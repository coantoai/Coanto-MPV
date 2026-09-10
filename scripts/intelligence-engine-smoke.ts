import { buildCompetitiveIntelligence, type IntelligenceEvent } from '../src/lib/intelligence-engine.server.ts';

const events: IntelligenceEvent[] = [
  { id:'e1',eventType:'price-change',severity:'high',changeScore:95,title:'Price',summary:'',evidence:{},detectedAt:'2026-09-10T00:00:00.000Z',targetId:'t1' },
  { id:'e2',eventType:'offer-change',severity:'high',changeScore:90,title:'Offer',summary:'',evidence:{},detectedAt:'2026-09-10T01:00:00.000Z',targetId:'t1' },
  { id:'e3',eventType:'messaging-change',severity:'medium',changeScore:75,title:'Message',summary:'',evidence:{},detectedAt:'2026-09-10T02:00:00.000Z',targetId:'t2' },
  { id:'e4',eventType:'error',severity:'high',changeScore:100,title:'Error',summary:'',evidence:{},detectedAt:'2026-09-10T03:00:00.000Z',targetId:'t3' },
];

const result=buildCompetitiveIntelligence({events,analysesCount:4,memoryItemsCount:3,decisionsCount:2});
if(result.meaningfulEvents.length!==3)throw new Error('Meaningful event classification failed.');
if(result.errors.length!==1)throw new Error('Monitoring error classification failed.');
if(result.highPriority.length!==2)throw new Error('High priority classification failed.');
if(result.averageChangeScore!==87)throw new Error(`Unexpected average score: ${result.averageChangeScore}`);
if(!result.insights.some(item=>item.category==='pricing'))throw new Error('Pricing intelligence missing.');
if(!result.insights.some(item=>item.category==='promotion'))throw new Error('Promotion intelligence missing.');
if(!result.insights.some(item=>item.category==='positioning'))throw new Error('Positioning intelligence missing.');
const metric=new Map(result.metrics.map(item=>[item.key,item.value]));
if(metric.get('competitive_changes_30d')!==3||metric.get('monitoring_errors_30d')!==1||metric.get('decisions_30d')!==2)throw new Error('Intelligence metrics failed.');
console.log('INTELLIGENCE_ENGINE_SMOKE_OK',JSON.stringify({insights:result.insights.length,average:result.averageChangeScore}));
