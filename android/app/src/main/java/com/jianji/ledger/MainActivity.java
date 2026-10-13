package com.jianji.ledger;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.PluginHandle;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebView;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupFilePlugin.class);
        registerPlugin(ReportExportPlugin.class);
        registerPlugin(SocialSessionPlugin.class);
        registerPlugin(CloudSecretPlugin.class);
        registerPlugin(LedgerStorePlugin.class);
        registerPlugin(PaymentNotificationPlugin.class);
        registerPlugin(ImageOcrPlugin.class);
        registerPlugin(AppLockPlugin.class);
        registerPlugin(ReminderPlugin.class);
        registerPlugin(AutoBackupPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                bridge.getWebView().evaluateJavascript(
                    "typeof window.handleAppBack === 'function' && window.handleAppBack()",
                    result -> { if (!"true".equals(result)) moveTaskToBack(true); }
                );
            }
        });
        bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                PluginHandle handle = bridge.getPlugin("AppLock");
                AppLockPlugin lock = handle != null ? (AppLockPlugin) handle.getInstance() : null;
                if (lock != null && lock.isSessionLocked()) { callback.onReceiveValue(null); return true; }
                boolean imageFlow = false;
                for (String type : params.getAcceptTypes()) if (type.startsWith("image/")) imageFlow = true;
                final int token = lock != null && imageFlow ? lock.beginMediaFlow() : 0;
                try {
                    boolean handled = super.onShowFileChooser(webView, result -> {
                        if (lock != null) lock.finishMediaFlow(token);
                        callback.onReceiveValue(result);
                    }, params);
                    if (!handled && lock != null) lock.finishMediaFlow(token);
                    return handled;
                } catch (RuntimeException error) {
                    if (lock != null) lock.finishMediaFlow(token);
                    callback.onReceiveValue(null);
                    return true;
                }
            }
        });
    }
}
