import { businessContextForPrompt, normalizeBusinessContext } from '../src/lib/business-context.server.ts';

let passed=0;let failed=0;
function check(name:string, condition:boolean){if(condition){passed++;console.log(`PASS ${name}`);}else{failed++;console.error(`FAIL ${name}`);}}
function throws(name:string, fn:()=>unknown){try{fn();failed++;console.error(`FAIL ${name}`);}catch{passed++;console.log(`PASS ${name}`);}}

const normalized=normalizeBusinessContext({
  businessName:'  COANTO Shop  ',websiteUrl:'example.com',industry:' E-commerce ',businessModel:'ecommerce',companyStage:'growing',primaryMarket:' Lebanon ',
  targetMarkets:['Lebanon','UAE','uae',' '],targetCustomer:' SMB online shoppers ',valueProposition:' Fast verified decisions ',productsServices:[' Shoes ','Shoes',' Apparel '],
  competitiveGoals:['competitor-discovery','pricing','pricing'],knownCompetitors:['https://competitor.example','https://competitor.example'],preferredLanguage:'AR',currency:'usd'
});
check('normalizes website URL',normalized.websiteUrl==='https://example.com/');
check('normalizes scalar whitespace',normalized.businessName==='COANTO Shop'&&normalized.primaryMarket==='Lebanon');
check('deduplicates list values',normalized.targetMarkets.length===2&&normalized.productsServices.length===2&&normalized.competitiveGoals.length===2);
check('normalizes locale/currency',normalized.preferredLanguage==='ar'&&normalized.currency==='USD');
throws('rejects private website',()=>normalizeBusinessContext({...normalized,websiteUrl:'http://127.0.0.1'}));
throws('requires product/service',()=>normalizeBusinessContext({...normalized,productsServices:[]}));
throws('requires competitive goal',()=>normalizeBusinessContext({...normalized,competitiveGoals:[]}));
throws('rejects unsupported business model',()=>normalizeBusinessContext({...normalized,businessModel:'invalid'}));

const prompt=businessContextForPrompt({
  ...normalized,userId:'test-user',onboardingCompletedAt:new Date(0).toISOString(),createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString(),
});
check('prompt carries business identity',prompt.includes('COANTO Shop')&&prompt.includes('E-commerce'));
check('known competitors are explicitly leads',prompt.includes('leads only, not verified evidence'));

console.log(`ONBOARDING_SMOKE passed=${passed} failed=${failed}`);
if(failed)process.exit(1);
