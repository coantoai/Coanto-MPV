import { createFileRoute } from '@tanstack/react-router';
import {
  buildPrompt,
  discoverCompetitors,
  getMainSnapshot,
  hostname,
  normalizeUrl,
  validateTargetUrl,
  type AnalyzeInput,
  type SiteSnapshot,
} from '@/lib/analyze.server';
import { runResearchAnalysis } from '@/lib/ai-engine.server';
import { validateAiOutput } from '@/lib/ai-output.server';
import { enforceEvidence } from '@/lib/trust.server';
import { discoverCompetitorsWithGemini } from '@/lib/gemini-competitor-discovery.server';
import { filterCommercialCompetitors } from '@/lib/competitor-filter.server';
import { businessContextForPrompt, getBusinessContext } from '@/lib/business-context.server';
import {
  buildCommercialIntelligence,
  commercialIntelligenceForPrompt,
  type CommercialIntelligenceSnapshot,
} from '@/lib/commercial-intelligence.server';
import { saveAnalysis } from '@/lib/analysis-persistence.server';
import { buildAnalysisEvidenceLedger } from '@/lib/evidence-ledger.server';
import { createInsForgeEvidenceStore } from '@/lib/insforge-persistence.server';
import { analysisInputHash } from '@/lib/cost-policy.server';
import { completeAnalysisOperation, failAnalysisOperation, reserveAnalysisOperation } from '@/lib/operation-guard.server';
import { apiSecurityHeaders, contentLengthTooLarge, guardSameOriginMutation, requestId, utf8TooLarge } from '@/lib/http-security.server';

const MAX_REQUEST_BYTES = 64_000;
const MAX_URL_LENGTH = 2_048;
const CACHE_VERSION = 'commercial-intelligence-v1';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function objects(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}
function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : [];
}
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }

function json(request: Request, traceId: string, body: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: apiSecurityHeaders(request, {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': traceId,
      ...extraHeaders,
    }),
  });
}

function mergeSnapshots(...groups: SiteSnapshot[][]) {
  const byHost = new Map<string, SiteSnapshot>();
  for (const site of groups.flat()) {
    const host = hostname(site.url);
    if (!host) continue;
    const existing = byHost.get(host);
    if (!existing || (existing.sourceType === 'search-index' && site.sourceType === 'direct-site')) byHost.set(host, site);
  }
  return [...byHost.values()];
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^\uFEFF/, '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  for (let start = cleaned.indexOf('{'); start >= 0; start = cleaned.indexOf('{', start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < cleaned.length; index += 1) {
      const char = cleaned[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const candidate = cleaned.slice(start, index + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
          } catch { break; }
        }
      }
    }
  }
  throw new Error('AI returned no valid JSON object.');
}

function deriveBattlecards(analysis: Record<string, unknown>, commercial: CommercialIntelligenceSnapshot) {
  const signals = objects(analysis['signals']);
  const competitorRows = objects(analysis['competitors']);
  return competitorRows.slice(0, 8).map((competitor) => {
    const name = text(competitor['name']);
    const url = text(competitor['url']);
    const commercialEntity = commercial.competitors.find((item) => hostname(item.url) === hostname(url));
    const relatedSignals = signals.filter((signal) => {
      const actor = text(signal['competitor']).toLowerCase();
      return Boolean(name) && (actor.includes(name.toLowerCase()) || name.toLowerCase().includes(actor));
    });
    const observedMoves = commercialEntity?.observations.map((item) => ({
      kind: item.kind,
      title: item.title,
      detail: item.detail,
      sourceUrl: item.sourceUrl,
    })) ?? [];
    return {
      name,
      url,
      whyItMatters: text(competitor['why']) || text(competitor['note']),
      threat: text(competitor['threat']),
      observedMoves: observedMoves.slice(0, 6),
      signals: relatedSignals.slice(0, 5),
      evidence: Array.isArray(competitor['evidence']) ? competitor['evidence'] : [competitor['evidence']].filter(Boolean),
      sourceUrls: strings(competitor['sourceUrls']),
    };
  });
}

