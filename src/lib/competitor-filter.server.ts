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

export type CompetitorRelationship = 'direct' | 'adjacent' | 'unverified';
export type CompetitorAssessment = {
  score: number;
  relationship: CompetitorRelationship;
  evidenceQuality: 'verified-site' | 'indexed-only';
  sharedProducts: string[];
  sharedAttributes: string[];
  sharedCategories: number;
  commercialSignals: number;
  reason: string;
};
const productSpecificTerms = ['sneakers','sneaker','running shoes','walking shoes','trainers','boots','boot','sandals','sandal','slippers','slipper','flats','loafers','t-shirt','hoodie','leggings','jacket','sweater','socks','moisturizer','serum','perfume','laptop','smartphone','headphones','crm','project management','inventory management'];
const sharedAttributeTerms = ['sustainable','eco-friendly','recycled','wool','natural materials','organic','breathable','comfortable','comfort','performance','ethical'];
function canonicalProduct(term: string) {
  if (term === 'sneakers' || term === 'sneaker') return 'sneakers';
  if (term === 'boots' || term === 'boot') return 'boots';
  if (term === 'sandals' || term === 'sandal') return 'sandals';
  if (term === 'slippers' || term === 'slipper') return 'slippers';
  return term;
}
export function assessCommercialCompetitor(main: SiteSnapshot, candidate: SiteSnapshot): CompetitorAssessment {
  const mainText=textOf(main), candidateText=textOf(candidate);
  // A product named only in a footer/navigation is insufficient to prove a core offering.
  const candidatePrimaryText=[candidate.title,candidate.description,...candidate.h1,...candidate.h2].join(' ').toLowerCase();
  const overlap=categoryMatches(main,candidate), strong=strongCategoryMatches(main,candidate);
  const matched=new Set<string>();
  for(const term of productSpecificTerms) {
    if(containsTerm(mainText,term)&&containsTerm(candidatePrimaryText,term)) matched.add(canonicalProduct(term));
  }
  const sharedProducts=[...matched];
  const sharedAttributes=sharedAttributeTerms.filter((term)=>containsTerm(mainText,term)&&containsTerm(candidateText,term)).slice(0,5);
  const mainSpecific=productSpecificTerms.some((term)=>containsTerm(mainText,term));
  const directlyOverlapping=sharedProducts.length>0 || (!mainSpecific && strong>0);
  const commerce=commerceScore(candidate),direct=candidate.sourceType==='direct-site';
  const relationship:CompetitorRelationship=!direct?'unverified':directlyOverlapping?'direct':'adjacent';
  const score=Math.max(0,Math.min(92,Math.round(17+Math.min(overlap,2)*12+Math.min(strong,2)*4+Math.min(commerce,6)*1.75+Math.min(sharedProducts.length,3)*5+Math.min(sharedAttributes.length,3)*1.5+Number(directlyOverlapping)*6+Number(direct)*6+Number(googleGrounded(candidate))*2-editorialScore(candidate)*18)));
  const reason=[
    'category overlaps: '+overlap,
    'shared products: '+(sharedProducts.join(', ')||'not established'),
    'commercial signals: '+commerce,
    direct?'direct website evidence':'indexed evidence only; website not verified',
    'relationship: '+relationship
  ].join('; ')+'.';
  return {score,relationship,evidenceQuality:direct?'verified-site':'indexed-only',sharedProducts,sharedAttributes,sharedCategories:overlap,commercialSignals:commerce,reason};
}
export function scoreCommercialCompetitor(main: SiteSnapshot, candidate: SiteSnapshot) {
  return assessCommercialCompetitor(main,candidate).score;
}
export function competitorReason(main: SiteSnapshot, candidate: SiteSnapshot) {
  return assessCommercialCompetitor(main,candidate).reason;
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
