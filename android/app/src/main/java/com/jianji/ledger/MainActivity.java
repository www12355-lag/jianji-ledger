package com.jianji.ledger;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupFilePlugin.class);
        registerPlugin(LedgerStorePlugin.class);
        registerPlugin(PaymentNotificationPlugin.class);
        registerPlugin(ImageOcrPlugin.class);
        registerPlugin(AppLockPlugin.class);
        registerPlugin(ReminderPlugin.class);
        registerPlugin(AutoBackupPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
