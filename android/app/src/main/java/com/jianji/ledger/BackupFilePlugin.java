package com.jianji.ledger;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BackupFile")
public class BackupFilePlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name");
        String contents = call.getString("contents");
        if (name == null || contents == null || !name.endsWith(".jianji")) {
            call.reject("备份文件格式不正确");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/octet-stream");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        startActivityForResult(call, intent, "savedFile");
    }

    @ActivityCallback
    private void savedFile(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("已取消保存");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("未选定保存位置");
            return;
        }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (output == null) throw new IllegalStateException("无法写入文件");
            output.write(call.getString("contents").getBytes(StandardCharsets.UTF_8));
            call.resolve();
        } catch (Exception error) {
            call.reject("备份文件写入失败", error);
        }
    }
}
