import { competitorReason, filterCommercialCompetitors, scoreCommercialCompetitor } from '../src/lib/competitor-filter.server.ts';
import type { SiteSnapshot } from '../src/lib/analyze.server.ts';

const site=(url:string,title:string,text:string,sourceType:'direct-site'|'search-index'='direct-site'):SiteSnapshot=>({url,title,description:text,h1:[title],h2:[],text,sourceType,evidence:[`evidence:${url}`]});
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
console.log('COMPETITOR_DISCOVERY_SMOKE_OK');
