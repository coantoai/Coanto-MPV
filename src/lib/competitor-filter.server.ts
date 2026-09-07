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
  /\b(store|shop|marketplace|retail|ecommerce)\b/i,
  /\b(price|pricing)\b/i,
  /\b(book|reserve)\b/i,
];

const editorialSignals = /\b(news|analysis|research|strategy|guide|review|reviews|alternatives|competitors|comparison|stock|investing|financial|salary|employees|funding|ratings?|similar\s+sites|market\s+data)\b/i;

function textOf(site: SiteSnapshot) {
  return `${site.title} ${site.description} ${site.h1.join(' ')} ${site.h2.join(' ')} ${site.text.slice(0, 9000)}`;
}

function isObviousNonCompetitor(host: string) {
  return obviousNonCompetitorHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function commerceScore(site: SiteSnapshot) {
  const text = textOf(site);
  return strongCommerceSignals.reduce((score, signal) => score + (signal.test(text) ? 1 : 0), 0);
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
    if (editorial && commerce < 4) return false;
    return commerce >= 3;
  });

  return accepted
    .sort((a, b) => commerceScore(b) - commerceScore(a))
    .slice(0, 10);
}
