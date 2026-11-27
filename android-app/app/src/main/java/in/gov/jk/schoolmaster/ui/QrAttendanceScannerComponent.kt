package `in`.gov.jk.schoolmaster.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import `in`.gov.jk.schoolmaster.data.local.ScannerHistoryEntity
import `in`.gov.jk.schoolmaster.data.local.StudentEntity
import `in`.gov.jk.schoolmaster.security.ScannerHistoryPdfExporter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Triggers a subtle 40ms haptic pulse and short pleasant beep sound on successful student QR scan.
 */
fun triggerClassroomScanConfirmation(context: Context) {
    try {
        val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 75)
        tone.startTone(ToneGenerator.TONE_PROP_BEEP, 130)
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            try {
                tone.release()
            } catch (_: Exception) {
            }
        }, 220)
    } catch (_: Exception) {
        // Audio channel unavailable
    }

    try {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vm?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(40L, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(40L)
            }
        }
    } catch (_: Exception) {
        // Vibration not available
    }
}

/**
 * Reusable Jetpack Compose QR Attendance Scanner powered by CameraX + ZXing MultiFormatReader.
 * Includes subtle haptic + beep confirmation, Manual Override name search toggle, and Daily Scan Summary by class.
 */
@Composable
fun QrAttendanceScannerComponent(
    onStudentQrDetected: (rawQrPayload: String) -> Unit,
    students: List<StudentEntity> = emptyList(),
    recentScanHistory: List<ScannerHistoryEntity> = emptyList(),
    todayClassBreakdown: Map<String, Int> = emptyMap(),
    totalPresentViaQrToday: Int = 0,
    lastMarkedSummary: String? = null,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val haptic = LocalHapticFeedback.current
    var manualStudentCode by remember { mutableStateOf("") }
    var lastDecodedText by remember { mutableStateOf("") }
    var lastScanTimestampMs by remember { mutableLongStateOf(0L) }
    var soundAndHapticsEnabled by remember { mutableStateOf(true) }
    var manualOverrideEnabled by remember { mutableStateOf(false) }
    var overrideNameQuery by remember { mutableStateOf("") }
    var selectedHistoryClassFilter by remember { mutableStateOf("All Classes") }
    var classFilterDropdownExpanded by remember { mutableStateOf(false) }
    var scanSuccessOverlaySubtitle by remember { mutableStateOf<String?>(null) }
    var scanSuccessOverlayTrigger by remember { mutableLongStateOf(0L) }

    LaunchedEffect(scanSuccessOverlayTrigger) {
        if (scanSuccessOverlayTrigger > 0L) {
            delay(1500L)
            scanSuccessOverlaySubtitle = null
        }
    }

    val availableFilterClasses = remember(students, todayClassBreakdown, recentScanHistory) {
        buildSet {
            students.forEach { add("Class ${it.classNumber}-${it.section}") }
            todayClassBreakdown.keys.forEach { add(it) }
            recentScanHistory.forEach { if (it.classSection.isNotBlank()) add(it.classSection) }
        }.sorted()
    }

    val hasCameraPermission = remember(context) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
    }

    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    DisposableEffect(Unit) {
        onDispose { analysisExecutor.shutdown() }
    }

    val notifyAndDispatchScan: (String) -> Unit = { payload ->
        if (soundAndHapticsEnabled) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            triggerClassroomScanConfirmation(context)
        }
        val matchedStudent = students.find {
            it.admissionNumber.equals(payload.trim(), ignoreCase = true) ||
                it.id.equals(payload.trim(), ignoreCase = true) ||
                payload.contains(it.admissionNumber, ignoreCase = true)
        }
        scanSuccessOverlaySubtitle = matchedStudent?.let {
            "${it.fullName} · Class ${it.classNumber}-${it.section}"
        } ?: payload.lines().firstOrNull()?.take(40) ?: "Attendance Marked Present"
        scanSuccessOverlayTrigger = System.currentTimeMillis()
        onStudentQrDetected(payload)
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Daily Scan Summary Card
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFEEF2FF))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Daily Scan Summary",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = "Students marked 'Present' via QR today",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF475569)
                        )
                    }
                    Text(
                        text = "$totalPresentViaQrToday Present",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color(0xFF047857)
                    )
                }

                if (todayClassBreakdown.isNotEmpty()) {
                    todayClassBreakdown.entries.sortedBy { it.key }.forEach { (classLabel, count) ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = classLabel,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF1E293B)
                            )
                            Text(
                                text = "$count marked",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF059669)
                            )
                        }
                    }
                }
                // Class Filter Dropdown Menu for Last 5 Scan History Log
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Filter Scan History by Class",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF334155)
                    )
                    Box {
                        OutlinedButton(
                            onClick = { classFilterDropdownExpanded = true },
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text(
                                text = selectedHistoryClassFilter,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Icon(
                                imageVector = Icons.Rounded.ArrowDropDown,
                                contentDescription = "Select class filter"
                            )
                        }
                        DropdownMenu(
                            expanded = classFilterDropdownExpanded,
                            onDismissRequest = { classFilterDropdownExpanded = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("All Classes") },
                                onClick = {
                                    selectedHistoryClassFilter = "All Classes"
                                    classFilterDropdownExpanded = false
                                }
                            )
                            availableFilterClasses.forEach { clsLabel ->
                                DropdownMenuItem(
                                    text = { Text(clsLabel) },
                                    onClick = {
                                        selectedHistoryClassFilter = clsLabel
                                        classFilterDropdownExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }

        // Scan History Log — Last 5 Successful Student Scans with Timestamps (filtered by selected class)
        val lastFiveScans = remember(recentScanHistory, selectedHistoryClassFilter) {
            recentScanHistory
                .filter { entry ->
                    selectedHistoryClassFilter == "All Classes" ||
                        entry.classSection.equals(selectedHistoryClassFilter, ignoreCase = true) ||
                        "Class ${entry.classSection}".equals(selectedHistoryClassFilter, ignoreCase = true)
                }
                .sortedByDescending { it.scannedAtMillis }
                .take(5)
        }
        val timeFmt = remember { SimpleDateFormat("HH:mm:ss", Locale.US) }
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (selectedHistoryClassFilter == "All Classes") {
                            "Scan History (Last 5 Scans)"
                        } else {
                            "Scan History — $selectedHistoryClassFilter"
                        },
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F172A)
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                val todayIso = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                                ScannerHistoryPdfExporter.exportScanHistoryToPdf(
                                    context = context,
                                    dateLabel = todayIso,
                                    totalScannedToday = totalPresentViaQrToday,
                                    classBreakdown = todayClassBreakdown,
                                    entries = lastFiveScans,
                                    classFilterLabel = selectedHistoryClassFilter
                                )
                            },
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.PictureAsPdf,
                                contentDescription = "Export scan history PDF",
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("PDF", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                        Text(
                            text = "${lastFiveScans.size}/5",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF475569)
                        )
                    }
                }
                if (lastFiveScans.isEmpty()) {
                    Text(
                        text = if (selectedHistoryClassFilter == "All Classes") {
                            "No successful scans recorded yet. Recent scans with timestamps will appear here."
                        } else {
                            "No successful scans recorded yet for $selectedHistoryClassFilter."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF64748B)
                    )
                } else {
                    lastFiveScans.forEach { scan ->
                        val initials = scan.studentName
                            .trim()
                            .split(Regex("\\s+"))
                            .take(2)
                            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                            .joinToString("")
                            .ifBlank { "ST" }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFFEEF2FF))
                                        .border(1.dp, Color(0xFFC7D2FE), CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = initials,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF3730A3)
                                    )
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = scan.studentName,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0F172A)
                                    )
                                    Text(
                                        text = "${scan.classSection} · ${scan.admissionNumber}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color(0xFF64748B)
                                    )
                                }
                            }
                            Text(
                                text = timeFmt.format(Date(scan.scannedAtMillis)),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF059669)
                            )
                        }
                    }
                }
            }
        }

        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "ZXing Student ID QR Scanner",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F172A)
                    )
                    FilterChip(
                        selected = soundAndHapticsEnabled,
                        onClick = { soundAndHapticsEnabled = !soundAndHapticsEnabled },
                        label = { Text(if (soundAndHapticsEnabled) "Beep + Haptic" else "Muted") }
                    )
                }

                // Manual Override Toggle Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Manual Override (Missing / Damaged ID)",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF92400E)
                        )
                        Text(
                            text = "Search student by name to mark Present manually",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF64748B)
                        )
                    }
                    Switch(
                        checked = manualOverrideEnabled,
                        onCheckedChange = { manualOverrideEnabled = it }
                    )
                }

                if (manualOverrideEnabled) {
                    OutlinedTextField(
                        value = overrideNameQuery,
                        onValueChange = { overrideNameQuery = it },
                        label = { Text("Search student by name...") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    val matches = remember(students, overrideNameQuery) {
                        val q = overrideNameQuery.trim().lowercase()
                        if (q.isEmpty()) students.take(5)
                        else students.filter {
                            it.fullName.lowercase().contains(q) ||
                                it.admissionNumber.lowercase().contains(q) ||
                                it.classNumber.lowercase().contains(q)
                        }.take(8)
                    }
                    matches.forEach { st ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = st.fullName,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "Class ${st.classNumber}-${st.section} · ${st.admissionNumber}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color(0xFF64748B)
                                )
                            }
                            Button(
                                onClick = { notifyAndDispatchScan(st.admissionNumber) },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669))
                            ) {
                                Text("Present")
                            }
                        }
                    }
                }

                if (hasCameraPermission) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(240.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(Color(0xFF0F172A)),
                        contentAlignment = Alignment.Center
                    ) {
                        AndroidView(
                            modifier = Modifier.fillMaxSize(),
                            factory = { ctx ->
                                val previewView = PreviewView(ctx)
                                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                                cameraProviderFuture.addListener({
                                    val cameraProvider = cameraProviderFuture.get()
                                    val preview = Preview.Builder().build().also {
                                        it.setSurfaceProvider(previewView.surfaceProvider)
                                    }

                                    val zxingReader = MultiFormatReader().apply {
                                        setHints(
                                            mapOf(
                                                DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
                                                DecodeHintType.TRY_HARDER to true
                                            )
                                        )
                                    }

                                    val imageAnalysis = ImageAnalysis.Builder()
                                        .setTargetResolution(Size(640, 480))
                                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                        .build()

                                    imageAnalysis.setAnalyzer(analysisExecutor) { imageProxy ->
                                        decodeQrWithZxing(imageProxy, zxingReader)?.let { payload ->
                                            val now = System.currentTimeMillis()
                                            if (payload != lastDecodedText || now - lastScanTimestampMs > 2800L) {
                                                lastDecodedText = payload
                                                lastScanTimestampMs = now
                                                ContextCompat.getMainExecutor(ctx).execute {
                                                    notifyAndDispatchScan(payload)
                                                }
                                            }
                                        }
                                        imageProxy.close()
                                    }

                                    try {
                                        cameraProvider.unbindAll()
                                        cameraProvider.bindToLifecycle(
                                            lifecycleOwner,
                                            CameraSelector.DEFAULT_BACK_CAMERA,
                                            preview,
                                            imageAnalysis
                                        )
                                    } catch (_: Exception) {
                                        // Camera busy or unavailable
                                    }
                                }, ContextCompat.getMainExecutor(ctx))
                                previewView
                            }
                        )

                        // 'Scan Successful' Animated Overlay directly over Camera View
                        AnimatedVisibility(
                            visible = scanSuccessOverlaySubtitle != null,
                            enter = fadeIn(tween(180)) + scaleIn(initialScale = 0.86f, animationSpec = tween(220)),
                            exit = fadeOut(tween(260)),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(Color(0xB8064E3B)),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                    modifier = Modifier.padding(16.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(56.dp)
                                            .clip(CircleShape)
                                            .background(Color(0xFF10B981)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.CheckCircle,
                                            contentDescription = "Scan Successful",
                                            tint = Color.White,
                                            modifier = Modifier.size(34.dp)
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        text = "Scan Successful",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color.White
                                    )
                                    scanSuccessOverlaySubtitle?.let { subtitle ->
                                        Text(
                                            text = subtitle,
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFFA7F3D0)
                                        )
                                    }
                                }
                            }
                        }
                    }
                } else {
                    Text(
                        text = "Camera permission is required for live QR scanning. Grant CAMERA permission in App Settings or use Manual Override above.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFB45309)
                    )
                }

                if (!lastMarkedSummary.isNullOrBlank()) {
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFECFDF5))
                    ) {
                        Text(
                            text = lastMarkedSummary,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF065F46),
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = manualStudentCode,
                        onValueChange = { manualStudentCode = it },
                        label = { Text("Student ID / Admission No") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    Button(
                        onClick = {
                            val code = manualStudentCode.trim()
                            if (code.isNotEmpty()) {
                                notifyAndDispatchScan(code)
                                manualStudentCode = ""
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669))
                    ) {
                        Text("Mark Present")
                    }
                }
            }
        }
    }
}

private fun decodeQrWithZxing(imageProxy: ImageProxy, reader: MultiFormatReader): String? {
    return try {
        val plane = imageProxy.planes.firstOrNull() ?: return null
        val buffer = plane.buffer
        val data = ByteArray(buffer.remaining())
        buffer.get(data)
        val source = PlanarYUVLuminanceSource(
            data,
            imageProxy.width,
            imageProxy.height,
            0,
            0,
            imageProxy.width,
            imageProxy.height,
            false
        )
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        reader.decodeWithState(bitmap)?.text
    } catch (_: Exception) {
        null
    } finally {
        reader.reset()
    }
}
