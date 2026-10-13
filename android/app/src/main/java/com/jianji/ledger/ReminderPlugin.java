package com.jianji.ledger;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

@CapacitorPlugin(name = "Reminder")
public class ReminderPlugin extends Plugin {
    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", ReminderScheduler.enabled(getContext()));
        result.put("permission", Build.VERSION.SDK_INT < 33 || getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
        call.resolve(result);
    }
    @PluginMethod public void configure(PluginCall call) {
        JSONArray rules = call.getArray("rules");
        Boolean enabled = call.getBoolean("enabled");
        if (rules == null || enabled == null || rules.length() > 3000) { call.reject("提醒规则无效"); return; }
        ReminderScheduler.update(getContext(), rules, enabled);
        if (enabled && Boolean.TRUE.equals(call.getBoolean("askPermission")) && Build.VERSION.SDK_INT >= 33 && getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            getActivity().requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 801);
        call.resolve();
    }
}
