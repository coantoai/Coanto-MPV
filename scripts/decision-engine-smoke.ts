import { buildDecisions } from '../src/lib/decision-engine.server.ts';

const result=buildDecisions([
  {id:'i1',title:'Price pattern',summary:'Two competitors changed price.',category:'pricing',impact:'high',confidence:0.9,evidence:[{eventId:'e1'},{eventId:'e2'}],recommendation:'Review unit economics before changing price.',sourceAnalysisId:'a1'},
  {id:'i2',title:'Offer pattern',summary:'Competitor launched a promotion.',category:'promotion',impact:'medium',confidence:0.8,evidence:[{eventId:'e3'}],recommendation:'Test a differentiated offer before matching the discount.',sourceAnalysisId:null},
  {id:'i3',title:'Unsupported',summary:'No source.',category:'competition',impact:'high',confidence:0.9,evidence:[],recommendation:'Do something unsupported.',sourceAnalysisId:null},
  {id:'i4',title:'Low confidence',summary:'Weak signal.',category:'competition',impact:'high',confidence:0.4,evidence:[{eventId:'e4'}],recommendation:'Wait.',sourceAnalysisId:null},
  {id:'i5',title:'No action',summary:'Observed only.',category:'competition',impact:'medium',confidence:0.8,evidence:[{eventId:'e5'}],recommendation:null,sourceAnalysisId:null},
]);

if(result.decisions.length!==2)throw new Error(`Expected 2 publishable decisions, got ${result.decisions.length}.`);
if(result.decisions[0]?.sourceInsightId!=='i1'||result.decisions[0]?.rank!==1)throw new Error('Decision ranking failed.');
if(result.decisions[0]?.priority!=='high')throw new Error(`Unexpected priority: ${result.decisions[0]?.priority}`);
if(!/^dec_[a-f0-9]{24}$/.test(result.decisions[0]?.decisionKey??''))throw new Error('Stable decision key format failed.');
if(result.rejected.filter(item=>item.reason==='missing-evidence').length!==1)throw new Error('Missing-evidence gate failed.');
if(result.rejected.filter(item=>item.reason==='low-confidence').length!==1)throw new Error('Low-confidence gate failed.');
if(result.rejected.filter(item=>item.reason==='missing-action').length!==1)throw new Error('Missing-action gate failed.');

const replay=buildDecisions([{id:'different-row-id',title:'Price pattern',summary:'New daily row.',category:'pricing',impact:'high',confidence:0.9,evidence:[{eventId:'e1'}],recommendation:'Review unit economics before changing price.',sourceAnalysisId:null}]);
if(replay.decisions[0]?.decisionKey!==result.decisions[0]?.decisionKey)throw new Error('Decision identity must remain stable across intelligence refreshes.');
console.log('DECISION_ENGINE_SMOKE_OK',JSON.stringify({published:result.decisions.length,rejected:result.rejected.length,topScore:result.decisions[0]?.score}));
