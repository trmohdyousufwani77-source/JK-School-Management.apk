package `in`.gov.jk.schoolmaster.ai

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Base64
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import `in`.gov.jk.schoolmaster.data.local.LessonPlanEntity
import `in`.gov.jk.schoolmaster.data.local.SchoolMasterDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Shared native helper for launching Android Share Intents with a generated Lesson Plan PDF
 * directly via WhatsApp, Email, or the system Android share sheet.
 */
object LessonPlanShareHelper {

    private const val SHARED_PDF_DIR = "shared_lesson_plans"

    fun createSharedPdfFile(context: Context, rawFileName: String): File {
        val dir = File(context.cacheDir, SHARED_PDF_DIR)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        val safeName = rawFileName
            .replace(Regex("[^a-zA-Z0-9._-]"), "_")
            .ifBlank { "Lesson_Plan_${System.currentTimeMillis()}.pdf" }
            .let { if (it.endsWith(".pdf", ignoreCase = true)) it else "$it.pdf" }
        return File(dir, safeName)
    }

    fun writeBase64PdfToFile(context: Context, base64Pdf: String, rawFileName: String): File? {
        return try {
            val cleaned = base64Pdf.substringAfter("base64,", base64Pdf).trim()
            val bytes = Base64.decode(cleaned, Base64.DEFAULT)
            if (bytes.isEmpty()) return null
            val outFile = createSharedPdfFile(context, rawFileName)
            FileOutputStream(outFile).use { it.write(bytes) }
            outFile
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Fires an Android ACTION_SEND Share Intent carrying the PDF FileProvider URI.
     *
     * @param targetChannel "whatsapp", "email", or "chooser"
     */
    fun sharePdfFile(
        context: Context,
        pdfFile: File,
        title: String,
        subject: String,
        classLevel: String,
        targetChannel: String = "chooser"
    ): Boolean {
        return try {
            val uri = FileProvider.getUriForFile(
                context,
                "${context.applicationContext.packageName}.fileprovider",
                pdfFile
            )
            val safeTitle = title.ifBlank { "Structured Lesson Plan" }
            val emailSubject = "Lesson Plan: $safeTitle ($subject - $classLevel)"
            val shareBody = buildString {
                appendLine("Please find attached the structured Lesson Plan PDF:")
                appendLine("Title: $safeTitle")
                if (subject.isNotBlank()) appendLine("Subject: $subject")
                if (classLevel.isNotBlank()) appendLine("Class: $classLevel")
                append("Generated with SchoolMaster Lesson Plan Generator.")
            }

            val baseIntent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, emailSubject)
                putExtra(Intent.EXTRA_TEXT, shareBody)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                if (context !is android.app.Activity) {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }

            when (targetChannel.lowercase(Locale.US)) {
                "whatsapp" -> {
                    val waPackage = resolveInstalledWhatsAppPackage(context.packageManager)
                    if (waPackage != null) {
                        baseIntent.setPackage(waPackage)
                        context.startActivity(baseIntent)
                    } else {
                        val chooser = Intent.createChooser(baseIntent, "Share Lesson Plan PDF via WhatsApp").apply {
                            if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        context.startActivity(chooser)
                    }
                }
                "email" -> {
                    // Use message/rfc822 hint when launching email chooser while preserving application/pdf stream
                    val emailIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "application/pdf"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        putExtra(Intent.EXTRA_SUBJECT, emailSubject)
                        putExtra(Intent.EXTRA_TEXT, shareBody)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        if (context !is android.app.Activity) {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    }
                    val chooser = Intent.createChooser(emailIntent, "Email Lesson Plan PDF").apply {
                        if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(chooser)
                }
                else -> {
                    val chooser = Intent.createChooser(baseIntent, "Share Lesson Plan PDF").apply {
                        if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(chooser)
                }
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun resolveInstalledWhatsAppPackage(pm: PackageManager): String? {
        val candidates = listOf("com.whatsapp", "com.whatsapp.w4b")
        for (pkg in candidates) {
            try {
                pm.getPackageInfo(pkg, 0)
                return pkg
            } catch (_: Exception) {
                // Not installed, check next
            }
        }
        return null
    }
}

/**
 * WebView JavaScript Bridge exposed as `window.SchoolMasterLessonPlanBridge`.
 * Connects the React LessonPlanGenerator directly to:
 * 1) Existing Room Database (`lesson_plans` table) for full offline persistence
 * 2) Native Android Share Intents (WhatsApp / Email / Share Sheet) attaching the jsPDF-generated PDF file
 */
class LessonPlanAndroidBridge(private val context: Context) {

    private val database: SchoolMasterDatabase by lazy {
        SchoolMasterDatabase.getInstance(context.applicationContext)
    }

    @JavascriptInterface
    fun isAvailable(): Boolean = true

    @JavascriptInterface
    fun getSavedLessonPlansJson(): String {
        return try {
            val entities = runBlocking(Dispatchers.IO) {
                database.lessonPlanDao().getAllLessonPlansOnce()
            }
            val arr = JSONArray()
            entities.forEach { entity ->
                arr.put(entityToJson(entity))
            }
            arr.toString()
        } catch (_: Exception) {
            "[]"
        }
    }

    @JavascriptInterface
    fun saveLessonPlanJson(payloadJson: String): Boolean {
        return try {
            val obj = JSONObject(payloadJson)
            val planObj = obj.optJSONObject("plan") ?: obj
            val nowMs = System.currentTimeMillis()
            val isoNow = obj.optString("savedAt").ifBlank {
                SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date(nowMs))
            }
            val entity = LessonPlanEntity(
                id = obj.optString("id").ifBlank { "lp-$nowMs" },
                title = planObj.optString("title", obj.optString("title", "Lesson Plan")),
                subject = obj.optString("subject", "General"),
                classLevel = obj.optString("classLevel", "Class 8"),
                chapter = obj.optString("chapter", ""),
                topic = obj.optString("topic", ""),
                duration = obj.optString("duration", "40 minutes"),
                language = obj.optString("language", "English"),
                isRtl = obj.optBoolean("isRtl", false),
                generalObjectives = planObj.optString("generalObjectives", ""),
                specificLearningOutcomes = planObj.optString("specificLearningOutcomes", ""),
                previousKnowledge = planObj.optString("previousKnowledge", ""),
                teachingLearningMaterials = planObj.optString("teachingLearningMaterials", ""),
                introduction = planObj.optString("introduction", ""),
                presentationOfTopic = planObj.optString("presentationOfTopic", ""),
                teacherActivities = planObj.optString("teacherActivities", ""),
                studentActivities = planObj.optString("studentActivities", ""),
                teachingMethodology = planObj.optString("teachingMethodology", ""),
                blackboardWork = planObj.optString("blackboardWork", ""),
                assessmentQuestions = planObj.optString("assessmentQuestions", ""),
                homework = planObj.optString("homework", ""),
                conclusion = planObj.optString("conclusion", ""),
                teacherName = obj.optString("teacherName", ""),
                schoolName = obj.optString("schoolName", "Govt Middle School Pamposh Colony"),
                savedAtIso = isoNow,
                updatedAtMillis = nowMs
            )
            runBlocking(Dispatchers.IO) {
                database.lessonPlanDao().upsert(entity)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun deleteLessonPlan(id: String): Boolean {
        if (id.isBlank()) return false
        return try {
            runBlocking(Dispatchers.IO) {
                database.lessonPlanDao().deleteById(id)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun shareLessonPlanPdf(
        base64Pdf: String,
        fileName: String,
        title: String,
        subject: String,
        classLevel: String,
        targetChannel: String
    ): Boolean {
        val pdfFile = LessonPlanShareHelper.writeBase64PdfToFile(context, base64Pdf, fileName)
            ?: return false
        return LessonPlanShareHelper.sharePdfFile(
            context = context,
            pdfFile = pdfFile,
            title = title,
            subject = subject,
            classLevel = classLevel,
            targetChannel = targetChannel
        )
    }

    private fun entityToJson(e: LessonPlanEntity): JSONObject {
        val planObj = JSONObject().apply {
            put("title", e.title)
            put("generalObjectives", e.generalObjectives)
            put("specificLearningOutcomes", e.specificLearningOutcomes)
            put("previousKnowledge", e.previousKnowledge)
            put("teachingLearningMaterials", e.teachingLearningMaterials)
            put("introduction", e.introduction)
            put("presentationOfTopic", e.presentationOfTopic)
            put("teacherActivities", e.teacherActivities)
            put("studentActivities", e.studentActivities)
            put("teachingMethodology", e.teachingMethodology)
            put("blackboardWork", e.blackboardWork)
            put("assessmentQuestions", e.assessmentQuestions)
            put("homework", e.homework)
            put("conclusion", e.conclusion)
        }
        return JSONObject().apply {
            put("id", e.id)
            put("subject", e.subject)
            put("classLevel", e.classLevel)
            put("chapter", e.chapter)
            put("topic", e.topic)
            put("duration", e.duration)
            put("language", e.language)
            put("isRtl", e.isRtl)
            put("teacherName", e.teacherName)
            put("schoolName", e.schoolName)
            put("savedAt", e.savedAtIso.ifBlank {
                SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date(e.updatedAtMillis))
            })
            put("storageEngine", "room")
            put("plan", planObj)
        }
    }
}
