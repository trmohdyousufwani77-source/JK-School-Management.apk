package `in`.gov.jk.schoolmaster.ai

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import `in`.gov.jk.schoolmaster.BuildConfig
import `in`.gov.jk.schoolmaster.data.local.LessonPlanEntity
import `in`.gov.jk.schoolmaster.data.local.SchoolMasterDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class SavedEduItem(
    val id: String,
    val title: String,
    val mode: String,
    val subject: String,
    val classLevel: String,
    val language: String,
    val content: String,
    val duration: String = "40 minutes",
    val chapter: String = "",
    val topic: String = "",
    val isRtl: Boolean = false,
    val structuredPlan: LessonPlanEntity? = null,
    val createdAtMs: Long = System.currentTimeMillis()
)

data class AiSmartEduUiState(
    val activeSection: String = "home",
    val subject: String = "Science",
    val classLevel: String = "Class 8",
    val language: String = "English",
    val kashmiriScript: String = "perso-arabic",
    val answerFormat: String = "Short Answer",
    val difficulty: String = "Medium",
    val totalMarks: Int = 50,
    val duration: String = "40 minutes",
    val darkMode: Boolean = false,
    val isLoading: Boolean = false,
    val outputTitle: String = "",
    val outputContent: String = "",
    val currentStructuredPlan: LessonPlanEntity? = null,
    val errorMessage: String? = null,
    val statusMessage: String? = null,
    val savedItems: List<SavedEduItem> = emptyList()
)

/**
 * MVVM ViewModel for AI Smart Education – Lesson Planner & Question Answer App.
 * - Calls the secure backend proxy (`/api/smart-edu/generate`) — zero Gemini API keys stored in the APK.
 * - Persists saved Lesson Plans directly into the existing Room Database (`lesson_plans` table)
 *   so saved plans remain 100% available offline.
 * - Generates structured PDF files into FileProvider cache and shares via WhatsApp / Email / Share Sheet.
 */
class AiSmartEduViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(AiSmartEduUiState())
    val uiState: StateFlow<AiSmartEduUiState> = _uiState.asStateFlow()

    private var roomDb: SchoolMasterDatabase? = null
    private var roomObserverJob: Job? = null

    val subjects = listOf("English", "Urdu", "Science", "Social Science", "Kashmiri")
    val languages = listOf("English", "Urdu", "Kashmiri")
    val answerFormats = listOf(
        "Very Short Answer",
        "Short Answer",
        "Long Answer",
        "Detailed Explanation",
        "Point-wise Answer"
    )

    fun attachRoomDatabase(context: Context) {
        if (roomDb != null) return
        val db = SchoolMasterDatabase.getInstance(context.applicationContext)
        roomDb = db
        roomObserverJob?.cancel()
        roomObserverJob = viewModelScope.launch {
            db.lessonPlanDao().observeAllLessonPlans().collect { entities ->
                val mapped = entities.map { e ->
                    SavedEduItem(
                        id = e.id,
                        title = e.title,
                        mode = "lesson_plan",
                        subject = e.subject,
                        classLevel = e.classLevel,
                        language = e.language,
                        content = formatLessonPlanEntity(e),
                        duration = e.duration,
                        chapter = e.chapter,
                        topic = e.topic,
                        isRtl = e.isRtl,
                        structuredPlan = e,
                        createdAtMs = e.updatedAtMillis
                    )
                }
                _uiState.value = _uiState.value.copy(savedItems = mapped)
            }
        }
    }

    fun setSection(section: String) {
        _uiState.value = _uiState.value.copy(activeSection = section, errorMessage = null)
    }

    fun setSubject(subject: String) {
        _uiState.value = _uiState.value.copy(subject = subject)
    }

    fun setClassLevel(cls: String) {
        _uiState.value = _uiState.value.copy(classLevel = cls)
    }

    fun setLanguage(lang: String) {
        _uiState.value = _uiState.value.copy(language = lang)
    }

    fun setKashmiriScript(script: String) {
        _uiState.value = _uiState.value.copy(kashmiriScript = script)
    }

    fun setAnswerFormat(format: String) {
        _uiState.value = _uiState.value.copy(answerFormat = format)
    }

    fun setDifficulty(difficulty: String) {
        _uiState.value = _uiState.value.copy(difficulty = difficulty)
    }

    fun toggleDarkMode() {
        _uiState.value = _uiState.value.copy(darkMode = !_uiState.value.darkMode)
    }

    fun openSavedItem(item: SavedEduItem) {
        _uiState.value = _uiState.value.copy(
            activeSection = "lesson_plan",
            subject = item.subject,
            classLevel = item.classLevel,
            language = item.language,
            duration = item.duration,
            outputTitle = item.title,
            outputContent = item.content,
            currentStructuredPlan = item.structuredPlan,
            statusMessage = "Loaded offline lesson plan from Room Database."
        )
    }

    fun generateContent(
        mode: String,
        chapter: String = "",
        topic: String = "",
        question: String = "",
        translateTargetLanguage: String = "Urdu",
        sourceText: String = ""
    ) {
        val current = _uiState.value
        _uiState.value = current.copy(isLoading = true, errorMessage = null, statusMessage = null)

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                callSmartEduApi(
                    mode = mode,
                    subject = current.subject,
                    classLevel = current.classLevel,
                    language = current.language,
                    kashmiriScript = current.kashmiriScript,
                    chapter = chapter,
                    topic = topic,
                    duration = current.duration,
                    question = question,
                    answerFormat = current.answerFormat,
                    difficulty = current.difficulty,
                    totalMarks = current.totalMarks,
                    translateTargetLanguage = translateTargetLanguage,
                    sourceText = sourceText
                )
            }

            result.fold(
                onSuccess = { apiOut ->
                    val label = when (mode) {
                        "lesson_plan" -> apiOut.structuredPlan?.title?.ifBlank { null }
                            ?: "13-Section Lesson Plan — ${current.subject} (${topic.ifBlank { chapter }})"
                        "qa" -> "${current.answerFormat} — ${current.subject}"
                        "question_paper" -> "Question Paper (${current.totalMarks} Marks) — ${current.subject}"
                        "notes" -> "Chapter Notes — ${current.subject}"
                        "mcq" -> "MCQ Quiz — ${current.subject}"
                        "worksheet" -> "Classroom Worksheet — ${current.subject}"
                        "translate" -> "Translation to $translateTargetLanguage"
                        else -> "AI Smart Education Output"
                    }
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        outputTitle = label,
                        outputContent = apiOut.text,
                        currentStructuredPlan = apiOut.structuredPlan
                    )
                },
                onFailure = { err ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = err.localizedMessage ?: "Unable to connect to AI Smart Education service."
                    )
                }
            )
        }
    }

    fun saveCurrentOutput(context: Context? = null) {
        val s = _uiState.value
        if (s.outputContent.isBlank()) return
        if (context != null && roomDb == null) {
            attachRoomDatabase(context)
        }
        val nowMs = System.currentTimeMillis()
        val isoNow = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date(nowMs))
        val isRtl = s.language == "Urdu" || (s.language == "Kashmiri" && s.kashmiriScript == "perso-arabic")

        val entity = s.currentStructuredPlan?.copy(
            id = s.currentStructuredPlan.id.ifBlank { "lp-$nowMs" },
            title = s.outputTitle.ifBlank { s.currentStructuredPlan.title },
            savedAtIso = isoNow,
            updatedAtMillis = nowMs
        ) ?: LessonPlanEntity(
            id = "lp-$nowMs",
            title = s.outputTitle.ifBlank { "${s.subject} — ${s.activeSection}" },
            subject = s.subject,
            classLevel = s.classLevel,
            duration = s.duration,
            language = s.language,
            isRtl = isRtl,
            presentationOfTopic = s.outputContent,
            savedAtIso = isoNow,
            updatedAtMillis = nowMs
        )

        val db = roomDb
        if (db != null) {
            viewModelScope.launch(Dispatchers.IO) {
                db.lessonPlanDao().upsert(entity)
                withContext(Dispatchers.Main) {
                    _uiState.value = _uiState.value.copy(
                        currentStructuredPlan = entity,
                        statusMessage = "Saved offline to Room Database."
                    )
                }
            }
        } else {
            val item = SavedEduItem(
                id = entity.id,
                title = entity.title,
                mode = s.activeSection,
                subject = s.subject,
                classLevel = s.classLevel,
                language = s.language,
                content = s.outputContent,
                duration = s.duration,
                isRtl = isRtl,
                structuredPlan = entity
            )
            _uiState.value = s.copy(
                savedItems = listOf(item) + s.savedItems,
                statusMessage = "Saved to local library."
            )
        }
    }

    fun deleteSavedItem(id: String) {
        val db = roomDb
        if (db != null) {
            viewModelScope.launch(Dispatchers.IO) {
                db.lessonPlanDao().deleteById(id)
            }
        } else {
            _uiState.value = _uiState.value.copy(
                savedItems = _uiState.value.savedItems.filterNot { it.id == id }
            )
        }
    }

    fun exportOutputToPdf(
        context: Context,
        title: String,
        content: String,
        structuredPlan: LessonPlanEntity? = _uiState.value.currentStructuredPlan
    ): File? {
        return try {
            val document = PdfDocument()
            var pageNum = 1
            var page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNum).create())
            var canvas = page.canvas

            val headerBgPaint = Paint().apply { color = Color.rgb(15, 23, 42) }
            val sectionBgPaint = Paint().apply { color = Color.rgb(241, 245, 249) }
            val titleWhitePaint = Paint().apply {
                color = Color.WHITE
                textSize = 15f
                isFakeBoldText = true
                isAntiAlias = true
            }
            val subWhitePaint = Paint().apply {
                color = Color.rgb(203, 213, 225)
                textSize = 9.5f
                isAntiAlias = true
            }
            val sectionTitlePaint = Paint().apply {
                color = Color.rgb(30, 41, 59)
                textSize = 10.5f
                isFakeBoldText = true
                isAntiAlias = true
            }
            val bodyPaint = Paint().apply {
                color = Color.rgb(51, 65, 85)
                textSize = 10f
                isAntiAlias = true
            }

            // Header Banner
            canvas.drawRect(32f, 28f, 563f, 96f, headerBgPaint)
            canvas.drawText(
                (structuredPlan?.schoolName ?: "SchoolMaster Institution").take(54),
                44f,
                50f,
                titleWhitePaint
            )
            val metaLine = if (structuredPlan != null) {
                "${structuredPlan.subject} · ${structuredPlan.classLevel} · ${structuredPlan.duration} · ${structuredPlan.language}"
            } else {
                "${_uiState.value.subject} · ${_uiState.value.classLevel} · ${_uiState.value.language}"
            }
            canvas.drawText(metaLine.take(78), 44f, 68f, subWhitePaint)
            canvas.drawText(title.take(68), 44f, 84f, titleWhitePaint.apply { textSize = 11f })

            var y = 118f

            fun ensureSpace(needed: Float) {
                if (y + needed > 800f) {
                    document.finishPage(page)
                    pageNum++
                    page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNum).create())
                    canvas = page.canvas
                    y = 44f
                }
            }

            if (structuredPlan != null) {
                val sections = listOf(
                    "1. General Objectives" to structuredPlan.generalObjectives,
                    "2. Specific Learning Outcomes" to structuredPlan.specificLearningOutcomes,
                    "3. Previous Knowledge" to structuredPlan.previousKnowledge,
                    "4. Teaching-Learning Materials (TLM)" to structuredPlan.teachingLearningMaterials,
                    "5. Introduction & Warm-Up" to structuredPlan.introduction,
                    "6. Presentation of the Topic" to structuredPlan.presentationOfTopic,
                    "7. Teacher Activities" to structuredPlan.teacherActivities,
                    "8. Student Activities" to structuredPlan.studentActivities,
                    "9. Teaching Methodology" to structuredPlan.teachingMethodology,
                    "10. Blackboard Work" to structuredPlan.blackboardWork,
                    "11. Assessment Questions" to structuredPlan.assessmentQuestions,
                    "12. Homework" to structuredPlan.homework,
                    "13. Conclusion" to structuredPlan.conclusion
                )
                for ((label, value) in sections) {
                    ensureSpace(44f)
                    canvas.drawRect(32f, y - 13f, 563f, y + 6f, sectionBgPaint)
                    canvas.drawText(label, 40f, y, sectionTitlePaint)
                    y += 20f

                    val lines = value.ifBlank { "—" }.lines()
                    for (rawLine in lines) {
                        val chunks = rawLine.chunked(82).ifEmpty { listOf("") }
                        for (chunk in chunks) {
                            ensureSpace(16f)
                            canvas.drawText(chunk, 40f, y, bodyPaint)
                            y += 14.5f
                        }
                    }
                    y += 10f
                }
            } else {
                for (rawLine in content.lines()) {
                    val chunks = rawLine.chunked(82).ifEmpty { listOf("") }
                    for (line in chunks) {
                        ensureSpace(16f)
                        canvas.drawText(line, 40f, y, bodyPaint)
                        y += 15f
                    }
                }
            }
            document.finishPage(page)

            val slug = title.lowercase(Locale.US).replace(Regex("[^a-z0-9]+"), "_").take(32).ifBlank { "lesson_plan" }
            val outFile = LessonPlanShareHelper.createSharedPdfFile(context, "Lesson_Plan_${slug}.pdf")
            FileOutputStream(outFile).use { document.writeTo(it) }
            document.close()
            outFile
        } catch (_: Exception) {
            null
        }
    }

    private data class ApiGenerationResult(
        val text: String,
        val structuredPlan: LessonPlanEntity? = null
    )

    private fun callSmartEduApi(
        mode: String,
        subject: String,
        classLevel: String,
        language: String,
        kashmiriScript: String,
        chapter: String,
        topic: String,
        duration: String,
        question: String,
        answerFormat: String,
        difficulty: String,
        totalMarks: Int,
        translateTargetLanguage: String,
        sourceText: String
    ): Result<ApiGenerationResult> {
        return try {
            val baseUrl = BuildConfig.APP_URL.trim().trimEnd('/').ifBlank {
                "https://ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app"
            }
            val endpoint = URL("$baseUrl/api/smart-edu/generate")
            val conn = (endpoint.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 20000
                readTimeout = 45000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            }

            val payload = JSONObject().apply {
                put("mode", mode)
                put("subject", subject)
                put("classLevel", classLevel)
                put("language", language)
                put("kashmiriScript", kashmiriScript)
                put("chapter", chapter)
                put("topic", topic)
                put("duration", duration)
                put("question", question)
                put("answerFormat", answerFormat)
                put("difficulty", difficulty)
                put("totalMarks", totalMarks)
                put("translateTargetLanguage", translateTargetLanguage)
                put("sourceText", sourceText)
            }

            conn.outputStream.use { os ->
                os.write(payload.toString().toByteArray(Charsets.UTF_8))
            }

            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() } ?: ""
            conn.disconnect()

            if (status !in 200..299) {
                return Result.failure(IllegalStateException("Server returned HTTP $status"))
            }

            val json = JSONObject(body)
            val result = when {
                json.has("lessonPlan") -> {
                    val lp = json.getJSONObject("lessonPlan")
                    val nowMs = System.currentTimeMillis()
                    val isRtl = json.optBoolean(
                        "isRtl",
                        language == "Urdu" || (language == "Kashmiri" && kashmiriScript == "perso-arabic")
                    )
                    val entity = LessonPlanEntity(
                        id = "lp-$nowMs",
                        title = lp.optString("title", "$subject Lesson Plan"),
                        subject = subject,
                        classLevel = classLevel,
                        chapter = chapter,
                        topic = topic,
                        duration = duration,
                        language = language,
                        isRtl = isRtl,
                        generalObjectives = lp.optString("generalObjectives", ""),
                        specificLearningOutcomes = lp.optString("specificLearningOutcomes", ""),
                        previousKnowledge = lp.optString("previousKnowledge", ""),
                        teachingLearningMaterials = lp.optString("teachingLearningMaterials", ""),
                        introduction = lp.optString("introduction", ""),
                        presentationOfTopic = lp.optString("presentationOfTopic", ""),
                        teacherActivities = lp.optString("teacherActivities", ""),
                        studentActivities = lp.optString("studentActivities", ""),
                        teachingMethodology = lp.optString("teachingMethodology", ""),
                        blackboardWork = lp.optString("blackboardWork", ""),
                        assessmentQuestions = lp.optString("assessmentQuestions", ""),
                        homework = lp.optString("homework", ""),
                        conclusion = lp.optString("conclusion", ""),
                        savedAtIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date(nowMs)),
                        updatedAtMillis = nowMs
                    )
                    ApiGenerationResult(text = formatLessonPlanEntity(entity), structuredPlan = entity)
                }
                json.has("mcqs") -> ApiGenerationResult(text = formatMcqsJson(json))
                json.has("content") -> ApiGenerationResult(text = json.optString("content"))
                else -> ApiGenerationResult(text = body)
            }
            Result.success(result)
        } catch (ex: Exception) {
            Result.failure(ex)
        }
    }

    private fun formatLessonPlanEntity(lp: LessonPlanEntity): String {
        val sections = listOf(
            "1. General Objectives" to lp.generalObjectives,
            "2. Specific Learning Outcomes" to lp.specificLearningOutcomes,
            "3. Previous Knowledge" to lp.previousKnowledge,
            "4. Teaching-Learning Materials" to lp.teachingLearningMaterials,
            "5. Introduction" to lp.introduction,
            "6. Presentation of Topic" to lp.presentationOfTopic,
            "7. Teacher Activities" to lp.teacherActivities,
            "8. Student Activities" to lp.studentActivities,
            "9. Teaching Methodology" to lp.teachingMethodology,
            "10. Blackboard Work" to lp.blackboardWork,
            "11. Assessment Questions" to lp.assessmentQuestions,
            "12. Homework" to lp.homework,
            "13. Conclusion" to lp.conclusion
        )
        return buildString {
            appendLine(lp.title.ifBlank { "Lesson Plan" })
            appendLine()
            sections.forEach { (label, content) ->
                appendLine(label)
                appendLine(content.ifBlank { "—" })
                appendLine()
            }
        }.trim()
    }

    private fun formatMcqsJson(root: JSONObject): String {
        val arr = root.optJSONArray("mcqs") ?: return ""
        return buildString {
            for (i in 0 until arr.length()) {
                val q = arr.getJSONObject(i)
                appendLine("Q${i + 1}. ${q.optString("question")}")
                val opts = q.optJSONArray("options")
                if (opts != null) {
                    val letters = listOf("A", "B", "C", "D")
                    for (j in 0 until opts.length()) {
                        appendLine("   ${letters.getOrElse(j) { "$j" }}) ${opts.optString(j)}")
                    }
                }
                appendLine("   Answer: ${q.optString("correctAnswer")}")
                appendLine("   Explanation: ${q.optString("explanation")}")
                appendLine()
            }
        }.trim()
    }
}
