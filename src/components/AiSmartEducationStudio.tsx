import { apiFetch } from "../utils/apiConfig";
import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BookOpenCheck,
  Camera,
  FileText,
  HelpCircle,
  ClipboardList,
  NotebookPen,
  ListChecks,
  FileSpreadsheet,
  Bookmark,
  Globe,
  Moon,
  Sun,
  Copy,
  Check,
  Download,
  Share2,
  Save,
  Trash2,
  RefreshCw,
  Edit3,
  BarChart3,
  Languages,
  AlertCircle,
  Home,
  ChevronRight,
  GraduationCap,
  Image as ImageIcon,
  Printer,
  Plus,
  X,
  Mic,
  MicOff,
  Search,
  Bell,
  User as UserIcon,
  FlaskConical,
  ScanText,
  Menu,
  Clock,
  Sliders,
  ShieldCheck,
  CheckSquare,
  Square,
} from 'lucide-react';
import { SchoolProfile, User } from '../types';
import { SchoolEmblem } from './SchoolEmblem';
import {
  StudioUploadedImage,
  loadStudioImages,
  saveStudioImage,
  deleteStudioImageById,
  extractBase64Payload,
  printHtmlDocumentSafely,
} from '../utils/studioMediaStore';
import { StudioImageUploader } from './StudioImageUploader';
import { StudioImageQaGenerator } from './StudioImageQaGenerator';
import { DailyTeacherDiary } from './DailyTeacherDiary';
import { ScienceHandwrittenImageCreator } from './ScienceHandwrittenImageCreator';
import { AiOcrTool } from './AiOcrTool';
import { ShortLessonPlanGenerator } from './ShortLessonPlanGenerator';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { exportTextToDocx } from '../utils/docxExport';
import { guardSensitiveExport } from '../utils/biometricProtection';
import { exportBrandedSchoolJpeg, exportBrandedSchoolPdf } from '../utils/schoolDocumentExport';

export type SmartEduLang = 'English' | 'Urdu' | 'Kashmiri';
export type KashmiriScript = 'perso-arabic' | 'devanagari';
export type SmartEduTab =
  | 'admin'
  | 'ai_ocr'
  | 'chatbot'
  | 'qa'
  | 'diary'
  | 'home'
  | 'lesson_plan'
  | 'mcq'
  | 'notes'
  | 'image_qa'
  | 'question_paper'
  | 'saved'
  | 'science_handwritten'
  | 'worksheet';

export type AnswerFormatType =
  | 'Very Short Answer'
  | 'Short Answer'
  | 'Long Answer'
  | 'Detailed Explanation'
  | 'Point-wise Answer';

interface LessonPlan13 {
  title: string;
  generalObjectives: string;
  specificLearningOutcomes: string;
  previousKnowledge: string;
  teachingLearningMaterials: string;
  introduction: string;
  presentationOfTopic: string;
  teacherActivities: string;
  studentActivities: string;
  teachingMethodology: string;
  blackboardWork: string;
  assessmentQuestions: string;
  homework: string;
  conclusion: string;
}

interface CustomLessonSection {
  id: string;
  label: string;
  content: string;
}

interface EditableLessonPlanRecord {
  id: string;
  title: string;
  subject: string;
  classLevel: string;
  duration: string;
  language: SmartEduLang;
  kashmiriScript: KashmiriScript;
  isRtl: boolean;
  plan: LessonPlan13;
  customSections: CustomLessonSection[];
  hiddenSections: string[];
  savedAt: string;
  updatedAt: string;
}

interface McqItem {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
  explanation: string;
}

interface SavedSmartEduItem {
  id: string;
  type: 'lesson_plan' | 'qa' | 'question_paper' | 'notes' | 'mcq' | 'worksheet' | 'diary' | 'ocr' | 'chat';
  title: string;
  subject: string;
  classLevel: string;
  section?: string;
  examType?: string;
  academicSession?: string;
  language: SmartEduLang;
  kashmiriScript: KashmiriScript;
  isRtl: boolean;
  content: string;
  savedAt: string;
}

interface AiSmartEducationStudioProps {
  school: SchoolProfile;
  currentUser: User;
  isAdmin?: boolean;
}

const SUBJECT_CARDS = [
  {
    id: 'English',
    name: 'English',
    nativeName: 'English Language & Literature',
    desc: 'Grammar, comprehension, prose, poetry, essays & writing skills',
    accent: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800',
  },
  {
    id: 'Urdu',
    name: 'Urdu',
    nativeName: 'اُردو ادب و قواعد',
    desc: 'Nazm, Ghazal, Nasr, Qawaid, Mazmoon & comprehension in RTL Urdu',
    accent: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800',
  },
  {
    id: 'Science',
    name: 'Science',
    nativeName: 'Physics, Chemistry & Biology',
    desc: 'Experiments, laws, diagrams, definitions, MCQs & numericals',
    accent: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800',
  },
  {
    id: 'Social Science',
    name: 'Social Science',
    nativeName: 'History, Geography & Civics',
    desc: 'Maps, heritage, democracy, economy & structured long answers',
    accent: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
  },
  {
    id: 'Kashmiri',
    name: 'Kashmiri',
    nativeName: 'کٲشُر / कॉशुर',
    desc: 'Kashmiri prose, poetry & grammar in Perso-Arabic or Devanagari',
    accent: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800',
  },
] as const;

const CLASS_OPTIONS = [
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11',
  'Class 12',
];

const ANSWER_FORMATS: AnswerFormatType[] = [
  'Very Short Answer',
  'Short Answer',
  'Long Answer',
  'Detailed Explanation',
  'Point-wise Answer',
];

const LESSON_PLAN_SECTIONS: Array<{ key: keyof LessonPlan13; label: string }> = [
  { key: 'generalObjectives', label: '1. General Objectives' },
  { key: 'specificLearningOutcomes', label: '2. Specific Learning Outcomes' },
  { key: 'previousKnowledge', label: '3. Previous Knowledge' },
  { key: 'teachingLearningMaterials', label: '4. Teaching-Learning Materials (TLM)' },
  { key: 'introduction', label: '5. Introduction' },
  { key: 'presentationOfTopic', label: '6. Presentation of the Topic' },
  { key: 'teacherActivities', label: '7. Teacher Activities' },
  { key: 'studentActivities', label: '8. Student Activities' },
  { key: 'teachingMethodology', label: '9. Teaching Methodology' },
  { key: 'blackboardWork', label: '10. Blackboard Work' },
  { key: 'assessmentQuestions', label: '11. Assessment Questions' },
  { key: 'homework', label: '12. Homework' },
  { key: 'conclusion', label: '13. Conclusion' },
];

const SAVED_STORAGE_KEY = 'sm_ai_smart_edu_saved_v1';
const USAGE_STORAGE_KEY = 'sm_ai_smart_edu_usage_v1';
const EDITABLE_LP_STORAGE_KEY = 'sm_studio_editable_lesson_plans_v1';

function escapeHtmlText(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function exportSmartEduPdf(params: {
  title: string;
  subtitle: string;
  schoolName: string;
  bodyText: string;
  isRtl: boolean;
  hasNonLatin: boolean;
  filename: string;
}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  if (params.isRtl || params.hasNonLatin) {
    // High-resolution canvas rendering so Urdu (Nastaleeq/Perso-Arabic), Kashmiri & Devanagari render crisply in PDF
    const canvasW = 1240;
    const canvasH = 1754;
    const margin = 80;
    const contentW = canvasW - margin * 2;
    const paragraphs = params.bodyText.split('\n');

    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = canvasW;
    measureCanvas.height = canvasH;
    const mCtx = measureCanvas.getContext('2d');
    if (!mCtx) return;

    const fontStack = params.isRtl
      ? '28px "Noori Nastaleeq", "Noto Nastaliq Urdu", "Noto Sans Arabic", serif'
      : '26px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif';
    mCtx.font = fontStack;

    const wrappedLines: string[] = [];
    for (const para of paragraphs) {
      const trimmed = para.trimEnd();
      if (!trimmed) {
        wrappedLines.push('');
        continue;
      }
      const words = trimmed.split(/\s+/);
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (mCtx.measureText(candidate).width > contentW && line) {
          wrappedLines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) wrappedLines.push(line);
    }

    const lineH = params.isRtl ? 50 : 42;
    const headerBlockH = 190;
    const footerBlockH = 70;
    const firstPageLines = Math.floor((canvasH - margin * 2 - headerBlockH - footerBlockH) / lineH);
    const nextPageLines = Math.floor((canvasH - margin * 2 - footerBlockH) / lineH);

    const pages: string[][] = [];
    let cursor = 0;
    pages.push(wrappedLines.slice(0, firstPageLines));
    cursor += firstPageLines;
    while (cursor < wrappedLines.length) {
      pages.push(wrappedLines.slice(cursor, cursor + nextPageLines));
      cursor += nextPageLines;
    }

    pages.forEach((lines, pageIndex) => {
      if (pageIndex > 0) doc.addPage();
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvasW;
      pageCanvas.height = canvasH;
      const ctx = pageCanvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);

      let y = margin;
      if (pageIndex === 0) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(margin, y, contentW, 130);
        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 30px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.direction = 'ltr';
        ctx.fillText(params.schoolName.slice(0, 62), margin + 28, y + 48);
        ctx.fillStyle = '#CBD5E1';
        ctx.font = '22px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(params.subtitle.slice(0, 88), margin + 28, y + 86);
        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(params.title.slice(0, 74), margin + 28, y + 116);
        y += headerBlockH;
      }

      ctx.fillStyle = '#1E293B';
      ctx.font = fontStack;
      ctx.direction = params.isRtl ? 'rtl' : 'ltr';
      ctx.textAlign = params.isRtl ? 'right' : 'left';
      const drawX = params.isRtl ? canvasW - margin : margin;

      for (const ln of lines) {
        if (ln) {
          ctx.fillText(ln, drawX, y);
        }
        y += lineH;
      }

      ctx.direction = 'ltr';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748B';
      ctx.font = '20px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(
        `AI Smart Education · Page ${pageIndex + 1} of ${pages.length}`,
        canvasW - margin,
        canvasH - 42
      );

      doc.addImage(pageCanvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
    });
  } else {
    // Crisp native vector PDF for English content
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const maxW = pageW - margin * 2;

    doc.setFillColor(15, 23, 42);
    doc.rect(margin, 14, maxW, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(params.schoolName.slice(0, 68), margin + 4, 22);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225);
    doc.text(params.subtitle.slice(0, 96), margin + 4, 28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(253, 230, 138);
    doc.text(params.title.slice(0, 88), margin + 4, 34);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    let y = 46;
    const lines = doc.splitTextToSize(params.bodyText, maxW) as string[];
    for (const line of lines) {
      if (y > pageH - 18) {
        doc.addPage();
        y = 18;
      }
      doc.text(line, margin, y);
      y += 5.4;
    }

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`AI Smart Education · Page ${p} of ${totalPages}`, pageW - margin, pageH - 10, {
        align: 'right',
      });
    }
  }

  doc.save(params.filename);
}

