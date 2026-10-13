const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const report=require('../social-report.js');
function runtime(){
  const state={enabled:true,mode:'week',hideAmounts:true,hideCategories:true,shareBudget:false,recipients:['friend'],published:{}};
  const calls=[],status={hidden:true,textContent:''};
  const context=vm.createContext({Map,Set,Date,JSON,Uint8Array,TextEncoder,crypto:require('node:crypto').webcrypto,
    clearTimeout(){},setTimeout(){return 1;},document:{hidden:false},navigator:{onLine:true},$:()=>status,
    socialSession:{token:'test-token'},socialState:{user:{id:'me'},friends:[{id:'friend'}],reports:[]},socialBusy:false,
    data:{entries:[],budgets:{}},JianjiSocialReport:report,JianjiReporting:{iso:d=>d.toISOString().slice(0,10)},socialLabels:{week:'周报'},confirm:()=>true});
  vm.runInContext(fs.readFileSync(require.resolve('../social-my.js'),'utf8'),context);
  context.autoOptions=()=>state;context.storeAuto=v=>Object.assign(state,v);context.refreshSocial=async()=>{};
  context.socialStatus=()=>{};context.socialRequest=async(...args)=>{calls.push(args);return {ok:true};};
  context.renderAutoSummary=()=>{};
  return {context,state,calls};
}
test('automatic sharing uploads once concurrently, skips identical content and respects disable/lock/offline',async()=>{
  const {context,state,calls}=runtime();
  await vm.runInContext('Promise.all([runSocialAuto(),runSocialAuto()])',context);
  assert.equal(calls.length,1);assert.equal(calls[0][2].report.net,null);
  await vm.runInContext('runSocialAuto()',context);assert.equal(calls.length,1);
  state.enabled=false;state.published={};await vm.runInContext('runSocialAuto()',context);assert.equal(calls.length,1);
  state.enabled=true;context.$=()=>({hidden:false});await vm.runInContext('runSocialAuto()',context);assert.equal(calls.length,1);
  context.$=()=>({hidden:true});context.navigator.onLine=false;
  await assert.rejects(vm.runInContext('runSocialAuto()',context),/离线/);assert.equal(calls.length,1);
});
test('withdrawing an automatic report disables sharing and cancelling keeps it untouched',async()=>{
  const {context,state,calls}=runtime();
  const current=report.create([],{},'week',new Date().toISOString().slice(0,10));
  context.socialState.reports=[{id:'report',report:current}];
  context.confirm=()=>false;await vm.runInContext("revokeSocialReport('report')",context);
  assert.equal(state.enabled,true);assert.equal(calls.length,0);
  context.confirm=()=>true;await vm.runInContext("revokeSocialReport('report')",context);
  assert.equal(state.enabled,false);assert.equal(calls[0][0],'/v1/reports/report');assert.equal(calls[0][1],'DELETE');
});
