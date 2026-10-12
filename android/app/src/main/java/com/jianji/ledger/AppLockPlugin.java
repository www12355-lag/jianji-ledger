package com.jianji.ledger;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.fragment.app.FragmentActivity;
import androidx.core.content.ContextCompat;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.PowerManager;
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
    private AppLockSession session;
    private BroadcastReceiver screenReceiver;
    private int authenticators() { return BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL; }

    @Override public void load() {
        session = new AppLockSession(getContext().getSharedPreferences(PREF, 0).getBoolean("enabled", false));
        session.setDelay(getContext().getSharedPreferences(PREF, 0).getLong("delayMs", 0));
        screenReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                session.screenOff();
                notifyLockState();
            }
        };
        ContextCompat.registerReceiver(getContext(), screenReceiver, new IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private void notifyLockState() {
        getActivity().runOnUiThread(() -> getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('jianji-app-lock-state'));", null));
    }

    int beginMediaFlow() { return session.beginMedia(); }
    void finishMediaFlow(int token) { session.finishMedia(token); notifyLockState(); }
    boolean isSessionLocked() { return session.isLocked(); }

    @PluginMethod public void sessionState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("locked", session.isLocked());
            result.put("mediaOpen", session.isMediaOpen());
            call.resolve(result);
        });
    }

    @Override protected void handleOnStop() {
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (power != null && !power.isInteractive()) session.screenOff();
        else session.stopped(activePrompt);
        notifyLockState();
    }

    @Override protected void handleOnDestroy() {
        if (screenReceiver != null) getContext().unregisterReceiver(screenReceiver);
    }
    @Override protected void handleOnResume() { session.resumed(); notifyLockState(); }

    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", getContext().getSharedPreferences(PREF, 0).getBoolean("enabled", false));
        result.put("delayMs", getContext().getSharedPreferences(PREF, 0).getLong("delayMs", 0));
        call.resolve(result);
    }

    @PluginMethod public void setDelay(PluginCall call) {
        Integer delay = call.getInt("delayMs");
        if (delay == null || (delay != 0 && delay != 30000 && delay != 60000)) { call.reject("锁定时间无效"); return; }
        if (authenticatedAt == 0 || android.os.SystemClock.elapsedRealtime() - authenticatedAt > 30000) { call.reject("请先完成系统身份验证"); return; }
        getActivity().runOnUiThread(() -> {
            getContext().getSharedPreferences(PREF, 0).edit().putLong("delayMs", delay).apply();
            authenticatedAt = 0;
            session.setDelay(delay);
            call.resolve();
        });
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
                    session.authenticated();
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
        session.setEnabled(enabled);
        call.resolve();
    }
}
