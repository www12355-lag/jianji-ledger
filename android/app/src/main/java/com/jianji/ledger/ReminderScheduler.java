package com.jianji.ledger;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

final class ReminderScheduler {
    static final String PREF = "jianji-reminders";
    static final String ACTION = "com.jianji.ledger.REMINDER";

    static JSONArray stored(Context context) {
        try { return new JSONArray(context.getSharedPreferences(PREF, 0).getString("rules", "[]")); }
        catch (Exception error) { return new JSONArray(); }
    }
    static boolean enabled(Context context) { return context.getSharedPreferences(PREF, 0).getBoolean("enabled", false); }
    static void update(Context context, JSONArray rules, boolean enabled) {
        JSONArray old = stored(context);
        for (int i = 0; i < old.length(); i++) cancel(context, old.optJSONObject(i).optString("id"));
        context.getSharedPreferences(PREF, 0).edit().putString("rules", rules.toString()).putBoolean("enabled", enabled).apply();
        if (enabled) scheduleAll(context);
    }
    static void scheduleAll(Context context) {
        if (!enabled(context)) return;
        JSONArray rules = stored(context);
        for (int i = 0; i < rules.length(); i++) schedule(context, rules.optJSONObject(i));
    }
    static void schedule(Context context, JSONObject rule) {
        if (rule == null || !rule.optBoolean("active", true)) return;
        long when = nextTime(rule, System.currentTimeMillis());
        if (when <= 0) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager != null) manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, intent(context, rule.optString("id"), PendingIntent.FLAG_UPDATE_CURRENT));
    }
    static long nextTime(JSONObject rule, long after) {
        try {
            SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            dateFormat.setLenient(false);
            Date first = dateFormat.parse(rule.getString("startDate"));
            Calendar start = Calendar.getInstance(); start.setTime(first);
            int day = start.get(Calendar.DAY_OF_MONTH);
            if ("weekly".equals(rule.optString("frequency"))) {
                Calendar due = (Calendar) start.clone(); due.add(Calendar.DAY_OF_MONTH, -1); atNine(due);
                while (due.getTimeInMillis() <= after) due.add(Calendar.DAY_OF_MONTH, 7);
                return due.getTimeInMillis();
            }
            Calendar month = (Calendar) start.clone(); month.set(Calendar.DAY_OF_MONTH, 1);
            for (int i = 0; i < 1200; i++) {
                Calendar due = (Calendar) month.clone();
                due.set(Calendar.DAY_OF_MONTH, Math.min(day, due.getActualMaximum(Calendar.DAY_OF_MONTH)));
                due.add(Calendar.DAY_OF_MONTH, -1); atNine(due);
                if (due.getTimeInMillis() > after) return due.getTimeInMillis();
                month.add(Calendar.MONTH, "yearly".equals(rule.optString("frequency")) ? 12 : 1);
            }
        } catch (Exception ignored) { }
        return -1;
    }
    private static void atNine(Calendar date) { date.set(Calendar.HOUR_OF_DAY, 9); date.set(Calendar.MINUTE, 0); date.set(Calendar.SECOND, 0); date.set(Calendar.MILLISECOND, 0); }
    private static PendingIntent intent(Context context, String id, int flags) {
        Intent intent = new Intent(context, ReminderReceiver.class).setAction(ACTION + "." + id).putExtra("id", id);
        return PendingIntent.getBroadcast(context, 0, intent, flags | PendingIntent.FLAG_IMMUTABLE);
    }
    private static void cancel(Context context, String id) {
        PendingIntent pending = intent(context, id, PendingIntent.FLAG_NO_CREATE);
        if (pending != null) {
            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (manager != null) manager.cancel(pending);
            pending.cancel();
        }
    }
}
