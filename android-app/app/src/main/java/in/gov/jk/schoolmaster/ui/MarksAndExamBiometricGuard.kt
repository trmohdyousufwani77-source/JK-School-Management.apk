package `in`.gov.jk.schoolmaster.ui

import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import `in`.gov.jk.schoolmaster.security.BiometricAuthHelper
import org.json.JSONObject

/**
 * Jetpack Compose Biometric Guard wrapping Marks Entry and Examination screens
 * using AndroidX BiometricPrompt API.
 */
@Composable
fun MarksAndExamBiometricGuard(
    activity: FragmentActivity,
    moduleTitle: String,
    isUnlocked: Boolean,
    onUnlock: (authMethod: String) -> Unit,
    onLock: () -> Unit,
    onAuditEvent: (outcome: String, authMethod: String, detailMessage: String) -> Unit = { _, _, _ -> },
    content: @Composable () -> Unit
) {
    var errorMessage by remember { mutableStateOf<String?>(null) }

    if (isUnlocked) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFECFDF5))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.VerifiedUser,
                            contentDescription = null,
                            tint = Color(0xFF059669)
                        )
                        Text(
                            text = "$moduleTitle Verified via BiometricPrompt",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF065F46)
                        )
                    }
                    OutlinedButton(onClick = onLock) {
                        Text("Lock")
                    }
                }
            }
            content()
        }
        return
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Rounded.Lock,
                contentDescription = null,
                tint = Color(0xFF4F46E5)
            )
            Text(
                text = "Biometric Authorization Required",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0F172A)
            )
            Text(
                text = "Authenticate with AndroidX BiometricPrompt to access $moduleTitle and protect academic grades.",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF475569)
            )

            if (!errorMessage.isNullOrBlank()) {
                Text(
                    text = errorMessage ?: "",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFBE123C)
                )
            }

            Button(
                onClick = {
                    errorMessage = null
                    BiometricAuthHelper.authenticateGradeModule(
                        activity = activity,
                        moduleTitle = moduleTitle,
                        onSuccess = { method -> onUnlock(method) },
                        onFailure = { reason -> errorMessage = reason },
                        onAuditEvent = onAuditEvent
                    )
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4F46E5))
            ) {
                Icon(
                    imageVector = Icons.Rounded.Fingerprint,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 6.dp)
                )
                Text("Unlock $moduleTitle")
            }
        }
    }
}

/**
 * WebView JavaScript Bridge exposed as `window.SchoolMasterAndroidBiometric`
 * so the Web Marks Entry and Examination modules trigger native AndroidX BiometricPrompt.
 */
class AndroidBiometricBridge(
    private val activity: FragmentActivity,
    private val webView: WebView
) {
    @JavascriptInterface
    fun authenticateGradeModule(moduleTitle: String, callbackName: String) {
        // Strict allowlist check on callbackName to prevent script injection
        if (!callbackName.matches(Regex("^[a-zA-Z0-9_]{4,64}$"))) return
        val safeTitle = moduleTitle.take(48).ifBlank { "Marks Entry" }

        activity.runOnUiThread {
            BiometricAuthHelper.authenticateGradeModule(
                activity = activity,
                moduleTitle = safeTitle,
                onSuccess = { authMethod ->
                    val detailLiteral = JSONObject.quote(authMethod)
                    webView.evaluateJavascript(
                        "window['$callbackName'] && window['$callbackName'](true, $detailLiteral);",
                        null
                    )
                },
                onFailure = { errorMsg ->
                    val errLiteral = JSONObject.quote(errorMsg)
                    webView.evaluateJavascript(
                        "window['$callbackName'] && window['$callbackName'](false, $errLiteral);",
                        null
                    )
                }
            )
        }
    }

    @JavascriptInterface
    fun authenticateExport(actionLabel: String, callbackName: String) {
        // Strict allowlist check on callbackName to prevent script injection
        if (!callbackName.matches(Regex("^[a-zA-Z0-9_]{4,64}$"))) return
        val safeLabel = actionLabel.take(80).ifBlank { "PDF / Excel Report Export" }

        activity.runOnUiThread {
            BiometricAuthHelper.authenticateSensitiveModule(
                activity = activity,
                moduleTitle = "Report Export",
                subtitle = "Confirm device biometrics (androidx.biometric) before exporting: $safeLabel",
                onSuccess = {
                    val detailLiteral = JSONObject.quote("AndroidX BiometricPrompt Verified")
                    webView.evaluateJavascript(
                        "window['$callbackName'] && window['$callbackName'](true, $detailLiteral);",
                        null
                    )
                },
                onFailure = { errorMsg ->
                    val errLiteral = JSONObject.quote(errorMsg)
                    webView.evaluateJavascript(
                        "window['$callbackName'] && window['$callbackName'](false, $errLiteral);",
                        null
                    )
                }
            )
        }
    }
}
