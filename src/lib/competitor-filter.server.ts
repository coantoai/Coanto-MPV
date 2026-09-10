import { hostname, type SiteSnapshot } from './analyze.server';

const obviousNonCompetitorHosts = [
  'csimarket.com','tracxn.com','similarweb.com','statista.com','companieshistory.com','marketing91.com','businessmodelanalyst.com','discobrands.co','econosa.com','yoursustainableguide.com','markets.apistemic.com','koalagains.com','ringly.io',
];

const categoryGroups = [
  ['shoes','shoe','footwear','sneaker','sneakers','boots','sandals'],
  ['apparel','clothing','fashion','activewear','sportswear','wear'],
  ['beauty','cosmetics','skincare','makeup','fragrance'],
  ['electronics','laptop','phone','mobile','computer','tech'],
  ['grocery','groceries','supermarket','food','fresh'],
  ['delivery','courier','logistics','shipping','delivery service'],
  ['hotel','hotels','accommodation','lodging','travel'],
  ['booking','reservation','reserve','tickets','flights'],
  ['ride','rides','taxi','mobility','transport'],
  ['music','streaming','podcast','audio'],
  ['software','saas','platform','app','applications'],
];

const strongCommerceSignals = [
  /add\s+to\s+cart/i,/shopping\s+cart/i,/checkout/i,/buy\s+(now|online)/i,/shop\s+(now|online)/i,/products?/i,/collections?/i,/shipping/i,/returns?/i,/place\s+an\s+order/i,/order\s+(now|online)/i,/delivery/i,/\b(store|shop|marketplace|retail|ecommerce|shopping)\b/i,/\b(price|pricing)\b/i,/\b(book|reserve)\b/i,
];
const editorialSignals = /\b(news|analysis|research|strategy|guide|review|reviews|alternatives|competitors|comparison|stock|investing|financial|salary|employees|funding|ratings?|similar\s+sites|market\s+data)\b/i;

function textOf(site: SiteSnapshot) { return `${site.title} ${site.description} ${site.h1.join(' ')} ${site.h2.join(' ')} ${site.text.slice(0,9000)}`.toLowerCase(); }
function isObviousNonCompetitor(host: string) { return obviousNonCompetitorHosts.some((blocked)=>host===blocked||host.endsWith(`.${blocked}`)); }
function commerceScore(site: SiteSnapshot) { const text=textOf(site); return strongCommerceSignals.reduce((score,signal)=>score+(signal.test(text)?1:0),0); }
function categoryMatches(main: SiteSnapshot,candidate: SiteSnapshot) { const a=textOf(main),b=textOf(candidate); return categoryGroups.filter((g)=>g.some((t)=>a.includes(t))&&g.some((t)=>b.includes(t))).length; }
function strongCategoryMatches(main: SiteSnapshot,candidate: SiteSnapshot) { const a=textOf(main),b=textOf(candidate); return categoryGroups.filter((g)=>g.filter((t)=>a.includes(t)).length>=2&&g.filter((t)=>b.includes(t)).length>=2).length; }
function editorialScore(site: SiteSnapshot) { return editorialSignals.test(`${site.title} ${site.description} ${site.h1.join(' ')} ${site.h2.join(' ')}`)?1:0; }

export function scoreCommercialCompetitor(main: SiteSnapshot, candidate: SiteSnapshot) {
  const raw=commerceScore(candidate)+strongCategoryMatches(main,candidate)*6+categoryMatches(main,candidate)*2-editorialScore(candidate);
  return Math.max(0,Math.min(100,Math.round(raw*7)));
}

export function competitorReason(main: SiteSnapshot,candidate: SiteSnapshot) {
  const overlap=categoryMatches(main,candidate), commerce=commerceScore(candidate);
  const evidence=candidate.sourceType==='direct-site'?'direct website evidence':'indexed public evidence';
  return `${overlap ? `${overlap} category overlap${overlap>1?'s':''}` : 'commercial overlap'}; ${commerce} commercial signals; ${evidence}.`;
}

export function filterCommercialCompetitors(main: SiteSnapshot,candidates: SiteSnapshot[],explicit: string[] = []) {
  const own=hostname(main.url); const explicitHosts=new Set(explicit.map(hostname).filter(Boolean));
  return candidates.filter((site)=>{
    const host=hostname(site.url); if(!host||host===own||host.endsWith(`.${own}`))return false;
    if(explicitHosts.has(host))return true; if(isObviousNonCompetitor(host))return false;
    const commerce=commerceScore(site), editorial=editorialScore(site), overlap=categoryMatches(main,site), strong=strongCategoryMatches(main,site);
    if(editorial&&commerce<4)return false; if(commerce<2)return false;
    if(site.sourceType==='direct-site')return strong>0;
    return overlap>0&&commerce>=2;
  }).sort((a,b)=>scoreCommercialCompetitor(main,b)-scoreCommercialCompetitor(main,a)).slice(0,10);
}
