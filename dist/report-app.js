let reportFile=null,reportRenderId=0,reportExportBusy=false;
function openShareReport(){
  $('reportAnchor').max=JianjiReporting.iso(new Date());
  const today=JianjiReporting.iso(new Date()), selected=JianjiReporting.iso(view);
  $('reportAnchor').value=key()===today.slice(0,7)||selected>today?today:selected;
  $('reportMode').value='month';$('reportHideAmounts').checked=true;$('reportHideCategories').checked=false;
  open('shareReportModal');renderShareReport();
}
async function renderShareReport(){
  const id=++reportRenderId;reportFile=null;setReportButtons();
  try{
    const bounds=JianjiShareReport.period($('reportMode').value,$('reportAnchor').value), summary=JianjiShareReport.summarize(data.entries,bounds);
    const report={bounds,summary,comparison:JianjiShareReport.comparison(data.entries,bounds,summary)};
    (bounds.mode==='year'?drawAnnualPoster:drawReportPoster)($('reportCanvas'),report,{theme:$('reportTheme').value,name:$('reportName').value,hideAmounts:$('reportHideAmounts').checked,hideCategories:$('reportHideCategories').checked});
    $('reportCanvas').setAttribute('aria-label',`${bounds.label}预览：${summary.count}笔收支，${summary.recordedDays}天有记录。${$('reportHideAmounts').checked?'具体金额已隐藏。':`收入${money(summary.income)}，净支出${money(summary.net)}，收支结余${money(summary.balance)}。`}${$('reportHideCategories').checked?'分类已隐藏。':summary.title}`);
    $('reportCanvas').hidden=false;
    $('reportStatus').textContent=`${bounds.label} · ${formatDate(bounds.start)}${bounds.mode==='day'?'':' 至 '+formatDate(bounds.end)}${bounds.incomplete?'（截至 '+formatDate(bounds.through)+'）':''}`;
    const blob=await new Promise(resolve=>$('reportCanvas').toBlob(resolve,'image/png'));
    if(id!==reportRenderId)return;if(!blob)throw new Error('图片生成失败，请重试');
    reportFile=new File([blob],`简记-${bounds.label}-${bounds.start}.png`,{type:'image/png'});
  }catch(error){if(id===reportRenderId){$('reportCanvas').hidden=true;$('reportStatus').textContent=error.message||'暂时无法生成小报';}}
  finally{if(id===reportRenderId)setReportButtons();}
}
function setReportButtons(){
  $('saveShareReport').disabled=$('shareReport').disabled=!reportFile||reportExportBusy;
  $('shareReport').hidden=!onAndroid()&&!(navigator.share&&navigator.canShare);
}
async function exportShareReport(share){
  if(!reportFile||reportExportBusy)return;
  if(!$('appLockOverlay').hidden)return;
  const file=reportFile;reportExportBusy=true;setReportButtons();
  try{
    if(onAndroid()){
      const contents=$('reportCanvas').toDataURL('image/png').split(',')[1];
      const result=await window.Capacitor.nativePromise('ReportExport',share?'share':'save',{name:file.name,contents});
      toast(result?.cancelled?'已取消保存':share?'已返回简记':'小报图片已保存');
    }else if(share){
      if(!navigator.canShare?.({files:[file]}))return toast('此浏览器不支持图片分享，请先保存图片');
      await navigator.share({files:[file],title:'简记 · 账本小报'});
    }else{
      const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('小报图片已下载');
    }
  }catch(error){if(error.name!=='AbortError')toast(error.message||'导出未完成，请重试');}
  finally{reportExportBusy=false;setReportButtons();}
}
function setupShareReport(){
  $('openShareReport').onclick=openShareReport;
  for(const id of ['reportMode','reportAnchor','reportTheme','reportName','reportHideAmounts','reportHideCategories'])$(id).addEventListener('input',renderShareReport);
  $('saveShareReport').onclick=()=>exportShareReport(false);$('shareReport').onclick=()=>exportShareReport(true);
}
