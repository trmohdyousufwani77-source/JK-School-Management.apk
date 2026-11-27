package `in`.gov.jk.schoolmaster

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.FileProvider
import androidx.fragment.app.FragmentActivity
import `in`.gov.jk.schoolmaster.ai.LessonPlanAndroidBridge
import `in`.gov.jk.schoolmaster.ui.AndroidBiometricBridge
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Hardened production WebView container for SchoolMaster Android APK.
 *
 * Features:
 * - Native Splash Screen with School Logo while production URL resolves
 * - Explicit JavaScript, DOM Storage, Database & Hardware Acceleration configuration
 * - Sub-path URL validation redirecting unknown React sub-paths back to root `/`
 * - Explicit HTTP 404 / 5xx detection via onReceivedHttpError with local app_errors.json logging
 * - Native 404 recovery overlay ("Return to Dashboard" clears history & reloads root URL)
 * - Native Connection Failed screen with "Retry" & "Inspect Logs" (in-app log console + .txt export)
 */
class WebViewActivity : FragmentActivity() {

    private lateinit var rootLayout: FrameLayout
    private lateinit var webView: WebView
    private lateinit var splashOverlay: LinearLayout
    private lateinit var errorOverlay: LinearLayout
    private lateinit var errorTitleView: TextView
    private lateinit var errorMessageView: TextView
    private lateinit var errorUrlView: TextView
    private lateinit var primaryActionButton: Button
    private lateinit var inspectLogsOverlay: LinearLayout
    private lateinit var logsTextView: TextView

    private val productionRootUrl: String by lazy {
        val configured = BuildConfig.APP_URL.trim().trimEnd('/')
        if (configured.startsWith("https://")) configured
        else "https://ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app"
    }

