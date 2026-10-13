(function(root){
  const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function validDate(value) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return false;
    const [y,m,d]=value.split('-').map(Number), date=new Date(y,m-1,d);
    return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d;
  }
  function range(mode,year,month,start,end) {
    if(mode==='custom') {
      if(!validDate(start)||!validDate(end)||start>end) throw new Error('请选择有效日期，开始日期不能晚于结束日期');
      return {start,end,label:'自选日期'};
    }
    if(mode==='year') return {start:`${year}-01-01`,end:`${year}-12-31`,label:`${year}年`};
    return {start:iso(new Date(year,month,1)),end:iso(new Date(year,month+1,0)),label:`${year}年${month+1}月`};
  }
  const within=(entry,bounds)=>!entry.deletedAt && entry.date>=bounds.start && entry.date<=bounds.end;
  function buckets(bounds) {
    const [sy,sm]=bounds.start.split('-').map(Number),[ey,em]=bounds.end.split('-').map(Number);
    const count=(ey-sy)*12+em-sm+1, result=[];
    if(count>24) {
      for(let y=sy;y<=ey;y++) result.push({key:String(y),label:`${y}年`});
    } else {
      for(let i=0;i<count;i++){const date=new Date(sy,sm-1+i,1);result.push({key:iso(date).slice(0,7),label:`${date.getFullYear()!==sy?date.getFullYear()+'年':''}${date.getMonth()+1}月`});}
    }
    return result;
  }
  function preferences(value) {
    const source=value&&typeof value==='object'?value:{};
    return {quick:source.quick!==false,templates:source.templates!==false,savings:source.savings!==false,recent:source.recent!==false};
  }
  const api={iso,validDate,range,within,buckets,preferences};
  root.JianjiReporting=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
