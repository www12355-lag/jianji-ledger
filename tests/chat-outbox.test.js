const test=require('node:test'),assert=require('node:assert/strict');
const {Outbox}=require('../chat-outbox.js');
test('failed message preserves its content and retries with the same client id',async()=>{
  const queue=new Outbox('alice'),record=queue.enqueue('bob','  一起加油\n继续记账  ');
  await assert.rejects(queue.deliver(record.client,()=>{throw new Error('offline');}),/offline/);
  assert.equal(record.status,'failed');assert.equal(record.content,'一起加油\n继续记账');assert.equal(queue.list('bob').length,1);
  let calls=0,release;
  const transport=(friend,body)=>{calls++;return new Promise(resolve=>release=()=>resolve({id:1,client:body.clientId,sender:'alice',receiver:friend,content:body.content}));};
  const a=queue.deliver(record.client,transport),b=queue.deliver(record.client,transport);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(record.status,'sending');release();
  const [first,second]=await Promise.all([a,b]);assert.equal(first.client,record.client);assert.equal(second.id,first.id);assert.equal(queue.list('bob').length,0);
});
test('a lost acknowledgement is reconciled from history without duplicating a message',async()=>{
  const queue=new Outbox('alice'),record=queue.enqueue('bob','hello');
  await assert.rejects(queue.deliver(record.client,async()=>{throw new Error('timeout');}));
  queue.reconcile([{sender:'carol',client:record.client}]);assert.equal(queue.list('bob').length,1);
  queue.reconcile([{sender:'alice',client:record.client}]);assert.equal(queue.list('bob').length,0);
  assert.equal(await queue.deliver(record.client,()=>{throw new Error('must not send');}),null);
});
test('empty or oversized messages cannot enter the outbox, and history is scoped to the selected friend',()=>{
  const queue=new Outbox('alice');assert.throws(()=>queue.enqueue('bob','   '));assert.throws(()=>queue.enqueue('bob','x'.repeat(2001)));
  queue.enqueue('bob','first');queue.enqueue('carol','second');assert.equal(queue.list('bob').length,1);queue.clear();assert.equal(queue.list('bob').length,0);
});