    private val validSpaRoots = setOf("", "/", "/index.html")
    private var lastFailedUrl: String = ""
    private var lastHttpStatus: Int = 0
    private var lastResponseHeaders: Map<String, String> = emptyMap()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        rootLayout = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0F172A"))
        }

        webView = WebView(this).apply {
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                loadsImagesAutomatically = true
                mediaPlaybackRequiresUserGesture = false
                setGeolocationEnabled(true)
                cacheMode = WebSettings.LOAD_DEFAULT
                allowFileAccess = true
                allowContentAccess = true
                setSupportZoom(true)
                builtInZoomControls = false
                displayZoomControls = false
            }
            addJavascriptInterface(
                AndroidBiometricBridge(this@WebViewActivity, this),
                "SchoolMasterAndroidBiometric"
            )
            addJavascriptInterface(
                LessonPlanAndroidBridge(this@WebViewActivity),
                "SchoolMasterLessonPlanBridge"
            )
        }

        splashOverlay = buildSplashOverlay()
        errorOverlay = buildErrorOverlay()
        inspectLogsOverlay = buildInspectLogsOverlay()

        rootLayout.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        rootLayout.addView(splashOverlay)
        rootLayout.addView(errorOverlay)
        rootLayout.addView(inspectLogsOverlay)
        setContentView(rootLayout)

        configureWebClients()

        val initialUrl = intent?.getStringExtra(EXTRA_START_URL)?.takeIf { it.startsWith("https://") }
            ?: productionRootUrl
        webView.loadUrl(initialUrl)
    }

    private fun configureWebClients() {
        webView.webViewClient = object : WebViewClient() {

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url ?: return false
                val scheme = uri.scheme?.lowercase(Locale.US) ?: ""

                if (scheme == "mailto" || scheme == "tel" || scheme == "whatsapp") {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        true
                    } catch (_: Exception) {
                        false
                    }
                }

                // Check if same-origin navigation requests a missing sub-path not handled by React client state
                val rootHost = Uri.parse(productionRootUrl).host
                if (uri.host == rootHost) {
                    val path = uri.path ?: "/"
                    val isStaticAsset = path.startsWith("/assets/") ||
                        path.startsWith("/api/") ||
                        path.endsWith(".js") ||
                        path.endsWith(".css") ||
                        path.endsWith(".png") ||
                        path.endsWith(".svg") ||
                        path.endsWith(".json") ||
                        path.endsWith(".apk")

                    if (!isStaticAsset && path !in validSpaRoots) {
                        appendDiagnosticLog(
                            statusCode = 404,
                            requestedUrl = uri.toString(),
                            reason = "Sub-path not registered in React router; forcing root reload ($productionRootUrl/)",
                            headers = emptyMap()
                        )
                        view.stopLoading()
                        view.clearHistory()
                        view.loadUrl("$productionRootUrl/")
                        return true
                    }
                }
                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                errorOverlay.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                splashOverlay.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                super.onReceivedError(view, request, error)
                if (!request.isForMainFrame) return

                val failedUrl = request.url?.toString() ?: productionRootUrl
                lastFailedUrl = failedUrl
                lastHttpStatus = error.errorCode
                lastResponseHeaders = emptyMap()

                appendDiagnosticLog(
                    statusCode = error.errorCode,
                    requestedUrl = failedUrl,
                    reason = "Connection Error: ${error.description}",
                    headers = emptyMap()
                )

                showErrorOverlay(
                    isNotFound = false,
                    title = "Connection Failed",
                    message = "Unable to reach the SchoolMaster server (${error.description}). Please check your internet connection and retry.",
                    url = failedUrl
                )
            }

            override fun onReceivedHttpError(
                view: WebView,
                request: WebResourceRequest,
                errorResponse: WebResourceResponse
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                if (!request.isForMainFrame) return

                val statusCode = errorResponse.statusCode
                if (statusCode == 404 || statusCode >= 500) {
                    val failedUrl = request.url?.toString() ?: productionRootUrl
                    val headers = errorResponse.responseHeaders ?: emptyMap()
                    lastFailedUrl = failedUrl
                    lastHttpStatus = statusCode
                    lastResponseHeaders = headers

                    appendDiagnosticLog(
                        statusCode = statusCode,
                        requestedUrl = failedUrl,
                        reason = "HTTP $statusCode ${errorResponse.reasonPhrase ?: "Error"}",
                        headers = headers
                    )

                    if (statusCode == 404) {
                        showErrorOverlay(
                            isNotFound = true,
                            title = "Page Not Found (HTTP 404)",
                            message = "The requested page could not be found on the server. Tap Return to Dashboard to clear navigation history and reload the SchoolMaster home portal.",
                            url = failedUrl
                        )
                    } else {
                        showErrorOverlay(
                            isNotFound = false,
                            title = "Server Error (HTTP $statusCode)",
                            message = "The SchoolMaster production server returned HTTP $statusCode. Tap Retry or inspect diagnostic logs.",
                            url = failedUrl
                        )
                    }
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.grant(request.resources)
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }
        }
    }

    private fun showErrorOverlay(
        isNotFound: Boolean,
        title: String,
        message: String,
        url: String
    ) {
        runOnUiThread {
            splashOverlay.visibility = View.GONE
            errorTitleView.text = title
            errorMessageView.text = message
            errorUrlView.text = "Requested URL: $url"
            primaryActionButton.text = if (isNotFound) "Return to Dashboard" else "Retry Connection"
            primaryActionButton.setOnClickListener {
                errorOverlay.visibility = View.GONE
                splashOverlay.visibility = View.VISIBLE
                webView.stopLoading()
                if (isNotFound) {
                    webView.clearHistory()
                    webView.loadUrl("$productionRootUrl/")
                } else {
                    webView.loadUrl(productionRootUrl)
                }
            }
            errorOverlay.visibility = View.VISIBLE
        }
    }

    private fun buildSplashOverlay(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(64, 64, 64, 64)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )

            val logoView = ImageView(this@WebViewActivity).apply {
                setImageResource(R.drawable.ic_launcher_indigo)
                layoutParams = LinearLayout.LayoutParams(220, 220).apply {
                    bottomMargin = 36
                }
            }
            val title = TextView(this@WebViewActivity).apply {
                text = "School Master"
                textSize = 24f
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
            }
            val subtitle = TextView(this@WebViewActivity).apply {
                text = "Loading school portal..."
                textSize = 14f
                setTextColor(Color.parseColor("#CBD5E1"))
                gravity = Gravity.CENTER
                setPadding(0, 12, 0, 36)
            }
            val spinner = ProgressBar(this@WebViewActivity)

            addView(logoView)
            addView(title)
            addView(subtitle)
            addView(spinner)
        }
    }

    private fun buildErrorOverlay(): LinearLayout {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#F8FAFC"))
            setPadding(56, 56, 56, 56)
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        errorTitleView = TextView(this).apply {
            textSize = 22f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#0F172A"))
            gravity = Gravity.CENTER
        }
        errorMessageView = TextView(this).apply {
            textSize = 15f
            setTextColor(Color.parseColor("#475569"))
            gravity = Gravity.CENTER
            setPadding(0, 20, 0, 20)
        }
        errorUrlView = TextView(this).apply {
            textSize = 12f
            setTextColor(Color.parseColor("#64748B"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 36)
        }

        primaryActionButton = Button(this).apply {
            text = "Return to Dashboard"
            setBackgroundColor(Color.parseColor("#4F46E5"))
            setTextColor(Color.WHITE)
            setPadding(48, 28, 48, 28)
        }

        val inspectButton = Button(this).apply {
            text = "Inspect Logs"
            setBackgroundColor(Color.parseColor("#E2E8F0"))
            setTextColor(Color.parseColor("#0F172A"))
            setPadding(48, 24, 48, 24)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = 20
            }
            setOnClickListener { openDiagnosticLogConsole() }
        }

        container.addView(errorTitleView)
        container.addView(errorMessageView)
        container.addView(errorUrlView)
        container.addView(primaryActionButton)
        container.addView(inspectButton)
        return container
    }

    private fun buildInspectLogsOverlay(): LinearLayout {
        val overlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(36, 64, 36, 36)
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        val header = TextView(this).apply {
            text = "SchoolMaster Diagnostic Log Console (app_errors.json)"
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            setPadding(0, 0, 0, 20)
        }

        logsTextView = TextView(this).apply {
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setTextColor(Color.parseColor("#A7F3D0"))
            setPadding(16, 16, 16, 16)
        }

        val scrollView = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#1E293B"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
            addView(logsTextView)
        }

        val actionsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setPadding(0, 20, 0, 0)
        }

        val exportBtn = Button(this).apply {
            text = "Export Diagnostic .txt"
            setBackgroundColor(Color.parseColor("#10B981"))
            setTextColor(Color.WHITE)
            setOnClickListener { exportDiagnosticTextFile() }
        }

        val closeBtn = Button(this).apply {
            text = "Close"
            setBackgroundColor(Color.parseColor("#334155"))
            setTextColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                leftMargin = 16
            }
            setOnClickListener { inspectLogsOverlay.visibility = View.GONE }
        }

        actionsRow.addView(exportBtn)
        actionsRow.addView(closeBtn)

        overlay.addView(header)
        overlay.addView(scrollView)
        overlay.addView(actionsRow)
        return overlay
    }

    private fun openDiagnosticLogConsole() {
        val logFile = File(filesDir, APP_ERRORS_FILENAME)
        val rawContent = if (logFile.exists()) logFile.readText() else "No errors logged yet."
        val headerSummary = buildString {
            appendLine("=== Latest HTTP / Navigation Failure ===")
            appendLine("Production Root: $productionRootUrl")
            appendLine("Last Requested URL: ${lastFailedUrl.ifBlank { "N/A" }}")
            appendLine("HTTP / Error Status: $lastHttpStatus")
            appendLine("Response Headers:")
            if (lastResponseHeaders.isEmpty()) {
                appendLine("  (none captured)")
            } else {
                lastResponseHeaders.forEach { (k, v) -> appendLine("  $k: $v") }
            }
            appendLine()
            appendLine("=== Stored app_errors.json ===")
            append(rawContent)
        }
        logsTextView.text = headerSummary
        inspectLogsOverlay.visibility = View.VISIBLE
    }

    private fun exportDiagnosticTextFile() {
        try {
            val exportFile = File(cacheDir, "schoolmaster_webview_diagnostics.txt")
            exportFile.writeText(logsTextView.text.toString())
            val uri = FileProvider.getUriForFile(
                this,
                "${applicationContext.packageName}.fileprovider",
                exportFile
            )
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, "SchoolMaster Android WebView Diagnostic Logs")
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(shareIntent, "Export Diagnostic Logs"))
        } catch (_: Exception) {
            // Keep logs visible on screen if no share target is available
        }
    }

    private fun appendDiagnosticLog(
        statusCode: Int,
        requestedUrl: String,
        reason: String,
        headers: Map<String, String>
    ) {
        try {
            val file = File(filesDir, APP_ERRORS_FILENAME)
            val existingArray = if (file.exists()) {
                try {
                    JSONArray(file.readText())
                } catch (_: Exception) {
                    JSONArray()
                }
            } else {
                JSONArray()
            }

            val headersJson = JSONObject()
            headers.forEach { (k, v) -> headersJson.put(k, v) }

            val entry = JSONObject().apply {
                put("timestamp", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date()))
                put("statusCode", statusCode)
                put("requestedUrl", requestedUrl)
                put("reason", reason)
                put("responseHeaders", headersJson)
            }
            existingArray.put(entry)

            // Keep most recent 100 entries
            val trimmed = JSONArray()
            val startIdx = (existingArray.length() - 100).coerceAtLeast(0)
            for (i in startIdx until existingArray.length()) {
                trimmed.put(existingArray.get(i))
            }
            file.writeText(trimmed.toString(2))
        } catch (_: Exception) {
            // Do not crash WebView if filesystem write fails
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (inspectLogsOverlay.visibility == View.VISIBLE) {
                inspectLogsOverlay.visibility = View.GONE
                return true
            }
            if (webView.canGoBack()) {
                webView.goBack()
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        const val EXTRA_START_URL = "extra_start_url"
        private const val APP_ERRORS_FILENAME = "app_errors.json"
    }
}
