import { getDatabase } from './database.server';
import { validateTargetUrl } from './analyze.server';
import { DECISION_SOURCE_URL_RULE } from './decision-source-contract';

export const BUSINESS_MODELS = ['ecommerce','saas','services','marketplace','retail','other'] as const;
export const COMPANY_STAGES = ['prelaunch','early','growing','established'] as const;
export type BusinessModel = typeof BUSINESS_MODELS[number];
export type CompanyStage = typeof COMPANY_STAGES[number];

export type BusinessContextInput = {
  businessName: string;
  websiteUrl: string;
  industry: string;
  businessModel: BusinessModel;
  companyStage: CompanyStage;
  primaryMarket: string;
  targetMarkets?: string[];
  targetCustomer: string;
  valueProposition: string;
  productsServices?: string[];
  competitiveGoals?: string[];
  knownCompetitors?: string[];
  preferredLanguage?: string;
  currency?: string;
};

export type BusinessContext = {
  userId: string;
  businessName: string;
  websiteUrl: string;
  industry: string;
  businessModel: BusinessModel;
  companyStage: CompanyStage;
  primaryMarket: string;
  targetMarkets: string[];
  targetCustomer: string;
  valueProposition: string;
  productsServices: string[];
  competitiveGoals: string[];
  knownCompetitors: string[];
  preferredLanguage: string;
  currency: string;
  onboardingCompletedAt: string;
  createdAt: string;
  updatedAt: string;
};

function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'string') throw new Error(`${label} مطلوب.`);
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (cleaned.length < min || cleaned.length > max) throw new Error(`${label} يجب أن يكون بين ${min} و${max} حرفًا.`);
  return cleaned;
}
function enumValue<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`${label} غير صالح.`);
  return value as T[number];
}
function list(value: unknown, label: string, maxItems: number, maxLength = 180) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} غير صالح.`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim().replace(/\s+/g, ' ');
    if (!cleaned) continue;
    if (cleaned.length > maxLength) throw new Error(`${label}: أحد العناصر طويل جدًا.`);
    const key = cleaned.toLocaleLowerCase('en');
    if (!seen.has(key)) { seen.add(key); out.push(cleaned); }
    if (out.length >= maxItems) break;
  }
  return out;
}

export function normalizeBusinessContext(input: unknown): Required<BusinessContextInput> {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const website = text(raw['websiteUrl'], 'رابط الموقع', 4, 500);
  const valid = validateTargetUrl(website);
  if (!valid.ok || !valid.url) throw new Error(valid.reason || 'رابط الموقع غير صالح.');
  const preferredLanguage = typeof raw['preferredLanguage'] === 'string' ? raw['preferredLanguage'].trim().toLowerCase() : 'ar';
  if (!/^[a-z]{2}(?:-[a-z]{2})?$/i.test(preferredLanguage)) throw new Error('اللغة المفضلة غير صالحة.');
  const currency = typeof raw['currency'] === 'string' ? raw['currency'].trim().toUpperCase() : 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('رمز العملة غير صالح.');
  const productsServices = list(raw['productsServices'], 'المنتجات أو الخدمات', 20, 180);
  if (!productsServices.length) throw new Error('أضف منتجًا أو خدمة واحدة على الأقل.');
  const competitiveGoals = list(raw['competitiveGoals'], 'أهداف المنافسة', 12, 180);
  if (!competitiveGoals.length) throw new Error('اختر هدفًا تنافسيًا واحدًا على الأقل.');
  return {
    businessName: text(raw['businessName'], 'اسم النشاط', 2, 120),
    websiteUrl: valid.url,
    industry: text(raw['industry'], 'القطاع', 2, 120),
    businessModel: enumValue(raw['businessModel'], BUSINESS_MODELS, 'نموذج العمل'),
    companyStage: enumValue(raw['companyStage'], COMPANY_STAGES, 'مرحلة الشركة'),
    primaryMarket: text(raw['primaryMarket'], 'السوق الأساسي', 2, 120),
    targetMarkets: list(raw['targetMarkets'], 'الأسواق المستهدفة', 20, 120),
    targetCustomer: text(raw['targetCustomer'], 'العميل المستهدف', 3, 1200),
    valueProposition: text(raw['valueProposition'], 'عرض القيمة', 3, 1600),
    productsServices,
    competitiveGoals,
    knownCompetitors: list(raw['knownCompetitors'], 'المنافسون المعروفون', 20, 300),
    preferredLanguage,
    currency,
  };
}

function mapRow(row: any): BusinessContext {
  return {
    userId: String(row.user_id), businessName: String(row.business_name), websiteUrl: String(row.website_url), industry: String(row.industry),
    businessModel: row.business_model as BusinessModel, companyStage: row.company_stage as CompanyStage, primaryMarket: String(row.primary_market),
    targetMarkets: Array.isArray(row.target_markets) ? row.target_markets.map(String) : [], targetCustomer: String(row.target_customer), valueProposition: String(row.value_proposition),
    productsServices: Array.isArray(row.products_services) ? row.products_services.map(String) : [], competitiveGoals: Array.isArray(row.competitive_goals) ? row.competitive_goals.map(String) : [],
    knownCompetitors: Array.isArray(row.known_competitors) ? row.known_competitors.map(String) : [], preferredLanguage: String(row.preferred_language || 'ar'), currency: String(row.currency || 'USD'),
    onboardingCompletedAt: String(row.onboarding_completed_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export async function getBusinessContext(userId: string): Promise<BusinessContext | null> {
  const { data, error } = await getDatabase().from('business_contexts').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Business context read failed: ${error.message}`);
  return data ? mapRow(data) : null;
}

