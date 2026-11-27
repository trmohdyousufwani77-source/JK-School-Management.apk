package `in`.gov.jk.schoolmaster.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import `in`.gov.jk.schoolmaster.ai.AiSmartEduViewModel
import `in`.gov.jk.schoolmaster.ai.LessonPlanShareHelper

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AiSmartEduScreen(
    modifier: Modifier = Modifier,
    vm: AiSmartEduViewModel = viewModel()
) {
    val state by vm.uiState.collectAsState()
    val context = LocalContext.current
    var chapterInput by remember { mutableStateOf("") }
    var topicInput by remember { mutableStateOf("") }
    var questionInput by remember { mutableStateOf("") }
    var pdfStatus by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(context) {
        vm.attachRoomDatabase(context)
    }

    val isRtl = state.language == "Urdu" ||
        (state.language == "Kashmiri" && state.kashmiriScript == "perso-arabic")

    val bgColor = if (state.darkMode) Color(0xFF0F172A) else Color(0xFFF8FAFC)
    val cardColor = if (state.darkMode) Color(0xFF1E293B) else Color.White
    val textPrimary = if (state.darkMode) Color(0xFFF8FAFC) else Color(0xFF0F172A)
    val textSecondary = if (state.darkMode) Color(0xFF94A3B8) else Color(0xFF475569)

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(bgColor)
            .verticalScroll(rememberScrollState())
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header + Dark Mode Toggle
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = cardColor)
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "AI Smart Education",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = textPrimary
                        )
                        Text(
                            text = "Lesson Planner & Q&A · English · Urdu · Kashmiri",
                            style = MaterialTheme.typography.bodySmall,
                            color = textSecondary
                        )
                    }
                    OutlinedButton(onClick = { vm.toggleDarkMode() }) {
                        Text(if (state.darkMode) "Light" else "Dark")
                    }
                }

                // Language Bar (English / Urdu RTL / Kashmiri Perso-Arabic or Devanagari)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    vm.languages.forEach { lang ->
                        FilterChip(
                            selected = state.language == lang,
                            onClick = { vm.setLanguage(lang) },
                            label = { Text(lang) }
                        )
                    }
                }
                if (state.language == "Kashmiri") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(
                            selected = state.kashmiriScript == "perso-arabic",
                            onClick = { vm.setKashmiriScript("perso-arabic") },
                            label = { Text("Kashmiri Perso-Arabic (RTL)") }
                        )
                        FilterChip(
                            selected = state.kashmiriScript == "devanagari",
                            onClick = { vm.setKashmiriScript("devanagari") },
                            label = { Text("Kashmiri Devanagari (LTR)") }
                        )
                    }
                }
            }
        }

        // 5 Subject Cards
        Text(
            text = "Subjects",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = textPrimary
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            vm.subjects.forEach { sub ->
                FilterChip(
                    selected = state.subject == sub,
                    onClick = { vm.setSubject(sub) },
                    label = { Text(sub) }
                )
            }
        }

        // 6 Quick-Access Buttons
        Text(
            text = "Quick Tools",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = textPrimary
        )
        val quickTools = listOf(
            "lesson_plan" to "Create Lesson Plan",
            "qa" to "Ask AI",
            "chatbot" to "AI Study Chat",
            "question_paper" to "Generate Questions",
            "notes" to "Generate Notes",
            "worksheet" to "Create Worksheet",
            "mcq" to "MCQ Quiz",
            "saved" to "Saved Lessons (${state.savedItems.size})"
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            quickTools.forEach { (id, label) ->
                FilterChip(
                    selected = state.activeSection == id,
                    onClick = { vm.setSection(id) },
                    label = { Text(label) }
                )
            }
        }

        // Interactive Tool Workspace
        if (state.activeSection == "saved") {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = cardColor)
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Saved Lessons & Study Material",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = textPrimary
                    )
                    if (state.savedItems.isEmpty()) {
                        Text(
                            text = "No saved items yet. Generate a lesson plan or answer and tap Save.",
                            style = MaterialTheme.typography.bodySmall,
                            color = textSecondary
                        )
                    } else {
                        state.savedItems.forEach { item ->
                            Card(
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = bgColor)
                            ) {
                                Column(
                                    modifier = Modifier.padding(10.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        text = item.title,
                                        fontWeight = FontWeight.Bold,
                                        color = textPrimary
                                    )
                                    Text(
                                        text = "${item.subject} · ${item.classLevel} · ${item.language} · Saved Offline (Room)",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = textSecondary
                                    )
                                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Button(onClick = { vm.openSavedItem(item) }) {
                                            Text("Open")
                                        }
                                        OutlinedButton(
                                            onClick = {
                                                val file = vm.exportOutputToPdf(
                                                    context = context,
                                                    title = item.title,
                                                    content = item.content,
                                                    structuredPlan = item.structuredPlan
                                                )
                                                if (file != null) {
                                                    LessonPlanShareHelper.sharePdfFile(
                                                        context = context,
                                                        pdfFile = file,
                                                        title = item.title,
                                                        subject = item.subject,
                                                        classLevel = item.classLevel,
                                                        targetChannel = "whatsapp"
                                                    )
                                                }
                                            }
                                        ) {
                                            Text("WhatsApp PDF")
                                        }
                                        OutlinedButton(onClick = { vm.deleteSavedItem(item.id) }) {
                                            Text("Remove")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            val activeMode = if (state.activeSection == "home") "lesson_plan" else state.activeSection
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = cardColor)
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = state.classLevel,
                        onValueChange = { vm.setClassLevel(it) },
                        label = { Text("Class / Grade (e.g. Class 8)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (activeMode == "qa" || activeMode == "chatbot") {
                        if (activeMode == "qa") {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                vm.answerFormats.forEach { fmt ->
                                    FilterChip(
                                        selected = state.answerFormat == fmt,
                                        onClick = { vm.setAnswerFormat(fmt) },
                                        label = { Text(fmt) }
                                    )
                                }
                            }
                        }
                        OutlinedTextField(
                            value = questionInput,
                            onValueChange = { questionInput = it },
                            label = {
                                Text(
                                    if (activeMode == "chatbot") "Ask AI Study Assistant (step-by-step)"
                                    else "Ask any educational question"
                                )
                            },
                            minLines = 3,
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        OutlinedTextField(
                            value = chapterInput,
                            onValueChange = { chapterInput = it },
                            label = { Text("Chapter Name") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = topicInput,
                            onValueChange = { topicInput = it },
                            label = { Text("Topic") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    Button(
                        enabled = !state.isLoading,
                        onClick = {
                            pdfStatus = null
                            vm.generateContent(
                                mode = activeMode,
                                chapter = chapterInput,
                                topic = topicInput,
                                question = questionInput
                            )
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4F46E5)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (state.isLoading) {
                            CircularProgressIndicator(
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("Generate with AI (${state.language})")
                        }
                    }

                    if (!state.errorMessage.isNullOrBlank()) {
                        Text(
                            text = state.errorMessage ?: "",
                            color = Color(0xFFE11D48),
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
        }

        // Generated Result Card with RTL support + Save + Export PDF
        if (state.outputContent.isNotBlank()) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = cardColor)
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = state.outputTitle,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = textPrimary
                    )
                    CompositionLocalProvider(
                        LocalLayoutDirection provides if (isRtl) LayoutDirection.Rtl else LayoutDirection.Ltr
                    ) {
                        Text(
                            text = state.outputContent,
                            style = MaterialTheme.typography.bodyMedium,
                            color = textPrimary
                        )
                    }

                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Button(onClick = { vm.saveCurrentOutput(context) }) {
                            Text("Save Offline (Room)")
                        }
                        OutlinedButton(
                            onClick = {
                                val file = vm.exportOutputToPdf(context, state.outputTitle, state.outputContent)
                                if (file != null) {
                                    pdfStatus = "Exported structured PDF: ${file.name}"
                                    LessonPlanShareHelper.sharePdfFile(
                                        context = context,
                                        pdfFile = file,
                                        title = state.outputTitle,
                                        subject = state.subject,
                                        classLevel = state.classLevel,
                                        targetChannel = "whatsapp"
                                    )
                                }
                            }
                        ) {
                            Text("WhatsApp PDF")
                        }
                        OutlinedButton(
                            onClick = {
                                val file = vm.exportOutputToPdf(context, state.outputTitle, state.outputContent)
                                if (file != null) {
                                    pdfStatus = "Exported structured PDF: ${file.name}"
                                    LessonPlanShareHelper.sharePdfFile(
                                        context = context,
                                        pdfFile = file,
                                        title = state.outputTitle,
                                        subject = state.subject,
                                        classLevel = state.classLevel,
                                        targetChannel = "email"
                                    )
                                }
                            }
                        ) {
                            Text("Email PDF")
                        }
                        OutlinedButton(
                            onClick = {
                                val file = vm.exportOutputToPdf(context, state.outputTitle, state.outputContent)
                                if (file != null) {
                                    pdfStatus = "Exported structured PDF: ${file.name}"
                                    LessonPlanShareHelper.sharePdfFile(
                                        context = context,
                                        pdfFile = file,
                                        title = state.outputTitle,
                                        subject = state.subject,
                                        classLevel = state.classLevel,
                                        targetChannel = "chooser"
                                    )
                                }
                            }
                        ) {
                            Text("Share PDF")
                        }
                    }

                    val feedbackText = pdfStatus ?: state.statusMessage
                    if (!feedbackText.isNullOrBlank()) {
                        Text(
                            text = feedbackText,
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF059669)
                        )
                    }
                }
            }
        }
    }
}
