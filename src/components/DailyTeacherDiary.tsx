import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  Calendar,
  Plus,
  Edit3,
  Trash2,
  Save,
  Search,
  Printer,
  Download,
  FileSpreadsheet,
  X,
  Globe,
  AlertCircle,
  Archive,
  Sparkles,
  Camera,
  ScanText,
  Image as ImageIcon,
  Share2,
  Copy,
  History,
  CheckCircle2,
  Eye,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { SchoolProfile, User } from '../types';
import {
  StudioUploadedImage,
  extractBase64Payload,
  printHtmlDocumentSafely,
} from '../utils/studioMediaStore';
import { exportAllDiaryRecordsZip } from '../utils/diaryZipExport';
import { guardSensitiveExport } from '../utils/biometricProtection';
import {
  BrandedDocumentSection,
  exportBrandedSchoolJpeg,
  exportBrandedSchoolPdf,
} from '../utils/schoolDocumentExport';
import { StudioImageUploader } from './StudioImageUploader';
import { SchoolEmblem } from './SchoolEmblem';

export type DiaryLang = 'English' | 'Urdu' | 'Kashmiri';
export type DiaryKashmiriScript = 'perso-arabic' | 'devanagari';

export interface DiaryAuditLogItem {
  timestamp: string;
  action: 'CREATED' | 'UPDATED' | 'AI_GENERATED' | 'DUPLICATED';
  actorName: string;
  summary: string;
}

export interface DailyTeacherDiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  lessonName: string;
  lessonNo: string;
  topic: string;
  subTopic: string;
  classNumber?: string;
  section?: string;
  subject?: string;
  academicSession?: string;
  lessonIntroduction?: string;
  learningObjectives?: string;
  topicsCovered?: string;
  teachingMethodology?: string;
  classroomTeachingActivities?: string;
  lessonExplanation?: string;
  teachingLearningMaterials?: string;
  studentParticipationActivities?: string;
  learningOutcomes?: string;
  homeworkAssigned?: string;
  teachersRemarks?: string;
  dailyTeachingSummary?: string;
  ocrExtractedText?: string;
  auditHistory?: DiaryAuditLogItem[];
  language: DiaryLang;
  kashmiriScript: DiaryKashmiriScript;
  teacherName: string;
  createdAt: string;
  updatedAt: string;
}

const DIARY_STORAGE_KEY = 'sm_daily_teacher_diary_entries_v1';

const AI_DIARY_FIELDS: Array<{
  key: keyof Pick<
    DailyTeacherDiaryEntry,
    | 'lessonIntroduction'
    | 'learningObjectives'
    | 'topicsCovered'
    | 'teachingMethodology'
    | 'classroomTeachingActivities'
    | 'lessonExplanation'
    | 'teachingLearningMaterials'
    | 'studentParticipationActivities'
    | 'learningOutcomes'
    | 'homeworkAssigned'
    | 'teachersRemarks'
    | 'dailyTeachingSummary'
  >;
  label: string;
  rows: number;
}> = [
  { key: 'lessonIntroduction', label: '1. Lesson Introduction', rows: 2 },
  { key: 'learningObjectives', label: '2. Learning Objectives', rows: 2 },
  { key: 'topicsCovered', label: '3. Topics Covered', rows: 2 },
  { key: 'teachingMethodology', label: '4. Teaching Methodology', rows: 2 },
  { key: 'classroomTeachingActivities', label: '5. Classroom Teaching Activities', rows: 3 },
  { key: 'lessonExplanation', label: '6. Explanation of the Lesson', rows: 3 },
  { key: 'teachingLearningMaterials', label: '7. Teaching-Learning Materials (TLM)', rows: 2 },
  { key: 'studentParticipationActivities', label: '8. Student Participation Activities', rows: 2 },
  { key: 'learningOutcomes', label: '9. Learning Outcomes', rows: 2 },
  { key: 'homeworkAssigned', label: '10. Homework Assigned', rows: 2 },
  { key: 'teachersRemarks', label: "11. Teacher's Remarks (Editable)", rows: 2 },
  { key: 'dailyTeachingSummary', label: '12. Daily Teaching Summary', rows: 2 },
];

interface DailyTeacherDiaryProps {
  school: SchoolProfile;
  currentUser: User;
  defaultLanguage: DiaryLang;
  defaultKashmiriScript: DiaryKashmiriScript;
  defaultSubject?: string;
  defaultClassLevel?: string;
  onDownloadPdf: (title: string, text: string, isRtl: boolean, lang: DiaryLang) => Promise<void>;
  onSaveToLibrary?: (title: string, content: string, isRtl: boolean) => void;
  onNotify: (msg: string) => void;
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const DailyTeacherDiary: React.FC<DailyTeacherDiaryProps> = ({
  school,
  currentUser,
  defaultLanguage,
  defaultKashmiriScript,
  defaultSubject = 'Science',
  defaultClassLevel = 'Class 8',
  onSaveToLibrary,
  onNotify,
}) => {
  const todayIso = useMemo(() => getTodayIso(), []);

  // Automatically derive default class, section, and subject from existing school/user profile
  const availableClasses = useMemo(() => {
    const fromSchool = (school.classesOffered || []).map((c) =>
      /^class\s/i.test(c) ? c : `Class ${c}`
    );
    return fromSchool.length > 0
      ? fromSchool
      : ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];
  }, [school.classesOffered]);

  const initialAssignedClass = useMemo(() => {
    const first = currentUser.assignedClasses?.[0];
    if (first) {
      const clsPart = first.split('-')[0].trim();
      return /^class\s/i.test(clsPart) ? clsPart : `Class ${clsPart}`;
    }
    return availableClasses.includes(defaultClassLevel) ? defaultClassLevel : availableClasses[0];
  }, [currentUser.assignedClasses, availableClasses, defaultClassLevel]);

