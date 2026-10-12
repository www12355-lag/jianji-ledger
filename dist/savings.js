(function(root) {
  function progress(goal, today = new Date().toLocaleDateString('en-CA')) {
    const saved = Math.round(goal.contributions.reduce((sum,item) => sum + Number(item.amount),0) * 100) / 100;
    const remaining = Math.max(0, Math.round((goal.target-saved)*100)/100);
    const months = goal.deadline ? Math.max(1,(Number(goal.deadline.slice(0,4))-Number(today.slice(0,4)))*12 + Number(goal.deadline.slice(5,7))-Number(today.slice(5,7)) + 1) : null;
    return {saved,remaining,percent:Math.min(100,saved/goal.target*100),complete:remaining===0,overdue:!!goal.deadline && goal.deadline<today && remaining>0,monthly:months ? Math.ceil(remaining/months*100)/100 : null};
  }
  const api={progress}; if(typeof module!=='undefined') module.exports=api; root.JianjiSavings=api;
})(typeof globalThis!=='undefined'?globalThis:this);
