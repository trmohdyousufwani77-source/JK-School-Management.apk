#!/usr/bin/env bash
set -e

echo "=== Building Android APK for Smart School Master ==="

WORK_DIR="/tmp/android_apk_build"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/src/in/gov/up/schoolmaster"
mkdir -p "$WORK_DIR/gen"
mkdir -p "$WORK_DIR/bin"
mkdir -p "$WORK_DIR/res/values"
mkdir -p "$WORK_DIR/res/mipmap-mdpi"
mkdir -p "$WORK_DIR/res/mipmap-hdpi"
mkdir -p "$WORK_DIR/res/mipmap-xhdpi"
mkdir -p "$WORK_DIR/res/mipmap-xxhdpi"
mkdir -p "$WORK_DIR/assets/www"

# 1. Generate Icons
echo "Generating app launcher icons..."
convert -background none -resize 48x48 /app/applet/public/pwa-192x192.svg "$WORK_DIR/res/mipmap-mdpi/ic_launcher.png"
convert -background none -resize 72x72 /app/applet/public/pwa-192x192.svg "$WORK_DIR/res/mipmap-hdpi/ic_launcher.png"
convert -background none -resize 96x96 /app/applet/public/pwa-192x192.svg "$WORK_DIR/res/mipmap-xhdpi/ic_launcher.png"
convert -background none -resize 144x144 /app/applet/public/pwa-512x512.svg "$WORK_DIR/res/mipmap-xxhdpi/ic_launcher.png"

# 2. Strings.xml
cat << 'EOF' > "$WORK_DIR/res/values/strings.xml"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Smart School Master</string>
</resources>
EOF

# 3. AndroidManifest.xml
cat << 'EOF' > "$WORK_DIR/AndroidManifest.xml"
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="in.gov.up.schoolmaster"
    android:versionCode="104"
    android:versionName="1.0.4">

    <uses-sdk
        android:minSdkVersion="21"
        android:targetSdkVersion="33" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />

    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="false"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:configChanges="orientation|screenSize|keyboardHidden|screenLayout"
            android:windowSoftInputMode="adjustResize"
            android:label="@string/app_name">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="schoolmaster" />
            </intent-filter>
        </activity>
    </application>
</manifest>
EOF

# Validate production APP_URL before packaging APK
PRODUCTION_APP_URL="${APP_URL:-https://ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app}"
PRODUCTION_APP_URL="${PRODUCTION_APP_URL%/}"
case "$PRODUCTION_APP_URL" in
    *localhost*|*127.0.0.1*)
        echo "ERROR: Refusing to package release APK with localhost URL: $PRODUCTION_APP_URL"
        exit 1
        ;;
    https://*)
        echo "Validated production APP_URL: $PRODUCTION_APP_URL"
        ;;
    *)
        echo "ERROR: APP_URL must start with https:// (got: $PRODUCTION_APP_URL)"
        exit 1
        ;;
esac

