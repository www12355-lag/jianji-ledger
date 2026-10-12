package com.jianji.ledger;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {
    private static final String PREF = "jianji-app-lock";
    private long authenticatedAt = 0;
    private boolean activePrompt = false;
    private int authenticators() { return BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL; }

    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", getContext().getSharedPreferences(PREF, 0).getBoolean("enabled", false));
        call.resolve(result);
    }

    @PluginMethod public void authenticate(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (activePrompt) { call.reject("验证窗口已打开"); return; }
            if (BiometricManager.from(getContext()).canAuthenticate(authenticators()) != BiometricManager.BIOMETRIC_SUCCESS) {
                call.reject("请先在手机系统中设置指纹、面容或屏幕锁"); return;
            }
            activePrompt = true;
            BiometricPrompt prompt = new BiometricPrompt((FragmentActivity) getActivity(), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    activePrompt = false;
                    authenticatedAt = android.os.SystemClock.elapsedRealtime();
                    call.resolve();
                }
                @Override public void onAuthenticationError(int code, CharSequence message) {
                    activePrompt = false;
                    call.reject(message.toString());
                }
            });
            prompt.authenticate(new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("解锁简记")
                    .setSubtitle("使用指纹、面容或手机屏幕锁")
                    .setAllowedAuthenticators(authenticators())
                    .build());
        });
    }

    @PluginMethod public void setEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null || authenticatedAt == 0 || android.os.SystemClock.elapsedRealtime() - authenticatedAt > 30000) {
            call.reject("请先完成系统身份验证"); return;
        }
        getContext().getSharedPreferences(PREF, 0).edit().putBoolean("enabled", enabled).apply();
        authenticatedAt = 0;
        call.resolve();
    }
}