export async function saveBusinessContext(userId: string, input: unknown): Promise<BusinessContext> {
  if (!userId.trim()) throw new Error('Authenticated user required.');
  const value = normalizeBusinessContext(input);
  const now = new Date().toISOString();
  const row = {
    user_id: userId, business_name: value.businessName, website_url: value.websiteUrl, industry: value.industry, business_model: value.businessModel,
    company_stage: value.companyStage, primary_market: value.primaryMarket, target_markets: value.targetMarkets, target_customer: value.targetCustomer,
    value_proposition: value.valueProposition, products_services: value.productsServices, competitive_goals: value.competitiveGoals, known_competitors: value.knownCompetitors,
    preferred_language: value.preferredLanguage, currency: value.currency, onboarding_completed_at: now, updated_at: now,
  };
  const { data, error } = await getDatabase().from('business_contexts').upsert(row, { onConflict: 'user_id' }).select('*').single();
  if (error) throw new Error(`Business context save failed: ${error.message}`);
  if (!data) throw new Error('Business context save failed: missing saved row.');
  return mapRow(data);
}

export const CUSTOMER_COMPANY_ANALYSIS_RULES = [
  'HARD PRODUCT MODE: CUSTOMER COMPANY COMMERCIAL ANALYSIS ONLY.',
  'The sole subject is the target business, its real competitors, its customers, and its commercial market environment.',
  'Never discuss COANTO itself, product-market fit, willingness to pay for a competitor-analysis product, pilot design, subscription demand, building an analysis tool, scraping feasibility, data-extraction architecture, or technical requirements for COANTO.',
  'Never convert missing commercial evidence into research questions about the COANTO product. Unknowns must be missing facts about the target company, a verified competitor, the customer, or the market that could change a business decision.',
  'Prioritize commercially useful dimensions when evidence exists: pricing, promotions, assortment, product launches/removals, availability/stock signals, private label, delivery/fulfillment, positioning/value proposition, channel/geographic expansion, digital visibility/demand, customer/review signals, and concrete competitor moves.',
  'First identify what is actually observed or changed. Then explain why it matters specifically to the target business. Only then recommend ACT, TEST, WATCH, or IGNORE.',
  'A threat, opportunity, signal, action, scenario, or unknown is allowed only if a reasonable owner or executive of the target business could use it to make or revisit a commercial decision.',
  'Prefer a small number of material, specific findings over generic advice. Name the competitor, category/product, market, offer, or observable condition whenever the evidence supports it.',
  'If the public evidence does not support a useful commercial conclusion, say insufficient evidence. Do not fill the screen with generic business advice.',
  'Do not infer sales, revenue, margin, inventory, true market share, basket behavior, or financial impact from a public website unless those facts are explicitly evidenced or owner-provided.',
  'Do not present legal or technical data-collection constraints as customer opportunities, threats, next actions, or unknowns unless the target company itself faces that documented business issue.',
].join('\n');

export function businessContextForPrompt(context: BusinessContext | null): string {
  if (!context) return '';
  return [
    `Business: ${context.businessName}`, `Industry: ${context.industry}`, `Business model: ${context.businessModel}`, `Company stage: ${context.companyStage}`,
    `Primary market: ${context.primaryMarket}`, `Target markets: ${context.targetMarkets.join(', ') || context.primaryMarket}`, `Target customer: ${context.targetCustomer}`,
    `Value proposition: ${context.valueProposition}`, `Products/services: ${context.productsServices.join(', ')}`, `Competitive goals: ${context.competitiveGoals.join(', ')}`,
    `Known competitors supplied by user (leads only, not verified evidence): ${context.knownCompetitors.join(', ') || 'none'}`,
    'END OWNER-PROVIDED BUSINESS CONTEXT.',
    CUSTOMER_COMPANY_ANALYSIS_RULES,
    DECISION_SOURCE_URL_RULE,
  ].join('\n');
}
