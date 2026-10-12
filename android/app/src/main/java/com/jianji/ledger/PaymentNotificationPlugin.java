package com.jianji.ledger;

import android.app.NotificationManager;
import android.os.Build;
import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PaymentNotification")
public class PaymentNotificationPlugin extends Plugin {
    private boolean enabled() {
        ComponentName component = new ComponentName(getContext(), PaymentNotificationListener.class);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
            String listeners = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
            if (listeners == null) return false;
            for (String listener : listeners.split(":")) if (component.equals(ComponentName.unflattenFromString(listener))) return true;
            return false;
        }
        NotificationManager manager = (NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        return manager != null && manager.isNotificationListenerAccessGranted(component);
    }

    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", enabled());
        call.resolve(result);
    }

    @PluginMethod public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) { call.reject("无法打开通知读取权限设置", error); }
    }

    @PluginMethod public void list(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("notices", new PaymentNoticeStore(getContext()).list());
            call.resolve(result);
        } catch (Exception error) { call.reject("支付通知读取失败", error); }
    }

    @PluginMethod public void dismiss(PluginCall call) {
        String id = call.getString("id");
        if (id == null || !id.matches("[a-f0-9]{64}")) { call.reject("通知编号无效"); return; }
        try { new PaymentNoticeStore(getContext()).remove(id); call.resolve(); }
        catch (Exception error) { call.reject("支付通知处理失败", error); }
    }
}
