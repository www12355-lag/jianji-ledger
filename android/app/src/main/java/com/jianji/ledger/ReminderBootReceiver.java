package com.jianji.ledger;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ReminderBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) ReminderScheduler.scheduleAll(context);
    }
}
