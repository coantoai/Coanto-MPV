import { hostname, type SiteSnapshot } from './analyze.server';

const obviousNonCompetitorHosts = [
  'csimarket.com',
  'tracxn.com',
  'similarweb.com',
  'statista.com',
  'companieshistory.com',
  'marketing91.com',
  'businessmodelanalyst.com',
  'discobrands.co',
  'econosa.com',
  'yoursustainableguide.com',
  'markets.apistemic.com',
  'koalagains.com',
];

const categoryGroups = [
  ['shoes', 'shoe', 'footwear', 'sneaker', 'sneakers', 'boots', 'sandals'],
  ['apparel', 'clothing', 'fashion', 'activewear', 'sportswear', 'wear'],
  ['beauty', 'cosmetics', 'skincare', 'makeup', 'fragrance'],
  ['electronics', 'laptop', 'phone', 'mobile', 'computer', 'tech'],
  ['grocery', 'groceries', 'supermarket', 'food', 'fresh'],
  ['marketplace', 'ecommerce', 'e-commerce', 'retail', 'store', 'shopping'],
  ['delivery', 'courier', 'logistics', 'shipping', 'delivery service'],
  ['hotel', 'hotels', 'accommodation', 'lodging', 'travel'],
  ['booking', 'reservation', 'reserve', 'tickets', 'flights'],
  ['ride', 'rides', 'taxi', 'mobility', 'transport'],
  ['music', 'streaming', 'podcast', 'audio'],
  ['software', 'saas', 'platform', 'app', 'applications'],
];

const strongCommerceSignals = [
  /add\s+to\s+cart/i,
  /shopping\s+cart/i,
  /checkout/i,
  /buy\s+(now|online)/i,
  /shop\s+(now|online)/i,
  /products?/i,
  /collections?/i,
  /shipping/i,
  /returns?/i,
  /place\s+an\s+order/i,
  /order\s+(now|online)/i,
  /delivery/i,
  /\b(store|shop|marketplace|retail|ecommerce|shopping)\b/i,
  /\b(price|pricing)\b/i,
  /\b(book|reserve)\b/i,
];

const editorialSignals = /\b(news|analysis|research|strategy|guide|review|reviews|alternatives|competitors|comparison|stock|investing|financial|salary|employees|funding|ratings?|similar\s+sites|market\s+data)\b/i;

function textOf(site: SiteSnapshot) {
  return `${site.title} ${site.description} ${site.h1.join(' ')} ${site.h2.join(' ')} ${site.text.slice(0, 9000)}`.toLowerCase();
}

function isObviousNonCompetitor(host: string) {
  return obviousNonCompetitorHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function commerceScore(site: SiteSnapshot) {
  const text = textOf(site);
  return strongCommerceSignals.reduce((score, signal) => score + (signal.test(text) ? 1 : 0), 0);
}

function categoryMatches(main: SiteSnapshot, candidate: SiteSnapshot) {
  const mainText = textOf(main);
  const candidateText = textOf(candidate);
  return categoryGroups.filter((group) => group.some((term) => mainText.includes(term)) && group.some((term) => candidateText.includes(term))).length;
}

function strongCategoryMatches(main: SiteSnapshot, candidate: SiteSnapshot) {
  const mainText = textOf(main);
  const candidateText = textOf(candidate);
  return categoryGroups.filter((group) => {
    const mainHits = group.filter((term) => mainText.includes(term)).length;
    const candidateHits = group.filter((term) => candidateText.includes(term)).length;
    return mainHits >= 2 && candidateHits >= 2;
  }).length;
}

function editorialScore(site: SiteSnapshot) {
  const text = `${site.title} ${site.description} ${site.h1.join(' ')} ${site.h2.join(' ')}`;
  return editorialSignals.test(text) ? 1 : 0;
}

export function filterCommercialCompetitors(main: SiteSnapshot, candidates: SiteSnapshot[], explicit: string[] = []) {
  const own = hostname(main.url);
  const explicitHosts = new Set(explicit.map(hostname).filter(Boolean));
  const accepted = candidates.filter((site) => {
    const host = hostname(site.url);
    if (!host || host === own || host.endsWith(`.${own}`)) return false;
    if (explicitHosts.has(host)) return true;
    if (isObviousNonCompetitor(host)) return false;
    const commerce = commerceScore(site);
    const editorial = editorialScore(site);
    const categoryOverlap = categoryMatches(main, site);
    const strongCategoryOverlap = strongCategoryMatches(main, site);
    if (editorial && commerce < 4) return false;
    if (commerce < 2) return false;
    return strongCategoryOverlap > 0 || (categoryOverlap > 0 && commerce >= 5);
  });

  return accepted
    .sort((a, b) => {
      const scoreA = commerceScore(a) + strongCategoryMatches(main, a) * 6 + categoryMatches(main, a) * 2 - editorialScore(a);
      const scoreB = commerceScore(b) + strongCategoryMatches(main, b) * 6 + categoryMatches(main, b) * 2 - editorialScore(b);
      return scoreB - scoreA;
    })
    .slice(0, 10);
}