function deriveExecutiveBrief(analysis: Record<string, unknown>) {
  const pulse = object(analysis['decisionPulse']);
  const threat = object(pulse['threat']);
  const opportunity = object(pulse['opportunity']);
  const action = object(pulse['action']);
  const priority = objects(analysis['priorityMatrix'] ?? analysis['priority_matrix']);
  return {
    headline: text(analysis['summary']) || 'تم تحديث صورة المنافسة الحالية.',
    topThreat: { title: text(threat['title']), detail: text(threat['description']), severity: text(threat['severity']) },
    topOpportunity: { title: text(opportunity['title']), detail: text(opportunity['description']), severity: text(opportunity['severity']) },
    nextMove: { title: text(action['title']) || text(analysis['next_action']), detail: text(action['description']), severity: text(action['severity']) },
    decisions: priority.slice(0, 5),
    unknowns: strings(analysis['unknowns']).slice(0, 8),
  };
}

function capabilityState(commercial: CommercialIntelligenceSnapshot) {
  const has = (kind: keyof CommercialIntelligenceSnapshot['categories']) => commercial.categories[kind] > 0;
  return {
    monitoring: { status: 'baseline-ready', detail: 'يحفظ هذا التشغيل خط أساس يمكن مقارنته مع التشغيلات اللاحقة.' },
    pricing: { status: has('price') ? 'observed' : 'insufficient-public-evidence' },
    promotions: { status: has('promotion') ? 'observed' : 'insufficient-public-evidence' },
    availability: { status: has('availability') ? 'observed' : 'insufficient-public-evidence' },
    assortment: { status: has('assortment') || has('product') ? 'observed' : 'insufficient-public-evidence' },
    delivery: { status: has('delivery') ? 'observed' : 'insufficient-public-evidence' },
    battlecards: { status: 'generated-from-current-evidence' },
    seoTrafficGap: { status: 'provider-expansion-required', detail: 'SEO العام يمكن جمعه تدريجيًا؛ أرقام Traffic لا تُعرض بلا مزود بيانات موثوق.' },
    reviewsSentiment: { status: 'source-expansion-required', detail: 'لن نعرض Sentiment حتى نجمع مراجعات عامة قابلة للتتبع.' },
    alerts: { status: 'event-layer-ready', detail: 'التوصيل إلى Slack/Teams يأتي بعد تثبيت جودة Decision Events.' },
    executiveBrief: { status: 'available' },
  };
}

function commercialPrompt(main: SiteSnapshot, competitors: SiteSnapshot[], commercial: CommercialIntelligenceSnapshot, context: string) {
  return [
    'CUSTOMER COMPANY INTELLIGENCE MODE.',
    'Analyze ONLY the customer company, its actual market, and verified competitors. Never discuss building COANTO, PMF, willingness to pay, scraping feasibility, or internal product research.',
    'Think like a commercial intelligence analyst briefing an owner or executive team.',
    'Prioritize concrete commercially relevant observations: price, promotions, assortment, product launches/removals, availability, delivery, loyalty, positioning, category pressure, competitive moves, and evidence-backed market gaps.',
    'The first output should answer: what deserves attention now, why it matters to this company, what evidence supports it, what argues against it, what remains unknown, what action is bounded and sensible, and what observable trigger changes the decision.',
    'Do not invent market share, traffic, revenue, margin, inventory, price indices, elasticity, sentiment, or customer demand metrics. If unavailable, say unknown.',
    'Use web search when the supplied evidence is insufficient, but cite exact URLs actually returned by search. Never guess deep source URLs.',
    'Keep customer-facing Arabic concise and commercial, not technical.',
    '',
    `OWNER BUSINESS CONTEXT:\n${context}`,
    '',
    commercialIntelligenceForPrompt(commercial),
    '',
    buildPrompt(main, competitors),
  ].join('\n\n');
}