# 4. MainActivity.java
cat << EOF > "$WORK_DIR/src/in/gov/up/schoolmaster/MainActivity.java"
package in.gov.up.schoolmaster;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private WebView mWebView;
    private LinearLayout mSplashOverlay;
    private LinearLayout mErrorOverlay;
    private TextView mErrorTitle;
    private TextView mErrorDesc;
    private Button mPrimaryRecoveryBtn;
    private ValueCallback<Uri[]> mFilePathCallback;
    private static final int FILECHOOSER_RESULTCODE = 101;
    private static final String CLOUD_URL = "${PRODUCTION_APP_URL}";
    private static final String OFFLINE_URL = "file:///android_asset/www/index.html";
    private String mLastFailedUrl = CLOUD_URL;
    private String mLastHeadersSummary = "";

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(0xFF0F172A);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF0F172A);

        mWebView = new WebView(this);
        mWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        mSplashOverlay = buildSplashOverlay();
        mErrorOverlay = buildErrorOverlay();

        root.addView(mWebView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(mSplashOverlay);
        root.addView(mErrorOverlay);
        setContentView(root);

        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("whatsapp:")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        return false;
                    }
                }
                try {
                    Uri parsed = Uri.parse(url);
                    Uri rootUri = Uri.parse(CLOUD_URL);
                    if (parsed.getHost() != null && parsed.getHost().equals(rootUri.getHost())) {
                        String path = parsed.getPath();
                        boolean isAssetOrApi = path != null && (
                            path.startsWith("/assets/") || path.startsWith("/api/") || path.contains(".")
                        );
                        if (path != null && !path.isEmpty() && !path.equals("/") && !isAssetOrApi) {
                            String hashRoute = "#" + (path.startsWith("/") ? path : "/" + path);
                            view.stopLoading();
                            view.loadUrl(CLOUD_URL + "/" + hashRoute);
                            return true;
                        }
                    }
                } catch (Exception ignored) { }

                if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file:///")) {
                    return false;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (mSplashOverlay != null) {
                    mSplashOverlay.setVisibility(View.GONE);
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                mLastFailedUrl = failingUrl != null ? failingUrl : CLOUD_URL;
                logDiagnosticError(errorCode, mLastFailedUrl, "Connection Failed: " + description, "");
                if (failingUrl != null && !failingUrl.startsWith("file:///")) {
                    // Seamlessly fall back to bundled offline SPA (retaining hash route) instead of trapping user
                    String targetHash = extractHashRoute(failingUrl);
                    view.stopLoading();
                    view.loadUrl(OFFLINE_URL + targetHash);
                    Toast.makeText(MainActivity.this, "Switched to Offline Portal — data will sync when online", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            @TargetApi(Build.VERSION_CODES.M)
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                String failingUrl = request.getUrl() != null ? request.getUrl().toString() : CLOUD_URL;
                mLastFailedUrl = failingUrl;
                String desc = error.getDescription() != null ? error.getDescription().toString() : "Network error";
                logDiagnosticError(error.getErrorCode(), failingUrl, "Connection Failed: " + desc, "");
                if (!failingUrl.startsWith("file:///")) {
                    String targetHash = extractHashRoute(failingUrl);
                    view.stopLoading();
                    view.loadUrl(OFFLINE_URL + targetHash);
                    Toast.makeText(MainActivity.this, "Switched to Offline Portal — data will sync when online", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            @TargetApi(Build.VERSION_CODES.M)
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (!request.isForMainFrame()) return;
                int status = errorResponse.getStatusCode();
                if (status == 404 || status >= 500) {
                    String failingUrl = request.getUrl() != null ? request.getUrl().toString() : CLOUD_URL;
                    mLastFailedUrl = failingUrl;
                    StringBuilder hdr = new StringBuilder();
                    Map<String, String> map = errorResponse.getResponseHeaders();
                    if (map != null) {
                        for (Map.Entry<String, String> entry : map.entrySet()) {
                            hdr.append(entry.getKey()).append(": ").append(entry.getValue()).append("\\n");
                        }
                    }
                    mLastHeadersSummary = hdr.toString();
                    logDiagnosticError(status, failingUrl, "HTTP " + status + " " + errorResponse.getReasonPhrase(), mLastHeadersSummary);
                    // Automatically recover from 404/5xx by loading bundled offline SPA with preserved hash route
                    String targetHash = extractHashRoute(failingUrl);
                    view.stopLoading();
                    view.clearHistory();
                    view.loadUrl(OFFLINE_URL + targetHash);
                }
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            @TargetApi(Build.VERSION_CODES.LOLLIPOP)
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILECHOOSER_RESULTCODE);
                } catch (Exception e) {
                    mFilePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        String initialHash = resolveInitialHashFromIntent(getIntent());
        if (isNetworkAvailable()) {
            mWebView.loadUrl(CLOUD_URL + "/" + initialHash);
        } else {
            mWebView.loadUrl(OFFLINE_URL + initialHash);
            Toast.makeText(MainActivity.this, "Offline mode activated - loading local database", Toast.LENGTH_SHORT).show();
        }
    }

    private String resolveInitialHashFromIntent(Intent intent) {
        if (intent != null && intent.getData() != null) {
            return extractHashRoute(intent.getData().toString());
        }
        return "#/dashboard";
    }

    private String extractHashRoute(String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl);
            String fragment = uri.getFragment();
            if (fragment != null && !fragment.isEmpty()) {
                return fragment.startsWith("/") ? "#" + fragment : "#/" + fragment;
            }
            String path = uri.getPath();
            if (path != null && !path.isEmpty() && !path.equals("/") && !path.endsWith("index.html")) {
                return "#" + (path.startsWith("/") ? path : "/" + path);
            }
        } catch (Exception ignored) { }
        return "#/dashboard";
    }

    private LinearLayout buildSplashOverlay() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(0xFF0F172A);
        layout.setPadding(64, 64, 64, 64);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(192, 192);
        lp.bottomMargin = 28;
        logo.setLayoutParams(lp);

        TextView title = new TextView(this);
        title.setText("Smart School Master");
        title.setTextSize(22f);
        title.setTypeface(null, Typeface.BOLD);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);

        TextView sub = new TextView(this);
        sub.setText("Connecting to production portal...");
        sub.setTextSize(14f);
        sub.setTextColor(0xFFCBD5E1);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, 10, 0, 32);

        ProgressBar spinner = new ProgressBar(this);
        layout.addView(logo);
        layout.addView(title);
        layout.addView(sub);
        layout.addView(spinner);
        return layout;
    }

    private LinearLayout buildErrorOverlay() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(0xFFF8FAFC);
        layout.setPadding(56, 56, 56, 56);
        layout.setVisibility(View.GONE);

        mErrorTitle = new TextView(this);
        mErrorTitle.setTextSize(20f);
        mErrorTitle.setTypeface(null, Typeface.BOLD);
        mErrorTitle.setTextColor(0xFF0F172A);
        mErrorTitle.setGravity(Gravity.CENTER);

        mErrorDesc = new TextView(this);
        mErrorDesc.setTextSize(14f);
        mErrorDesc.setTextColor(0xFF475569);
        mErrorDesc.setGravity(Gravity.CENTER);
        mErrorDesc.setPadding(0, 20, 0, 32);

        mPrimaryRecoveryBtn = new Button(this);
        mPrimaryRecoveryBtn.setText("Return to Dashboard");
        mPrimaryRecoveryBtn.setBackgroundColor(0xFF4F46E5);
        mPrimaryRecoveryBtn.setTextColor(Color.WHITE);

        Button offlineBtn = new Button(this);
        offlineBtn.setText("Open Offline Mode");
        offlineBtn.setBackgroundColor(0xFF0F766E);
        offlineBtn.setTextColor(Color.WHITE);
        LinearLayout.LayoutParams offLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        offLp.topMargin = 16;
        offlineBtn.setLayoutParams(offLp);
        offlineBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                mErrorOverlay.setVisibility(View.GONE);
                mWebView.loadUrl(OFFLINE_URL);
            }
        });

        Button logsBtn = new Button(this);
        logsBtn.setText("Inspect Logs");
        logsBtn.setBackgroundColor(0xFFE2E8F0);
        logsBtn.setTextColor(0xFF0F172A);
        LinearLayout.LayoutParams logLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        logLp.topMargin = 16;
        logsBtn.setLayoutParams(logLp);
        logsBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showDiagnosticLogsDialog();
            }
        });

        layout.addView(mErrorTitle);
        layout.addView(mErrorDesc);
        layout.addView(mPrimaryRecoveryBtn);
        layout.addView(offlineBtn);
        layout.addView(logsBtn);
        return layout;
    }

    private void showErrorOverlay(final boolean isNotFound, final String title, final String desc) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (mSplashOverlay != null) mSplashOverlay.setVisibility(View.GONE);
                mErrorTitle.setText(title);
                mErrorDesc.setText(desc);
                mPrimaryRecoveryBtn.setText(isNotFound ? "Return to Dashboard" : "Retry Connection");
                mPrimaryRecoveryBtn.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        mErrorOverlay.setVisibility(View.GONE);
                        mSplashOverlay.setVisibility(View.VISIBLE);
                        mWebView.stopLoading();
                        mWebView.clearHistory();
                        mWebView.loadUrl(CLOUD_URL + "/");
                    }
                });
                mErrorOverlay.setVisibility(View.VISIBLE);
            }
        });
    }

    private void showDiagnosticLogsDialog() {
        String content = readDiagnosticLogFile();
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Diagnostic Logs (app_errors.json)");
        builder.setMessage("URL: " + mLastFailedUrl + "\\nHeaders:\\n" +
            (mLastHeadersSummary.isEmpty() ? "(none)\\n" : mLastHeadersSummary) + "\\n" + content);
        builder.setPositiveButton("Close", null);
        builder.setNeutralButton("Share .txt", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("text/plain");
                share.putExtra(Intent.EXTRA_SUBJECT, "SchoolMaster Diagnostic Logs");
                share.putExtra(Intent.EXTRA_TEXT, content);
                startActivity(Intent.createChooser(share, "Export Diagnostic Logs"));
            }
        });
        builder.show();
    }

    private void logDiagnosticError(int statusCode, String url, String reason, String headers) {
        try {
            File file = new File(getFilesDir(), "app_errors.json");
            String ts = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(new Date());
            String entry = "{\\"timestamp\\":\\"" + ts + "\\",\\"status\\":" + statusCode +
                ",\\"url\\":\\"" + url.replace("\\"", "'") + "\\",\\"reason\\":\\"" +
                reason.replace("\\"", "'") + "\\"}\\n";
            FileOutputStream fos = new FileOutputStream(file, true);
            fos.write(entry.getBytes("UTF-8"));
            fos.close();
        } catch (Exception ignored) { }
    }

    private String readDiagnosticLogFile() {
        try {
            File file = new File(getFilesDir(), "app_errors.json");
            if (!file.exists()) return "No errors logged yet.";
            StringBuilder sb = new StringBuilder();
            BufferedReader reader = new BufferedReader(new FileReader(file));
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\\n");
            }
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            return "Unable to read app_errors.json: " + e.getMessage();
        }
    }

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            return activeNetwork != null && activeNetwork.isConnectedOrConnecting();
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if ((keyCode == KeyEvent.KEYCODE_BACK) && mWebView.canGoBack()) {
            mWebView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILECHOOSER_RESULTCODE) {
            if (mFilePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                }
            }
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }
}
EOF

