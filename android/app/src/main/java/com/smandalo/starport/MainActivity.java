package com.smandalo.starport;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Offline web workspace, with a narrow bridge for user-requested file exports. */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final int OPEN_FILE = 41, SAVE_FILE = 42;
    static final long MAX_EXPORT = 400L * 1024 * 1024;
    WebView webView;
    private FrameLayout root;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, ExportJob> jobs = new HashMap<>();
    private ValueCallback<Uri[]> picker;
    private ExportJob saving;
    private boolean destroyed, rendererFailed;

    static final class ExportJob {
        String id, name, mime;
        File file;
        long expected, written;
        FileOutputStream stream;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(13, 20, 32));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                    android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(android.view.WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return insets;
            });
        } else root.setFitsSystemWindows(true);
        setContentView(root);
        if (state != null && state.containsKey("savingId")) {
            ExportJob job = new ExportJob();
            job.id = state.getString("savingId");
            job.name = state.getString("savingName");
            job.mime = state.getString("savingMime");
            job.file = new File(new File(getCacheDir(), "exports"), job.id + "/" + job.name);
            if (job.file.isFile()) { job.expected = job.written = job.file.length(); saving = job; jobs.put(job.id, job); }
        }
        io.execute(this::cleanOldExports);
        createWebView();
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
    }

    private void createWebView() {
        rendererFailed = false;
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(13, 20, 32));
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setTextZoom(100);
        settings.setBuiltInZoomControls(false);
        webView.addJavascriptInterface(new FileBridge(), "StarportAndroid");
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) {
                    WebResourceResponse result = loader.shouldInterceptRequest(uri);
                    if (result != null) return result;
                }
                // No network fallback, including for nonexistent assets.
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    new HashMap<>(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
                    && uri.getPath() != null && uri.getPath().startsWith("/assets/")) return false;
                if (request.isForMainFrame() && request.hasGesture() && "https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException e) { toast("手机没有可打开来源链接的浏览器"); }
                }
                return true;
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                rendererFailed = true;
                root.removeView(view);
                view.destroy();
                new AlertDialog.Builder(MainActivity.this).setTitle("画布需要重新打开")
                    .setMessage("页面进程已结束。重新打开会恢复已保存的项目；较大的舰队可先选择普通清晰度导出。")
                    .setPositiveButton("重新打开", (d, w) -> createWebView())
                    .setNegativeButton("退出", (d, w) -> finish()).setCancelable(false).show();
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (picker != null) picker.onReceiveValue(null);
                picker = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                String[] types = acceptedMimeTypes(params.getAcceptTypes());
                if (types.length > 0) intent.putExtra(Intent.EXTRA_MIME_TYPES, types);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try { startActivityForResult(intent, OPEN_FILE); }
                catch (ActivityNotFoundException e) { picker = null; callback.onReceiveValue(null); toast("系统文件选择器不可用"); }
                return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setTitle("星港合影").setMessage(message)
                    .setPositiveButton("继续", (d, w) -> result.confirm())
                    .setNegativeButton("取消", (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel()).show();
                return true;
            }
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (BuildConfig.DEBUG) Log.d("StarportWeb", message.message() + " @" + message.sourceId() + ":" + message.lineNumber());
                return true;
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        webView.loadUrl("https://" + HOST + "/assets/www/index.html");
    }

    static String[] acceptedMimeTypes(String[] accept) {
        java.util.LinkedHashSet<String> result = new java.util.LinkedHashSet<>();
        for (String raw : accept) for (String token : raw.split(",")) {
            String type = token.trim().toLowerCase(java.util.Locale.ROOT);
            switch (type) {
                case ".json": type = "application/json"; break;
                case ".xlsx": type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; break;
                case ".xls": type = "application/vnd.ms-excel"; break;
                case ".xlsm": type = "application/vnd.ms-excel.sheet.macroenabled.12"; break;
                default: break;
            }
            if (type.contains("/")) result.add(type);
        }
        return result.toArray(new String[0]);
    }

    public class FileBridge {
        @JavascriptInterface public synchronized String beginExport(String name, String type, long size) {
            if (size < 0 || size > MAX_EXPORT) return "ERROR:导出文件超过 400 MB";
            synchronized (jobs) { if (jobs.size() >= 2) return "ERROR:请先完成当前文件的保存或分享"; }
            ExportJob job = new ExportJob();
            job.id = UUID.randomUUID().toString();
            job.name = safeName(name);
            job.mime = safeMime(type);
            job.expected = size;
            File directory = new File(getCacheDir(), "exports/" + job.id);
            try {
                if (!directory.mkdirs()) throw new IOException("无法创建导出目录");
                job.file = new File(directory, job.name);
                job.stream = new FileOutputStream(job.file);
                synchronized (jobs) { jobs.put(job.id, job); }
                return job.id;
            } catch (IOException e) { deleteTree(directory); return "ERROR:无法准备文件，请检查剩余空间"; }
        }
        @JavascriptInterface public synchronized String appendExport(String id, String base64) {
            ExportJob job;
            synchronized (jobs) { job = jobs.get(id); }
            if (job == null || job.stream == null) return "ERROR:导出会话已结束";
            try {
                if (base64.length() > 280000) throw new IOException("分块过大");
                byte[] bytes = Base64.decode(base64, Base64.NO_WRAP);
                if (job.written + bytes.length > job.expected) throw new IOException("文件大小不匹配");
                job.stream.write(bytes);
                job.written += bytes.length;
                return "OK";
            } catch (Exception e) { abortExport(id); return "ERROR:写入失败，请检查剩余空间"; }
        }
        @JavascriptInterface public synchronized String finishExport(String id) {
            ExportJob job;
            synchronized (jobs) { job = jobs.get(id); }
            if (job == null || job.stream == null) return "ERROR:导出会话不存在";
            try {
                job.stream.close(); job.stream = null;
                if (job.written != job.expected) throw new IOException("文件不完整");
                runOnUiThread(() -> showExportOptions(job));
                return "OK";
            } catch (IOException e) { abortExport(id); return "ERROR:导出文件不完整"; }
        }
        @JavascriptInterface public synchronized void abortExport(String id) {
            ExportJob job;
            synchronized (jobs) { job = jobs.remove(id); }
            if (job != null) {
                try { if (job.stream != null) job.stream.close(); } catch (IOException ignored) { }
                deleteTree(job.file.getParentFile());
            }
        }
    }

    static String safeName(String raw) {
        String name = raw == null ? "星港合影" : raw.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "-").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) name = "星港合影";
        if (name.length() > 120) {
            int dot = name.lastIndexOf('.');
            String ext = dot > 0 && name.length() - dot < 16 ? name.substring(dot) : "";
            name = name.substring(0, 120 - ext.length()) + ext;
        }
        return name;
    }
    static String safeMime(String raw) {
        String type = raw == null ? "" : raw.split(";", 2)[0].toLowerCase(java.util.Locale.ROOT);
        switch (type) {
            case "image/png": case "image/jpeg": case "image/webp": case "application/json":
            case "text/csv": case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": return type;
            default: return "application/octet-stream";
        }
    }

    private void showExportOptions(ExportJob job) {
        if (destroyed || isFinishing()) { complete(job, "cancelled", "已取消"); return; }
        boolean image = job.mime.startsWith("image/");
        String[] options = image ? new String[]{"保存到相册", "另存为文件", "分享…"} : new String[]{"保存到文件", "分享…"};
        new AlertDialog.Builder(this).setTitle(job.name).setItems(options, (d, index) -> {
            if (image && index == 0) saveToGallery(job);
            else if (index == (image ? 1 : 0)) saveAs(job);
            else share(job);
        }).setNegativeButton("取消", (d, w) -> complete(job, "cancelled", "已取消保存"))
          .setOnCancelListener(d -> complete(job, "cancelled", "已取消保存")).show();
    }
    private void saveAs(ExportJob job) {
        if (saving != null) { complete(job, "error", "请先完成上一个文件的保存"); return; }
        saving = job;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType(job.mime).putExtra(Intent.EXTRA_TITLE, job.name);
        try { startActivityForResult(intent, SAVE_FILE); }
        catch (ActivityNotFoundException e) { saving = null; complete(job, "error", "系统保存窗口不可用"); }
    }
    private void share(ExportJob job) {
        try {
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".exports", job.file);
            Intent intent = new Intent(Intent.ACTION_SEND).setType(job.mime).putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.setClipData(android.content.ClipData.newRawUri(job.name, uri));
            startActivity(Intent.createChooser(intent, "分享 " + job.name));
            complete(job, "shared", "分享面板已打开");
        } catch (Exception e) { complete(job, "error", "无法打开分享面板，请选择保存到文件"); }
    }
    private void saveToGallery(ExportJob job) {
        io.execute(() -> {
            Uri uri = null;
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, job.name);
                values.put(MediaStore.Images.Media.MIME_TYPE, job.mime);
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/StarportPortraits");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IOException("无法创建图片");
                copyTo(job.file, uri);
                ContentValues done = new ContentValues(); done.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContentResolver().update(uri, done, null, null);
                runOnUiThread(() -> complete(job, "saved", "已保存到相册 · Pictures/StarportPortraits"));
            } catch (Exception e) {
                if (uri != null) getContentResolver().delete(uri, null, null);
                runOnUiThread(() -> complete(job, "error", "保存图片失败，请检查剩余空间"));
            }
        });
    }
    private void copyTo(File file, Uri uri) throws IOException {
        try (FileInputStream input = new FileInputStream(file); OutputStream output = getContentResolver().openOutputStream(uri, "w")) {
            if (output == null) throw new IOException("无法打开目标文件");
            byte[] buffer = new byte[65536];
            int length;
            while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
            output.flush();
        }
    }
    private void complete(ExportJob job, String status, String message) {
        synchronized (jobs) { jobs.remove(job.id); }
        if (!destroyed && !rendererFailed) {
            JSONObject result = new JSONObject();
            try { result.put("id", job.id); result.put("status", status); result.put("message", message); }
            catch (Exception ignored) { }
            webView.evaluateJavascript("window.StarportNativeResult && window.StarportNativeResult(" + result + ")", null);
            toast(message);
        }
        // Keep shared files until a later launch, so the recipient can finish reading.
        if (!status.equals("shared") && !io.isShutdown()) io.execute(() -> deleteTree(job.file.getParentFile()));
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OPEN_FILE) {
            ValueCallback<Uri[]> callback = picker; picker = null;
            if (callback == null) return;
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            if (uri != null) {
                try { getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); }
                catch (SecurityException ignored) { }
            }
            callback.onReceiveValue(uri == null ? null : new Uri[]{uri});
        } else if (request == SAVE_FILE) {
            ExportJob job = saving; saving = null;
            if (job == null) return;
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            if (uri == null) { complete(job, "cancelled", "已取消保存"); return; }
            io.execute(() -> {
                try { copyTo(job.file, uri); runOnUiThread(() -> complete(job, "saved", "文件已保存")); }
                catch (Exception e) { runOnUiThread(() -> complete(job, "error", "文件保存失败，请重新导出")); }
            });
        }
    }
    private void handleBack() {
        if (rendererFailed) { finish(); return; }
        webView.evaluateJavascript("window.StarportMobile ? window.StarportMobile.back() : false", result -> {
            if (!"true".equals(result)) new AlertDialog.Builder(this).setTitle("退出星港合影？")
                .setMessage("项目会自动暂存本机。重要修改建议先导出工程备份。")
                .setNegativeButton("继续编辑", null).setPositiveButton("退出", (d, w) -> finish()).show();
        });
    }
    // API 33+ uses the OnBackInvokedDispatcher callback registered in onCreate.
    // This override is the fallback for Android 10-12 only.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onPause() {
        if (webView != null && !rendererFailed) webView.evaluateJavascript("window.dispatchEvent(new Event('starport:pause'))", null);
        super.onPause();
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (saving != null) { state.putString("savingId", saving.id); state.putString("savingName", saving.name); state.putString("savingMime", saving.mime); }
    }
    @Override protected void onDestroy() {
        destroyed = true;
        if (picker != null) { picker.onReceiveValue(null); picker = null; }
        synchronized (jobs) {
            for (ExportJob job : jobs.values()) try { if (job.stream != null) job.stream.close(); } catch (IOException ignored) { }
        }
        if (webView != null && !rendererFailed) { webView.removeJavascriptInterface("StarportAndroid"); root.removeView(webView); webView.destroy(); }
        io.shutdown();
        super.onDestroy();
    }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_SHORT).show(); }
    private void cleanOldExports() {
        File[] directories = new File(getCacheDir(), "exports").listFiles();
        if (directories == null) return;
        long cutoff = System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000;
        for (File directory : directories) if (directory.lastModified() < cutoff) deleteTree(directory);
    }
    private static void deleteTree(File file) {
        if (file == null) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        file.delete();
    }
}