  const initialAssignedSection = useMemo(() => {
    const first = currentUser.assignedClasses?.[0];
    if (first && first.includes('-')) {
      return first.split('-')[1].trim() || 'A';
    }
    return 'A';
  }, [currentUser.assignedClasses]);

  const availableSubjects = useMemo(() => {
    const base = ['English', 'Urdu', 'Science', 'Mathematics', 'Social Science', 'Kashmiri', 'Hindi', 'Environmental Science'];
    const assigned = currentUser.assignedSubjects || [];
    return Array.from(new Set([...assigned, ...base]));
  }, [currentUser.assignedSubjects]);

  const [entries, setEntries] = useState<DailyTeacherDiaryEntry[]>(() => {
    try {
      const raw = localStorage.getItem(DIARY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as DailyTeacherDiaryEntry[]) : [];
    } catch {
      return [];
    }
  });

  // Minimal Required Teacher Inputs: Date + Lesson Name / Topic
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(todayIso);
  const [lessonName, setLessonName] = useState<string>('');
  const [lessonNo, setLessonNo] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [subTopic, setSubTopic] = useState<string>('');
  const [classNumber, setClassNumber] = useState<string>(initialAssignedClass);
  const [section, setSection] = useState<string>(initialAssignedSection);
  const [subject, setSubject] = useState<string>(
    currentUser.assignedSubjects?.[0] || defaultSubject || 'Science'
  );
  const [entryLang, setEntryLang] = useState<DiaryLang>(defaultLanguage);
  const [entryScript, setEntryScript] = useState<DiaryKashmiriScript>(defaultKashmiriScript);

  // 12 Editable AI-Generated Diary Sections
  const [aiFields, setAiFields] = useState<Record<string, string>>({});
  const [showRichSections, setShowRichSections] = useState<boolean>(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiGeneratedFlag, setAiGeneratedFlag] = useState<boolean>(false);

  // Camera & Gallery OCR Integration
  const [showOcrPanel, setShowOcrPanel] = useState<boolean>(false);
  const [diaryImages, setDiaryImages] = useState<StudioUploadedImage[]>([]);
  const [isExtractingOcr, setIsExtractingOcr] = useState<boolean>(false);
  const [ocrText, setOcrText] = useState<string>('');
  const [ocrQualityNote, setOcrQualityNote] = useState<string | null>(null);
  const [ocrVerifiedByTeacher, setOcrVerifiedByTeacher] = useState<boolean>(false);

  // Export & View States
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [isExportingDoc, setIsExportingDoc] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'all'>('all');
  const [searchDate, setSearchDate] = useState<string>('');
  const [searchMonth, setSearchMonth] = useState<string>(todayIso.slice(0, 7));
  const [searchClassFilter, setSearchClassFilter] = useState<string>('ALL');
  const [searchSubjectFilter, setSearchSubjectFilter] = useState<string>('ALL');
  const [searchTeacherFilter, setSearchTeacherFilter] = useState<string>('');
  const [keywordQuery, setKeywordQuery] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DailyTeacherDiaryEntry | null>(null);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<DailyTeacherDiaryEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<DailyTeacherDiaryEntry | null>(null);

