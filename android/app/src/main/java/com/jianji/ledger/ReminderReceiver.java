package com.jianji.ledger;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

public class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("id");
        if (id == null || !(ReminderScheduler.ACTION + "." + id).equals(intent.getAction()) || !ReminderScheduler.enabled(context)) return;
        JSONArray rules = ReminderScheduler.stored(context);
        for (int i = 0; i < rules.length(); i++) {
            JSONObject rule = rules.optJSONObject(i);
            if (rule == null || !id.equals(rule.optString("id")) || !rule.optBoolean("active", true)) continue;
            if (ReminderScheduler.onceDelivered(context, rule)) return;
            if ("once".equals(rule.optString("frequency"))) {
                long now = System.currentTimeMillis(), next = ReminderScheduler.nextTime(rule, now);
                if (next < 0) return;
                if (next > now + 6000) { ReminderScheduler.schedule(context, rule); return; }
            }
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                boolean possession = "possession".equals(rule.optString("kind"));
                String channel = possession ? "jianji-possessions" : "jianji-recurring";
                if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(channel, possession ? "物品保修与保养" : "固定账单提醒", NotificationManager.IMPORTANCE_DEFAULT));
                Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                PendingIntent open = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, channel) : new Notification.Builder(context);
                Notification notice = builder
                        .setSmallIcon(R.mipmap.ic_launcher).setContentTitle(possession ? "简记：物品提醒" : "简记：固定账单即将到期")
                        .setContentText(possession ? "归物本中有保修或保养日期需要留意，打开简记查看。" : "近期有一笔周期账目待确认，打开简记查看。")
                        .setContentIntent(open).setAutoCancel(true).build();
                try { if (manager.areNotificationsEnabled()) { manager.notify(id.hashCode(), notice); ReminderScheduler.markOnceDelivered(context, rule); } } catch (SecurityException ignored) { }
            }
            if ("once".equals(rule.optString("frequency"))) return;
            ReminderScheduler.schedule(context, rule);
            return;
        }
    }
}
