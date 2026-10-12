package com.jianji.ledger;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "LedgerStore")
public class LedgerStorePlugin extends Plugin {
    private static class Database extends SQLiteOpenHelper {
        Database(LedgerStorePlugin plugin) { super(plugin.getContext(), "jianji-ledger.db", null, 1); }
        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE entries (id TEXT PRIMARY KEY, payload TEXT NOT NULL)");
            db.execSQL("CREATE TABLE state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL)");
        }
        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }
    }

    @PluginMethod
    public void load(PluginCall call) {
        try (SQLiteDatabase db = new Database(this).getReadableDatabase();
             Cursor state = db.rawQuery("SELECT payload FROM state WHERE id = 1", null)) {
            JSObject response = new JSObject();
            if (!state.moveToFirst()) { response.put("data", JSONObject.NULL); call.resolve(response); return; }
            JSONObject data = new JSONObject(state.getString(0));
            JSONArray entries = new JSONArray();
            try (Cursor rows = db.rawQuery("SELECT payload FROM entries", null)) {
                while (rows.moveToNext()) entries.put(new JSONObject(rows.getString(0)));
            }
            data.put("entries", entries);
            response.put("data", data);
            call.resolve(response);
        } catch (Exception error) { call.reject("账本数据库读取失败", error); }
    }

    @PluginMethod
    public void save(PluginCall call) {
        JSObject data = call.getObject("data");
        if (data == null) { call.reject("账本数据缺失"); return; }
        try {
            JSONArray entries = data.getJSONArray("entries");
            JSONObject state = new JSONObject(data.toString());
            state.remove("entries");
            try (SQLiteDatabase db = new Database(this).getWritableDatabase()) {
                db.beginTransaction();
                try {
                    db.execSQL("DELETE FROM entries");
                    android.database.sqlite.SQLiteStatement insert = db.compileStatement("INSERT INTO entries(id,payload) VALUES(?,?)");
                    for (int i = 0; i < entries.length(); i++) {
                        JSONObject entry = entries.getJSONObject(i);
                        insert.clearBindings();
                        insert.bindString(1, entry.get("id").toString());
                        insert.bindString(2, entry.toString());
                        insert.executeInsert();
                    }
                    db.execSQL("INSERT OR REPLACE INTO state(id,payload) VALUES(1,?)", new Object[]{state.toString()});
                    db.setTransactionSuccessful();
                } finally { db.endTransaction(); }
            }
            call.resolve();
        } catch (Exception error) { call.reject("账本数据库保存失败", error); }
    }
}
