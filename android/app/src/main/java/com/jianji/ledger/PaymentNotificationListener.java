package com.jianji.ledger;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public class PaymentNotificationListener extends NotificationListenerService {
    @Override public void onNotificationPosted(StatusBarNotification notification) {
        String packageName = notification.getPackageName();
        if (!"com.tencent.mm".equals(packageName) && !"com.eg.android.AlipayGphone".equals(packageName)) return;
        Notification payload = notification.getNotification();
        if (payload == null || payload.extras == null) return;
        CharSequence title = payload.extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence body = payload.extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (body == null) body = payload.extras.getCharSequence(Notification.EXTRA_TEXT);
        if (body == null) {
            CharSequence[] lines = payload.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) body = android.text.TextUtils.join(" ", lines);
        }
        PaymentNoticeParser.Result parsed = PaymentNoticeParser.parse(packageName,
                title == null ? "" : title.toString(), body == null ? "" : body.toString());
        if (parsed == null) return;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                    (notification.getKey() + ":" + notification.getPostTime()).getBytes(StandardCharsets.UTF_8));
            StringBuilder id = new StringBuilder();
            for (byte part : digest) id.append(String.format("%02x", part & 0xff));
            new PaymentNoticeStore(this).add(id.toString(), parsed.source, parsed.cents, notification.getPostTime());
        } catch (Exception ignored) { /* A notification must never interrupt the payment app. */ }
    }
}
