package com.jianji.ledger;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

@CapacitorPlugin(name = "ImageOcr")
public class ImageOcrPlugin extends Plugin {
    @PluginMethod public void recognize(PluginCall call) {
        String encoded = call.getString("image");
        if (encoded == null || encoded.length() > 12_000_000) { call.reject("图片过大，请选用较小的截图"); return; }
        final Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IllegalArgumentException("图片格式不正确");
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = 1;
            while (Math.max(bounds.outWidth / options.inSampleSize, bounds.outHeight / options.inSampleSize) > 2400) options.inSampleSize *= 2;
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (bitmap == null) throw new IllegalArgumentException("图片无法读取");
        } catch (Exception error) { call.reject("图片无法读取", error); return; }
        TextRecognizer recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
        recognizer.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener(result -> {
                    JSObject response = new JSObject();
                    response.put("text", result.getText());
                    call.resolve(response);
                })
                .addOnFailureListener(error -> call.reject("图片文字识别失败", error))
                .addOnCompleteListener(task -> { recognizer.close(); bitmap.recycle(); });
    }
}