  // Sync with server-side persistent diary store on mount
  useEffect(() => {
    let active = true;
    void fetch('/api/smart-edu/diary')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.ok || !Array.isArray(data.entries)) return;
        setEntries((prev) => {
          const map = new Map<string, DailyTeacherDiaryEntry>();
          prev.forEach((e) => map.set(e.id, e));
          (data.entries as DailyTeacherDiaryEntry[]).forEach((srv) => {
            const existing = map.get(srv.id);
            if (!existing || (srv.updatedAt || '') >= (existing.updatedAt || '')) {
              map.set(srv.id, srv);
            }
          });
          return Array.from(map.values()).sort((a, b) => {
            const dCmp = b.date.localeCompare(a.date);
            return dCmp !== 0 ? dCmp : (b.updatedAt || '').localeCompare(a.updatedAt || '');
          });
        });
      })
      .catch(() => {
        // Offline or server unavailable; localStorage copy remains intact
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Ignore storage quota errors
    }
  }, [entries]);

  const isFormRtl =
    entryLang === 'Urdu' || (entryLang === 'Kashmiri' && entryScript === 'perso-arabic');

  const hasUnclearOcrMarkers = useMemo(
    () => /\[\?\]|\[unclear\]|\?\?\?|illegible/i.test(ocrText),
    [ocrText]
  );

  // Check accidental duplicate entry on same date + class + subject + lesson
  useEffect(() => {
    if (editingId || !date.trim() || !lessonName.trim()) {
      setDuplicateWarning(null);
      return;
    }
    const found = entries.find(
      (e) =>
        e.date === date.trim() &&
        (e.classNumber || '') === classNumber &&
        (e.subject || '') === subject &&
        e.lessonName.toLowerCase().trim() === lessonName.toLowerCase().trim()
    );
    setDuplicateWarning(found || null);
  }, [date, lessonName, classNumber, subject, editingId, entries]);

  const resetForm = (keepDate = true) => {
    setEditingId(null);
    if (!keepDate) setDate(todayIso);
    setLessonName('');
    setLessonNo('');
    setTopic('');
    setSubTopic('');
    setAiFields({});
    setShowRichSections(false);
    setAiGeneratedFlag(false);
    setOcrText('');
    setOcrQualityNote(null);
    setOcrVerifiedByTeacher(false);
    setDiaryImages([]);
    setFormError(null);
    setDuplicateWarning(null);
  };

  // Extract OCR text from captured/uploaded textbook pages or handwritten notes
  const handleRunDiaryOcr = async () => {
    const selected = diaryImages.filter((i) => i.selectedForAi);
    const targets = selected.length > 0 ? selected : diaryImages;
    if (targets.length === 0) {
      setFormError('Capture a photo with Camera or upload an image from Gallery first.');
      return;
    }
    setFormError(null);
    setIsExtractingOcr(true);
    try {
      const combinedParts: string[] = [];
      let latestNote: string | null = null;

      for (let i = 0; i < targets.length; i++) {
        const img = targets[i];
        const { base64, mimeType } = extractBase64Payload(img.dataUrl);
        const res = await fetch('/api/ai/ocr-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mimeType: mimeType || 'image/jpeg',
            base64Data: base64,
            fileName: img.name,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || `OCR extraction failed on page ${i + 1}.`);
        }
        if (targets.length > 1) {
          combinedParts.push(`--- Page ${i + 1} (${img.name}) ---\n${data.extractedText || ''}`);
        } else {
          combinedParts.push(data.extractedText || '');
        }
        if (data.qualityNote) latestNote = data.qualityNote;
      }

      setOcrText(combinedParts.join('\n\n').trim());
      setOcrQualityNote(
        latestNote ||
          'Review and verify all extracted text carefully (especially any unclear handwriting) before generating the diary.'
      );
      setOcrVerifiedByTeacher(false);
      onNotify(`Extracted text from ${targets.length} page${targets.length === 1 ? '' : 's'}. Review and edit before sending to AI.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to extract OCR text.');
    } finally {
      setIsExtractingOcr(false);
    }
  };

  // Automatic AI Generation using ONLY Date + Lesson Name (+ optional verified OCR text)
  const handleGenerateAiDiary = async () => {
    if (!date.trim() || !lessonName.trim()) {
      setFormError('Enter Date and Lesson Name / Topic to automatically generate the Daily Teacher Diary.');
      return;
    }
    if (ocrText.trim() && !ocrVerifiedByTeacher) {
      setFormError('Please review the OCR-extracted text and check "I have verified the OCR text" before sending it to AI.');
      return;
    }
    setFormError(null);
    setIsGeneratingAi(true);
    try {
      const res = await fetch('/api/smart-edu/diary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: date.trim(),
          lessonName: lessonName.trim(),
          classNumber,
          section,
          subject,
          teacherName: currentUser.name || 'Teacher',
          schoolName: school.name || '',
          academicSession: school.academicSession || '',
          language: entryLang,
          kashmiriScript: entryScript,
          ocrExtractedText: ocrVerifiedByTeacher ? ocrText.trim() : '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.diary) {
        throw new Error(data?.error || 'AI diary generation failed.');
      }
      const d = data.diary;
      if (!topic.trim() && d.topic) setTopic(d.topic);
      if (!subTopic.trim() && d.subTopic) setSubTopic(d.subTopic);
      setAiFields({
        lessonIntroduction: d.lessonIntroduction || '',
        learningObjectives: d.learningObjectives || '',
        topicsCovered: d.topicsCovered || '',
        teachingMethodology: d.teachingMethodology || '',
        classroomTeachingActivities: d.classroomTeachingActivities || '',
        lessonExplanation: d.lessonExplanation || '',
        teachingLearningMaterials: d.teachingLearningMaterials || '',
        studentParticipationActivities: d.studentParticipationActivities || '',
        learningOutcomes: d.learningOutcomes || '',
        homeworkAssigned: d.homeworkAssigned || '',
        teachersRemarks: d.teachersRemarks || '',
        dailyTeachingSummary: d.dailyTeachingSummary || '',
      });
      setShowRichSections(true);
      setAiGeneratedFlag(true);
      onNotify("Generated complete Daily Teacher's Diary draft. Review, edit if needed, and click Save.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to generate Daily Teacher Diary.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date.trim() || !lessonName.trim()) {
      setFormError('Please fill in Date and Lesson Name / Topic.');
      return;
    }
    setFormError(null);

    const now = new Date().toISOString();
    const existing = editingId ? entries.find((item) => item.id === editingId) : null;
    const auditEvent: DiaryAuditLogItem = {
      timestamp: now,
      action: editingId ? 'UPDATED' : aiGeneratedFlag ? 'AI_GENERATED' : 'CREATED',
      actorName: currentUser.name || 'Teacher',
      summary: editingId
        ? `Updated diary record for ${lessonName.trim()} (${classNumber}-${section}, ${subject})`
        : `${aiGeneratedFlag ? 'Saved AI-generated' : 'Created'} diary record for ${lessonName.trim()} (${classNumber}-${section}, ${subject})`,
    };

    const record: DailyTeacherDiaryEntry = {
      id: editingId || `diary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: date.trim(),
      lessonName: lessonName.trim(),
      lessonNo: lessonNo.trim() || '-',
      topic: topic.trim() || lessonName.trim(),
      subTopic: subTopic.trim() || '-',
      classNumber,
      section,
      subject,
      academicSession: school.academicSession,
      lessonIntroduction: aiFields.lessonIntroduction || '',
      learningObjectives: aiFields.learningObjectives || '',
      topicsCovered: aiFields.topicsCovered || '',
      teachingMethodology: aiFields.teachingMethodology || '',
      classroomTeachingActivities: aiFields.classroomTeachingActivities || '',
      lessonExplanation: aiFields.lessonExplanation || '',
      teachingLearningMaterials: aiFields.teachingLearningMaterials || '',
      studentParticipationActivities: aiFields.studentParticipationActivities || '',
      learningOutcomes: aiFields.learningOutcomes || '',
      homeworkAssigned: aiFields.homeworkAssigned || '',
      teachersRemarks: aiFields.teachersRemarks || '',
      dailyTeachingSummary: aiFields.dailyTeachingSummary || '',
      ocrExtractedText: ocrVerifiedByTeacher ? ocrText.trim() : existing?.ocrExtractedText || '',
      auditHistory: [auditEvent, ...(existing?.auditHistory || [])].slice(0, 20),
      language: entryLang,
      kashmiriScript: entryScript,
      teacherName: currentUser.name || 'Teacher',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    setEntries((prev) => {
      const next = editingId
        ? prev.map((item) => (item.id === editingId ? record : item))
        : [record, ...prev];
      return next.sort((a, b) => {
        const dCmp = b.date.localeCompare(a.date);
        return dCmp !== 0 ? dCmp : (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
    });

    try {
      const url = editingId ? `/api/smart-edu/diary/${encodeURIComponent(record.id)}` : '/api/smart-edu/diary';
      await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch {
      // Saved locally even if offline
    }

    if (onSaveToLibrary && !editingId) {
      const diarySummaryBody = buildSectionsForEntry(record)
        .map((sec) => `${sec.heading}\n${sec.body}`)
        .join('\n\n');
      const entryRtl =
        record.language === 'Urdu' ||
        (record.language === 'Kashmiri' && record.kashmiriScript === 'perso-arabic');
      onSaveToLibrary(
        `Daily Diary (${record.date}): ${record.lessonName}`,
        diarySummaryBody,
        entryRtl
      );
    }

    onNotify(editingId ? 'Diary entry updated and saved.' : "New Daily Teacher's Diary entry saved.");
    resetForm(true);
  };

  const handleEditEntry = (entry: DailyTeacherDiaryEntry) => {
    setEditingId(entry.id);
    setDate(entry.date);
    setLessonName(entry.lessonName);
    setLessonNo(entry.lessonNo === '-' ? '' : entry.lessonNo);
    setTopic(entry.topic || '');
    setSubTopic(entry.subTopic === '-' ? '' : entry.subTopic);
    if (entry.classNumber) setClassNumber(entry.classNumber);
    if (entry.section) setSection(entry.section);
    if (entry.subject) setSubject(entry.subject);
    setEntryLang(entry.language || 'English');
    setEntryScript(entry.kashmiriScript || 'perso-arabic');
    const loadedAi: Record<string, string> = {};
    let hasAnyRich = false;
    AI_DIARY_FIELDS.forEach((f) => {
      const val = String(entry[f.key] || '');
      loadedAi[f.key] = val;
      if (val.trim()) hasAnyRich = true;
    });
    setAiFields(loadedAi);
    setShowRichSections(hasAnyRich);
    if (entry.ocrExtractedText) {
      setOcrText(entry.ocrExtractedText);
      setOcrVerifiedByTeacher(true);
    }
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDuplicateEntry = async (entry: DailyTeacherDiaryEntry) => {
    const now = new Date().toISOString();
    const copyRecord: DailyTeacherDiaryEntry = {
      ...entry,
      id: `diary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: todayIso,
      lessonName: `${entry.lessonName} (Copy)`,
      teacherName: currentUser.name || entry.teacherName,
      academicSession: school.academicSession,
      createdAt: now,
      updatedAt: now,
      auditHistory: [
        {
          timestamp: now,
          action: 'DUPLICATED' as const,
          actorName: currentUser.name || 'Teacher',
          summary: `Duplicated from ${entry.date} (${entry.lessonName})`,
        },
        ...(entry.auditHistory || []),
      ].slice(0, 20),
    };
    setEntries((prev) => [copyRecord, ...prev]);
    try {
      await fetch('/api/smart-edu/diary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(copyRecord),
      });
    } catch {
      // Saved locally
    }
    onNotify(`Duplicated diary entry for ${todayIso}.`);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteEntry) return;
    const targetId = confirmDeleteEntry.id;
    setEntries((prev) => prev.filter((item) => item.id !== targetId));
    if (editingId === targetId) resetForm(true);
    if (viewingEntry?.id === targetId) setViewingEntry(null);
    setConfirmDeleteEntry(null);

    try {
      await fetch(`/api/smart-edu/diary/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
    } catch {
      // Already deleted locally
    }
    onNotify('Diary entry permanently deleted.');
  };

  const filteredEntries = useMemo(() => {
    const q = keywordQuery.trim().toLowerCase();
    const teacherQ = searchTeacherFilter.trim().toLowerCase();
    return entries.filter((entry) => {
      if (viewMode === 'daily') {
        const activeDay = searchDate || date || todayIso;
        if (entry.date !== activeDay) return false;
      } else if (viewMode === 'monthly') {
        if (searchMonth && !entry.date.startsWith(searchMonth)) return false;
      } else {
        if (searchDate && entry.date !== searchDate) return false;
      }
      if (searchClassFilter !== 'ALL' && (entry.classNumber || '') !== searchClassFilter) return false;
      if (searchSubjectFilter !== 'ALL' && (entry.subject || '') !== searchSubjectFilter) return false;
      if (teacherQ && !(entry.teacherName || '').toLowerCase().includes(teacherQ)) return false;
      if (q) {
        const hay = `${entry.date} ${entry.lessonNo} ${entry.lessonName} ${entry.topic} ${entry.subTopic} ${entry.classNumber || ''} ${entry.subject || ''} ${entry.teacherName || ''} ${entry.dailyTeachingSummary || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    entries,
    viewMode,
    searchDate,
    searchMonth,
    searchClassFilter,
    searchSubjectFilter,
    searchTeacherFilter,
    keywordQuery,
    date,
    todayIso,
  ]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, DailyTeacherDiaryEntry[]>();
    filteredEntries.forEach((entry) => {
      const bucket = groups.get(entry.date) || [];
      bucket.push(entry);
      groups.set(entry.date, bucket);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredEntries]);

  const buildSectionsForEntry = (entry: DailyTeacherDiaryEntry): BrandedDocumentSection[] => {
    const sections: BrandedDocumentSection[] = [
      {
        heading: 'Lesson Identification',
        body: [
          `Lesson Name: ${entry.lessonName}`,
          entry.lessonNo && entry.lessonNo !== '-' ? `Lesson No.: ${entry.lessonNo}` : '',
          entry.topic ? `Topic: ${entry.topic}` : '',
          entry.subTopic && entry.subTopic !== '-' ? `Sub-topic: ${entry.subTopic}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];
    AI_DIARY_FIELDS.forEach((f) => {
      const val = String(entry[f.key] || '').trim();
      if (val) {
        sections.push({ heading: f.label, body: val });
      }
    });
    return sections;
  };

  const getActiveExportTarget = (explicitEntry?: DailyTeacherDiaryEntry): DailyTeacherDiaryEntry | null => {
    if (explicitEntry) return explicitEntry;
    if (lessonName.trim()) {
      return {
        id: editingId || 'draft',
        date,
        lessonName: lessonName.trim(),
        lessonNo: lessonNo.trim() || '-',
        topic: topic.trim() || lessonName.trim(),
        subTopic: subTopic.trim() || '-',
        classNumber,
        section,
        subject,
        academicSession: school.academicSession,
        lessonIntroduction: aiFields.lessonIntroduction,
        learningObjectives: aiFields.learningObjectives,
        topicsCovered: aiFields.topicsCovered,
        teachingMethodology: aiFields.teachingMethodology,
        classroomTeachingActivities: aiFields.classroomTeachingActivities,
        lessonExplanation: aiFields.lessonExplanation,
        teachingLearningMaterials: aiFields.teachingLearningMaterials,
        studentParticipationActivities: aiFields.studentParticipationActivities,
        learningOutcomes: aiFields.learningOutcomes,
        homeworkAssigned: aiFields.homeworkAssigned,
        teachersRemarks: aiFields.teachersRemarks,
        dailyTeachingSummary: aiFields.dailyTeachingSummary,
        language: entryLang,
        kashmiriScript: entryScript,
        teacherName: currentUser.name || 'Teacher',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return filteredEntries[0] || entries[0] || null;
  };

  const handleExportBrandedPdf = async (explicitEntry?: DailyTeacherDiaryEntry) => {
    const target = getActiveExportTarget(explicitEntry);
    if (!target) {
      setFormError('Enter or save a diary entry before downloading PDF.');
      return;
    }
    setIsExportingDoc(true);
    try {
      const isRtl =
        target.language === 'Urdu' ||
        (target.language === 'Kashmiri' && target.kashmiriScript === 'perso-arabic');
      const { exported } = await exportBrandedSchoolPdf({
        school,
        documentType: "DAILY TEACHER'S DIARY",
        title: target.lessonName,
        teacherName: target.teacherName || currentUser.name,
        className: target.classNumber || classNumber,
        section: target.section || section,
        subject: target.subject || subject,
        date: target.date,
        isRtl,
        sections: buildSectionsForEntry(target),
        filenameBase: `Daily_Teachers_Diary_${target.date}_${target.lessonName}`,
      });
      if (exported) onNotify("Downloaded branded Daily Teacher's Diary PDF.");
    } finally {
      setIsExportingDoc(false);
    }
  };

  const handleExportBrandedJpeg = async (explicitEntry?: DailyTeacherDiaryEntry) => {
    const target = getActiveExportTarget(explicitEntry);
    if (!target) {
      setFormError('Enter or save a diary entry before downloading JPEG.');
      return;
    }
    setIsExportingDoc(true);
    try {
      const isRtl =
        target.language === 'Urdu' ||
        (target.language === 'Kashmiri' && target.kashmiriScript === 'perso-arabic');
      const { exported, pageCount } = await exportBrandedSchoolJpeg({
        school,
        documentType: "DAILY TEACHER'S DIARY",
        title: target.lessonName,
        teacherName: target.teacherName || currentUser.name,
        className: target.classNumber || classNumber,
        section: target.section || section,
        subject: target.subject || subject,
        date: target.date,
        isRtl,
        sections: buildSectionsForEntry(target),
        filenameBase: `Daily_Teachers_Diary_${target.date}_${target.lessonName}`,
      });
      if (exported) {
        onNotify(`Downloaded branded Daily Teacher's Diary JPEG (${pageCount} page${pageCount === 1 ? '' : 's'}).`);
      }
    } finally {
      setIsExportingDoc(false);
    }
  };

  const handleShareDiary = async (explicitEntry?: DailyTeacherDiaryEntry) => {
    const target = getActiveExportTarget(explicitEntry);
    if (!target) {
      setFormError('Enter or save a diary entry before sharing.');
      return;
    }
    const sectionsText = buildSectionsForEntry(target)
      .map((s) => `${s.heading}\n${s.body}`)
      .join('\n\n');
    const fullText = [
      `${school.name} (Session: ${school.academicSession})`,
      `DAILY TEACHER'S DIARY — ${target.date}`,
      `Teacher: ${target.teacherName} | Class: ${target.classNumber || classNumber}-${target.section || section} | Subject: ${target.subject || subject}`,
      '',
      sectionsText,
    ].join('\n');

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Daily Teacher's Diary — ${target.lessonName}`, text: fullText });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(fullText);
      onNotify("Copied formatted Daily Teacher's Diary to clipboard for sharing.");
    } catch {
      onNotify('Unable to access clipboard for sharing.');
    }
  };

  const handlePrintDiary = (explicitEntry?: DailyTeacherDiaryEntry) => {
    const single = explicitEntry ? [explicitEntry] : null;
    const targetList = single || (filteredEntries.length > 0 ? filteredEntries : entries);
    if (targetList.length === 0) {
      setFormError('Add at least one diary entry before printing.');
      return;
    }
    const logoTag =
      school.logoDataUrl && school.logoDataUrl.startsWith('data:image/')
        ? `<img src="${school.logoDataUrl}" alt="School Logo" style="width:56px;height:56px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0;padding:4px;background:#fff;" />`
        : '';

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Daily Teacher's Diary — ${escapeHtml(school.name)}</title>
<style>
  body { font-family: "Plus Jakarta Sans", "Noto Nastaliq Urdu", Arial, sans-serif; color: #0f172a; padding: 24px; }
  .header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0; }
  .sub { font-size: 12px; color: #475569; margin-top: 2px; }
  .entry { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; margin-bottom: 14px; page-break-inside: avoid; }
  .entry-meta { font-size: 11px; color: #334155; background: #f8fafc; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px; }
  .sec-title { font-size: 11px; font-weight: 700; color: #312e81; margin: 8px 0 2px 0; text-transform: uppercase; }
  .sec-body { font-size: 12px; white-space: pre-wrap; line-height: 1.5; }
  .rtl { direction: rtl; text-align: right; font-family: "Noto Nastaliq Urdu", "Noto Sans Arabic", serif; }
</style>
</head>
<body>
  <div class="header">
    ${logoTag}
    <div>
      <h1>${escapeHtml(school.name)} — DAILY TEACHER'S DIARY</h1>
      <div class="sub">${escapeHtml(school.address)} · U-DISE: ${escapeHtml(school.code)} · Academic Session: ${escapeHtml(school.academicSession)}</div>
    </div>
  </div>
  ${targetList
    .map((entry) => {
      const rtlClass =
        entry.language === 'Urdu' ||
        (entry.language === 'Kashmiri' && entry.kashmiriScript === 'perso-arabic')
          ? 'rtl'
          : '';
      const secs = buildSectionsForEntry(entry);
      return `<div class="entry">
        <div class="entry-meta">
          <strong>Date:</strong> ${escapeHtml(entry.date)} &nbsp;|&nbsp;
          <strong>Class:</strong> ${escapeHtml(entry.classNumber || '-')}-${escapeHtml(entry.section || '-')} &nbsp;|&nbsp;
          <strong>Subject:</strong> ${escapeHtml(entry.subject || '-')} &nbsp;|&nbsp;
          <strong>Teacher:</strong> ${escapeHtml(entry.teacherName)}
        </div>
        <div class="${rtlClass}">
          ${secs
            .map(
              (s) =>
                `<div class="sec-title">${escapeHtml(s.heading)}</div><div class="sec-body">${escapeHtml(s.body)}</div>`
            )
            .join('')}
        </div>
      </div>`;
    })
    .join('')}
</body>
</html>`;
    printHtmlDocumentSafely(html);
  };

  const handleDownloadCsv = async () => {
    const target = filteredEntries.length > 0 ? filteredEntries : entries;
    if (target.length === 0) return;
    const allowed = await guardSensitiveExport("Daily Teacher's Diary CSV Report");
    if (!allowed) return;
    const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    const csv = [
      'Date,Class,Section,Subject,No.,Lesson Name,Topic,Sub-topic,Learning Objectives,Homework,Summary,Teacher,Academic Session',
      ...target.map((e) =>
        [
          esc(e.date),
          esc(e.classNumber || ''),
          esc(e.section || ''),
          esc(e.subject || ''),
          esc(e.lessonNo),
          esc(e.lessonName),
          esc(e.topic),
          esc(e.subTopic),
          esc(e.learningObjectives || ''),
          esc(e.homeworkAssigned || ''),
          esc(e.dailyTeachingSummary || ''),
          esc(e.teacherName),
          esc(e.academicSession || school.academicSession),
        ].join(',')
      ),
    ].join('\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Daily_Teachers_Diary_${todayIso}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify("Downloaded Daily Teacher's Diary CSV.");
  };

  const handleDownloadAllRecordsZip = async () => {
    if (entries.length === 0) {
      setFormError('Add at least one diary entry before downloading all records.');
      return;
    }
    const allowed = await guardSensitiveExport("Daily Teacher's Diary Monthly PDFs (ZIP)");
    if (!allowed) return;
    setFormError(null);
    setIsExportingZip(true);
    try {
      const { monthCount, filename } = await exportAllDiaryRecordsZip({
        schoolName: school.name || 'AI Teaching & Learning Studio',
        schoolAddress: school.address,
        academicSession: school.academicSession,
        teacherName: currentUser.name,
        entries,
      });
      onNotify(
        `Downloaded ${filename} (${monthCount} monthly PDF document${monthCount === 1 ? '' : 's'} bundled).`
      );
    } catch {
      setFormError('Unable to generate the monthly PDF ZIP bundle. Please try again.');
    } finally {
      setIsExportingZip(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Automatic School Profile & Branding Strip (Single Source of Truth) */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {school.logoDataUrl ? (
            <div className="w-11 h-11 rounded-xl bg-white p-1 flex items-center justify-center shrink-0">
              <img
                src={school.logoDataUrl}
                alt={`${school.name} Logo`}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <SchoolEmblem size={42} />
          )}
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold truncate">{school.name}</h2>
            <p className="text-[11px] text-slate-300 truncate">
              {school.address} · U-DISE: {school.code} · Session: {school.academicSession}
            </p>
          </div>
        </div>
        <div className="text-[11px] sm:text-right shrink-0 text-slate-300">
          <p className="font-bold text-amber-300">Teacher: {currentUser.name}</p>
          <p>
            {classNumber}-{section} · {subject}
          </p>
        </div>
      </div>

      {/* Main AI-Powered Daily Teacher's Diary Composer */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpenCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Daily Teacher&apos;s Diary — Automatic AI Generator</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enter just the <strong>Date</strong> and <strong>Lesson Name / Topic</strong> — school branding, teacher name, class, subject &amp; academic session load automatically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowOcrPanel((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                showOcrPanel
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-800 dark:text-cyan-200 border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Direct Camera &amp; Gallery OCR</span>
            </button>
            <button
              type="button"
              disabled={isExportingDoc}
              onClick={() => void handleExportBrandedPdf()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 text-white"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              disabled={isExportingDoc}
              onClick={() => void handleExportBrandedJpeg()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>JPEG</span>
            </button>
            <button
              type="button"
              onClick={() => handlePrintDiary()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={() => void handleShareDiary()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadCsv()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              data-testid="diary-download-all-zip-btn"
              disabled={isExportingZip || entries.length === 0}
              onClick={() => void handleDownloadAllRecordsZip()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{isExportingZip ? 'Bundling Monthly PDFs...' : 'Download All Records'}</span>
            </button>
          </div>
        </div>

        {/* Camera & Gallery OCR Panel (Optional — feeds verified text into AI generation) */}
        {showOcrPanel && (
          <div className="p-4 rounded-2xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-extrabold text-cyan-900 dark:text-cyan-200 flex items-center gap-1.5">
                  <ScanText className="w-4 h-4" />
                  <span>Direct Camera &amp; Gallery Upload + OCR Text Extraction</span>
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Capture textbook pages or handwritten teaching notes, crop/rotate/enhance, extract text via OCR, verify any unclear words, and feed into AI Diary Generation.
                </p>
              </div>
              <button
                type="button"
                disabled={isExtractingOcr || diaryImages.length === 0}
                onClick={() => void handleRunDiaryOcr()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold disabled:opacity-50"
              >
                {isExtractingOcr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanText className="w-3.5 h-3.5" />}
                <span>{isExtractingOcr ? 'Extracting Text...' : 'Extract Text (OCR)'}</span>
              </button>
            </div>

            <StudioImageUploader
              images={diaryImages}
              onAddImages={(added) => setDiaryImages((prev) => [...prev, ...added])}
              onUpdateImage={(upd) => setDiaryImages((prev) => prev.map((i) => (i.id === upd.id ? upd : i)))}
              onDeleteImage={(id) => setDiaryImages((prev) => prev.filter((i) => i.id !== id))}
              onToggleSelect={(id) =>
                setDiaryImages((prev) =>
                  prev.map((i) => (i.id === id ? { ...i, selectedForAi: !i.selectedForAi } : i))
                )
              }
              compactTitle="Diary Reference Pages (Direct Camera / Gallery · JPG, JPEG, PNG, HEIC)"
              helperText="Scan one or multiple pages, crop & rotate, then click Extract Text (OCR)."
            />

            {ocrText && (
              <div className="space-y-2 pt-2 border-t border-cyan-200 dark:border-cyan-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Editable OCR Extracted Content (Verify Before AI Processing)
                  </label>
                  {hasUnclearOcrMarkers && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Unclear OCR markers detected — please review</span>
                    </span>
                  )}
                </div>
                {ocrQualityNote && (
                  <p className="text-[11px] text-cyan-800 dark:text-cyan-300">{ocrQualityNote}</p>
                )}
                <textarea
                  rows={4}
                  value={ocrText}
                  onChange={(e) => {
                    setOcrText(e.target.value);
                    setOcrVerifiedByTeacher(false);
                  }}
                  className={`w-full px-3 py-2 rounded-xl border text-xs bg-white dark:bg-slate-900 ${
                    hasUnclearOcrMarkers
                      ? 'border-amber-400 ring-1 ring-amber-300'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ocrVerifiedByTeacher}
                    onChange={(e) => setOcrVerifiedByTeacher(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>I have reviewed and verified the OCR-extracted text for AI Daily Diary generation</span>
                </label>
              </div>
            )}
          </div>
        )}

        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {duplicateWarning && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                An entry for <strong>{duplicateWarning.lessonName}</strong> ({duplicateWarning.date}) already exists. Load it to revise instead of creating a duplicate?
              </span>
            </span>
            <button
              type="button"
              onClick={() => handleEditEntry(duplicateWarning)}
              className="px-3 py-1 rounded-lg bg-amber-600 text-white font-bold text-[11px]"
            >
              Edit Existing Entry
            </button>
          </div>
        )}

        {/* Entry Form */}
        <form onSubmit={(e) => void handleSaveEntry(e)} className="space-y-4">
          {/* Row 1: Simple Teacher Input (Date + Lesson Name) + Generate Button */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
            <div className="md:col-span-3">
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              />
            </div>

            <div className="md:col-span-5">
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Lesson Name / Topic <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                dir={isFormRtl ? 'rtl' : 'ltr'}
                value={lessonName}
                onChange={(e) => setLessonName(e.target.value)}
                placeholder="e.g., Photosynthesis in Plants / Force and Pressure"
                required
                className={`w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 ${
                  isFormRtl ? 'font-urdu text-sm' : ''
                }`}
              />
            </div>

            <div className="md:col-span-4 flex items-end">
              <button
                type="button"
                data-testid="generate-daily-diary-btn"
                disabled={isGeneratingAi || !date.trim() || !lessonName.trim()}
                onClick={() => void handleGenerateAiDiary()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition-colors disabled:opacity-55"
              >
                {isGeneratingAi ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {isGeneratingAi ? 'Generating AI Diary...' : "Generate Daily Teacher's Diary"}
                </span>
              </button>
            </div>
          </div>

          {/* Row 2: Auto-Fetched Class, Section, Subject, Language & Optional Lesson No./Sub-topic */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Class</label>
              <select
                value={classNumber}
                onChange={(e) => setClassNumber(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {availableClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Section</label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {['A', 'B', 'C', 'D'].map((s) => (
                  <option key={s} value={s}>
                    Section {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Subject</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {availableSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Language</label>
              <select
                value={entryLang}
                onChange={(e) => setEntryLang(e.target.value as DiaryLang)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                <option value="English">English</option>
                <option value="Urdu">Urdu (اردو)</option>
                <option value="Kashmiri">Kashmiri (کٲشُر)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Lesson No. (Opt.)</label>
              <input
                type="text"
                value={lessonNo}
                onChange={(e) => setLessonNo(e.target.value)}
                placeholder="e.g., Ch. 4"
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Sub-topic (Opt.)</label>
              <input
                type="text"
                value={subTopic}
                onChange={(e) => setSubTopic(e.target.value)}
                placeholder="Optional sub-topic"
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>

          {entryLang === 'Kashmiri' && (
            <div className="flex items-center gap-2 text-xs">
              <Globe className="w-4 h-4 text-indigo-500" />
              <span className="font-semibold">Kashmiri Script:</span>
              <button
                type="button"
                onClick={() => setEntryScript('perso-arabic')}
                className={`px-2.5 py-1 rounded-lg font-semibold ${
                  entryScript === 'perso-arabic'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                Perso-Arabic (RTL)
              </button>
              <button
                type="button"
                onClick={() => setEntryScript('devanagari')}
                className={`px-2.5 py-1 rounded-lg font-semibold ${
                  entryScript === 'devanagari'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                Devanagari (LTR)
              </button>
            </div>
          )}

          {/* Toggle & Editable 12-Section AI Diary Editor */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowRichSections((v) => !v)}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {showRichSections
                  ? 'Hide Detailed 12-Section Editable Diary Fields'
                  : 'Show / Manually Edit All 12 Structured Diary Sections'}
              </button>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                All AI-generated entries are editable drafts — attendance is never marked automatically.
              </span>
            </div>

            {showRichSections && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {AI_DIARY_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                      {field.label}
                    </label>
                    <textarea
                      rows={field.rows}
                      dir={isFormRtl ? 'rtl' : 'ltr'}
                      value={aiFields[field.key] || ''}
                      onChange={(e) =>
                        setAiFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className={`w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 ${
                        isFormRtl ? 'font-urdu text-sm leading-loose' : ''
                      }`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{editingId ? 'Update Saved Diary' : 'Save Daily Diary Entry'}</span>
            </button>
            {(editingId || lessonName || showRichSections) && (
              <button
                type="button"
                onClick={() => resetForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Form</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Saved Daily & Monthly Diary Records + Search Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Saved Daily &amp; Monthly Diary Records ({filteredEntries.length})</span>
            </h3>
          </div>

          <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            {([
              { id: 'all', label: 'All Records' },
              { id: 'daily', label: 'Daily View' },
              { id: 'monthly', label: 'Monthly View' },
            ] as const).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setViewMode(m.id)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                  viewMode === m.id
                    ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search by Date, Month, Class, Subject, Teacher & Keyword */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={keywordQuery}
              onChange={(e) => setKeywordQuery(e.target.value)}
              placeholder="Search lesson / topic..."
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>

          {viewMode === 'monthly' ? (
            <input
              type="month"
              value={searchMonth}
              onChange={(e) => setSearchMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          ) : (
            <input
              type="date"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          )}

          <select
            value={searchClassFilter}
            onChange={(e) => setSearchClassFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          >
            <option value="ALL">All Classes</option>
            {availableClasses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={searchSubjectFilter}
            onChange={(e) => setSearchSubjectFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          >
            <option value="ALL">All Subjects</option>
            {availableSubjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={searchTeacherFilter}
            onChange={(e) => setSearchTeacherFilter(e.target.value)}
            placeholder="Filter by teacher..."
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        </div>

        {groupedByDate.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No diary entries match the current filters. Enter a Date &amp; Lesson Name above and click <strong>Generate Daily Teacher&apos;s Diary</strong> to start.
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByDate.map(([dateKey, dayEntries]) => (
              <div key={dateKey} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{dateKey}</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    ({dayEntries.length} entr{dayEntries.length === 1 ? 'y' : 'ies'})
                  </span>
                </div>

                <div className="space-y-2.5">
                  {dayEntries.map((entry) => {
                    const entryRtl =
                      entry.language === 'Urdu' ||
                      (entry.language === 'Kashmiri' && entry.kashmiriScript === 'perso-arabic');
                    return (
                      <div
                        key={entry.id}
                        className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div dir={entryRtl ? 'rtl' : 'ltr'} className="min-w-0 flex-1">
                            <h4 className={`text-sm font-extrabold text-slate-900 dark:text-white ${entryRtl ? 'font-urdu text-base' : ''}`}>
                              {entry.lessonName}
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {entry.classNumber || classNumber}-{entry.section || section} · {entry.subject || subject} · Teacher: {entry.teacherName} · Session: {entry.academicSession || school.academicSession}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setViewingEntry(entry)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-indigo-400"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditEntry(entry)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-indigo-400"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDuplicateEntry(entry)}
                              title="Duplicate Entry"
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-indigo-400"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleExportBrandedPdf(entry)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleExportBrandedJpeg(entry)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>JPEG</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteEntry(entry)}
                              aria-label="Delete Diary Entry"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {entry.dailyTeachingSummary && (
                          <p
                            dir={entryRtl ? 'rtl' : 'ltr'}
                            className={`text-xs text-slate-600 dark:text-slate-300 line-clamp-2 ${entryRtl ? 'font-urdu text-sm' : ''}`}
                          >
                            {entry.dailyTeachingSummary}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Full Saved Diary & Audit History Modal */}
      {viewingEntry && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm font-extrabold truncate">{viewingEntry.lessonName}</h4>
                <p className="text-[11px] text-slate-500">
                  {viewingEntry.date} · {viewingEntry.classNumber || classNumber}-{viewingEntry.section || section} · {viewingEntry.subject || subject} · {viewingEntry.teacherName}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleExportBrandedPdf(viewingEntry)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-bold"
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportBrandedJpeg(viewingEntry)}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                >
                  JPEG
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintDiary(viewingEntry)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setViewingEntry(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 text-xs">
              {buildSectionsForEntry(viewingEntry).map((sec) => (
                <div
                  key={sec.heading}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700"
                >
                  <p className="font-extrabold text-indigo-700 dark:text-indigo-300 mb-1">{sec.heading}</p>
                  <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200 leading-relaxed">{sec.body}</p>
                </div>
              ))}

              {viewingEntry.auditHistory && viewingEntry.auditHistory.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                  <p className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" />
                    <span>Audit History</span>
                  </p>
                  {viewingEntry.auditHistory.map((log, i) => (
                    <div key={i} className="text-[11px] text-slate-500 flex items-center justify-between gap-2">
                      <span>
                        <strong className="text-slate-700 dark:text-slate-200">{log.action}</strong> — {log.summary} ({log.actorName})
                      </span>
                      <span className="font-mono shrink-0">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Permanent Deletion Confirmation Modal */}
      {confirmDeleteEntry && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Confirm Permanent Deletion
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Permanently delete the diary record <strong>&ldquo;{confirmDeleteEntry.lessonName}&rdquo;</strong> dated <strong>{confirmDeleteEntry.date}</strong>? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteEntry(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
