import { hostname, type SiteSnapshot } from './analyze.server';

const obviousNonCompetitorHosts = ['csimarket.com','tracxn.com','similarweb.com','statista.com','companieshistory.com','marketing91.com','businessmodelanalyst.com','discobrands.co','econosa.com','yoursustainableguide.com','markets.apistemic.com','koalagains.com','ringly.io'];
const categoryGroups = [
  ['shoes','shoe','footwear','sneaker','sneakers','boots','sandals','running shoes','trainers'],
  ['apparel','clothing','fashion','activewear','sportswear','menswear','womenswear'],
  ['beauty','cosmetics','skincare','makeup','fragrance'],
  ['electronics','laptop','phone','mobile phone','computer','consumer tech'],
  ['grocery','groceries','supermarket','food store','fresh food'],
  ['courier','logistics','delivery service','last mile delivery','parcel delivery','freight'],
  ['hotel','hotels','accommodation','lodging'],
  ['travel booking','flight booking','hotel booking','ticket booking','reservation platform'],
  ['ride hailing','taxi','mobility service','passenger transport'],
  ['music streaming','podcast','audio streaming'],
  ['software','saas','software platform','software application','business app'],
];
const strongCommerceSignals = [/add\s+to\s+cart/i,/shopping\s+cart/i,/checkout/i,/buy\s+(now|online)/i,/shop\s+(now|online)/i,/products?/i,/collections?/i,/shipping/i,/returns?/i,/place\s+an\s+order/i,/order\s+(now|online)/i,/delivery/i,/\b(store|shop|marketplace|retail|ecommerce|shopping)\b/i,/\b(price|pricing)\b/i,/\b(book|reserve)\b/i];
const editorialSignals = /\b(news|analysis|research|strategy|guide|review|reviews|alternatives|competitors|comparison|stock|investing|financial|salary|employees|funding|ratings?|similar\s+sites|market\s+data)\b/i;

function textOf(site: SiteSnapshot) { return `${site.title} ${site.description} ${site.h1.join(' ')} ${site.h2.join(' ')} ${site.text.slice(0,12000)}`.toLowerCase(); }
function isObviousNonCompetitor(host: string) { return obviousNonCompetitorHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`)); }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function containsTerm(text: string, term: string) { const pattern = escapeRegExp(term.trim()).replace(/\s+/g, '\\s+'); return new RegExp(`(?:^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(text); }
function commerceScore(site: SiteSnapshot) { const text = textOf(site); return strongCommerceSignals.reduce((score, signal) => score + (signal.test(text) ? 1 : 0), 0); }
function groupTermCount(text: string, group: string[]) { return group.reduce((count, term) => count + (containsTerm(text, term) ? 1 : 0), 0); }
function categoryMatches(main: SiteSnapshot, candidate: SiteSnapshot) { const a = textOf(main), b = textOf(candidate); return categoryGroups.filter((group) => groupTermCount(a, group) > 0 && groupTermCount(b, group) > 0).length; }
function strongCategoryMatches(main: SiteSnapshot, candidate: SiteSnapshot) { const a = textOf(main), b = textOf(candidate); return categoryGroups.filter((group) => groupTermCount(a, group) >= 2 && groupTermCount(b, group) >= 2).length; }
function editorialScore(site: SiteSnapshot) { return editorialSignals.test(`${site.title} ${site.description} ${site.h1.join(' ')} ${site.h2.join(' ')}`) ? 1 : 0; }
function groundedSourceCount(site: SiteSnapshot) { return site.evidence.filter((item) => item.startsWith('Google Search grounding source:')).length; }
function googleGrounded(site: SiteSnapshot) {
  return site.evidence.some((item) => item.startsWith('Gemini Google Search grounded competitor candidate:'))
    && site.evidence.some((item) => item.startsWith('Grounded commercial evidence:'))
    && groundedSourceCount(site) > 0;
}

export function scoreCommercialCompetitor(main: SiteSnapshot, candidate: SiteSnapshot) {
  const groundedBonus = googleGrounded(candidate) ? 10 : 0;
  const directBonus = candidate.sourceType === 'direct-site' ? 2 : 0;
  const raw = commerceScore(candidate) + strongCategoryMatches(main, candidate) * 6 + categoryMatches(main, candidate) * 2 + groundedBonus + directBonus - editorialScore(candidate);
  return Math.max(0, Math.min(100, Math.round(raw * 7)));
}
export function competitorReason(main: SiteSnapshot, candidate: SiteSnapshot) {
  const overlap = categoryMatches(main, candidate);
  const commerce = commerceScore(candidate);
  const evidence = candidate.sourceType === 'direct-site'
    ? googleGrounded(candidate) ? 'direct website + candidate-specific Google Search grounding' : 'direct website evidence'
    : googleGrounded(candidate) ? 'candidate-specific Google Search grounded public evidence' : 'indexed public evidence';
  return `${overlap ? `${overlap} category overlap${overlap > 1 ? 's' : ''}` : 'grounded competitive relationship'}; ${commerce} commercial signals; ${evidence}.`;
}
export function filterCommercialCompetitors(main: SiteSnapshot, candidates: SiteSnapshot[], explicit: string[] = []) {
  const own = hostname(main.url);
  const explicitHosts = new Set(explicit.map(hostname).filter(Boolean));
  return candidates.filter((site) => {
    const host = hostname(site.url);
    if (!host || host === own || host.endsWith(`.${own}`)) return false;
    if (explicitHosts.has(host)) return true;
    if (isObviousNonCompetitor(host)) return false;
    const commerce = commerceScore(site);
    const editorial = editorialScore(site);
    const overlap = categoryMatches(main, site);
    const strong = strongCategoryMatches(main, site);

    // A candidate-specific grounded relationship is intentionally category-agnostic.
    // This lets COANTO support services, restaurants, finance, real estate, education,
    // and other businesses that are not covered by the small lexical taxonomy above.
    if (googleGrounded(site)) {
      if (editorial && site.sourceType !== 'direct-site' && commerce === 0) return false;
      return true;
    }

    if (editorial && commerce < 4) return false;
    if (commerce < 2) return false;
    if (site.sourceType === 'direct-site') return strong > 0 || (overlap > 0 && commerce >= 3);
    return overlap > 0 && commerce >= 2;
  }).sort((a, b) => scoreCommercialCompetitor(main, b) - scoreCommercialCompetitor(main, a)).slice(0, 10);
}