# 5. Copy built web assets into assets/www
echo "Copying web app into APK assets..."
cp -r /app/applet/dist/* "$WORK_DIR/assets/www/"

# Modify asset paths in assets/www/index.html to be relative if needed
sed -i 's|href="/|href="./|g' "$WORK_DIR/assets/www/index.html"
sed -i 's|src="/|src="./|g' "$WORK_DIR/assets/www/index.html"

# 6. Generate R.java
echo "Compiling Android resources with aapt..."
aapt package -m -J "$WORK_DIR/gen" \
    -M "$WORK_DIR/AndroidManifest.xml" \
    -S "$WORK_DIR/res" \
    -I /usr/lib/android-sdk/platforms/android-23/android.jar

# 7. Compile Java to Bytecode
echo "Compiling Java sources with javac..."
javac -source 8 -target 8 \
    -bootclasspath /usr/lib/android-sdk/platforms/android-23/android.jar \
    -d "$WORK_DIR/bin" \
    "$WORK_DIR/gen/in/gov/up/schoolmaster/R.java" \
    "$WORK_DIR/src/in/gov/up/schoolmaster/MainActivity.java"

# 8. Convert class files to Dalvik Executable (classes.dex)
echo "Generating Dalvik Executable (classes.dex) with dx..."
dx --dex --output="$WORK_DIR/bin/classes.dex" "$WORK_DIR/bin"

# 9. Package Initial APK
echo "Packaging unaligned APK with aapt..."
aapt package -f \
    -M "$WORK_DIR/AndroidManifest.xml" \
    -S "$WORK_DIR/res" \
    -A "$WORK_DIR/assets" \
    -I /usr/lib/android-sdk/platforms/android-23/android.jar \
    -F "$WORK_DIR/bin/unaligned.apk"

# Add classes.dex into APK
echo "Adding classes.dex to APK..."
cd "$WORK_DIR/bin"
aapt add unaligned.apk classes.dex

# 10. Align APK on 4-byte boundaries
echo "Aligning APK with zipalign..."
zipalign -f -p 4 unaligned.apk aligned.apk

# 11. Create or use keystore and sign APK
echo "Generating production release signing key..."
KEYSTORE="/app/applet/schoolmaster-release.keystore"
if [ ! -f "$KEYSTORE" ]; then
    keytool -genkeypair -v \
        -keystore "$KEYSTORE" \
        -alias schoolmaster \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass SchoolMaster2026 \
        -keypass SchoolMaster2026 \
        -dname "CN=Mohd Yousuf, OU=UDISE Student Management, O=Smart School Master, L=Lucknow, ST=Uttar Pradesh, C=IN"
fi

echo "Signing APK with apksigner (v1, v2, v3 schemes)..."
apksigner sign \
    --ks "$KEYSTORE" \
    --ks-pass pass:SchoolMaster2026 \
    --ks-key-alias schoolmaster \
    --key-pass pass:SchoolMaster2026 \
    --out "$WORK_DIR/bin/SchoolMaster-release.apk" \
    aligned.apk

# 12. Verify APK Signature
echo "Verifying APK signature..."
apksigner verify --verbose "$WORK_DIR/bin/SchoolMaster-release.apk"

# 13. Output APK Details
echo "Inspecting generated APK badging..."
aapt dump badging "$WORK_DIR/bin/SchoolMaster-release.apk" | head -n 15

# 14. Deploy APK to public/ and dist/
echo "Deploying release APK to public and dist directories..."
cp "$WORK_DIR/bin/SchoolMaster-release.apk" /app/applet/public/SchoolMaster-release.apk
cp "$WORK_DIR/bin/SchoolMaster-release.apk" /app/applet/public/SchoolMaster_v1.0.4_release.apk
cp "$WORK_DIR/bin/SchoolMaster-release.apk" /app/applet/public/SchoolMaster.apk
cp "$WORK_DIR/bin/SchoolMaster-release.apk" /app/applet/public/school_master_v1.0.0.apk
cp "$WORK_DIR/bin/SchoolMaster-release.apk" /app/applet/public/school_master_release.apk

mkdir -p /app/applet/dist
cp "$WORK_DIR/bin/SchoolMaster-release.apk" /app/applet/dist/SchoolMaster-release.apk
cp "$WORK_DIR/bin/SchoolMaster-release.apk" /app/applet/dist/SchoolMaster_v1.0.4_release.apk
cp "$WORK_DIR/bin/SchoolMaster-release.apk" /app/applet/dist/SchoolMaster.apk
cp "$WORK_DIR/bin/SchoolMaster-release.apk" /app/applet/dist/school_master_v1.0.0.apk

echo "APK build complete!"
ls -lh /app/applet/public/SchoolMaster-release.apk
