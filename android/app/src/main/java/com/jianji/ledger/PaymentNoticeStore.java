package com.jianji.ledger;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;

final class PaymentNoticeStore extends SQLiteOpenHelper {
    PaymentNoticeStore(Context context) { super(context, "jianji-payment-notices.db", null, 1); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE notices (id TEXT PRIMARY KEY, source TEXT NOT NULL, cents INTEGER NOT NULL, received_at INTEGER NOT NULL, dismissed INTEGER NOT NULL DEFAULT 0)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }

    void add(String id, String source, long cents, long receivedAt) {
        try (SQLiteDatabase db = getWritableDatabase()) {
            ContentValues values = new ContentValues();
            values.put("id", id);
            values.put("source", source);
            values.put("cents", cents);
            values.put("received_at", receivedAt);
            db.insertWithOnConflict("notices", null, values, SQLiteDatabase.CONFLICT_IGNORE);
            db.delete("notices", "received_at < ?", new String[]{String.valueOf(System.currentTimeMillis() - 90L * 86400000L)});
            db.execSQL("DELETE FROM notices WHERE id NOT IN (SELECT id FROM notices ORDER BY received_at DESC LIMIT 500)");
        }
    }

    JSONArray list() throws Exception {
        JSONArray result = new JSONArray();
        try (SQLiteDatabase db = getReadableDatabase();
             Cursor rows = db.rawQuery("SELECT id,source,cents,received_at FROM notices WHERE dismissed = 0 ORDER BY received_at DESC LIMIT 100", null)) {
            while (rows.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("id", rows.getString(0));
                item.put("source", rows.getString(1));
                item.put("amount", rows.getLong(2) / 100.0);
                item.put("receivedAt", rows.getLong(3));
                result.put(item);
            }
        }
        return result;
    }

    void remove(String id) {
        try (SQLiteDatabase db = getWritableDatabase()) {
            ContentValues values = new ContentValues();
            values.put("dismissed", 1);
            db.update("notices", values, "id = ?", new String[]{id});
        }
    }
}
