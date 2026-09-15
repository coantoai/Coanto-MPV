import { createFileRoute } from '@tanstack/react-router';
import { discoverRelevantTrends, generateTrendScript, type TrendPulseProfile, type TrendSignal } from '@/lib/trends-pulse.server';
import { apiSecurityHeaders, contentLengthTooLarge, guardSameOriginMutation, requestId, utf8TooLarge } from '@/lib/http-security.server';

const MAX_REQUEST_BYTES = 3_600_000;

function json(request: Request, traceId: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: apiSecurityHeaders(request, {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': traceId,
    }),
  });
}

function profileFrom(value: unknown): TrendPulseProfile {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const s = (key: string, max = 1200) => typeof data[key] === 'string' ? String(data[key]).trim().slice(0, max) : '';
  const platforms = Array.isArray(data['platforms']) ? data['platforms'].filter((v): v is string => typeof v === 'string').map((v) => v.slice(0, 60)).slice(0, 6) : [];
  return {
    businessName: s('businessName', 160),
    storeUrl: s('storeUrl', 2048),
    productName: s('productName', 220),
    productPrice: s('productPrice', 120),
    productDescription: s('productDescription', 1800),
    audience: s('audience', 900),
    region: s('region', 120) || 'السعودية',
    city: s('city', 120),
    dialect: s('dialect', 120) || 'سعودي',
    tone: s('tone', 160) || 'ودّي وواضح',
    objective: s('objective', 120) || 'بيع',
    prohibitedClaims: s('prohibitedClaims', 900),
    platforms,
  };
}

function trendFrom(value: unknown): TrendSignal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const text = (key: string, fallback = '') => typeof data[key] === 'string' ? String(data[key]).trim().slice(0, 1800) : fallback;
  const strength = text('signalStrength');
  const state = text('state');
  return {
    id: text('id', `trend-${Date.now()}`),
    title: text('title', 'إشارة محتوى'),
    hashtag: text('hashtag'),
    platform: text('platform', 'Cross-platform'),
    signalStrength: strength === 'قوية' || strength === 'متوسطة' ? strength : 'أولية',
    freshness: text('freshness', 'حديثة'),
    state: state === 'استخدم الآن' || state === 'تجاهل' ? state : 'راقب',
    whyNow: text('whyNow'),
    businessFit: text('businessFit'),
    contentAngle: text('contentAngle'),
    saturationRisk: text('saturationRisk'),
    confidenceNote: text('confidenceNote'),
    evidenceSummary: text('evidenceSummary'),
  };
}

// @ts-expect-error TanStack file-route type map is generated during build.
export const Route = createFileRoute('/api/trends-pulse')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const traceId = requestId(request);
        try {
          const mutation = guardSameOriginMutation(request);
          if (!mutation.ok) return json(request, traceId, { error: mutation.reason }, mutation.status);
          if (contentLengthTooLarge(request, MAX_REQUEST_BYTES)) return json(request, traceId, { error: 'حجم الطلب كبير جدًا.' }, 413);
          const raw = await request.text();
          if (utf8TooLarge(raw, MAX_REQUEST_BYTES)) return json(request, traceId, { error: 'حجم الطلب كبير جدًا.' }, 413);

          let body: Record<string, unknown>;
          try { body = JSON.parse(raw) as Record<string, unknown>; }
          catch { return json(request, traceId, { error: 'بيانات الطلب غير صالحة.' }, 400); }

          const { getUserIdFromRequest } = await import('@/lib/auth.server');
          const userId = await getUserIdFromRequest(request);
          if (!userId) return json(request, traceId, { error: 'سجّل الدخول لتشغيل البحث الحقيقي.', code: 'AUTH_REQUIRED' }, 401);

          const mode = typeof body['mode'] === 'string' ? body['mode'] : 'discover';
          const profile = profileFrom(body['profile']);
          if (!profile.productName && !profile.productDescription && !profile.storeUrl) {
            return json(request, traceId, { error: 'أضف رابط المنتج أو اسم/وصف المنتج حتى نخصص البحث.' }, 400);
          }

          if (mode === 'discover') {
            const result = await discoverRelevantTrends(profile);
            return json(request, traceId, { ok: true, mode, result });
          }

          if (mode === 'script') {
            const trend = trendFrom(body['trend']);
            if (!trend) return json(request, traceId, { error: 'اختر إشارة أولًا.' }, 400);
            const format = typeof body['format'] === 'string' ? body['format'].slice(0, 80) : 'TikTok / Reels';
            const imageDataUrl = typeof body['imageDataUrl'] === 'string' ? body['imageDataUrl'] : undefined;
            const result = await generateTrendScript({ profile, trend, format, imageDataUrl });
            return json(request, traceId, { ok: true, mode, result });
          }

          return json(request, traceId, { error: 'وضع التشغيل غير معروف.' }, 400);
        } catch (error) {
          console.error('TRENDS PULSE API failed', { traceId, error });
          const message = error instanceof Error ? error.message : 'Unexpected error';
          const providerIssue = /Gemini|GEMINI_API_KEY|timed out|429|quota/i.test(message);
          return json(request, traceId, {
            error: providerIssue ? 'تعذّر تشغيل محرك البحث والذكاء الآن. تحقق من Gemini/quota وحاول مجددًا.' : 'تعذّر إكمال العملية الآن.',
            code: providerIssue ? 'AI_PROVIDER_FAILED' : 'TRENDS_PULSE_FAILED',
            traceId,
          }, providerIssue ? 502 : 500);
        }
      },
    },
  },
});
