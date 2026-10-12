package com.jianji.ledger;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "AutoBackup")
public class AutoBackupPlugin extends Plugin {
    private static final String PREFS = "jianji-auto-backup";
    private static final String KEY = "jianji-auto-backup-key";

    private android.content.SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, 0); }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("configured", prefs().contains("folder") && prefs().contains("password"));
        result.put("hasFolder", prefs().contains("folder"));
        result.put("lastSavedAt", prefs().getString("lastSavedAt", ""));
        call.resolve(result);
    }

    @PluginMethod
    public void chooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "folderChosen");
    }

    @ActivityCallback
    private void folderChosen(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("已取消选择目录");
            return;
        }
        Uri uri = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            prefs().edit().putString("folder", uri.toString()).apply();
            call.resolve();
        } catch (Exception error) { call.reject("无法取得目录写入权限", error); }
    }

    private SecretKey secretKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    @PluginMethod
    public void setPassword(PluginCall call) {
        String password = call.getString("password", "");
        if (password.length() < 8) { call.reject("备份密码至少 8 位"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey());
            byte[] encrypted = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));
            prefs().edit().putString("password", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).apply();
            call.resolve();
        } catch (Exception error) { call.reject("无法安全保存备份密码", error); }
    }

    @PluginMethod
    public void getPassword(PluginCall call) {
        try {
            String value = prefs().getString("password", null);
            String iv = prefs().getString("iv", null);
            if (value == null || iv == null) { call.reject("请先设置自动备份密码"); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            JSObject result = new JSObject();
            result.put("password", new String(cipher.doFinal(Base64.decode(value, Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) { call.reject("备份密码无法读取，请重新设置", error); }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        prefs().edit().remove("folder").remove("password").remove("iv").apply();
        call.resolve();
    }

    @PluginMethod
    public void write(PluginCall call) {
        String content = call.getString("contents", "");
        String folder = prefs().getString("folder", null);
        if (folder == null || !prefs().contains("password")) { call.reject("请先设置自动备份"); return; }
        if (content.length() == 0 || content.length() > 50 * 1024 * 1024) { call.reject("备份文件大小不正确"); return; }
        try {
            org.json.JSONObject envelope = new org.json.JSONObject(content);
            if (!"jianji-backup".equals(envelope.optString("format")) || envelope.optInt("version") != 1) {
                call.reject("只能写入加密的简记备份"); return;
            }
            Uri tree = Uri.parse(folder);
            String name = "简记自动备份-" + new java.text.SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", java.util.Locale.US).format(new java.util.Date()) + ".jianji";
            Uri file = DocumentsContract.createDocument(getContext().getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)), "application/octet-stream", name);
            if (file == null) throw new IllegalStateException("无法创建备份文件");
            try (OutputStream output = getContext().getContentResolver().openOutputStream(file, "w")) {
                if (output == null) throw new IllegalStateException("无法写入备份文件");
                output.write(content.getBytes(StandardCharsets.UTF_8));
            } catch (Exception error) {
                DocumentsContract.deleteDocument(getContext().getContentResolver(), file);
                throw error;
            }
            String savedAt = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", java.util.Locale.US).format(new java.util.Date());
            prefs().edit().putString("lastSavedAt", savedAt).apply();
            JSObject result = new JSObject();
            result.put("savedAt", savedAt);
            result.put("name", name);
            call.resolve(result);
        } catch (Exception error) { call.reject("自动备份写入失败，请检查目录权限和剩余空间", error); }
    }
}
