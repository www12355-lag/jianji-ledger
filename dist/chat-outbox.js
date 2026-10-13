(function(root){
  class Outbox{
    constructor(sender){this.sender=sender;this.records=new Map();this.inflight=new Map();}
    enqueue(friend,content){
      content=String(content).trim();if(!content||content.length>2000)throw new Error('消息需为 1 至 2000 字');
      const client=root.crypto.randomUUID().replaceAll('-','');
      const record={client,friend,sender:this.sender,content,status:'sending',created:Date.now()/1000,error:''};
      this.records.set(client,record);return record;
    }
    list(friend){return [...this.records.values()].filter(r=>r.friend===friend);}
    reconcile(messages){for(const m of messages)if(m.sender===this.sender&&m.client)this.records.delete(m.client);}
    async deliver(client,transport){
      if(this.inflight.has(client))return this.inflight.get(client);
      const record=this.records.get(client);if(!record)return null;
      record.status='sending';record.error='';
      const attempt=(async()=>{
        try{
          const message=await Promise.resolve().then(()=>transport(record.friend,{content:record.content,clientId:client}));
          if(!message||message.client!==client||message.sender!==this.sender||message.receiver!==record.friend)throw new Error('消息确认失败，可以重试');
          this.records.delete(client);return message;
        }catch(error){if(this.records.has(client)){record.status='failed';record.error=error.message||'发送失败';}throw error;}
        finally{this.inflight.delete(client);}
      })();
      this.inflight.set(client,attempt);return attempt;
    }
    clear(){this.records.clear();}
  }
  root.JianjiChatOutbox={Outbox};if(typeof module!=='undefined')module.exports={Outbox};
})(typeof window!=='undefined'?window:globalThis);