export const AiSmartEducationStudio: React.FC<AiSmartEducationStudioProps> = ({
  school,
  currentUser,
  isAdmin = true,
}) => {
  const [activeTab, setActiveTab] = useState<SmartEduTab>('home');
  const [lessonPlanMode, setLessonPlanMode] = useState<'short' | 'detailed'>('short');
  const [subject, setSubject] = useState<string>('Science');
  const [classLevel, setClassLevel] = useState<string>('Class 8');
  const [selectedLang, setSelectedLang] = useState<SmartEduLang>('English');
  const [kashmiriScript, setKashmiriScript] = useState<KashmiriScript>('perso-arabic');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  // Studio Shell & Admin Config State
  const [studioSearch, setStudioSearch] = useState<string>('');
  const [showNotificationsPanel, setShowNotificationsPanel] = useState<boolean>(false);
  const [showProfilePanel, setShowProfilePanel] = useState<boolean>(false);
  const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false);
  const [recentModules, setRecentModules] = useState<SmartEduTab[]>(() => {
    try {
      const raw = localStorage.getItem('sm_studio_recent_modules_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, 6) as SmartEduTab[];
      }
    } catch {
      // ignore storage errors
    }
    return ['science_handwritten', 'ai_ocr', 'lesson_plan', 'image_qa'];
  });
  const [aiModelProvider, setAiModelProvider] = useState<string>(() => {
    try {
      return localStorage.getItem('sm_studio_ai_provider_v1') || 'Google Gemini (gemini-4-hydrogen)';
    } catch {
      return 'Google Gemini (gemini-4-hydrogen)';
    }
  });
  const [aiDailyLimit, setAiDailyLimit] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('sm_studio_ai_limit_v1'));
      return Number.isFinite(saved) && saved > 0 ? saved : 100;
    } catch {
      return 100;
    }
  });
  const [customPromptPrefix, setCustomPromptPrefix] = useState<string>(() => {
    try {
      return (
        localStorage.getItem('sm_studio_prompt_template_v1') ||
        'Follow NCERT/JKBOSE syllabus clarity, age-appropriate vocabulary, and structured examination formatting.'
      );
    } catch {
      return 'Follow NCERT/JKBOSE syllabus clarity, age-appropriate vocabulary, and structured examination formatting.';
    }
  });
  const [promptTemplates, setPromptTemplates] = useState<Array<{ id: string; name: string; body: string }>>(() => {
    try {
      const raw = localStorage.getItem('sm_studio_prompt_templates_list_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'tpl-ncert',
        name: 'NCERT / JKBOSE Exam Standard',
        body: 'Follow NCERT/JKBOSE syllabus clarity, age-appropriate vocabulary, and structured examination formatting.',
      },
      {
        id: 'tpl-bilingual',
        name: 'Bilingual Classroom Friendly',
        body: 'Include clear step-by-step explanations with everyday school examples and concise revision points.',
      },
    ];
  });
  const [newTemplateName, setNewTemplateName] = useState<string>('');
  const [newTemplateBody, setNewTemplateBody] = useState<string>('');
  const [studentModuleOverrides, setStudentModuleOverrides] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('sm_studio_student_perms_v1');
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      // ignore
    }
    return {};
  });
  const [aiHistoryLog, setAiHistoryLog] = useState<
    Array<{ id: string; timestamp: string; mode: string; subject: string; classLevel: string; actor: string; summary: string }>
  >(() => {
    try {
      const raw = localStorage.getItem('sm_studio_ai_history_v1');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return [];
  });

  const openModule = (tab: SmartEduTab) => {
    setActiveTab(tab);
    setErrorMsg(null);
    setShowMobileMenu(false);
    setShowNotificationsPanel(false);
    setShowProfilePanel(false);
    if (tab !== 'home') {
      setRecentModules((prev) => {
        const next = [tab, ...prev.filter((m) => m !== tab)].slice(0, 6);
        try {
          localStorage.setItem('sm_studio_recent_modules_v1', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
  };

  // Feature Form States
  const [classSection, setClassSection] = useState<string>('A');
  const [chapter, setChapter] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [duration, setDuration] = useState<string>('40 minutes');
  const [lessonObjectivesInput, setLessonObjectivesInput] = useState<string>('');
  const [lessonExtraInstructions, setLessonExtraInstructions] = useState<string>('');
  const [regeneratingLessonSectionKey, setRegeneratingLessonSectionKey] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState<string>('');
  const [answerFormat, setAnswerFormat] = useState<AnswerFormatType>('Short Answer');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Mixed'>('Medium');
  const [totalMarks, setTotalMarks] = useState<number>(50);
  const [paperExamType, setPaperExamType] = useState<string>('T1 Examination');
  const [paperTimeAllowed, setPaperTimeAllowed] = useState<string>('2 Hours');
  const [paperDate, setPaperDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [mcqCount, setMcqCount] = useState<number>(8);
  const [translateTargetLang, setTranslateTargetLang] = useState<SmartEduLang>('Urdu');

  // Output States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [qaOutput, setQaOutput] = useState<{ text: string; isRtl: boolean; format: string } | null>(null);
  const [isEditingQaOutput, setIsEditingQaOutput] = useState<boolean>(false);
  const [isEditingTextOutput, setIsEditingTextOutput] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<
    Array<{ id: string; role: 'user' | 'assistant'; text: string; isRtl: boolean; lang: SmartEduLang }>
  >([]);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan13 | null>(null);
  const [lessonPlanRtl, setLessonPlanRtl] = useState<boolean>(false);
  const [isEditingLessonPlan, setIsEditingLessonPlan] = useState<boolean>(false);
  const [activeLessonPlanId, setActiveLessonPlanId] = useState<string | null>(null);
  const [customLessonSections, setCustomLessonSections] = useState<CustomLessonSection[]>([]);
  const [hiddenLessonSections, setHiddenLessonSections] = useState<string[]>([]);
  const [showSavedPlansDrawer, setShowSavedPlansDrawer] = useState<boolean>(false);
  const [showAddSectionForm, setShowAddSectionForm] = useState<boolean>(false);
  const [newSectionLabel, setNewSectionLabel] = useState<string>('');
  const [newSectionContent, setNewSectionContent] = useState<string>('');
  const [confirmDeleteSectionTarget, setConfirmDeleteSectionTarget] = useState<{
    kind: 'standard' | 'custom';
    id: string;
    label: string;
  } | null>(null);
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [savedEditablePlans, setSavedEditablePlans] = useState<EditableLessonPlanRecord[]>(() => {
    try {
      const raw = localStorage.getItem(EDITABLE_LP_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as EditableLessonPlanRecord[]) : [];
    } catch {
      return [];
    }
  });

  // Shared Persistent Uploaded Educational Images (Camera & Gallery)
  const [studioImages, setStudioImages] = useState<StudioUploadedImage[]>([]);

  // Web Speech API Voice Input for Lesson Plan Generator
  const {
    isSupported: isVoiceSupported,
    isListening: isVoiceListening,
    activeField: voiceActiveField,
    voiceError: lpVoiceError,
    startDictation: startLpDictation,
  } = useVoiceDictation(selectedLang);

  const [paperOutput, setPaperOutput] = useState<{ text: string; isRtl: boolean } | null>(null);
  const [notesOutput, setNotesOutput] = useState<{ text: string; isRtl: boolean } | null>(null);
  const [worksheetOutput, setWorksheetOutput] = useState<{ text: string; isRtl: boolean } | null>(null);
  const [mcqList, setMcqList] = useState<McqItem[]>([]);
  const [mcqTitle, setMcqTitle] = useState<string>('');
  const [mcqRtl, setMcqRtl] = useState<boolean>(false);
  const [mcqSelectedAnswers, setMcqSelectedAnswers] = useState<Record<number, string>>({});
  const [mcqRevealAll, setMcqRevealAll] = useState<boolean>(false);
  const [mcqCheckedMap, setMcqCheckedMap] = useState<Record<number, boolean>>({});
  const [editingMcqIdx, setEditingMcqIdx] = useState<number | null>(null);
  const [mcqEditDraft, setMcqEditDraft] = useState<McqItem | null>(null);
  const [regeneratingMcqIdx, setRegeneratingMcqIdx] = useState<number | null>(null);

  // Saved Content & Usage Analytics
  const [savedItems, setSavedItems] = useState<SavedSmartEduItem[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedSmartEduItem[]) : [];
    } catch {
      return [];
    }
  });
  const [savedFilter, setSavedFilter] = useState<string>('all');
  const [savedSubjectFilter, setSavedSubjectFilter] = useState<string>('all');
  const [savedClassFilter, setSavedClassFilter] = useState<string>('all');
  const [savedExamFilter, setSavedExamFilter] = useState<string>('all');
  const [savedSessionFilter, setSavedSessionFilter] = useState<string>('all');
  const [savedDateFilter, setSavedDateFilter] = useState<string>('');
  const [savedSearch, setSavedSearch] = useState<string>('');
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null);
  const [editingSavedTitle, setEditingSavedTitle] = useState<string>('');
  const [editingSavedContent, setEditingSavedContent] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(USAGE_STORAGE_KEY);
      return raw
        ? (JSON.parse(raw) as Record<string, number>)
        : { qa: 0, image_qa_suite: 0, lesson_plan: 0, question_paper: 0, notes: 0, mcq: 0, worksheet: 0, translate: 0 };
    } catch {
      return { qa: 0, image_qa_suite: 0, lesson_plan: 0, question_paper: 0, notes: 0, mcq: 0, worksheet: 0, translate: 0 };
    }
  });

  useEffect(() => {
    let active = true;
    void loadStudioImages().then((loaded) => {
      if (active) setStudioImages(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(EDITABLE_LP_STORAGE_KEY, JSON.stringify(savedEditablePlans));
    } catch {
      // Ignore quota errors
    }
  }, [savedEditablePlans]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(savedItems));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedItems]);

  useEffect(() => {
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usageStats));
    } catch {
      // Ignore
    }
  }, [usageStats]);

  const handleAddStudioImages = async (newImages: StudioUploadedImage[]) => {
    for (const img of newImages) {
      await saveStudioImage(img);
    }
    setStudioImages((prev) => [...newImages, ...prev]);
    notify(
      newImages.length === 1
        ? `Uploaded "${newImages[0].name}". Ready for AI Q&A and Lesson Plan generation.`
        : `Uploaded ${newImages.length} images. Ready for AI Q&A and Lesson Plan generation.`
    );
  };

  const handleUpdateStudioImage = async (updated: StudioUploadedImage) => {
    await saveStudioImage(updated);
    setStudioImages((prev) => prev.map((img) => (img.id === updated.id ? updated : img)));
    notify(`Updated "${updated.name}". Original photo safely preserved.`);
  };

  const handleDeleteStudioImage = async (id: string) => {
    await deleteStudioImageById(id);
    setStudioImages((prev) => prev.filter((img) => img.id !== id));
    notify('Deleted image.');
  };

  const handleToggleStudioImageSelect = (id: string) => {
    setStudioImages((prev) =>
      prev.map((img) => {
        if (img.id !== id) return img;
        const toggled = { ...img, selectedForAi: !img.selectedForAi };
        void saveStudioImage(toggled);
        return toggled;
      })
    );
  };

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', next);
    }
  };

  const isCurrentLangRtl =
    selectedLang === 'Urdu' || (selectedLang === 'Kashmiri' && kashmiriScript === 'perso-arabic');

  const notify = (msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => setStatusBanner(null), 3200);
  };

  const incrementUsage = (mode: string, summaryText?: string) => {
    setUsageStats((prev) => ({ ...prev, [mode]: (prev[mode] || 0) + 1 }));
    setAiHistoryLog((prev) => {
      const next = [
        {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: new Date().toISOString(),
          mode,
          subject,
          classLevel,
          actor: currentUser.name || 'User',
          summary: summaryText || `${mode.replace(/_/g, ' ')} generated (${selectedLang})`,
        },
        ...prev,
      ].slice(0, 40);
      try {
        localStorage.setItem('sm_studio_ai_history_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const callSmartEduApi = async (payload: Record<string, any>) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/smart-edu/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      incrementUsage(payload.mode || 'qa', payload.topic || payload.chapter || payload.question?.slice(0, 60));
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to contact AI server.';
      setErrorMsg(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleAskQuestion = async (mode: 'qa' | 'translate' = 'qa') => {
    if (!questionText.trim()) {
      setErrorMsg('Please type a question or text first.');
      return;
    }
    const data = await callSmartEduApi({
      mode,
      subject,
      classLevel,
      language: selectedLang,
      kashmiriScript,
      question: questionText.trim(),
      answerFormat,
      targetLanguage: translateTargetLang,
    });
    if (data?.content) {
      setQaOutput({
        text: data.content,
        isRtl: Boolean(data.isRtl),
        format: mode === 'translate' ? `Translated to ${translateTargetLang}` : answerFormat,
      });
    }
  };

  const persistEditableLessonPlan = (
    planObj: LessonPlan13,
    rtl: boolean,
    customSecs: CustomLessonSection[],
    hiddenSecs: string[],
    planId?: string | null,
    silent = false
  ) => {
    const now = new Date().toISOString();
    const id = planId || `lp-edit-${Date.now()}`;
    setSavedEditablePlans((prev) => {
      const exists = prev.find((p) => p.id === id);
      const record: EditableLessonPlanRecord = {
        id,
        title: planObj.title || `${subject} Lesson Plan`,
        subject,
        classLevel,
        duration,
        language: selectedLang,
        kashmiriScript,
        isRtl: rtl,
        plan: planObj,
        customSections: customSecs,
        hiddenSections: hiddenSecs,
        savedAt: exists?.savedAt || now,
        updatedAt: now,
      };
      return exists ? prev.map((p) => (p.id === id ? record : p)) : [record, ...prev];
    });
    setActiveLessonPlanId(id);
    if (!silent) {
      notify(`Saved lesson plan "${planObj.title}" for editing anytime.`);
    }
  };

  const handleGenerateLessonPlan = async () => {
    const selectedImages = studioImages.filter((img) => img.selectedForAi);
    if (!chapter.trim() && !topic.trim() && selectedImages.length === 0) {
      setErrorMsg(
        'Upload a textbook/note image OR enter a Chapter Name or Topic to generate a complete lesson plan.'
      );
      return;
    }
    const imagePayload = selectedImages.slice(0, 6).map((img) => {
      const parsed = extractBase64Payload(img.dataUrl);
      return { base64: parsed.base64, mimeType: parsed.mimeType, name: img.name };
    });

    const data = await callSmartEduApi({
      mode: 'lesson_plan',
      subject,
      classLevel: `${classLevel} - Section ${classSection}`,
      language: selectedLang,
      kashmiriScript,
      chapter: chapter.trim(),
      topic: topic.trim(),
      duration,
      question: [
        lessonObjectivesInput.trim() ? `Learning Objectives focus: ${lessonObjectivesInput.trim()}` : '',
        lessonExtraInstructions.trim() ? `Additional Instructions: ${lessonExtraInstructions.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      images: imagePayload,
    });
    if (data?.lessonPlan) {
      const lp = data.lessonPlan as LessonPlan13;
      const rtl = Boolean(data.isRtl);
      setLessonPlan(lp);
      setLessonPlanRtl(rtl);
      setCustomLessonSections([]);
      setHiddenLessonSections([]);
      setIsEditingLessonPlan(false);
      persistEditableLessonPlan(lp, rtl, [], [], null, true);
      notify(`Generated and auto-saved "${lp.title}". You can edit, print, or download it anytime.`);
    }
  };

  const handleRegenerateLessonSection = async (secKey: keyof LessonPlan13, secLabel: string) => {
    if (!lessonPlan) return;
    setRegeneratingLessonSectionKey(secKey);
    setErrorMsg(null);
    try {
      const data = await callSmartEduApi({
        mode: 'qa',
        subject,
        classLevel: `${classLevel} - Section ${classSection}`,
        language: selectedLang,
        kashmiriScript,
        answerFormat: 'Point-wise Answer',
        question: `Rewrite ONLY the "${secLabel}" section for the Lesson Plan titled "${lessonPlan.title}" (Subject: ${subject}, Class: ${classLevel}, Duration: ${duration}). Provide fresh, practical, classroom-ready points only without repeating other sections.`,
      });
      if (data?.content) {
        const next = { ...lessonPlan, [secKey]: String(data.content).trim() };
        setLessonPlan(next);
        persistEditableLessonPlan(
          next,
          lessonPlanRtl,
          customLessonSections,
          hiddenLessonSections,
          activeLessonPlanId,
          true
        );
        notify(`Regenerated "${secLabel}".`);
      }
    } finally {
      setRegeneratingLessonSectionKey(null);
    }
  };

  const handleGenerateTextTool = async (mode: 'question_paper' | 'notes' | 'worksheet') => {
    if (!chapter.trim() && !topic.trim()) {
      setErrorMsg('Enter a Chapter Name or Topic first.');
      return;
    }
    const extraExamPrompt =
      mode === 'question_paper'
        ? `Examination: ${paperExamType} | Academic Session: ${school.academicSession || 'Current Session'} | Class: ${classLevel} (${classSection}) | Time Allowed: ${paperTimeAllowed} | Date: ${paperDate} | Total Marks: ${totalMarks}`
        : '';
    const data = await callSmartEduApi({
      mode,
      subject,
      classLevel: `${classLevel} (${classSection})`,
      language: selectedLang,
      kashmiriScript,
      chapter: chapter.trim(),
      topic: topic.trim(),
      question: extraExamPrompt,
      difficulty,
      totalMarks,
    });
    if (data?.content) {
      const result = { text: data.content as string, isRtl: Boolean(data.isRtl) };
      if (mode === 'question_paper') setPaperOutput(result);
      else if (mode === 'notes') setNotesOutput(result);
      else setWorksheetOutput(result);
    }
  };

  const handleGenerateMcqs = async () => {
    if (!chapter.trim() && !topic.trim()) {
      setErrorMsg('Enter a Chapter Name or Topic to generate MCQs.');
      return;
    }
    const data = await callSmartEduApi({
      mode: 'mcq',
      subject,
      classLevel,
      language: selectedLang,
      kashmiriScript,
      chapter: chapter.trim(),
      topic: topic.trim(),
      difficulty,
      questionCount: mcqCount,
    });
    if (Array.isArray(data?.mcqs)) {
      setMcqList(data.mcqs);
      setMcqTitle(data.title || `${subject} MCQs — ${topic || chapter}`);
      setMcqRtl(Boolean(data.isRtl));
      setMcqSelectedAnswers({});
      setMcqRevealAll(false);
      const checkedInit: Record<number, boolean> = {};
      data.mcqs.forEach((_: any, idx: number) => {
        checkedInit[idx] = true;
      });
      setMcqCheckedMap(checkedInit);
      setEditingMcqIdx(null);
      setMcqEditDraft(null);
    }
  };

  const handleRegenerateSingleMcq = async (idx: number) => {
    const existing = mcqList[idx];
    if (!existing) return;
    setRegeneratingMcqIdx(idx);
    try {
      const data = await callSmartEduApi({
        mode: 'mcq',
        subject,
        classLevel,
        language: selectedLang,
        kashmiriScript,
        chapter: chapter.trim() || mcqTitle,
        topic: `${topic.trim() || chapter.trim()} — generate 1 fresh MCQ different from: "${existing.question.slice(0, 100)}"`,
        difficulty,
        questionCount: 1,
      });
      if (Array.isArray(data?.mcqs) && data.mcqs[0]) {
        setMcqList((prev) => prev.map((m, i) => (i === idx ? data.mcqs[0] : m)));
        notify(`Regenerated MCQ #${idx + 1}.`);
      }
    } finally {
      setRegeneratingMcqIdx(null);
    }
  };

  const visibleStandardLessonSections = useMemo(
    () => LESSON_PLAN_SECTIONS.filter((s) => !hiddenLessonSections.includes(s.key)),
    [hiddenLessonSections]
  );

  const formatLessonPlanAsText = (lp: LessonPlan13) =>
    [
      `${lp.title}`,
      `Subject: ${subject} | Class: ${classLevel} | Duration: ${duration} | Language: ${selectedLang}`,
      '',
      ...visibleStandardLessonSections.map((s) => `${s.label}\n${lp[s.key] || ''}\n`),
      ...customLessonSections.map((c) => `${c.label}\n${c.content || ''}\n`),
    ].join('\n');

  const buildLessonPlanPrintHtml = (lp: LessonPlan13, rtl: boolean) => {
    const dirAttr = rtl ? 'rtl' : 'ltr';
    const fontFamily = rtl
      ? '"Noori Nastaleeq", "Noto Nastaliq Urdu", "Noto Sans Arabic", serif'
      : '"Plus Jakarta Sans", Arial, sans-serif';
    const cardsHtml = [
      ...visibleStandardLessonSections.map(
        (s) => `
          <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;margin-bottom:10px;page-break-inside:avoid;">
            <div style="font-size:12px;font-weight:800;color:#312e81;margin-bottom:6px;">${escapeHtmlText(s.label)}</div>
            <div dir="${dirAttr}" style="font-family:${fontFamily};font-size:${rtl ? '16px' : '12.5px'};line-height:${rtl ? '2' : '1.6'};white-space:pre-wrap;color:#1e293b;">${escapeHtmlText(lp[s.key] || '')}</div>
          </div>
        `
      ),
      ...customLessonSections.map(
        (c) => `
          <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;margin-bottom:10px;page-break-inside:avoid;">
            <div style="font-size:12px;font-weight:800;color:#312e81;margin-bottom:6px;">${escapeHtmlText(c.label)}</div>
            <div dir="${dirAttr}" style="font-family:${fontFamily};font-size:${rtl ? '16px' : '12.5px'};line-height:${rtl ? '2' : '1.6'};white-space:pre-wrap;color:#1e293b;">${escapeHtmlText(c.content || '')}</div>
          </div>
        `
      ),
    ].join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtmlText(lp.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 22px; }
    .hdr { background: #0f172a; color: #fff; padding: 16px 20px; border-radius: 10px; margin-bottom: 16px; }
    .hdr h1 { margin: 0 0 4px 0; font-size: 18px; }
    .hdr p { margin: 0; font-size: 12px; color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="hdr">
    <h1>${escapeHtmlText(school.name || 'AI Teaching & Learning Studio')}</h1>
    <p>${escapeHtmlText(lp.title)} · ${escapeHtmlText(subject)} · ${escapeHtmlText(classLevel)} · ${escapeHtmlText(duration)} · ${escapeHtmlText(selectedLang)} · Teacher: ${escapeHtmlText(currentUser.name)}</p>
  </div>
  ${cardsHtml}
</body>
</html>`;
  };

  const handlePrintLessonPlan = () => {
    if (!lessonPlan) return;
    printHtmlDocumentSafely(buildLessonPlanPrintHtml(lessonPlan, lessonPlanRtl));
  };

  const handleDownloadLessonPlanWord = () => {
    if (!lessonPlan) return;
    const html = buildLessonPlanPrintHtml(lessonPlan, lessonPlanRtl);
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const slug = lessonPlan.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'lesson_plan';
    link.download = `${slug}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify('Downloaded Lesson Plan as editable Word (.doc) file.');
  };

  const handleAddCustomLessonSection = () => {
    if (!lessonPlan || !newSectionLabel.trim()) return;
    const nextCustom: CustomLessonSection[] = [
      ...customLessonSections,
      {
        id: `lp-custom-${Date.now()}`,
        label: newSectionLabel.trim(),
        content: newSectionContent.trim() || 'Enter section details here...',
      },
    ];
    setCustomLessonSections(nextCustom);
    setNewSectionLabel('');
    setNewSectionContent('');
    setShowAddSectionForm(false);
    persistEditableLessonPlan(lessonPlan, lessonPlanRtl, nextCustom, hiddenLessonSections, activeLessonPlanId, true);
    notify('Added new custom section to Lesson Plan.');
  };

  const handleConfirmDeleteLessonSection = () => {
    if (!lessonPlan || !confirmDeleteSectionTarget) return;
    if (confirmDeleteSectionTarget.kind === 'standard') {
      const nextHidden = [...hiddenLessonSections, confirmDeleteSectionTarget.id];
      setHiddenLessonSections(nextHidden);
      persistEditableLessonPlan(lessonPlan, lessonPlanRtl, customLessonSections, nextHidden, activeLessonPlanId, true);
    } else {
      const nextCustom = customLessonSections.filter((c) => c.id !== confirmDeleteSectionTarget.id);
      setCustomLessonSections(nextCustom);
      persistEditableLessonPlan(lessonPlan, lessonPlanRtl, nextCustom, hiddenLessonSections, activeLessonPlanId, true);
    }
    notify(`Removed section "${confirmDeleteSectionTarget.label}".`);
    setConfirmDeleteSectionTarget(null);
  };

  const handleLoadEditablePlan = (rec: EditableLessonPlanRecord) => {
    setLessonPlan(rec.plan);
    setLessonPlanRtl(rec.isRtl);
    setCustomLessonSections(rec.customSections || []);
    setHiddenLessonSections(rec.hiddenSections || []);
    setSubject(rec.subject);
    setClassLevel(rec.classLevel);
    setDuration(rec.duration);
    setSelectedLang(rec.language);
    setKashmiriScript(rec.kashmiriScript);
    setActiveLessonPlanId(rec.id);
    setIsEditingLessonPlan(false);
    setShowSavedPlansDrawer(false);
    notify(`Loaded saved Lesson Plan "${rec.title}".`);
  };

  const handleDeleteEditablePlan = (id: string) => {
    setSavedEditablePlans((prev) => prev.filter((p) => p.id !== id));
    if (activeLessonPlanId === id) setActiveLessonPlanId(null);
    setConfirmDeletePlanId(null);
    notify('Deleted saved Lesson Plan.');
  };

  const formatMcqsAsText = (items: McqItem[], heading: string) =>
    [
      heading,
      `Subject: ${subject} | Class: ${classLevel} | Language: ${selectedLang}`,
      '',
      ...items.map(
        (m, i) =>
          `Q${i + 1}. ${m.question}\nA) ${m.optionA}\nB) ${m.optionB}\nC) ${m.optionC}\nD) ${m.optionD}\nCorrect Answer: ${m.correctOption}\nExplanation: ${m.explanation}\n`
      ),
    ].join('\n');

  const handleSaveItem = (
    type: SavedSmartEduItem['type'],
    title: string,
    content: string,
    isRtl: boolean,
    extraMeta?: { examType?: string }
  ) => {
    const newItem: SavedSmartEduItem = {
      id: `se-${type}-${Date.now()}`,
      type,
      title: title.slice(0, 140),
      subject,
      classLevel,
      section: classSection,
      examType: extraMeta?.examType || (type === 'question_paper' ? paperExamType : undefined),
      academicSession: school.academicSession || '',
      language: selectedLang,
      kashmiriScript,
      isRtl,
      content,
      savedAt: new Date().toISOString(),
    };
    setSavedItems((prev) => [newItem, ...prev]);
    notify(`Saved "${newItem.title}" to your Saved Content library.`);
  };

  const handleDuplicateSavedItem = (item: SavedSmartEduItem) => {
    const copy: SavedSmartEduItem = {
      ...item,
      id: `se-${item.type}-${Date.now()}`,
      title: `${item.title} (Copy)`,
      savedAt: new Date().toISOString(),
    };
    setSavedItems((prev) => [copy, ...prev]);
    notify(`Duplicated "${item.title}".`);
  };

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setErrorMsg('Clipboard access is unavailable in this browser.');
    }
  };

  const handleShareText = async (title: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopyText(text, 'share');
    notify('Copied formatted educational content for sharing.');
  };

  const handleDownloadPdf = async (
    title: string,
    text: string,
    isRtl: boolean,
    lang: SmartEduLang,
    extra?: { documentType?: string; examName?: string; maxMarks?: number; timeAllowed?: string; date?: string }
  ) => {
    const res = await exportBrandedSchoolPdf({
      school,
      documentType: extra?.documentType || `${subject.toUpperCase()} — ${lang.toUpperCase()}`,
      title,
      teacherName: currentUser.name,
      className: classLevel,
      section: classSection,
      subject,
      date: extra?.date || new Date().toISOString().slice(0, 10),
      examName: extra?.examName,
      maxMarks: extra?.maxMarks,
      timeAllowed: extra?.timeAllowed,
      isRtl,
      bodyText: text,
      filenameBase: title,
    });
    if (res.exported) {
      notify(`Downloaded branded PDF (${res.pageCount} page${res.pageCount > 1 ? 's' : ''}) with School Logo & Name.`);
    } else {
      notify('Biometric verification cancelled. PDF download was not started.');
    }
  };

  const handleDownloadJpeg = async (
    title: string,
    text: string,
    isRtl: boolean,
    extra?: { documentType?: string; examName?: string; maxMarks?: number; timeAllowed?: string; date?: string }
  ) => {
    const res = await exportBrandedSchoolJpeg({
      school,
      documentType: extra?.documentType || 'SCHOOL ACADEMIC DOCUMENT',
      title,
      teacherName: currentUser.name,
      className: classLevel,
      section: classSection,
      subject,
      date: extra?.date || new Date().toISOString().slice(0, 10),
      examName: extra?.examName,
      maxMarks: extra?.maxMarks,
      timeAllowed: extra?.timeAllowed,
      isRtl,
      bodyText: text,
      filenameBase: title,
    });
    if (res.exported) {
      notify(`Downloaded branded JPEG (${res.pageCount} image${res.pageCount > 1 ? 's' : ''}) with School Logo & Name.`);
    } else {
      notify('Biometric verification cancelled. JPEG download was not started.');
    }
  };

  const handlePrintGenericDocument = (
    title: string,
    bodyText: string,
    isRtl: boolean,
    subtitleLine?: string
  ) => {
    const logoHtml = school.logoDataUrl
      ? `<img src="${escapeHtmlText(school.logoDataUrl)}" alt="School Logo" style="width:58px;height:58px;object-fit:contain;border-radius:8px;background:#fff;padding:4px;border:1px solid #cbd5e1;" />`
      : '';
    const html = `<!doctype html>
<html dir="${isRtl ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8" /><title>${escapeHtmlText(title)}</title>
<style>
  body { font-family: ${isRtl ? '"Noto Nastaliq Urdu","Noto Sans Arabic",serif' : '"Plus Jakarta Sans",Arial,sans-serif'}; color:#0f172a; padding:24px; line-height:1.75; }
  .hdr { display:flex; align-items:center; gap:14px; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:16px; }
  .school { font-size:16px; font-weight:800; }
  .meta { font-size:11px; color:#475569; }
  pre { white-space:pre-wrap; font-family:inherit; font-size:${isRtl ? '16px' : '13px'}; margin:0; }
</style>
</head>
<body>
  <div class="hdr">
    ${logoHtml}
    <div>
      ${school.name ? `<div class="school">${escapeHtmlText(school.name)}</div>` : ''}
      ${school.address ? `<div class="meta">${escapeHtmlText(school.address)}${school.code ? ` · U-DISE: ${escapeHtmlText(school.code)}` : ''}</div>` : ''}
      <div style="font-weight:800;font-size:15px;margin-top:4px;">${escapeHtmlText(title)}</div>
      <div class="meta">${escapeHtmlText(subtitleLine || `${subject} · ${classLevel} (${classSection})${school.academicSession ? ` · Session ${school.academicSession}` : ''}`)}</div>
    </div>
  </div>
  <pre>${escapeHtmlText(bodyText)}</pre>
</body>
</html>`;
    printHtmlDocumentSafely(html);
  };

  const handleDownloadDocx = async (title: string, text: string, lang: SmartEduLang = selectedLang) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'ai_smart_edu';
    const exported = await exportTextToDocx({
      title,
      subtitle: `${subject} · ${classLevel} (${classSection})${school.academicSession ? ` · Session ${school.academicSession}` : ''} · ${lang} · Prepared by ${currentUser.name}`,
      schoolName: school.name || undefined,
      bodyText: text,
      filename: `${slug}.docx`,
    });
    if (exported) {
      notify(`Downloaded Word document: ${slug}.docx`);
    } else {
      notify('Biometric verification cancelled. DOCX download was not started.');
    }
  };

  const savedSessionOptions = useMemo(() => {
    const set = new Set<string>();
    if (school.academicSession) set.add(school.academicSession);
    savedItems.forEach((item) => {
      if (item.academicSession) set.add(item.academicSession);
    });
    return Array.from(set);
  }, [savedItems, school.academicSession]);

  const filteredSavedItems = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    return savedItems.filter((item) => {
      if (savedFilter !== 'all' && item.type !== savedFilter) return false;
      if (savedSubjectFilter !== 'all' && item.subject !== savedSubjectFilter) return false;
      if (savedClassFilter !== 'all' && item.classLevel !== savedClassFilter) return false;
      if (savedExamFilter !== 'all' && (item.examType || '') !== savedExamFilter) return false;
      if (savedSessionFilter !== 'all' && (item.academicSession || '') !== savedSessionFilter) return false;
      if (savedDateFilter && !item.savedAt.startsWith(savedDateFilter)) return false;
      if (q) {
        const hay = `${item.title} ${item.subject} ${item.classLevel} ${item.section || ''} ${item.examType || ''} ${item.academicSession || ''} ${item.language} ${item.content}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [savedItems, savedFilter, savedSubjectFilter, savedClassFilter, savedExamFilter, savedSessionFilter, savedDateFilter, savedSearch]);

  const totalAiGenerations = Object.values(usageStats).reduce((acc, v) => acc + v, 0);

  const mcqScore = useMemo(() => {
    let correct = 0;
    let answered = 0;
    mcqList.forEach((m, idx) => {
      const picked = mcqSelectedAnswers[idx];
      if (picked) {
        answered++;
        if (picked.toUpperCase() === m.correctOption.trim().toUpperCase().slice(0, 1)) {
          correct++;
        }
      }
    });
    return { correct, answered };
  }, [mcqList, mcqSelectedAnswers]);

  const handleSendChatMessage = async () => {
    const prompt = chatInput.trim();
    if (!prompt || isLoading) return;
    setErrorMsg(null);
    const userIsRtl =
      selectedLang === 'Urdu' || (selectedLang === 'Kashmiri' && kashmiriScript === 'perso-arabic');
    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user' as const,
      text: prompt,
      isRtl: userIsRtl,
      lang: selectedLang,
    };
    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    setChatInput('');
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/smart-edu/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chatbot',
          subject,
          classLevel,
          language: selectedLang,
          kashmiriScript,
          question: prompt,
          chatHistory: nextHistory.slice(-8).map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'AI Study Assistant request failed.');
      setChatMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: data.content || '',
          isRtl: Boolean(data.isRtl),
          lang: selectedLang,
        },
      ]);
      setUsageStats((prev) => {
        const updated = { ...prev, qa: (prev.qa || 0) + 1 };
        try {
          localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach AI Study Assistant.');
    } finally {
      setIsLoading(false);
    }
  };

  const isStudentRole = String(currentUser.role || '').toLowerCase() === 'student';

  // Exact 12 Core Modules in Requested Alphabetical Order for the Main Dashboard
  const CORE_12_STUDIO_MODULES: Array<{
    id: SmartEduTab;
    title: string;
    shortDesc: string;
    ctaLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    badge?: string;
    keywords: string;
    studentAllowed?: boolean;
  }> = [
    {
      id: 'admin',
      title: 'AI Admin',
      shortDesc: 'Manage AI models, providers, daily usage limits, prompt templates, permissions & analytics.',
      ctaLabel: 'Open AI Admin',
      icon: BarChart3,
      accent: 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700',
      badge: isAdmin ? 'Admin' : 'Analytics',
      keywords: 'admin settings models providers permissions usage limits analytics',
      studentAllowed: false,
    },
    {
      id: 'chatbot',
      title: 'AI Study Chat',
      shortDesc: 'Interactive AI study assistant for step-by-step explanations, homework guidance & subject tutoring.',
      ctaLabel: 'Open AI Study Chat',
      icon: GraduationCap,
      accent: 'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/60 border-violet-200 dark:border-violet-800',
      badge: `${chatMessages.length} Msg${chatMessages.length === 1 ? '' : 's'}`,
      keywords: 'chat tutor assistant study interactive explain concepts homework',
      studentAllowed: true,
    },
    {
      id: 'qa',
      title: 'Ask AI (Text)',
      shortDesc: 'Ask academic questions, generate structured explanations, summarize & simplify difficult topics.',
      ctaLabel: 'Open Ask AI (Text)',
      icon: HelpCircle,
      accent: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800',
      badge: 'Multilingual',
      keywords: 'ask ai text question answer explain summarize translate english urdu kashmiri',
      studentAllowed: true,
    },
    {
      id: 'diary',
      title: "Daily Teacher's Diary",
      shortDesc: 'Auto-generate daily diary from Date & Lesson Name, Camera/Gallery OCR, full CRUD & PDF/JPEG/ZIP.',
      ctaLabel: "Open Teacher's Diary",
      icon: BookOpenCheck,
      accent: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
      badge: 'Auto AI + OCR',
      keywords: 'diary daily teacher dairy log lessons homework monthly pdf jpeg zip csv ocr',
      studentAllowed: false,
    },
    {
      id: 'home',
      title: 'Home',
      shortDesc: 'Central studio dashboard with all 12 A–Z modules, school branding, recent activity & analytics.',
      ctaLabel: 'Open Home',
      icon: Home,
      accent: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800',
      badge: 'Overview',
      keywords: 'home dashboard overview shortcuts recent statistics',
      studentAllowed: true,
    },
    {
      id: 'lesson_plan',
      title: 'Lesson Plan',
      shortDesc: 'AI Short Lesson Plan Generator (One-View, English/Urdu/Kashmiri) & 13-section textbook lesson plans with voice input.',
      ctaLabel: 'Open Lesson Plan',
      icon: ClipboardList,
      accent: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800',
      badge: `${savedEditablePlans.length} Saved`,
      keywords: 'lesson plan 13 sections voice textbook duration objectives activities homework jpeg pdf docx',
      studentAllowed: false,
    },
    {
      id: 'mcq',
      title: 'MCQs',
      shortDesc: 'Generate editable multiple-choice quizzes with regeneration, selection & branded PDF/DOCX/JPEG.',
      ctaLabel: 'Open MCQs',
      icon: ListChecks,
      accent: 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800',
      badge: 'Interactive Quiz',
      keywords: 'mcq multiple choice quiz test assessment options answer key',
      studentAllowed: true,
    },
    {
      id: 'notes',
      title: 'Note',
      shortDesc: 'Generate chapter-wise and topic-wise study notes, key definitions & branded PDF/DOCX/JPEG.',
      ctaLabel: 'Open Note',
      icon: NotebookPen,
      accent: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800',
      badge: 'PDF · DOCX · JPEG',
      keywords: 'note notes summary definitions revision chapter study guide',
      studentAllowed: true,
    },
    {
      id: 'question_paper',
      title: 'Question Paper',
      shortDesc: 'Build printable T1/T2 examination papers with official school header, marks & PDF/DOCX/JPEG.',
      ctaLabel: 'Open Question Paper',
      icon: FileText,
      accent: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800',
      badge: 'T1 & T2 Exam',
      keywords: 'question paper t1 t2 exam test marks duration blueprint answer key',
      studentAllowed: false,
    },
    {
      id: 'image_qa',
      title: 'QA Generator',
      shortDesc: 'T1/T2 Q&A bank (max 10/request) from textbook images or voice with Match the Following & exports.',
      ctaLabel: 'Open QA Generator',
      icon: Camera,
      accent: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800',
      badge: `${studioImages.length} Photo${studioImages.length === 1 ? '' : 's'}`,
      keywords: 'qa generator t1 t2 camera gallery crop textbook questions answers match following',
      studentAllowed: false,
    },
    {
      id: 'saved',
      title: 'Saved',
      shortDesc: 'Unified library with filters for Class, Subject, Date, Exam Type & PDF/DOCX/JPEG/Print exports.',
      ctaLabel: 'Open Saved',
      icon: Bookmark,
      accent: 'text-fuchsia-700 dark:text-fuchsia-300 bg-fuchsia-50 dark:bg-fuchsia-950/60 border-fuchsia-200 dark:border-fuchsia-800',
      badge: `${savedItems.length} Item${savedItems.length === 1 ? '' : 's'}`,
      keywords: 'saved library bookmarks materials resources history',
      studentAllowed: true,
    },
    {
      id: 'worksheet',
      title: 'Worksheet',
      shortDesc: 'Generate printable classroom worksheets with exercises, matching & branded PDF/DOCX/JPEG.',
      ctaLabel: 'Open Worksheet',
      icon: FileSpreadsheet,
      accent: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800',
      badge: 'Printable',
      keywords: 'worksheet practice exercises homework matching fill blanks',
      studentAllowed: true,
    },
  ];

  // Preserved Specialized AI Utilities (zero disturbance to existing features)
  const SPECIALIZED_STUDIO_UTILITIES = [
    {
      id: 'ai_ocr' as SmartEduTab,
      title: 'AI OCR Tool',
      shortDesc: 'Upload images, PDFs, or use Camera to extract editable text, math equations & science formulas.',
      ctaLabel: 'Open OCR Tool',
      icon: ScanText,
      accent: 'text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/60 border-cyan-200 dark:border-cyan-800',
      badge: 'OCR · TXT/DOCX/PDF',
      keywords: 'ocr optical character recognition scan image pdf camera extract text equations formulas',
      studentAllowed: true,
    },
    {
      id: 'science_handwritten' as SmartEduTab,
      title: 'Science Handwritten Image Creator',
      shortDesc: 'Generate realistic handwritten Science notebook pages with formulas & labelled diagrams (Science-only).',
      ctaLabel: 'Open Image Creator',
      icon: FlaskConical,
      accent: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800',
      badge: 'Science Only · PNG/JPG',
      keywords: 'science handwritten image creator physics chemistry biology notebook diagram formula png jpg',
      studentAllowed: true,
    },
  ];

  const ALPHABETICAL_STUDIO_MODULES = useMemo(() => {
    const core = isStudentRole
      ? CORE_12_STUDIO_MODULES.filter((m) =>
          studentModuleOverrides[m.id] !== undefined ? studentModuleOverrides[m.id] : Boolean(m.studentAllowed)
        )
      : CORE_12_STUDIO_MODULES;
    return core;
  }, [isStudentRole, studentModuleOverrides, studioImages.length, savedEditablePlans.length, savedItems.length, chatMessages.length, isAdmin]);

  const ALL_SIDEBAR_MODULES = useMemo(
    () => [...ALPHABETICAL_STUDIO_MODULES, ...SPECIALIZED_STUDIO_UTILITIES],
    [ALPHABETICAL_STUDIO_MODULES]
  );

  const filteredDashboardModules = useMemo(() => {
    const q = studioSearch.trim().toLowerCase();
    if (!q) return ALPHABETICAL_STUDIO_MODULES;
    return ALPHABETICAL_STUDIO_MODULES.filter((mod) =>
      `${mod.title} ${mod.shortDesc} ${mod.keywords}`.toLowerCase().includes(q)
    );
  }, [studioSearch, ALPHABETICAL_STUDIO_MODULES]);

  const activeModuleMeta =
    ALL_SIDEBAR_MODULES.find((m) => m.id === activeTab) || ALPHABETICAL_STUDIO_MODULES[4] || ALPHABETICAL_STUDIO_MODULES[0];

  const recentNotifications = useMemo(() => {
    const items: Array<{ id: string; title: string; subtitle: string; tab: SmartEduTab }> = [];
    savedItems.slice(0, 3).forEach((s) => {
      items.push({
        id: s.id,
        title: `Saved: ${s.title}`,
        subtitle: `${s.subject} · ${s.classLevel} · ${new Date(s.savedAt).toLocaleDateString()}`,
        tab: 'saved',
      });
    });
    if (savedEditablePlans.length > 0) {
      items.push({
        id: 'lp-count',
        title: `${savedEditablePlans.length} Editable Lesson Plan${savedEditablePlans.length === 1 ? '' : 's'} Ready`,
        subtitle: 'Open Lesson Plan module to edit, print, or export.',
        tab: 'lesson_plan',
      });
    }
    if (items.length === 0) {
      items.push({
        id: 'welcome-tip',
        title: 'AI Teaching & Learning Studio Ready',
        subtitle: 'Explore Science Handwritten Image Creator, AI OCR Tool & 12 other modules in A–Z order.',
        tab: 'home',
      });
    }
    return items;
  }, [savedItems, savedEditablePlans.length]);

  // Shared language + script selector rendered on every AI tool
  const renderLanguageBar = () => (
    <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
      <span className="font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5">
        <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        <span>Output Language:</span>
      </span>

      <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-900 border border-slate-300/70 dark:border-slate-700">
        {(['English', 'Urdu', 'Kashmiri'] as SmartEduLang[]).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setSelectedLang(lang)}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap ${
              selectedLang === lang
                ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {lang === 'Urdu' ? 'Urdu (اردو)' : lang === 'Kashmiri' ? 'Kashmiri (کٲشُر)' : 'English'}
          </button>
        ))}
      </div>

      {selectedLang === 'Kashmiri' && (
        <div className="inline-flex items-center gap-1.5">
          <span className="text-slate-500 dark:text-slate-400 font-semibold">Script:</span>
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-900 border border-slate-300/70 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setKashmiriScript('perso-arabic')}
              className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap ${
                kashmiriScript === 'perso-arabic'
                  ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Perso-Arabic (کٲشُر · RTL)
            </button>
            <button
              type="button"
              onClick={() => setKashmiriScript('devanagari')}
              className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap ${
                kashmiriScript === 'devanagari'
                  ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Devanagari (कॉशुर · LTR)
            </button>
          </div>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Subject"
          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold"
        >
          {SUBJECT_CARDS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={classLevel}
          onChange={(e) => setClassLevel(e.target.value)}
          aria-label="Class Level"
          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold"
        >
          {CLASS_OPTIONS.map((cls) => (
            <option key={cls} value={cls}>
              {cls}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-16 lg:pb-0 text-slate-900 dark:text-slate-100">
      {/* Automatic School Profile Branding Strip (Auto-fetched from School Profile) */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {school.logoDataUrl ? (
            <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={school.logoDataUrl}
                alt={`${school.name || 'School'} Logo`}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <SchoolEmblem size={40} />
          )}
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-white truncate">
              {school.name || 'School Profile'}
            </p>
            <p className="text-[11px] text-slate-300 truncate">
              {[
                school.address,
                school.code ? `U-DISE: ${school.code}` : '',
                school.academicSession ? `Session: ${school.academicSession}` : '',
              ]
                .filter(Boolean)
                .join('  •  ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold shrink-0">
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-amber-300">
            Auto-Branded Exports Enabled
          </span>
        </div>
      </div>

      {/* Studio Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 relative">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setShowMobileMenu((v) => !v)}
            aria-label="Toggle Studio Modules Menu"
            className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
          >
            {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="truncate">AI Teaching &amp; Learning Studio</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {activeTab === 'home'
                ? `${ALPHABETICAL_STUDIO_MODULES.length} Core AI Studio Modules (A–Z) + Specialized Science & OCR Utilities`
                : `Active Module: ${activeModuleMeta.title} · ${subject} (${classLevel} - ${classSection})`}
            </p>
          </div>
        </div>

        {/* Search Bar + Notifications + Theme + Profile */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="studio-search-input"
              value={studioSearch}
              onChange={(e) => {
                setStudioSearch(e.target.value);
                if (activeTab !== 'home' && e.target.value.trim()) {
                  setActiveTab('home');
                }
              }}
              placeholder="Search studio modules..."
              className="w-full sm:w-52 pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Notifications Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowNotificationsPanel((v) => !v);
                setShowProfilePanel(false);
              }}
              aria-label="Studio Notifications"
              className="relative p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {recentNotifications.length}
              </span>
            </button>

            {showNotificationsPanel && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-40 p-3 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">Studio Notifications</span>
                  <button
                    type="button"
                    onClick={() => setShowNotificationsPanel(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {recentNotifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openModule(n.tab)}
                      className="w-full text-left p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                    >
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{n.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{n.subtitle}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Light / Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleDarkMode}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            <span className="hidden sm:inline">{isDarkMode ? 'Light' : 'Dark'}</span>
          </button>

          {/* User Profile & Account Settings */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowProfilePanel((v) => !v);
                setShowNotificationsPanel(false);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 transition-colors"
            >
              <UserIcon className="w-4 h-4 shrink-0" />
              <span className="max-w-[100px] truncate hidden sm:inline">{currentUser.name}</span>
            </button>

            {showProfilePanel && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-40 p-3.5 space-y-3 text-xs">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <p className="font-extrabold text-slate-900 dark:text-white truncate">{currentUser.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{currentUser.role}</p>
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-1 truncate">
                    {school.name} ({school.academicSession})
                  </p>
                </div>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => openModule('saved')}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                  >
                    <span>Saved Resources</span>
                    <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">{savedItems.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openModule('admin')}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                  >
                    <span>AI Admin &amp; Settings</span>
                    <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Mobile A–Z Module Menu */}
      {showMobileMenu && (
        <div className="lg:hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {ALL_SIDEBAR_MODULES.map((mod) => {
            const Icon = mod.icon;
            const active = activeTab === mod.id;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => openModule(mod.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{mod.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Responsive Layout: Desktop Sidebar (A–Z) + Content Workspace */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Desktop Sidebar Navigation (Strict 12 Core Modules A–Z + Specialized Utilities) */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 space-y-1 sticky top-4">
          <div className="px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Studio Modules (A–Z)
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-400">
              {ALPHABETICAL_STUDIO_MODULES.length}
            </span>
          </div>
          {ALPHABETICAL_STUDIO_MODULES.map((mod) => {
            const Icon = mod.icon;
            const active = activeTab === mod.id;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => openModule(mod.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate flex-1">{mod.title}</span>
              </button>
            );
          })}
          <div className="pt-2 mt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="px-2.5 py-1 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Specialized AI Tools
            </span>
            {SPECIALIZED_STUDIO_UTILITIES.map((mod) => {
              const Icon = mod.icon;
              const active = activeTab === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => openModule(mod.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate flex-1">{mod.title}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Active Workspace Column */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          {statusBanner && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">
              {statusBanner}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ================================================================= */}
          {/* 1. MAIN DASHBOARD — ALL 14 MODULES IN ALPHABETICAL ORDER (A–Z)    */}
          {/* ================================================================= */}
          {activeTab === 'home' && (
            <div className="space-y-6">
              {/* Usage KPIs & Recently Used Modules Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Available Modules</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {ALPHABETICAL_STUDIO_MODULES.length}
                  </p>
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                    Sorted A–Z
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Saved Resources</p>
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                    {savedItems.length + savedEditablePlans.length}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {savedEditablePlans.length} Lesson Plans · {savedItems.length} Library
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">AI Generations</p>
                  <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5 tabular-nums">
                    {totalAiGenerations}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Quota: {aiDailyLimit} / day
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Uploaded Photos</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {studioImages.length}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {subject} · {classLevel}
                  </p>
                </div>
              </div>

              {/* Recently Used Quick-Launch Strip */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-700 dark:text-slate-200 mr-1">
                  <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Recently Used:</span>
                </span>
                {recentModules.map((modId) => {
                  const mod = ALL_SIDEBAR_MODULES.find((m) => m.id === modId);
                  if (!mod) return null;
                  const Icon = mod.icon;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => openModule(mod.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white border border-slate-200 dark:border-slate-700 transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{mod.title}</span>
                    </button>
                  );
                })}
              </div>

              {/* ALL STUDIO MODULES — STRICT ALPHABETICAL ORDER (A–Z) */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      All Studio Modules (Alphabetical Order A–Z)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Every module is directly accessible below — click any card to launch immediately.
                    </p>
                  </div>
                  {studioSearch.trim() && (
                    <button
                      type="button"
                      onClick={() => setStudioSearch('')}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Clear search ({filteredDashboardModules.length} found)
                    </button>
                  )}
                </div>

                {filteredDashboardModules.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                    No studio modules match &ldquo;{studioSearch}&rdquo;. Try another keyword or clear the search bar.
                  </div>
                ) : (
                  <div
                    data-testid="studio-alphabetical-dashboard"
                    className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                  >
                    {filteredDashboardModules.map((mod, idx) => {
                      const Icon = mod.icon;
                      return (
                        <div
                          key={mod.id}
                          onClick={() => openModule(mod.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openModule(mod.id);
                            }
                          }}
                          className="group cursor-pointer rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 p-4 flex flex-col justify-between gap-3.5 transition-all hover:shadow-md"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${mod.accent}`}>
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="flex items-center gap-1.5">
                                {mod.badge && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {mod.badge}
                                  </span>
                                )}
                                <span className="text-[10px] font-mono font-bold text-slate-400 tabular-nums">
                                  #{idx + 1}
                                </span>
                              </div>
                            </div>

                            <div>
                              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {mod.title}
                              </h3>
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                {mod.shortDesc}
                              </p>
                            </div>
                          </div>

                          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                              <span>{mod.ctaLabel}</span>
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Preserved Specialized AI Utilities Strip (AI OCR Tool & Science Handwritten Creator) */}
              <div className="space-y-2.5">
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Specialized AI Studio Utilities
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {SPECIALIZED_STUDIO_UTILITIES.map((util) => {
                    const Icon = util.icon;
                    return (
                      <div
                        key={util.id}
                        onClick={() => openModule(util.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openModule(util.id);
                          }
                        }}
                        className="group cursor-pointer rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 p-4 flex items-center justify-between gap-3 transition-all hover:shadow-sm"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${util.accent}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                {util.title}
                              </h3>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {util.badge}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                              {util.shortDesc}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </div>

              {renderLanguageBar()}

              {/* Five Core Subject Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Select a Subject to Start Teaching or Studying
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Active: {subject} · {classLevel}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                  {SUBJECT_CARDS.map((card) => {
                    const isSelected = subject === card.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => {
                          setSubject(card.id);
                          if (card.id === 'Urdu') setSelectedLang('Urdu');
                          else if (card.id === 'Kashmiri') setSelectedLang('Kashmiri');
                          openModule('qa');
                        }}
                        className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 ${
                          isSelected
                            ? 'bg-slate-900 dark:bg-indigo-950 text-white border-indigo-600 ring-2 ring-indigo-500/30'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${card.accent}`}>
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-extrabold">{card.name}</h3>
                            <p
                              className={`text-xs font-medium mt-0.5 ${
                                isSelected ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {card.nativeName}
                            </p>
                          </div>
                          <p
                            className={`text-xs leading-relaxed ${
                              isSelected ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {card.desc}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold pt-2 border-t border-slate-200/20">
                          <span>Open {card.name}</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* 1.2 AI SCIENCE HANDWRITTEN IMAGE CREATOR (SCIENCE-ONLY)           */}
          {/* ================================================================= */}
          {activeTab === 'science_handwritten' && (
            <ScienceHandwrittenImageCreator
              defaultClassLevel={classLevel}
              onExit={() => openModule('home')}
              onNotify={notify}
            />
          )}

          {/* ================================================================= */}
          {/* 1.3 AI OCR TOOL (IMAGE / PDF / CAMERA TO EDITABLE TEXT)           */}
          {/* ================================================================= */}
          {activeTab === 'ai_ocr' && (
            <AiOcrTool
              schoolName={school.name || 'AI Teaching & Learning Studio'}
              onExit={() => openModule('home')}
              onNotify={notify}
              onSaveToLibrary={(title, content) =>
                handleSaveItem('ocr', title, content, /[\u0600-\u06FF]/.test(content))
              }
            />
          )}

          {/* ================================================================= */}
          {/* 1.5 AUTOMATIC IMAGE-TO-Q&A GENERATOR (ENGLISH, URDU, KASHMIRI)    */}
          {/* ================================================================= */}
          {activeTab === 'image_qa' && (
            <StudioImageQaGenerator
              school={school}
              currentUser={currentUser}
              subject={subject}
              classLevel={classLevel}
              selectedLang={selectedLang}
              kashmiriScript={kashmiriScript}
              images={studioImages}
              onAddImages={handleAddStudioImages}
              onUpdateImage={handleUpdateStudioImage}
              onDeleteImage={handleDeleteStudioImage}
              onToggleSelectImage={handleToggleStudioImageSelect}
              onDownloadPdf={handleDownloadPdf}
              onSaveToGlobalLibrary={(title, content, isRtl) => handleSaveItem('qa', title, content, isRtl)}
              onNotify={notify}
              renderLanguageBar={renderLanguageBar}
            />
          )}

      {/* ================================================================= */}
      {/* 1.8 DAILY TEACHER'S DIARY                                         */}
      {/* ================================================================= */}
      {activeTab === 'diary' && (
        <DailyTeacherDiary
          school={school}
          currentUser={currentUser}
          defaultLanguage={selectedLang}
          defaultKashmiriScript={kashmiriScript}
          defaultSubject={subject}
          defaultClassLevel={classLevel}
          onDownloadPdf={handleDownloadPdf}
          onSaveToLibrary={(title, content, isRtl) => handleSaveItem('diary', title, content, isRtl)}
          onNotify={notify}
        />
      )}

      {/* ================================================================= */}
      {/* 2. AI QUESTION ANSWER SYSTEM (5 FORMATS + TRANSLATOR)             */}
      {/* ================================================================= */}
      {activeTab === 'qa' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          {renderLanguageBar()}

          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              Select Answer Format
            </label>
            <div className="flex flex-wrap gap-2">
              {ANSWER_FORMATS.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setAnswerFormat(fmt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                    answerFormat === fmt
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-bold text-slate-500 dark:text-slate-400">Quick Assist:</span>
              {[
                { label: 'Summarize Text', prefix: 'Summarize this clearly in bullet points:\n' },
                { label: 'Rewrite & Simplify', prefix: 'Rewrite and simplify this for students:\n' },
                { label: 'Improve Grammar', prefix: 'Correct grammar and polish this educational text:\n' },
                { label: 'Generate Examples', prefix: 'Explain with 3 real-life classroom examples:\n' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setQuestionText((prev) =>
                      prev.trim().startsWith(preset.prefix.trim()) ? prev : `${preset.prefix}${prev}`
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                Enter Educational Question or Passage ({subject} · {classLevel})
              </label>
              <textarea
                rows={4}
                dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder={
                  selectedLang === 'Urdu'
                    ? 'اپنا تعلیمی سوال یہاں لکھیں...'
                    : selectedLang === 'Kashmiri'
                    ? kashmiriScript === 'devanagari'
                      ? 'पनुन तालीमी सवाल यति लिख्योव...'
                      : 'پَنُن تعلیمی سوال ییٚتہِ لیکھِو...'
                    : 'e.g., Explain photosynthesis with its chemical equation and classroom example...'
                }
                className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setIsEditingQaOutput(false);
                  void handleAskQuestion('qa');
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
              >
                <HelpCircle className="w-4 h-4" />
                <span>{isLoading ? 'Generating Answer...' : `Generate ${answerFormat}`}</span>
              </button>

              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-slate-500" />
                <select
                  value={translateTargetLang}
                  onChange={(e) => setTranslateTargetLang(e.target.value as SmartEduLang)}
                  aria-label="Translate target language"
                  className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  <option value="English">Translate to English</option>
                  <option value="Urdu">Translate to Urdu (اردو)</option>
                  <option value="Kashmiri">Translate to Kashmiri</option>
                </select>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setIsEditingQaOutput(false);
                    void handleAskQuestion('translate');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap disabled:opacity-60"
                >
                  Translate
                </button>
              </div>
            </div>
          </div>

          {qaOutput && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  {qaOutput.format} · {subject} · {classLevel}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsEditingQaOutput((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                      isEditingQaOutput
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isEditingQaOutput ? 'Done Editing' : 'Edit'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyText(qaOutput.text, 'qa')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                  >
                    {copiedId === 'qa' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSaveItem(
                        'qa',
                        `${subject} Q&A: ${questionText.slice(0, 60)}`,
                        `Question:\n${questionText}\n\n${qaOutput.format}:\n${qaOutput.text}`,
                        qaOutput.isRtl
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleDownloadPdf(
                        `${subject} — ${qaOutput.format}`,
                        `Question:\n${questionText}\n\nAnswer (${qaOutput.format}):\n${qaOutput.text}`,
                        qaOutput.isRtl,
                        selectedLang
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                </div>
              </div>
              {isEditingQaOutput ? (
                <textarea
                  rows={10}
                  dir={qaOutput.isRtl ? 'rtl' : 'ltr'}
                  value={qaOutput.text}
                  onChange={(e) => setQaOutput({ ...qaOutput, text: e.target.value })}
                  className={`w-full p-4 rounded-xl bg-white dark:bg-slate-900 border-2 border-indigo-400 text-sm leading-relaxed focus:outline-none ${
                    qaOutput.isRtl ? 'font-urdu text-base leading-loose' : ''
                  }`}
                />
              ) : (
                <div
                  dir={qaOutput.isRtl ? 'rtl' : 'ltr'}
                  className={`p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 whitespace-pre-wrap text-sm leading-relaxed ${
                    qaOutput.isRtl ? 'font-urdu text-base leading-loose' : ''
                  }`}
                >
                  {qaOutput.text}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. AUTOMATIC AI LESSON PLAN GENERATOR (IMAGE + TOPIC + FULL EDIT) */}
      {/* ================================================================= */}
      {activeTab === 'lesson_plan' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
          {/* Switcher between Short Lesson Plan (One-View) and Detailed 13-Section Textbook Plan */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setLessonPlanMode('short')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                  lessonPlanMode === 'short'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Short Lesson Plan (One-View AI)
              </button>
              <button
                type="button"
                onClick={() => setLessonPlanMode('detailed')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                  lessonPlanMode === 'detailed'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Detailed Textbook Lesson Plan (13-Section + Voice)
              </button>
            </div>
          </div>

          {lessonPlanMode === 'short' ? (
            <ShortLessonPlanGenerator school={school} />
          ) : (
            <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Automatic Lesson Plan Generator</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Upload textbook pages, diagrams, or handwritten notes via Camera/Gallery — or enter a Chapter &amp; Topic — to generate a complete editable Lesson Plan in English, Urdu, or Kashmiri.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSavedPlansDrawer((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold whitespace-nowrap shrink-0"
            >
              <Bookmark className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Saved Plans ({savedEditablePlans.length})</span>
            </button>
          </div>

          {renderLanguageBar()}

          {/* Saved Editable Lesson Plans Drawer */}
          {showSavedPlansDrawer && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">
                  Saved Editable Lesson Plans (Auto-Saved)
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSavedPlansDrawer(false)}
                  aria-label="Close saved lesson plans"
                  className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {savedEditablePlans.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center">
                  No saved Lesson Plans yet. Generate a Lesson Plan and it will be saved here automatically for future editing.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {savedEditablePlans.map((rec) => (
                    <div
                      key={rec.id}
                      className={`p-3 rounded-xl border bg-white dark:bg-slate-900 flex items-center justify-between gap-3 ${
                        activeLessonPlanId === rec.id
                          ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{rec.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {rec.subject} · {rec.classLevel} · {rec.language} · {rec.duration} ·{' '}
                          {new Date(rec.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoadEditablePlan(rec)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold whitespace-nowrap"
                        >
                          Load &amp; Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePlanId(rec.id)}
                          aria-label={`Delete saved plan ${rec.title}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Direct Camera & Gallery Image Uploader for Lesson Plan Material */}
          <StudioImageUploader
            images={studioImages}
            onAddImages={handleAddStudioImages}
            onUpdateImage={handleUpdateStudioImage}
            onDeleteImage={handleDeleteStudioImage}
            onToggleSelect={handleToggleStudioImageSelect}
            compactTitle="Upload Textbook Pages, Notes, or Diagrams for Lesson Plan (Optional)"
            helperText="Snap or upload chapter photos so AI automatically builds learning objectives, activities, blackboard work, and homework directly from your material."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block font-bold text-slate-700 dark:text-slate-200">
                  Textbook Title / Chapter Name {studioImages.some((i) => i.selectedForAi) ? '(Optional)' : ''}
                </label>
                {isVoiceListening && voiceActiveField === 'lp-chapter' && (
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    Listening...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  placeholder="e.g., Chapter 4: Heat & Temperature"
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <button
                  type="button"
                  data-testid="lp-chapter-voice-btn"
                  title={
                    isVoiceSupported
                      ? 'Dictate textbook title or chapter name'
                      : 'Web Speech API not supported in this browser'
                  }
                  onClick={() =>
                    startLpDictation('lp-chapter', (spoken) => {
                      setChapter((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
                      notify(`Voice input captured: "${spoken}"`);
                    })
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-2.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                    isVoiceListening && voiceActiveField === 'lp-chapter'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {isVoiceListening && voiceActiveField === 'lp-chapter' ? (
                    <MicOff className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  )}
                  <span>{isVoiceListening && voiceActiveField === 'lp-chapter' ? 'Stop' : 'Voice Input'}</span>
                </button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block font-bold text-slate-700 dark:text-slate-200">
                  Topic {studioImages.some((i) => i.selectedForAi) ? '(Optional)' : ''}
                </label>
                {isVoiceListening && voiceActiveField === 'lp-topic' && (
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    Listening...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Modes of Heat Transfer (Conduction, Convection)"
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <button
                  type="button"
                  data-testid="lp-topic-voice-btn"
                  title={
                    isVoiceSupported
                      ? 'Dictate lesson topic'
                      : 'Web Speech API not supported in this browser'
                  }
                  onClick={() =>
                    startLpDictation('lp-topic', (spoken) => {
                      setTopic((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
                      notify(`Voice input captured: "${spoken}"`);
                    })
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-2.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                    isVoiceListening && voiceActiveField === 'lp-topic'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {isVoiceListening && voiceActiveField === 'lp-topic' ? (
                    <MicOff className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  )}
                  <span>{isVoiceListening && voiceActiveField === 'lp-topic' ? 'Stop' : 'Voice Input'}</span>
                </button>
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Section &amp; Duration
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={classSection}
                  onChange={(e) => setClassSection(e.target.value)}
                  aria-label="Lesson Plan Section"
                  className="w-full px-2.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                >
                  {['A', 'B', 'C', 'D'].map((s) => (
                    <option key={s} value={s}>
                      Sec {s}
                    </option>
                  ))}
                </select>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full px-2.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="30 minutes">30 min</option>
                  <option value="35 minutes">35 min</option>
                  <option value="40 minutes">40 min</option>
                  <option value="45 minutes">45 min</option>
                  <option value="60 minutes">60 min</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Learning Objectives Focus (Optional)
              </label>
              <input
                type="text"
                dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
                value={lessonObjectivesInput}
                onChange={(e) => setLessonObjectivesInput(e.target.value)}
                placeholder="e.g., Students will compare conduction, convection & radiation with examples"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Additional Teaching Instructions (Optional)
              </label>
              <input
                type="text"
                dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
                value={lessonExtraInstructions}
                onChange={(e) => setLessonExtraInstructions(e.target.value)}
                placeholder="e.g., Include low-cost activity and 3 quick oral check questions"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>
          {lpVoiceError && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{lpVoiceError}</p>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void handleGenerateLessonPlan()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>
                {isLoading
                  ? 'Generating Lesson Plan...'
                  : studioImages.some((i) => i.selectedForAi)
                  ? `Generate Lesson Plan from ${studioImages.filter((i) => i.selectedForAi).length} Image${
                      studioImages.filter((i) => i.selectedForAi).length === 1 ? '' : 's'
                    }`
                  : 'Generate Complete Lesson Plan'}
              </span>
            </button>
          </div>

          {lessonPlan && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {isEditingLessonPlan ? (
                  <input
                    type="text"
                    dir={lessonPlanRtl ? 'rtl' : 'ltr'}
                    value={lessonPlan.title}
                    onChange={(e) => {
                      const next = { ...lessonPlan, title: e.target.value };
                      setLessonPlan(next);
                      persistEditableLessonPlan(next, lessonPlanRtl, customLessonSections, hiddenLessonSections, activeLessonPlanId, true);
                    }}
                    className="flex-1 min-w-[220px] px-3 py-1.5 rounded-xl border border-indigo-400 bg-slate-50 dark:bg-slate-800 text-sm font-extrabold"
                  />
                ) : (
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {lessonPlan.title}
                  </h3>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsEditingLessonPlan((v) => !v)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                      isEditingLessonPlan
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isEditingLessonPlan ? 'Done Editing' : 'Edit'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddSectionForm((v) => !v)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Add Section</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      persistEditableLessonPlan(
                        lessonPlan,
                        lessonPlanRtl,
                        customLessonSections,
                        hiddenLessonSections,
                        activeLessonPlanId,
                        false
                      );
                      handleSaveItem(
                        'lesson_plan',
                        lessonPlan.title,
                        formatLessonPlanAsText(lessonPlan),
                        lessonPlanRtl
                      );
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintLessonPlan}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleDownloadDocx(
                        lessonPlan.title,
                        formatLessonPlanAsText(lessonPlan),
                        selectedLang
                      )
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>DOCX</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleDownloadJpeg(
                        lessonPlan.title,
                        formatLessonPlanAsText(lessonPlan),
                        lessonPlanRtl,
                        { documentType: 'OFFICIAL LESSON PLAN' }
                      )
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold whitespace-nowrap"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>JPEG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleShareText(lessonPlan.title, formatLessonPlanAsText(lessonPlan))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleDownloadPdf(
                        lessonPlan.title,
                        formatLessonPlanAsText(lessonPlan),
                        lessonPlanRtl,
                        selectedLang,
                        { documentType: 'OFFICIAL LESSON PLAN' }
                      )
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                </div>
              </div>

              {/* Add Custom Lesson Section Form */}
              {showAddSectionForm && (
                <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-slate-900 dark:text-white">Add Custom Lesson Plan Section</h4>
                    <button
                      type="button"
                      onClick={() => setShowAddSectionForm(false)}
                      aria-label="Close add section form"
                      className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      value={newSectionLabel}
                      onChange={(e) => setNewSectionLabel(e.target.value)}
                      placeholder="Section Title (e.g., 14. Remedial Activities)"
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input
                      type="text"
                      dir={lessonPlanRtl ? 'rtl' : 'ltr'}
                      value={newSectionContent}
                      onChange={(e) => setNewSectionContent(e.target.value)}
                      placeholder="Enter details for this section..."
                      className="md:col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddSectionForm(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!newSectionLabel.trim()}
                      onClick={handleAddCustomLessonSection}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50"
                    >
                      Add Section
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {visibleStandardLessonSections.map((sec) => (
                  <div
                    key={sec.key}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                        {sec.label}
                      </h4>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={regeneratingLessonSectionKey === sec.key}
                          onClick={() => void handleRegenerateLessonSection(sec.key, sec.label)}
                          title={`Regenerate ${sec.label}`}
                          aria-label={`Regenerate ${sec.label}`}
                          className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              regeneratingLessonSectionKey === sec.key ? 'animate-spin text-indigo-600' : ''
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteSectionTarget({
                              kind: 'standard',
                              id: sec.key,
                              label: sec.label,
                            })
                          }
                          aria-label={`Remove ${sec.label}`}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {isEditingLessonPlan ? (
                      <textarea
                        rows={4}
                        dir={lessonPlanRtl ? 'rtl' : 'ltr'}
                        value={lessonPlan[sec.key]}
                        onChange={(e) => {
                          const next = { ...lessonPlan, [sec.key]: e.target.value };
                          setLessonPlan(next);
                          persistEditableLessonPlan(
                            next,
                            lessonPlanRtl,
                            customLessonSections,
                            hiddenLessonSections,
                            activeLessonPlanId,
                            true
                          );
                        }}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                      />
                    ) : (
                      <p
                        dir={lessonPlanRtl ? 'rtl' : 'ltr'}
                        className={`text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed ${
                          lessonPlanRtl ? 'font-urdu text-sm leading-loose' : ''
                        }`}
                      >
                        {lessonPlan[sec.key]}
                      </p>
                    )}
                  </div>
                ))}

                {customLessonSections.map((cSec) => (
                  <div
                    key={cSec.id}
                    className="p-4 rounded-xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {isEditingLessonPlan ? (
                        <input
                          type="text"
                          value={cSec.label}
                          onChange={(e) => {
                            const nextCustom = customLessonSections.map((x) =>
                              x.id === cSec.id ? { ...x, label: e.target.value } : x
                            );
                            setCustomLessonSections(nextCustom);
                            persistEditableLessonPlan(
                              lessonPlan,
                              lessonPlanRtl,
                              nextCustom,
                              hiddenLessonSections,
                              activeLessonPlanId,
                              true
                            );
                          }}
                          className="flex-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-extrabold"
                        />
                      ) : (
                        <h4 className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                          {cSec.label}
                        </h4>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDeleteSectionTarget({
                            kind: 'custom',
                            id: cSec.id,
                            label: cSec.label,
                          })
                        }
                        aria-label={`Delete ${cSec.label}`}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {isEditingLessonPlan ? (
                      <textarea
                        rows={4}
                        dir={lessonPlanRtl ? 'rtl' : 'ltr'}
                        value={cSec.content}
                        onChange={(e) => {
                          const nextCustom = customLessonSections.map((x) =>
                            x.id === cSec.id ? { ...x, content: e.target.value } : x
                          );
                          setCustomLessonSections(nextCustom);
                          persistEditableLessonPlan(
                            lessonPlan,
                            lessonPlanRtl,
                            nextCustom,
                            hiddenLessonSections,
                            activeLessonPlanId,
                            true
                          );
                        }}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                      />
                    ) : (
                      <p
                        dir={lessonPlanRtl ? 'rtl' : 'ltr'}
                        className={`text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed ${
                          lessonPlanRtl ? 'font-urdu text-sm leading-loose' : ''
                        }`}
                      >
                        {cSec.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delete Lesson Section Confirmation Modal */}
          {confirmDeleteSectionTarget && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm section deletion"
              className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
            >
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Delete Lesson Plan Section?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Are you sure you want to remove <strong>{confirmDeleteSectionTarget.label}</strong> from this Lesson Plan?
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteSectionTarget(null)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteLessonSection}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Saved Editable Lesson Plan Confirmation Modal */}
          {confirmDeletePlanId && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm saved lesson plan deletion"
              className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
            >
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Delete Saved Lesson Plan?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  This will permanently remove the saved Lesson Plan from your editable Lesson Plans list.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeletePlanId(null)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEditablePlan(confirmDeletePlanId)}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            </div>
          )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* 4, 5, 7: QUESTION PAPER / NOTES / WORKSHEET GENERATORS            */}
      {/* ================================================================= */}
      {(activeTab === 'question_paper' || activeTab === 'notes' || activeTab === 'worksheet') && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          {renderLanguageBar()}

          {/* Official T1 / T2 Examination Settings for Question Paper */}
          {activeTab === 'question_paper' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Examination Name
                </label>
                <select
                  value={paperExamType}
                  onChange={(e) => setPaperExamType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                >
                  <option value="T1 Examination">T1 Examination</option>
                  <option value="T2 Examination">T2 Examination</option>
                  <option value="Unit Test">Unit Test</option>
                  <option value="Annual Examination">Annual Examination</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Class Section
                </label>
                <select
                  value={classSection}
                  onChange={(e) => setClassSection(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                >
                  {['A', 'B', 'C', 'D', 'All'].map((s) => (
                    <option key={s} value={s}>
                      Section {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Time Allowed
                </label>
                <select
                  value={paperTimeAllowed}
                  onChange={(e) => setPaperTimeAllowed(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                >
                  <option value="1 Hour">1 Hour</option>
                  <option value="1.5 Hours">1.5 Hours</option>
                  <option value="2 Hours">2 Hours</option>
                  <option value="2.5 Hours">2.5 Hours</option>
                  <option value="3 Hours">3 Hours</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Exam Date
                </label>
                <input
                  type="date"
                  value={paperDate}
                  onChange={(e) => setPaperDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="md:col-span-2">
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Chapter Name or &ldquo;Complete Syllabus&rdquo;
              </label>
              <input
                type="text"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                placeholder="e.g., Chapter 2: Microorganisms or Complete Syllabus"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Topic Focus (Optional)</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Specific sub-topic..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            {activeTab !== 'notes' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="w-full px-2.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
                {activeTab === 'question_paper' && (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Total Marks</label>
                    <select
                      value={totalMarks}
                      onChange={(e) => setTotalMarks(Number(e.target.value))}
                      className="w-full px-2.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      {[20, 30, 40, 50, 80, 100].map((m) => (
                        <option key={m} value={m}>
                          {m} Marks
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-end">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Includes Summary, Key Points, Definitions &amp; Important Q&amp;As.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => void handleGenerateTextTool(activeTab)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>
              {isLoading
                ? 'Generating with Gemini AI...'
                : activeTab === 'question_paper'
                ? `Generate ${paperExamType} (${totalMarks} Marks) & Answer Key`
                : activeTab === 'notes'
                ? 'Generate Chapter Notes & Summary'
                : 'Generate Practice Worksheet & Answers'}
            </span>
          </button>

          {(() => {
            const activeOut =
              activeTab === 'question_paper'
                ? paperOutput
                : activeTab === 'notes'
                ? notesOutput
                : worksheetOutput;
            if (!activeOut) return null;
            const docTitle =
              activeTab === 'question_paper'
                ? `${subject} ${paperExamType} (${totalMarks} Marks) — ${chapter || topic}`
                : activeTab === 'notes'
                ? `${subject} Study Notes — ${chapter || topic}`
                : `${subject} Practice Worksheet — ${chapter || topic}`;
            const exportMeta =
              activeTab === 'question_paper'
                ? {
                    documentType: `${paperExamType.toUpperCase()} QUESTION PAPER`,
                    examName: paperExamType,
                    maxMarks: totalMarks,
                    timeAllowed: paperTimeAllowed,
                    date: paperDate,
                  }
                : {
                    documentType: activeTab === 'notes' ? 'CHAPTER STUDY NOTES' : 'PRACTICE WORKSHEET',
                  };
            return (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                {/* Official Branded Examination Header Preview */}
                {activeTab === 'question_paper' && (
                  <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-700 space-y-2">
                    <div className="flex items-center gap-3">
                      {school.logoDataUrl ? (
                        <img
                          src={school.logoDataUrl}
                          alt="School Logo"
                          className="w-12 h-12 rounded-lg bg-white p-1 object-contain shrink-0"
                        />
                      ) : (
                        <SchoolEmblem size={44} />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-black truncate">{school.name || 'School Examination Header'}</p>
                        {school.address && <p className="text-[11px] text-slate-300 truncate">{school.address}</p>}
                        <p className="text-xs font-bold text-amber-300 mt-0.5">
                          {paperExamType} {school.academicSession ? `· Session ${school.academicSession}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-700 text-[11px]">
                      <span>Class: <strong>{classLevel} ({classSection})</strong></span>
                      <span>Subject: <strong>{subject}</strong></span>
                      <span>Max Marks: <strong>{totalMarks}</strong></span>
                      <span>Time: <strong>{paperTimeAllowed}</strong> · {paperDate}</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{docTitle}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsEditingTextOutput((v) => !v)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                        isEditingTextOutput
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{isEditingTextOutput ? 'Done Editing' : 'Edit'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyText(activeOut.text, activeTab)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                    >
                      {copiedId === activeTab ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>Copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveItem(activeTab, docTitle, activeOut.text, activeOut.isRtl, {
                          examType: activeTab === 'question_paper' ? paperExamType : undefined,
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintGenericDocument(docTitle, activeOut.text, activeOut.isRtl)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownloadDocx(docTitle, activeOut.text, selectedLang)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>DOCX</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownloadJpeg(docTitle, activeOut.text, activeOut.isRtl, exportMeta)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>JPEG</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownloadPdf(docTitle, activeOut.text, activeOut.isRtl, selectedLang, exportMeta)
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </div>
                </div>
                {isEditingTextOutput ? (
                  <textarea
                    rows={14}
                    dir={activeOut.isRtl ? 'rtl' : 'ltr'}
                    value={activeOut.text}
                    onChange={(e) => {
                      const nextVal = { ...activeOut, text: e.target.value };
                      if (activeTab === 'question_paper') setPaperOutput(nextVal);
                      else if (activeTab === 'notes') setNotesOutput(nextVal);
                      else setWorksheetOutput(nextVal);
                    }}
                    className={`w-full p-4 rounded-xl bg-white dark:bg-slate-900 border-2 border-indigo-400 text-sm leading-relaxed focus:outline-none ${
                      activeOut.isRtl ? 'font-urdu text-base leading-loose' : ''
                    }`}
                  />
                ) : (
                  <div
                    dir={activeOut.isRtl ? 'rtl' : 'ltr'}
                    className={`p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 whitespace-pre-wrap text-sm leading-relaxed ${
                      activeOut.isRtl ? 'font-urdu text-base leading-loose' : ''
                    }`}
                  >
                    {activeOut.text}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ================================================================= */}
      {/* 6. INTERACTIVE MCQ GENERATOR                                      */}
      {/* ================================================================= */}
      {activeTab === 'mcq' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          {renderLanguageBar()}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="md:col-span-2">
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Chapter / Topic</label>
              <input
                type="text"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                placeholder="e.g., Solar System / Mughal Empire / Kashmiri Grammar"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
                <option value="Mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Questions</label>
              <select
                value={mcqCount}
                onChange={(e) => setMcqCount(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                {[5, 8, 10, 15].map((n) => (
                  <option key={n} value={n}>
                    {n} MCQs
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => void handleGenerateMcqs()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
          >
            <ListChecks className="w-4 h-4" />
            <span>{isLoading ? 'Generating MCQs...' : `Generate ${mcqCount} Interactive MCQs`}</span>
          </button>

          {mcqList.length > 0 && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              {(() => {
                const selectedMcqs = mcqList.filter((_, idx) => mcqCheckedMap[idx] !== false);
                const exportMcqs = selectedMcqs.length > 0 ? selectedMcqs : mcqList;
                return (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-extrabold">{mcqTitle}</h3>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          Score: {mcqScore.correct} / {mcqList.length} answered ({mcqScore.answered} attempted) · {selectedMcqs.length} Selected
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setMcqRevealAll((v) => !v)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                        >
                          {mcqRevealAll ? 'Hide Answer Key' : 'Reveal All Answers'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleSaveItem('mcq', mcqTitle, formatMcqsAsText(exportMcqs, mcqTitle), mcqRtl)
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save ({exportMcqs.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadDocx(mcqTitle, formatMcqsAsText(exportMcqs, mcqTitle), selectedLang)
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>DOCX</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadJpeg(mcqTitle, formatMcqsAsText(exportMcqs, mcqTitle), mcqRtl, {
                              documentType: 'MULTIPLE CHOICE ASSESSMENT (MCQs)',
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>JPEG</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadPdf(mcqTitle, formatMcqsAsText(exportMcqs, mcqTitle), mcqRtl, selectedLang, {
                              documentType: 'MULTIPLE CHOICE ASSESSMENT (MCQs)',
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {mcqList.map((item, idx) => {
                        const chosen = mcqSelectedAnswers[idx];
                        const correctKey = item.correctOption.trim().toUpperCase().slice(0, 1);
                        const showExplanation = Boolean(chosen) || mcqRevealAll;
                        const isChecked = mcqCheckedMap[idx] !== false;
                        const isEditingThis = editingMcqIdx === idx && mcqEditDraft;
                        const opts: Array<{ key: string; text: string }> = [
                          { key: 'A', text: item.optionA },
                          { key: 'B', text: item.optionB },
                          { key: 'C', text: item.optionC },
                          { key: 'D', text: item.optionD },
                        ];

                        return (
                          <div
                            key={idx}
                            dir={mcqRtl ? 'rtl' : 'ltr'}
                            className={`p-4 rounded-xl border space-y-2.5 ${
                              isChecked
                                ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                                : 'bg-slate-100/50 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-700 opacity-65'
                            }`}
                          >
                            {isEditingThis ? (
                              <div className="space-y-2 text-xs">
                                <input
                                  type="text"
                                  value={mcqEditDraft.question}
                                  onChange={(e) => setMcqEditDraft({ ...mcqEditDraft, question: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-semibold"
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {(['optionA', 'optionB', 'optionC', 'optionD'] as const).map((k, oi) => (
                                    <input
                                      key={k}
                                      type="text"
                                      value={mcqEditDraft[k]}
                                      onChange={(e) => setMcqEditDraft({ ...mcqEditDraft, [k]: e.target.value })}
                                      placeholder={`Option ${['A', 'B', 'C', 'D'][oi]}`}
                                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                                    />
                                  ))}
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <select
                                    value={mcqEditDraft.correctOption}
                                    onChange={(e) => setMcqEditDraft({ ...mcqEditDraft, correctOption: e.target.value })}
                                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-semibold"
                                  >
                                    {['A', 'B', 'C', 'D'].map((opt) => (
                                      <option key={opt} value={opt}>
                                        Correct: {opt}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMcqIdx(null);
                                        setMcqEditDraft(null);
                                      }}
                                      className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 font-semibold"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMcqList((prev) => prev.map((m, i) => (i === idx ? mcqEditDraft : m)));
                                        setEditingMcqIdx(null);
                                        setMcqEditDraft(null);
                                        notify(`Updated MCQ #${idx + 1}.`);
                                      }}
                                      className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setMcqCheckedMap((prev) => ({ ...prev, [idx]: !isChecked }))
                                      }
                                      aria-label={`Select MCQ ${idx + 1}`}
                                      className="mt-0.5 text-indigo-600 dark:text-indigo-400 shrink-0"
                                    >
                                      {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-400" />}
                                    </button>
                                    <p className={`text-sm font-bold ${mcqRtl ? 'font-urdu text-base' : ''}`}>
                                      {idx + 1}. {item.question}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      disabled={regeneratingMcqIdx === idx}
                                      onClick={() => void handleRegenerateSingleMcq(idx)}
                                      className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:border-indigo-400 disabled:opacity-50"
                                      title="Regenerate this MCQ"
                                    >
                                      <RefreshCw className={`w-3.5 h-3.5 ${regeneratingMcqIdx === idx ? 'animate-spin' : ''}`} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMcqIdx(idx);
                                        setMcqEditDraft({ ...item });
                                      }}
                                      className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400"
                                      title="Edit MCQ"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {opts.map((opt) => {
                                    const isPicked = chosen === opt.key;
                                    const isRight = opt.key === correctKey;
                                    let style =
                                      'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-400';
                                    if (showExplanation && isRight) {
                                      style = 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-200 font-bold';
                                    } else if (isPicked && !isRight) {
                                      style = 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-900 dark:text-rose-200';
                                    }
                                    return (
                                      <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() =>
                                          setMcqSelectedAnswers((prev) => ({ ...prev, [idx]: opt.key }))
                                        }
                                        className={`p-2.5 rounded-lg border text-left text-xs transition-colors ${style}`}
                                      >
                                        <span className="font-mono font-bold mr-1.5">{opt.key})</span>
                                        <span>{opt.text}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {showExplanation && (
                                  <div className="p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs text-slate-700 dark:text-slate-200">
                                    <strong className="text-emerald-700 dark:text-emerald-300">
                                      Correct: {correctKey}
                                    </strong>{' '}
                                    — {item.explanation}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* 8. SAVED CONTENT LIBRARY                                          */}
      {/* ================================================================= */}
      {activeTab === 'saved' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-bold">Saved Lessons &amp; AI Materials</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Unified library for Lesson Plans, Q&amp;As, Notes, Question Papers, MCQs, and Worksheets — filter by class, subject, date, or type.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 text-xs">
              <input
                type="text"
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                placeholder="Search title, chapter, exam..."
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <select
                value={savedFilter}
                onChange={(e) => setSavedFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                <option value="all">All Resource Types</option>
                <option value="diary">Daily Teacher&apos;s Diary</option>
                <option value="lesson_plan">Lesson Plans</option>
                <option value="qa">Q&amp;A Sets</option>
                <option value="question_paper">Question Papers</option>
                <option value="notes">Notes</option>
                <option value="mcq">MCQs</option>
                <option value="worksheet">Worksheets</option>
                <option value="chat">AI Study Chat</option>
                <option value="ocr">OCR Content</option>
              </select>
              <select
                value={savedSubjectFilter}
                onChange={(e) => setSavedSubjectFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                <option value="all">All Subjects</option>
                {SUBJECT_CARDS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={savedClassFilter}
                onChange={(e) => setSavedClassFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                <option value="all">All Classes</option>
                {CLASS_OPTIONS.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
              <select
                value={savedExamFilter}
                onChange={(e) => setSavedExamFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                <option value="all">All Exam Types</option>
                <option value="T1 Examination">T1 Examination</option>
                <option value="T2 Examination">T2 Examination</option>
                <option value="Unit Test">Unit Test</option>
              </select>
              <select
                value={savedSessionFilter}
                onChange={(e) => setSavedSessionFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                <option value="all">All Sessions</option>
                {savedSessionOptions.map((sess) => (
                  <option key={sess} value={sess}>
                    Session {sess}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={savedDateFilter}
                onChange={(e) => setSavedDateFilter(e.target.value)}
                aria-label="Filter saved items by date"
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
          </div>

          {filteredSavedItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              No saved items match the active filters. Generate a Lesson Plan, Q&amp;A, Notes, Question Paper, MCQ set, Worksheet, or Study Chat response and click Save.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSavedItems.map((item) => {
                const isEditingThis = editingSavedId === item.id;
                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold">{item.title}</h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {item.subject} · {item.classLevel}
                          {item.section ? ` (${item.section})` : ''}
                          {item.examType ? ` · ${item.examType}` : ''}
                          {item.academicSession ? ` · Session ${item.academicSession}` : ''} · {item.language} ·{' '}
                          {new Date(item.savedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!isEditingThis && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSavedId(item.id);
                              setEditingSavedTitle(item.title);
                              setEditingSavedContent(item.content);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDuplicateSavedItem(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Duplicate</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintGenericDocument(item.title, item.content, item.isRtl)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleShareText(item.title, item.content)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadDocx(item.title, item.content, item.language)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>DOCX</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadJpeg(item.title, item.content, item.isRtl)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>JPEG</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadPdf(item.title, item.content, item.isRtl, item.language)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                        {confirmDeleteId === item.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setSavedItems((prev) => prev.filter((x) => x.id !== item.id));
                                setConfirmDeleteId(null);
                                notify('Deleted saved item.');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            aria-label={`Delete ${item.title}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {isEditingThis ? (
                      <div className="space-y-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700">
                        <input
                          type="text"
                          value={editingSavedTitle}
                          onChange={(e) => setEditingSavedTitle(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                        />
                        <textarea
                          rows={6}
                          dir={item.isRtl ? 'rtl' : 'ltr'}
                          value={editingSavedContent}
                          onChange={(e) => setEditingSavedContent(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingSavedId(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSavedItems((prev) =>
                                prev.map((x) =>
                                  x.id === item.id
                                    ? {
                                        ...x,
                                        title: editingSavedTitle.trim() || x.title,
                                        content: editingSavedContent,
                                      }
                                    : x
                                )
                              );
                              setEditingSavedId(null);
                              notify('Updated saved resource.');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        dir={item.isRtl ? 'rtl' : 'ltr'}
                        className={`max-h-40 overflow-y-auto p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs whitespace-pre-wrap ${
                          item.isRtl ? 'font-urdu text-sm leading-loose' : ''
                        }`}
                      >
                        {item.content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* 8.5 AI STUDY ASSISTANT CHATBOT (STEP-BY-STEP MULTILINGUAL TUTOR)  */}
      {/* ================================================================= */}
      {activeTab === 'chatbot' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">AI Study Assistant — Step-by-Step Tutor</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ask follow-up educational questions for {subject} ({classLevel}) and receive step-by-step explanations in English, Urdu, or Kashmiri.
              </p>
            </div>
            {chatMessages.length > 0 && (
              <button
                type="button"
                onClick={() => setChatMessages([])}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Clear Chat
              </button>
            )}
          </div>

          {renderLanguageBar()}

          <div className="min-h-[280px] max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="text-center py-10 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                <GraduationCap className="w-8 h-8 mx-auto text-indigo-500" />
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  Start a step-by-step study conversation
                </p>
                <p>
                  Example: &ldquo;Explain photosynthesis step by step with an everyday example&rdquo; or ask in Urdu / Kashmiri.
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    dir={msg.isRtl ? 'rtl' : 'ltr'}
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs whitespace-pre-wrap leading-relaxed space-y-2 ${
                      msg.isRtl ? 'font-urdu text-sm leading-loose' : ''
                    } ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <div>{msg.text}</div>
                    {msg.role === 'assistant' && (
                      <div dir="ltr" className="pt-1.5 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleSaveItem(
                              'chat',
                              `AI Study Chat: ${subject} (${classLevel})`,
                              msg.text,
                              msg.isRtl
                            )
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold"
                        >
                          <Bookmark className="w-3 h-3" />
                          <span>Save to Library</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopyText(msg.text, msg.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendChatMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={`Ask your ${subject} (${classLevel}) study question in ${selectedLang}...`}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isLoading || !chatInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {isLoading ? 'Thinking...' : 'Send'}
            </button>
          </form>
        </div>
      )}

      {/* ================================================================= */}
      {/* 9. AI ADMIN OVERVIEW & CONFIGURATION PANEL                        */}
      {/* ================================================================= */}
      {activeTab === 'admin' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>AI Admin — Models, Permissions, Usage &amp; Configuration</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Monitor AI tool usage, manage active AI model preferences, daily request limits, and prompt templates. Server-side Gemini integration keeps API keys strictly on the backend.
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              {isAdmin ? 'Administrator Mode' : 'Read-Only Analytics'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">Total AI Requests</p>
              <p className="text-2xl font-black mt-1">{totalAiGenerations}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">Saved Materials</p>
              <p className="text-2xl font-black mt-1 text-emerald-600 dark:text-emerald-400">
                {savedItems.length + savedEditablePlans.length}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">Studio Modules</p>
              <p className="text-2xl font-black mt-1 text-indigo-600 dark:text-indigo-400">
                {ALPHABETICAL_STUDIO_MODULES.length}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">Daily Limit</p>
              <p className="text-2xl font-black mt-1">{aiDailyLimit}</p>
            </div>
          </div>

          {/* Model, Limits & Prompt Template Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <h3 className="font-bold text-sm">AI Model Provider &amp; Usage Quota</h3>
              <div>
                <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Active Server AI Provider
                </label>
                <select
                  value={aiModelProvider}
                  disabled={!isAdmin}
                  onChange={(e) => {
                    setAiModelProvider(e.target.value);
                    try {
                      localStorage.setItem('sm_studio_ai_provider_v1', e.target.value);
                    } catch {
                      // ignore
                    }
                    notify('Updated studio AI provider preference.');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-60"
                >
                  <option value="Google Gemini (gemini-4-hydrogen)">Google Gemini (gemini-4-hydrogen · Recommended)</option>
                  <option value="Google Gemini Multilingual Balanced">Google Gemini Multilingual Balanced (English/Urdu/Kashmiri)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Daily AI Generation Quota per Teacher
                </label>
                <input
                  type="number"
                  min={10}
                  max={1000}
                  disabled={!isAdmin}
                  value={aiDailyLimit}
                  onChange={(e) => {
                    const next = Math.max(10, Math.min(1000, Number(e.target.value) || 100));
                    setAiDailyLimit(next);
                    try {
                      localStorage.setItem('sm_studio_ai_limit_v1', String(next));
                    } catch {
                      // ignore
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Curriculum Prompt Template Prefix
                </label>
                <textarea
                  rows={2}
                  disabled={!isAdmin}
                  value={customPromptPrefix}
                  onChange={(e) => {
                    setCustomPromptPrefix(e.target.value);
                    try {
                      localStorage.setItem('sm_studio_prompt_template_v1', e.target.value);
                    } catch {
                      // ignore
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h3 className="font-bold text-sm">Usage Breakdown by AI Feature</h3>
                {Object.entries(usageStats).map(([key, count]) => (
                  <div key={key} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                    <span className="capitalize">{key.replace('_', ' ')}</span>
                    <span className="font-mono tabular-nums font-bold">{count}</span>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h3 className="font-bold text-sm">Configured Languages, Roles &amp; Endpoints</h3>
                <p className="text-slate-600 dark:text-slate-300">
                  <strong>Languages:</strong> English (LTR), Urdu (Perso-Arabic RTL), Kashmiri (Perso-Arabic RTL &amp; Devanagari LTR).
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  <strong>Subjects:</strong> {SUBJECT_CARDS.map((s) => s.name).join(', ')}.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  <strong>Protected Server Routes:</strong>{' '}
                  <span className="font-mono">/api/smart-edu/generate</span>,{' '}
                  <span className="font-mono">/api/smart-edu/diary/generate</span>,{' '}
                  <span className="font-mono">/api/ai/ocr-extract</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Role-Based Module Permissions & Reusable Prompt Templates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
              <h3 className="font-bold text-sm">Student Module Access Permissions</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Control which AI Studio modules are accessible to Student accounts without modifying source code.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CORE_12_STUDIO_MODULES.filter((m) => m.id !== 'admin' && m.id !== 'home').map((mod) => {
                  const enabled =
                    studentModuleOverrides[mod.id] !== undefined
                      ? studentModuleOverrides[mod.id]
                      : Boolean(mod.studentAllowed);
                  return (
                    <label
                      key={mod.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      <span className="font-semibold truncate">{mod.title}</span>
                      <input
                        type="checkbox"
                        disabled={!isAdmin}
                        checked={enabled}
                        onChange={(e) => {
                          const next = { ...studentModuleOverrides, [mod.id]: e.target.checked };
                          setStudentModuleOverrides(next);
                          try {
                            localStorage.setItem('sm_studio_student_perms_v1', JSON.stringify(next));
                          } catch {
                            // ignore
                          }
                          notify(`Updated student access for ${mod.title}.`);
                        }}
                        className="accent-indigo-600"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
              <h3 className="font-bold text-sm">Prompt Templates Manager</h3>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {promptTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-bold truncate">{tpl.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">{tpl.body}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => {
                          setCustomPromptPrefix(tpl.body);
                          try {
                            localStorage.setItem('sm_studio_prompt_template_v1', tpl.body);
                          } catch {
                            // ignore
                          }
                          notify(`Applied prompt template "${tpl.name}".`);
                        }}
                        className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-50"
                      >
                        Apply
                      </button>
                      {isAdmin && promptTemplates.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = promptTemplates.filter((x) => x.id !== tpl.id);
                            setPromptTemplates(next);
                            try {
                              localStorage.setItem('sm_studio_prompt_templates_list_v1', JSON.stringify(next));
                            } catch {
                              // ignore
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          aria-label={`Delete template ${tpl.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="New template name (e.g., Urdu Nastaleeq Poetry Style)"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newTemplateBody}
                      onChange={(e) => setNewTemplateBody(e.target.value)}
                      placeholder="Prompt instruction text..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                    <button
                      type="button"
                      disabled={!newTemplateName.trim() || !newTemplateBody.trim()}
                      onClick={() => {
                        const next = [
                          ...promptTemplates,
                          { id: `tpl-${Date.now()}`, name: newTemplateName.trim(), body: newTemplateBody.trim() },
                        ];
                        setPromptTemplates(next);
                        try {
                          localStorage.setItem('sm_studio_prompt_templates_list_v1', JSON.stringify(next));
                        } catch {
                          // ignore
                        }
                        setNewTemplateName('');
                        setNewTemplateBody('');
                        notify('Added new AI prompt template.');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recent AI Generation History & Report Export */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm">AI Generation Activity History &amp; Reports</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Audit log of recent AI studio generations across modules.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const reportText = [
                    `School: ${school.name} (${school.code}) · Academic Session: ${school.academicSession}`,
                    `Active Provider: ${aiModelProvider} | Daily Quota: ${aiDailyLimit}`,
                    `Total AI Requests: ${totalAiGenerations} | Saved Materials: ${savedItems.length + savedEditablePlans.length}`,
                    '',
                    'Usage Breakdown:',
                    ...Object.entries(usageStats).map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`),
                    '',
                    'Recent Activity Log:',
                    ...(aiHistoryLog.length > 0
                      ? aiHistoryLog.map(
                          (h) => `${new Date(h.timestamp).toLocaleString()} | ${h.actor} | ${h.mode} | ${h.subject} (${h.classLevel}) — ${h.summary}`
                        )
                      : ['No generation events recorded yet.']),
                  ].join('\n');
                  void handleDownloadPdf('AI Studio Usage & Activity Report', reportText, false, 'English');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export AI Activity Report (PDF)</span>
              </button>
            </div>
            {aiHistoryLog.length === 0 ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                No AI requests logged in this session yet. Generate a Lesson Plan, Q&amp;A, Note, or Worksheet to view activity logs here.
              </p>
            ) : (
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {aiHistoryLog.slice(0, 15).map((entry) => (
                  <div key={entry.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold capitalize">{entry.mode.replace(/_/g, ' ')}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {' '}· {entry.subject} ({entry.classLevel}) · {entry.actor}
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{entry.summary}</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
        </div>
      </div>

      {/* Mobile Bottom Quick-Navigation Bar */}
      <nav
        aria-label="Studio Mobile Quick Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 flex items-center justify-around"
      >
        {[
          { id: 'home' as SmartEduTab, label: 'Home', icon: Home },
          { id: 'science_handwritten' as SmartEduTab, label: 'Science', icon: FlaskConical },
          { id: 'ai_ocr' as SmartEduTab, label: 'OCR', icon: ScanText },
          { id: 'lesson_plan' as SmartEduTab, label: 'Lesson', icon: ClipboardList },
          { id: 'saved' as SmartEduTab, label: 'Saved', icon: Bookmark },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => openModule(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-bold transition-colors ${
                active
                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
