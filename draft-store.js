(function(root){
 let pending=Promise.resolve();
 function database(){return new Promise((resolve,reject)=>{const request=indexedDB.open('jianji-entry-draft',1);request.onupgradeneeded=()=>request.result.createObjectStore('draft');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 async function transact(mode,action){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('draft',mode);let result;action(tx.objectStore('draft'),value=>{result=value;});tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('草稿保存失败'));};});}
 function enqueue(action){const operation=pending.then(action);pending=operation.catch(()=>{});return operation;}
 const read=()=>enqueue(()=>transact('readonly',(store,done)=>{const entry=store.get('entry'),photo=store.get('photo');photo.onsuccess=()=>done(entry.result?{...entry.result,photo:photo.result||null}:null);}));
 const write=(value,photo,updatePhoto)=>enqueue(()=>transact('readwrite',store=>{store.put(value,'entry');if(updatePhoto){if(photo)store.put(photo,'photo');else store.delete('photo');}}));
 const clear=()=>enqueue(()=>transact('readwrite',store=>store.clear()));
 const meaningful=draft=>Boolean(draft.amount||draft.note||draft.merchant||draft.photo||draft.hasPhoto||draft.projects?.length||draft.splits?.some(part=>part.amount));
 const api={read,write,clear,meaningful,flush:()=>pending};
 if(typeof module!=='undefined')module.exports=api;root.JianjiDraftStore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