export const Route = createFileRoute('/api/company-intelligence')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const traceId = requestId(request);
        let activeRun: { userId: string; runId: string } | null = null;
        const failRun = async (code: string) => {
          if (!activeRun) return;
          try { await failAnalysisOperation(activeRun.userId, activeRun.runId, code); } catch {}
          activeRun = null;
        };

        try {
          const mutation = guardSameOriginMutation(request);
          if (!mutation.ok) return json(request, traceId, { error: 'Cross-site request rejected.' }, mutation.status);
          if (contentLengthTooLarge(request, MAX_REQUEST_BYTES)) return json(request, traceId, { error: 'حجم الطلب كبير جدًا.' }, 413);
          const raw = await request.text();
          if (utf8TooLarge(raw, MAX_REQUEST_BYTES)) return json(request, traceId, { error: 'حجم الطلب كبير جدًا.' }, 413);
          let body: Partial<AnalyzeInput>;
          try { body = JSON.parse(raw) as Partial<AnalyzeInput>; } catch { return json(request, traceId, { error: 'بيانات الطلب غير صالحة.' }, 400); }

          const { getUserIdFromRequest } = await import('@/lib/auth.server');
          const userId = await getUserIdFromRequest(request);
          if (!userId) return json(request, traceId, { error: 'يجب تسجيل الدخول لتشغيل التحليل.' }, 401);
          const businessContext = await getBusinessContext(userId);
          if (!businessContext) return json(request, traceId, { error: 'أكمل إعداد نشاطك أولًا.', code: 'ONBOARDING_REQUIRED' }, 409);

          const rawStoreUrl = typeof body.storeUrl === 'string' && body.storeUrl.trim() ? body.storeUrl.trim() : businessContext.websiteUrl;
          if (rawStoreUrl.length > MAX_URL_LENGTH) return json(request, traceId, { error: 'رابط الموقع طويل جدًا.' }, 400);
          const validation = validateTargetUrl(rawStoreUrl);
          if (!validation.ok || !validation.url) return json(request, traceId, { error: validation.reason }, 400);
          const storeUrl = normalizeUrl(validation.url);
          const inputHash = analysisInputHash({ storeUrl, competitors: [], businessContextUpdatedAt: `${businessContext.updatedAt}:${CACHE_VERSION}` });

          let reservation;
          try { reservation = await reserveAnalysisOperation({ userId, inputHash }); }
          catch { return json(request, traceId, { error: 'تعذّر حجز التحليل. حاول بعد قليل.' }, 503, { 'retry-after': '30' }); }
          if (reservation.kind === 'cached') {
            const cached = structuredClone(reservation.result);
            const metadata = object(cached['metadata']);
            cached['metadata'] = { ...metadata, requestId: traceId, cacheHit: true, cachedRunId: reservation.runId };
            return json(request, traceId, cached);
          }
          if (reservation.kind === 'in-progress') return json(request, traceId, { error: 'هذا التحليل قيد التشغيل بالفعل.', code: 'ANALYSIS_IN_PROGRESS' }, 409, { 'retry-after': String(reservation.retryAfterSeconds) });
          if (reservation.kind === 'burst-limited' || reservation.kind === 'daily-limited') return json(request, traceId, { error: 'تم الوصول إلى حد التحليل الحالي. حاول لاحقًا.', code: 'ANALYSIS_LIMIT' }, 429, { 'retry-after': String(reservation.retryAfterSeconds) });
          activeRun = { userId, runId: reservation.runId };

          let main: SiteSnapshot;
          try { main = await getMainSnapshot(storeUrl); }
          catch {
            await failRun('EVIDENCE_COLLECTION_FAILED');
            return json(request, traceId, { error: 'تعذّر جمع أدلة عامة كافية عن الشركة.', code: 'EVIDENCE_COLLECTION_FAILED' }, 422);
          }

          const grounded = await discoverCompetitorsWithGemini(main);
          let discovered = mergeSnapshots(grounded.snapshots);
          let competitors = filterCommercialCompetitors(main, discovered, []);
          let discoveryMethod = 'gemini-google-search';
          if (!competitors.length) {
            const legacy = await discoverCompetitors(main, []);
            discovered = mergeSnapshots(discovered, legacy);
            competitors = filterCommercialCompetitors(main, discovered, []);
            discoveryMethod = grounded.snapshots.length ? 'gemini-google-search+legacy-fallback' : 'legacy-search-fallback';
          }
          if (!competitors.length) {
            await failRun('NO_VERIFIED_COMPETITORS');
            return json(request, traceId, { error: 'لم نتمكن من توثيق منافسين تجاريين مناسبين لهذا الموقع بعد. لم يتم اختراع نتائج.', code: 'NO_VERIFIED_COMPETITORS' }, 422);
          }

          const commercial = buildCommercialIntelligence(main, competitors);
          const prompt = commercialPrompt(main, competitors, commercial, businessContextForPrompt(businessContext));
          let ai;
          try { ai = await runResearchAnalysis(prompt); }
          catch (error) {
            console.error('Company intelligence AI failed', { traceId, error });
            await failRun('AI_PROVIDER_FAILED');
            return json(request, traceId, { error: 'تعذّر تشغيل محرك التحليل التجاري حاليًا.', code: 'AI_PROVIDER_FAILED' }, 502);
          }

          let parsed: Record<string, unknown>;
          try { parsed = validateAiOutput(parseJsonObject(ai.text)); }
          catch (error) {
            console.error('Company intelligence contract failed', { traceId, error });
            await failRun('AI_CONTRACT_FAILED');
            return json(request, traceId, { error: 'النتيجة لم تجتز عقد الجودة، لذلك لم نعرضها.', code: 'AI_CONTRACT_FAILED' }, 502);
          }

          const analysis = enforceEvidence(parsed, main, competitors, ai.sources);
          if (!objects(analysis['competitors']).length) {
            await failRun('EVIDENCE_GATE_EMPTY');
            return json(request, traceId, { error: 'لم يبق أي منافس بعد بوابة الأدلة.', code: 'EVIDENCE_GATE_EMPTY' }, 502);
          }

          const observedAt = new Date().toISOString();
          analysis['commercialIntelligence'] = commercial;
          analysis['battlecards'] = deriveBattlecards(analysis, commercial);
          analysis['executiveBrief'] = deriveExecutiveBrief(analysis);
          analysis['capabilities'] = capabilityState(commercial);
          analysis['metadata'] = {
            ...object(analysis['metadata']),
            requestId: traceId,
            analysisRunId: reservation.runId,
            cacheHit: false,
            productMode: CACHE_VERSION,
            analyzedAt: observedAt,
            storeUrl,
            competitorDiscoveryMethod: discoveryMethod,
            commercialObservationCount: commercial.coverage.observations,
            commercialEntitiesObserved: commercial.coverage.entitiesObserved,
            aiProvider: ai.provider,
            aiModel: ai.model,
            aiWebSources: ai.sources.length,
            aiSearchQueries: ai.searchQueries ?? 0,
          };

          try {
            const saved = await saveAnalysis({ userId, storeUrl, result: analysis });
            const metadata = object(analysis['metadata']);
            metadata['id'] = saved.id;
            analysis['metadata'] = metadata;
            try {
              const ledger = buildAnalysisEvidenceLedger(main, competitors, observedAt);
              await createInsForgeEvidenceStore().persistAnalysisEvidence({ userId, analysisId: saved.id, entries: ledger });
              metadata['evidenceLedgerRecords'] = ledger.length;
              metadata['evidenceLedgerPersisted'] = true;
            } catch (error) {
              console.error('Company intelligence evidence persistence failed', { traceId, error });
              metadata['evidenceLedgerPersisted'] = false;
            }
          } catch (error) {
            console.error('Company intelligence persistence failed', { traceId, error });
            object(analysis['metadata'])['saveError'] = 'تعذّر حفظ التحليل في السجل.';
          }

          try { await completeAnalysisOperation(userId, reservation.runId, analysis); activeRun = null; }
          catch (error) { console.error('Company intelligence cache completion failed', { traceId, error }); }

          return json(request, traceId, analysis);
        } catch (error) {
          await failRun('UNEXPECTED_COMPANY_INTELLIGENCE_FAILURE');
          console.error('Company intelligence request failed', { traceId, error });
          return json(request, traceId, { error: 'حدث خطأ أثناء تحليل الشركة.', code: 'UNEXPECTED_COMPANY_INTELLIGENCE_FAILURE' }, 500);
        }
      },
    },
  },
});
