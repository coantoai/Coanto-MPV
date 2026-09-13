import { competitorReason, filterCommercialCompetitors, scoreCommercialCompetitor } from '../src/lib/competitor-filter.server.ts';
import type { SiteSnapshot } from '../src/lib/analyze.server.ts';

const site=(url:string,title:string,text:string,sourceType:'direct-site'|'search-index'='direct-site',evidence:string[]=[`evidence:${url}`]):SiteSnapshot=>({url,title,description:text,h1:[title],h2:[],text,sourceType,evidence});
const main=site('https://acme-shoes.com','Acme Shoes','shop shoes footwear sneakers products checkout shipping');
const real=site('https://runner.com','Runner Footwear','shop running shoes footwear sneakers products add to cart checkout shipping returns');
const editorial=site('https://example-news.com','Best Acme Competitors Review','analysis review competitors shoes market data');
const unrelated=site('https://flowers.com','Flowers','shop flowers bouquets checkout shipping products');

const accepted=filterCommercialCompetitors(main,[editorial,unrelated,real]);
if(accepted.length!==1||accepted[0]?.url!==real.url)throw new Error('Commercial competitor gate accepted an invalid candidate or rejected a valid one.');
const score=scoreCommercialCompetitor(main,real);
if(score<50||score>100)throw new Error(`Unexpected competitor relevance score: ${score}`);
const reason=competitorReason(main,real);
if(!/commercial signals/i.test(reason)||!/direct website evidence/i.test(reason))throw new Error('Competitor rationale is missing evidence explanation.');

const grounded=site(
  'https://grounded-runner.example',
  'Grounded Runner',
  'Footwear brand selling running shoes and sneakers to consumers.',
  'search-index',
  [
    'Gemini Google Search grounded competitor candidate: Grounded Runner — sells similar footwear to similar customers',
    'Grounded category: footwear and running shoes',
    'Grounded commercial evidence: sells running shoes and sneakers through its official website',
    'Google Search grounding source: public source — https://search-source.example/evidence',
  ],
);
const groundedAccepted=filterCommercialCompetitors(main,[grounded]);
if(groundedAccepted.length!==1||groundedAccepted[0]?.url!==grounded.url)throw new Error('Google-grounded commercial competitor fallback was rejected.');

const serviceMain=site('https://northstar-advisory.example','Northstar Advisory','advisory consulting for small businesses');
const groundedService=site(
  'https://rival-advisory.example',
  'Rival Advisory',
  'Business advisory consultancy serving small and medium businesses.',
  'search-index',
  [
    'Gemini Google Search grounded competitor candidate: Rival Advisory — provides the same business advisory service to SMEs',
    'Grounded category: business advisory consulting',
    'Grounded commercial evidence: offers paid advisory engagements to small and medium businesses',
    'Google Search grounding source: rival-advisory.example — https://search-source.example/rival',
  ],
);
if(filterCommercialCompetitors(serviceMain,[groundedService]).length!==1)throw new Error('Candidate-specific grounding should support businesses outside the lexical category taxonomy.');

const ungroundedService=site(
  'https://unverified-advisory.example',
  'Unverified Advisory',
  'Business advisory consultancy serving small and medium businesses.',
  'search-index',
  [
    'Gemini Google Search grounded competitor candidate: Unverified Advisory — alleged competitor',
    'Grounded commercial evidence: alleged similar service',
  ],
);
if(filterCommercialCompetitors(serviceMain,[ungroundedService]).length!==0)throw new Error('Grounded fallback without a candidate-specific Google source must not bypass verification.');

console.log('COMPETITOR_DISCOVERY_SMOKE_OK');
