package com.jianji.ledger;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "CloudSecret")
public class CloudSecretPlugin extends Plugin {
    private static final String ALIAS = "jianji-cloud-secret-v1";
    private static final String PREFS = "jianji-cloud-secret";

    private boolean allowed(PluginCall call) {
        PluginHandle handle = getBridge().getPlugin("AppLock");
        AppLockPlugin lock = handle != null ? (AppLockPlugin) handle.getInstance() : null;
        if (lock != null && lock.isSessionLocked()) { call.reject("请先解锁简记"); return false; }
        return true;
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    @PluginMethod public void read(PluginCall call) {
        if (!allowed(call)) return;
        try {
            String saved = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("session", "");
            JSObject result = new JSObject();
            if (saved.isEmpty()) { result.put("value", ""); call.resolve(result); return; }
            String[] parts = saved.split(":", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) { call.reject("云备份凭据无法读取，请重新填写备份密码并保存设置"); }
    }

    @PluginMethod public void write(PluginCall call) {
        if (!allowed(call)) return;
        try {
            String value = call.getString("value", "");
            if (value.isEmpty() || value.length() > 2048) { call.reject("云备份凭据无效"); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
                Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("session", encrypted).commit()) {
                call.reject("云备份凭据保存失败"); return;
            }
            call.resolve();
        } catch (Exception error) { call.reject("云备份凭据保存失败"); }
    }

    @PluginMethod public void clear(PluginCall call) {
        if (!allowed(call)) return;
        if (!getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()) {
            call.reject("云备份凭据清除失败"); return;
        }
        call.resolve();
    }
}
