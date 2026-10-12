const assert=require('node:assert/strict');
const {progress}=require('../savings.js');
const {createBackup,readBackup}=require('../backup-tools.js');
const goal={id:'goal',name:'旅行基金',target:1200,deadline:'2026-12-31',contributions:[{id:'first',amount:200.1,date:'2026-10-12',note:'本月结余'},{id:'second',amount:99.9,date:'2026-10-13'}]};
assert.deepEqual(progress(goal,'2026-10-12'),{saved:300,remaining:900,percent:25,complete:false,overdue:false,monthly:300});
assert.equal(progress(goal,'2027-01-01').overdue,true);
assert.equal(progress({...goal,deadline:''},'2026-10-12').monthly,null);
assert.equal(progress({...goal,target:250},'2026-10-12').percent,100);
assert.equal(progress({...goal,target:250},'2026-10-12').remaining,0);
assert.equal(progress({...goal,contributions:[goal.contributions[0]]},'2026-10-12').saved,200.1);
(async()=>{
 const ledger={entries:[],budgets:{},savingsGoals:[goal]};
 const restored=await readBackup(await createBackup(ledger,[],'savings-password'),'savings-password');
 assert.deepEqual(restored.data,ledger);
 await assert.rejects(createBackup({...ledger,savingsGoals:[{...goal,contributions:[{id:'bad',amount:-1,date:'2026-10-12'}]}]},[],'savings-password'),/储蓄目标/);
 console.log('Savings progress and backup: passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
