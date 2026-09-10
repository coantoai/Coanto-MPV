import { buildAlertCandidates, buildExecutiveDigest, type AlertPreferences } from '../src/lib/alerts-reports.server.ts';

const preferences:AlertPreferences={minimumChangeScore:70,includeDecisions:true,includeIntelligence:true,digestFrequency:'weekly'};
const monitoring=[
  {id:'m1',eventType:'price-change',severity:'high',changeScore:91,title:'Price up',summary:'Competitor raised price.',evidence:{source:'snapshot'},detectedAt:'2026-09-10T10:00:00.000Z'},
  {id:'m2',eventType:'content-change',severity:'low',changeScore:45,title:'Minor copy',summary:'Small copy edit.',evidence:{source:'snapshot'},detectedAt:'2026-09-10T11:00:00.000Z'},
  {id:'m3',eventType:'error',severity:'high',changeScore:100,title:'Fetch failed',summary:'Network error.',evidence:{},detectedAt:'2026-09-10T12:00:00.000Z'},
];
const decisions=[
  {id:'d1',status:'proposed',priority:'high',score:88,confidence:.9,evidenceCount:2,evidence:[{eventId:'m1'}],title:'Protect premium position',action:'Test value messaging before changing price.',lastSeenAt:'2026-09-10T12:30:00.000Z'},
  {id:'d2',status:'proposed',priority:'high',score:90,confidence:.92,evidenceCount:0,evidence:[],title:'Unsupported',action:'Do not surface.',lastSeenAt:'2026-09-10T12:40:00.000Z'},
];
const intelligence=[
  {id:'i1',impact:'high',confidence:.9,title:'Pricing pressure',summary:'Price movement observed.',recommendation:'Review margins.',evidence:[{eventId:'m1'}],createdAt:'2026-09-10T13:00:00.000Z'},
  {id:'i2',impact:'high',confidence:.95,title:'No evidence',summary:'Unsupported.',recommendation:null,evidence:[],createdAt:'2026-09-10T13:05:00.000Z'},
];

const alerts=buildAlertCandidates({preferences,monitoring,decisions,intelligence});
if(alerts.length!==3)throw new Error(`Expected 3 evidence-worthy alerts, got ${alerts.length}`);
if(!alerts.some(item=>item.alertKey==='monitoring:m1'))throw new Error('High-value monitoring alert missing.');
if(alerts.some(item=>item.alertKey==='monitoring:m2'||item.alertKey==='monitoring:m3'))throw new Error('Noise/error monitoring event leaked into alerts.');
if(!alerts.some(item=>item.alertKey==='decision:d1')||alerts.some(item=>item.alertKey==='decision:d2'))throw new Error('Decision evidence gate failed.');
if(!alerts.some(item=>item.alertKey==='intelligence:i1')||alerts.some(item=>item.alertKey==='intelligence:i2'))throw new Error('Intelligence evidence gate failed.');
if(alerts[0]?.score!==91&&alerts[0]?.score!==93)throw new Error('Alert priority ordering failed.');

const digest=buildExecutiveDigest({businessName:'COANTO Test',periodStart:'2026-09-03T00:00:00.000Z',periodEnd:'2026-09-10T14:00:00.000Z',competitors:4,activeMonitoring:3,monitoringChanges:monitoring,decisions,intelligence,evidenceLinks:7,unreadAlerts:2});
if(!digest.reportKey.startsWith('competitive-digest:'))throw new Error('Digest key missing.');
if(!digest.summary.includes('1 تغيّر تنافسي'))throw new Error(`Unexpected digest summary: ${digest.summary}`);
const payload=digest.payload as Record<string,unknown>;
const health=payload['health'] as Record<string,unknown>;
if(health['evidenceLinks']!==7||health['actionableDecisions']!==1)throw new Error('Digest health metrics failed.');
const topDecision=payload['topDecision'] as Record<string,unknown>;
if(topDecision['id']!=='d1')throw new Error('Digest top decision evidence gate failed.');
console.log('ALERTS_REPORTS_SMOKE_OK',JSON.stringify({alerts:alerts.length,reportKey:digest.reportKey}));
