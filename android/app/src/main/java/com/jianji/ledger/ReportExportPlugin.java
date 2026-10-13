package com.jianji.ledger;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(name="ReportExport")
public class ReportExportPlugin extends Plugin {
    private int flowToken;
    private boolean active;
    private File pendingImage;

    private AppLockPlugin lock() {
        PluginHandle handle=getBridge().getPlugin("AppLock");
        return handle!=null?(AppLockPlugin)handle.getInstance():null;
    }
    private byte[] image(PluginCall call) {
        String name=call.getString("name"), contents=call.getString("contents");
        if(name==null || !name.matches("[\\p{L}\\p{N}._-]{1,80}\\.png") || name.contains("..") || contents==null || contents.length()>8000000) throw new IllegalArgumentException("小报文件格式无效");
        byte[] bytes=Base64.decode(contents,Base64.DEFAULT);
        byte[] signature={(byte)137,80,78,71,13,10,26,10};
        if(bytes.length<signature.length || bytes.length>6000000) throw new IllegalArgumentException("小报图片大小无效");
        for(int i=0;i<signature.length;i++)if(bytes[i]!=signature[i])throw new IllegalArgumentException("小报图片格式无效");
        return bytes;
    }
    private File prepareImage(PluginCall call) throws Exception {
        byte[] bytes=image(call);
        // Capacitor saves call options in Activity state. Keep the PNG out of the Binder bundle.
        call.getData().remove("contents");
        File directory=new File(getContext().getCacheDir(),"share-reports");
        if(!directory.exists()&&!directory.mkdirs())throw new IllegalStateException("无法准备图片缓存");
        File[] oldFiles=directory.listFiles();
        if(oldFiles!=null)for(File old:oldFiles)if(System.currentTimeMillis()-old.lastModified()>86400000L)old.delete();
        File file=new File(directory,UUID.randomUUID()+".png");
        try(FileOutputStream output=new FileOutputStream(file)){output.write(bytes);}
        call.getData().put("cacheFile",file.getName());
        return file;
    }
    private File cachedImage(PluginCall call) {
        String name=call.getString("cacheFile");
        if(name==null||!name.matches("[a-f0-9-]{36}\\.png"))return null;
        File file=new File(new File(getContext().getCacheDir(),"share-reports"),name);
        return file.isFile()?file:null;
    }
    private boolean begin(PluginCall call) {
        AppLockPlugin appLock=lock();
        if(active){call.reject("导出窗口已打开");return false;}
        if(appLock!=null && appLock.isSessionLocked()){call.reject("请先解锁简记");return false;}
        flowToken=appLock!=null?appLock.beginMediaFlow():0;
        active=true;return true;
    }
    private void finish() {
        AppLockPlugin appLock=lock();if(appLock!=null)appLock.finishMediaFlow(flowToken);
        flowToken=0;active=false;pendingImage=null;
    }
    @PluginMethod public void save(PluginCall call) {
        getActivity().runOnUiThread(()->{
            if(!begin(call))return;
            try{
                pendingImage=prepareImage(call);
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("image/png");
                intent.putExtra(Intent.EXTRA_TITLE,call.getString("name"));
                startActivityForResult(call,intent,"savedImage");
            }catch(Exception error){finish();call.reject("无法打开图片保存窗口",error);}
        });
    }
    @ActivityCallback private void savedImage(PluginCall call,ActivityResult result) {
        if(call==null){finish();return;}
        try{
            if(result.getResultCode()!=Activity.RESULT_OK || result.getData()==null || result.getData().getData()==null){JSObject response=new JSObject();response.put("cancelled",true);call.resolve(response);return;}
            Uri uri=result.getData().getData();
            if(pendingImage==null)pendingImage=cachedImage(call);
            if(pendingImage==null)throw new IllegalStateException("小报图片已失效，请重新导出");
            try(OutputStream output=getContext().getContentResolver().openOutputStream(uri,"w");FileInputStream input=new FileInputStream(pendingImage)){
                if(output==null)throw new IllegalStateException("无法写入图片");
                byte[] buffer=new byte[8192];int length;while((length=input.read(buffer))!=-1)output.write(buffer,0,length);
            }
            call.resolve();
        }catch(Exception error){call.reject("小报图片保存失败",error);}finally{if(pendingImage!=null)pendingImage.delete();finish();}
    }
    @PluginMethod public void share(PluginCall call) {
        getActivity().runOnUiThread(()->{
            if(!begin(call))return;
            try{
                File file=prepareImage(call);
                Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",file);
                Intent intent=new Intent(Intent.ACTION_SEND);intent.setType("image/png");
                intent.putExtra(Intent.EXTRA_STREAM,uri);intent.setClipData(ClipData.newRawUri("账本小报",uri));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser=Intent.createChooser(intent,"分享账本小报");chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivityForResult(call,chooser,"sharedImage");
            }catch(Exception error){finish();call.reject("无法打开图片分享窗口",error);}
        });
    }
    @ActivityCallback private void sharedImage(PluginCall call,ActivityResult result) { finish();if(call!=null)call.resolve(); }
}
