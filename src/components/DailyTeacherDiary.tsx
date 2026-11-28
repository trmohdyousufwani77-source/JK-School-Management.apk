import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Calendar,
  Plus,
  Edit3,
  Trash2,
  Search,
  Printer,
  Download,
  FileSpreadsheet,
  X,
  AlertCircle,
  Archive,
  Sparkles,
  RefreshCw,
  Eye,
  FolderOpen,
  History,
  CheckCircle2,
  Loader2,
  Lock,
} from 'lucide-react';
import { SchoolProfile, User } from '../types';
import { printHtmlDocumentSafely } from '../utils/studioMediaStore';
import { exportAllDiaryRecordsZip } from '../utils/diaryZipExport';
import { apiFetch } from '../utils/apiConfig';
import { guardSensitiveExport } from '../utils/biometricProtection';
import {
  BrandedDocumentSection,
  exportBrandedSchoolPdf,
} from '../utils/schoolDocumentExport';
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
  kashmiriHeaderSummary?: string;
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

interface KashmiriAiSectionMeta {
  key: keyof Pick<
    DailyTeacherDiaryEntry,
    | 'learningObjectives'
    | 'teachingMethodology'
    | 'classroomTeachingActivities'
    | 'teachingLearningMaterials'
    | 'lessonExplanation'
    | 'studentParticipationActivities'
    | 'learningOutcomes'
    | 'homeworkAssigned'
    | 'teachersRemarks'
    | 'dailyTeachingSummary'
  >;
  kashmiriLabel: string;
  englishLabel: string;
}

const KASHMIRI_AI_SECTIONS: KashmiriAiSectionMeta[] = [
  { key: 'learningObjectives', kashmiriLabel: 'تٔعلیمی مقصَد', englishLabel: 'Learning Objectives' },
  { key: 'teachingMethodology', kashmiriLabel: 'تدریسی طریقہٕ کار', englishLabel: 'Teaching Method' },
  { key: 'classroomTeachingActivities', kashmiriLabel: 'کلاس روم سرگرمیہٕ', englishLabel: 'Classroom Activities' },
  { key: 'teachingLearningMaterials', kashmiriLabel: 'تدریسی اوزار (TLM)', englishLabel: 'Teaching Aids' },
  { key: 'lessonExplanation', kashmiriLabel: 'سبقُک اہم بیان', englishLabel: 'Core Concept' },
  { key: 'studentParticipationActivities', kashmiriLabel: 'طالب عٔلِمَن ہٕند شمولیت', englishLabel: 'Student Participation' },
  { key: 'learningOutcomes', kashmiriLabel: 'تٔعلیمی نتیجہٕ', englishLabel: 'Learning Outcomes' },
  { key: 'homeworkAssigned', kashmiriLabel: 'گھرٕچ کٲم', englishLabel: 'Homework' },
  { key: 'teachersRemarks', kashmiriLabel: 'اُستاد سُند نوٹ', englishLabel: "Teacher's Note" },
  { key: 'dailyTeachingSummary', kashmiriLabel: 'روزانہ تدریسی خلاصہٕ', englishLabel: 'Daily Summary' },
];

interface FiveFieldsSnapshot {
  topic: string;
  date: string;
  subject: string;
  lessonName: string;
  introduction: string;
}

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

function containsRtlScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text || '');
}

function serializeFiveFields(f: FiveFieldsSnapshot): string {
  return JSON.stringify({
    topic: f.topic.trim(),
    date: f.date.trim(),
    subject: f.subject.trim(),
    lessonName: f.lessonName.trim(),
    introduction: f.introduction.trim(),
  });
}

export const DailyTeacherDiary: React.FC<DailyTeacherDiaryProps> = ({
  school,
  currentUser,
  defaultSubject = 'Science',
  defaultClassLevel = 'Class 8',
  onSaveToLibrary,
  onNotify,
}) => {
  const todayIso = useMemo(() => getTodayIso(), []);

  // Automatically resolved background metadata (never requires teacher manual input)
  const autoClassNumber = useMemo(() => {
    const first = currentUser.assignedClasses?.[0];
    if (first) {
      const clsPart = first.split('-')[0].trim();
      return /^class\s/i.test(clsPart) ? clsPart : `Class ${clsPart}`;
    }
    return defaultClassLevel || 'Class 8';
  }, [currentUser.assignedClasses, defaultClassLevel]);

  const autoSection = useMemo(() => {
    const first = currentUser.assignedClasses?.[0];
    if (first && first.includes('-')) {
      return first.split('-')[1].trim() || 'A';
    }
    return 'A';
  }, [currentUser.assignedClasses]);

  const subjectSuggestions = useMemo(() => {
    const base = [
      'Kashmiri (کٲشُر)',
      'Science',
      'Mathematics',
      'English',
      'Urdu',
      'Social Science',
      'Environmental Science',
      'Hindi',
    ];
    const assigned = currentUser.assignedSubjects || [];
    return Array.from(new Set([...assigned, ...base]));
  }, [currentUser.assignedSubjects]);

  // Persistent Saved Diaries
  const [entries, setEntries] = useState<DailyTeacherDiaryEntry[]>(() => {
    try {
      const raw = localStorage.getItem(DIARY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as DailyTeacherDiaryEntry[]) : [];
    } catch {
      return [];
    }
  });

  // Main Dashboard Workspace View
  const [activeSection, setActiveSection] = useState<'composer' | 'saved'>('composer');

  // STRICTLY ONLY FIVE MANUAL INPUT FIELDS (Add, Edit, Delete/Clear)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>('');
  const [date, setDate] = useState<string>(todayIso);
  const [subject, setSubject] = useState<string>(
    currentUser.assignedSubjects?.[0] || defaultSubject || ''
  );
  const [lessonName, setLessonName] = useState<string>('');
  const [introduction, setIntroduction] = useState<string>('');

  // Currently Generated / Active Diary Record (AI sections strictly read-only)
  const [activeDiary, setActiveDiary] = useState<DailyTeacherDiaryEntry | null>(null);
  const [lastGeneratedSignature, setLastGeneratedSignature] = useState<string | null>(null);
  const [autoRegenerateOnEdit, setAutoRegenerateOnEdit] = useState<boolean>(true);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Saved Diaries Organization (Date-wise & Subject-wise) + Search
  const [organizationMode, setOrganizationMode] = useState<'date' | 'subject'>('date');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('ALL');

  // Export & Modals
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [viewingEntry, setViewingEntry] = useState<DailyTeacherDiaryEntry | null>(null);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<DailyTeacherDiaryEntry | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const formTopRef = useRef<HTMLDivElement | null>(null);

  // Sync with backend persistent diary store on mount
  useEffect(() => {
    let active = true;
    void apiFetch('/api/smart-edu/diary')
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
        // LocalStorage remains active offline
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

  const currentFiveFields: FiveFieldsSnapshot = useMemo(
    () => ({ topic, date, subject, lessonName, introduction }),
    [topic, date, subject, lessonName, introduction]
  );

  const currentSignature = useMemo(
    () => serializeFiveFields(currentFiveFields),
    [currentFiveFields]
  );

  const hasApprovedFieldChanges = Boolean(
    editingId && lastGeneratedSignature && currentSignature !== lastGeneratedSignature
  );

  const allSubjectsInSaved = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.subject?.trim()) set.add(e.subject.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const buildSectionsForEntry = useCallback(
    (entry: DailyTeacherDiaryEntry): BrandedDocumentSection[] => {
      const sections: BrandedDocumentSection[] = [
        {
          heading: 'معلوماتِ سبق — Lesson Details (Teacher Inputs)',
          body: [
            `Topic Name (عنوان): ${entry.topic || '-'}`,
            `Date (تٲریخ): ${entry.date || '-'}`,
            `Subject (مضمون): ${entry.subject || '-'}`,
            `Lesson Name (سبقُک ناو): ${entry.lessonName || '-'}`,
            entry.lessonIntroduction?.trim()
              ? `Introduction (تعارف): ${entry.lessonIntroduction.trim()}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ];

      if (entry.kashmiriHeaderSummary?.trim()) {
        sections.push({
          heading: 'کٲشُر عنوان — Kashmiri Title Summary',
          body: entry.kashmiriHeaderSummary.trim(),
        });
      }

      KASHMIRI_AI_SECTIONS.forEach((sec) => {
        const val = String(entry[sec.key] || '').trim();
        if (val) {
          sections.push({
            heading: `${sec.kashmiriLabel} — ${sec.englishLabel}`,
            body: val,
          });
        }
      });

      return sections;
    },
    []
  );

  // Core Automatic AI Kashmiri Diary Generation + Immediate Auto-Save
  const runGenerateAndAutoSave = useCallback(
    async (
      fields: FiveFieldsSnapshot,
      targetEditId: string | null,
      reason: 'create' | 'update' | 'auto-regenerate'
    ) => {
      const trimmedTopic = fields.topic.trim();
      const trimmedDate = fields.date.trim();
      const trimmedSubject = fields.subject.trim();
      const trimmedLesson = fields.lessonName.trim();
      const trimmedIntro = fields.introduction.trim();

      if (!trimmedTopic || !trimmedDate || !trimmedSubject || !trimmedLesson) {
        if (reason !== 'auto-regenerate') {
          setFormError(
            'Please fill in Topic Name, Date, Subject, and Lesson Name to generate the Kashmiri Daily Diary.'
          );
        }
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setFormError(null);
      setIsGeneratingAi(true);
      setStatusMessage(
        reason === 'create'
          ? 'Generating Kashmiri Script (کٲشُر) Daily Diary automatically...'
          : 'Approved field changed — regenerating Kashmiri Script (کٲشُر) diary & saving...'
      );

      try {
        const res = await apiFetch('/api/smart-edu/diary/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            topic: trimmedTopic,
            date: trimmedDate,
            subject: trimmedSubject,
            lessonName: trimmedLesson,
            introduction: trimmedIntro,
            classNumber: autoClassNumber,
            section: autoSection,
            teacherName: currentUser.name || 'Teacher',
            schoolName: school.name || '',
            academicSession: school.academicSession || '',
            language: 'Kashmiri',
            kashmiriScript: 'perso-arabic',
          }),
        });

        const data = await res.json();
        if (!res.ok || !data?.ok || !data.diary) {
          throw new Error(data?.error || 'Unable to generate Kashmiri Daily Diary.');
        }

        const ai = data.diary;
        const now = new Date().toISOString();
        const existingRecord = targetEditId
          ? entries.find((item) => item.id === targetEditId) || activeDiary
          : null;
        const recordId =
          targetEditId || `diary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const auditEvent: DiaryAuditLogItem = {
          timestamp: now,
          action: targetEditId ? 'UPDATED' : 'AI_GENERATED',
          actorName: currentUser.name || 'Teacher',
          summary: targetEditId
            ? `Updated permitted fields & auto-regenerated Kashmiri diary for ${trimmedLesson} (${trimmedSubject})`
            : `Auto-generated & saved Kashmiri diary for ${trimmedLesson} (${trimmedSubject})`,
        };

        const savedRecord: DailyTeacherDiaryEntry = {
          id: recordId,
          date: trimmedDate,
          topic: trimmedTopic,
          subject: trimmedSubject,
          lessonName: trimmedLesson,
          lessonIntroduction: trimmedIntro,
          lessonNo: existingRecord?.lessonNo || '-',
          subTopic: existingRecord?.subTopic || '-',
          classNumber: existingRecord?.classNumber || autoClassNumber,
          section: existingRecord?.section || autoSection,
          academicSession: existingRecord?.academicSession || school.academicSession,
          kashmiriHeaderSummary: ai.kashmiriHeaderSummary || '',
          learningObjectives: ai.learningObjectives || '',
          teachingMethodology: ai.teachingMethodology || '',
          classroomTeachingActivities: ai.classroomTeachingActivities || '',
          teachingLearningMaterials: ai.teachingLearningMaterials || '',
          lessonExplanation: ai.lessonExplanation || '',
          studentParticipationActivities: ai.studentParticipationActivities || '',
          learningOutcomes: ai.learningOutcomes || '',
          homeworkAssigned: ai.homeworkAssigned || '',
          teachersRemarks: ai.teachersRemarks || '',
          dailyTeachingSummary: ai.dailyTeachingSummary || '',
          language: 'Kashmiri',
          kashmiriScript: 'perso-arabic',
          teacherName: currentUser.name || 'Teacher',
          auditHistory: [auditEvent, ...(existingRecord?.auditHistory || [])].slice(0, 20),
          createdAt: existingRecord?.createdAt || now,
          updatedAt: now,
        };

        // Immediately update local state & active preview
        setEntries((prev) => {
          const exists = prev.some((item) => item.id === savedRecord.id);
          const next = exists
            ? prev.map((item) => (item.id === savedRecord.id ? savedRecord : item))
            : [savedRecord, ...prev];
          return next.sort((a, b) => {
            const dCmp = b.date.localeCompare(a.date);
            return dCmp !== 0 ? dCmp : (b.updatedAt || '').localeCompare(a.updatedAt || '');
          });
        });

        setEditingId(savedRecord.id);
        setActiveDiary(savedRecord);
        setLastGeneratedSignature(serializeFiveFields(fields));

        // Automatically persist to backend REST store
        try {
          const persistUrl = targetEditId
            ? `/api/smart-edu/diary/${encodeURIComponent(savedRecord.id)}`
            : '/api/smart-edu/diary';
          await apiFetch(persistUrl, {
            method: targetEditId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(savedRecord),
          });
        } catch {
          // Persisted cleanly in localStorage even offline
        }

        if (onSaveToLibrary && !targetEditId) {
          const summaryBody = buildSectionsForEntry(savedRecord)
            .map((sec) => `${sec.heading}\n${sec.body}`)
            .join('\n\n');
          onSaveToLibrary(
            `Daily Diary (${savedRecord.date}): ${savedRecord.lessonName}`,
            summaryBody,
            true
          );
        }

        const doneMsg = targetEditId
          ? 'Kashmiri diary regenerated & auto-saved after approved field update.'
          : 'Kashmiri Daily Diary generated & automatically saved.';
        setStatusMessage(doneMsg);
        onNotify(doneMsg);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        const msg =
          err instanceof Error ? err.message : 'Unable to generate Kashmiri Daily Diary.';
        setFormError(msg);
        setStatusMessage(null);
      } finally {
        if (abortControllerRef.current === controller) {
          setIsGeneratingAi(false);
        }
      }
    },
    [
      activeDiary,
      autoClassNumber,
      autoSection,
      buildSectionsForEntry,
      currentUser.name,
      entries,
      onNotify,
      onSaveToLibrary,
      school.academicSession,
      school.name,
    ]
  );

  // Automatic debounced regeneration whenever any of the 5 approved fields changes on an existing saved diary
  useEffect(() => {
    if (!autoRegenerateOnEdit) return;
    if (!editingId || !lastGeneratedSignature) return;
    if (currentSignature === lastGeneratedSignature) return;
    if (!topic.trim() || !date.trim() || !subject.trim() || !lessonName.trim()) return;

    const timer = window.setTimeout(() => {
      void runGenerateAndAutoSave(currentFiveFields, editingId, 'auto-regenerate');
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [
    autoRegenerateOnEdit,
    editingId,
    lastGeneratedSignature,
    currentSignature,
    currentFiveFields,
    topic,
    date,
    subject,
    lessonName,
    runGenerateAndAutoSave,
  ]);

  const handleStartNewDiary = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setEditingId(null);
    setActiveDiary(null);
    setLastGeneratedSignature(null);
    setTopic('');
    setDate(todayIso);
    setSubject(currentUser.assignedSubjects?.[0] || defaultSubject || '');
    setLessonName('');
    setIntroduction('');
    setFormError(null);
    setStatusMessage(null);
    setActiveSection('composer');
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleEditEntry = (entry: DailyTeacherDiaryEntry) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const snap: FiveFieldsSnapshot = {
      topic: entry.topic || '',
      date: entry.date || todayIso,
      subject: entry.subject || '',
      lessonName: entry.lessonName || '',
      introduction: entry.lessonIntroduction || '',
    };
    setEditingId(entry.id);
    setTopic(snap.topic);
    setDate(snap.date);
    setSubject(snap.subject);
    setLessonName(snap.lessonName);
    setIntroduction(snap.introduction);
    setActiveDiary(entry);
    setLastGeneratedSignature(serializeFiveFields(snap));
    setFormError(null);
    setStatusMessage('Editing the 5 approved fields — changes automatically regenerate the Kashmiri AI diary.');
    setActiveSection('composer');
    setViewingEntry(null);
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteEntry) return;
    const targetId = confirmDeleteEntry.id;
    setEntries((prev) => prev.filter((item) => item.id !== targetId));
    if (editingId === targetId) handleStartNewDiary();
    if (viewingEntry?.id === targetId) setViewingEntry(null);
    setConfirmDeleteEntry(null);

    try {
      await apiFetch(`/api/smart-edu/diary/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
    } catch {
      // Deleted locally
    }
    onNotify('Diary entry permanently deleted.');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runGenerateAndAutoSave(
      currentFiveFields,
      editingId,
      editingId ? 'update' : 'create'
    );
  };

  // Count unique YYYY-MM months for Download All Records ZIP badge
  const distinctMonthCount = useMemo(() => {
    const months = new Set<string>();
    entries.forEach((e) => {
      const key = (e.date || 'Undated').slice(0, 7);
      months.add(key);
    });
    return months.size;
  }, [entries]);

  // Filtered & Organized Saved Diaries (Date-wise & Subject-wise)
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filterDate && entry.date !== filterDate) return false;
      if (filterSubject !== 'ALL' && (entry.subject || '').trim() !== filterSubject) return false;
      if (q) {
        const hay = [
          entry.date,
          entry.topic,
          entry.subject,
          entry.lessonName,
          entry.lessonIntroduction,
          entry.dailyTeachingSummary,
          entry.learningObjectives,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, filterDate, filterSubject, searchQuery]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, DailyTeacherDiaryEntry[]>();
    filteredEntries.forEach((entry) => {
      const bucket = groups.get(entry.date) || [];
      bucket.push(entry);
      groups.set(entry.date, bucket);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredEntries]);

  const groupedBySubject = useMemo(() => {
    const groups = new Map<string, DailyTeacherDiaryEntry[]>();
    filteredEntries.forEach((entry) => {
      const key = (entry.subject || 'General').trim() || 'General';
      const bucket = groups.get(key) || [];
      bucket.push(entry);
      groups.set(key, bucket);
    });
    return Array.from(groups.entries())
      .map(([subj, list]) => [
        subj,
        [...list].sort((a, b) => b.date.localeCompare(a.date)),
      ] as [string, DailyTeacherDiaryEntry[]])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredEntries]);

  // Automatic PDF Download (Kashmiri Unicode RTL + All 5 Manual Fields + All AI Sections)
  const handleDownloadDiaryPdf = async (explicitEntry?: DailyTeacherDiaryEntry | null) => {
    const target = explicitEntry || activeDiary || filteredEntries[0] || entries[0] || null;
    if (!target) {
      setFormError('Generate or select a diary entry first to download its PDF.');
      return;
    }
    setIsExportingPdf(true);
    try {
      const isRtl =
        target.language === 'Urdu' ||
        (target.language === 'Kashmiri' && target.kashmiriScript !== 'devanagari') ||
        containsRtlScript(
          `${target.learningObjectives || ''} ${target.dailyTeachingSummary || ''}`
        );
      const { exported } = await exportBrandedSchoolPdf({
        school,
        documentType: "TEACHER'S DAILY DIARY — کٲشُر روزنامچہٕ",
        title: `${target.lessonName} — ${target.topic}`,
        teacherName: target.teacherName || currentUser.name,
        className: target.classNumber || autoClassNumber,
        section: target.section || autoSection,
        subject: target.subject || subject,
        date: target.date,
        isRtl,
        sections: buildSectionsForEntry(target),
        filenameBase: `Kashmiri_Teachers_Diary_${target.date}_${target.subject || 'Subject'}_${target.lessonName}`,
      });
      if (exported) {
        onNotify('Downloaded print-ready Kashmiri Teacher Daily Diary PDF.');
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintDiary = (explicitEntry?: DailyTeacherDiaryEntry) => {
    const targetList = explicitEntry
      ? [explicitEntry]
      : activeDiary
      ? [activeDiary]
      : filteredEntries.length > 0
      ? filteredEntries
      : entries;

    if (targetList.length === 0) {
      setFormError('Generate or save at least one diary entry before printing.');
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
<title>Teacher's Daily Diary (کٲشُر) — ${escapeHtml(school.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Scheherazade+New:wght@400;600;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body { font-family: "Plus Jakarta Sans", Arial, sans-serif; color: #0f172a; padding: 24px; }
  .header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0; }
  .sub { font-size: 12px; color: #475569; margin-top: 2px; }
  .entry { border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
  .entry-meta { font-size: 12px; color: #1e293b; background: #f8fafc; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .sec { margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
  .sec-title { font-size: 13px; font-weight: 700; color: #312e81; margin-bottom: 4px; direction: rtl; text-align: right; font-family: "Scheherazade New", "Noto Sans Arabic", serif; }
  .sec-body { font-size: 15px; white-space: pre-wrap; line-height: 1.9; direction: rtl; text-align: right; font-family: "Scheherazade New", "Noto Sans Arabic", serif; }
  .ltr-body { font-size: 13px; white-space: pre-wrap; line-height: 1.6; direction: ltr; text-align: left; font-family: "Plus Jakarta Sans", sans-serif; }
</style>
</head>
<body>
  <div class="header">
    ${logoTag}
    <div>
      <h1>${escapeHtml(school.name)} — TEACHER'S DAILY DIARY (کٲشُر)</h1>
      <div class="sub">${escapeHtml(school.address)} · U-DISE: ${escapeHtml(school.code)} · Academic Session: ${escapeHtml(school.academicSession)}</div>
    </div>
  </div>
  ${targetList
    .map((entry) => {
      const secs = buildSectionsForEntry(entry);
      return `<div class="entry">
        <div class="entry-meta">
          <div><strong>Topic Name:</strong> ${escapeHtml(entry.topic)}</div>
          <div><strong>Date:</strong> ${escapeHtml(entry.date)}</div>
          <div><strong>Subject:</strong> ${escapeHtml(entry.subject || '-')}</div>
          <div><strong>Lesson Name:</strong> ${escapeHtml(entry.lessonName)}</div>
        </div>
        ${secs
          .map((s) => {
            const bodyClass = containsRtlScript(s.body) ? 'sec-body' : 'ltr-body';
            return `<div class="sec"><div class="sec-title">${escapeHtml(s.heading)}</div><div class="${bodyClass}">${escapeHtml(s.body)}</div></div>`;
          })
          .join('')}
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
      'Date,Subject,Topic Name,Lesson Name,Introduction,Learning Objectives (Kashmiri),Teaching Method (Kashmiri),Homework (Kashmiri),Summary (Kashmiri),Teacher',
      ...target.map((e) =>
        [
          esc(e.date),
          esc(e.subject || ''),
          esc(e.topic || ''),
          esc(e.lessonName || ''),
          esc(e.lessonIntroduction || ''),
          esc(e.learningObjectives || ''),
          esc(e.teachingMethodology || ''),
          esc(e.homeworkAssigned || ''),
          esc(e.dailyTeachingSummary || ''),
          esc(e.teacherName || ''),
        ].join(',')
      ),
    ].join('\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Kashmiri_Teachers_Daily_Diary_${todayIso}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify("Downloaded Daily Teacher's Diary CSV.");
  };

  const handleDownloadAllRecordsZip = async () => {
    if (entries.length === 0) {
      setFormError('Create at least one diary entry before downloading all monthly records.');
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

  const renderSavedDiaryCard = (entry: DailyTeacherDiaryEntry) => (
    <div
      key={entry.id}
      className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2.5 transition-colors hover:border-indigo-300 dark:hover:border-indigo-700"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {entry.lessonName}
          </h4>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">
              {entry.subject || 'General'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Topic: {entry.topic}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{entry.date}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setViewingEntry(entry)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400 whitespace-nowrap"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View</span>
          </button>
          <button
            type="button"
            onClick={() => handleEditEntry(entry)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400 whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Diary</span>
          </button>
          <button
            type="button"
            disabled={isExportingPdf}
            onClick={() => void handleDownloadDiaryPdf(entry)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteEntry(entry)}
            aria-label="Delete Diary"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-xs font-semibold whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {entry.lessonIntroduction && (
        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1">
          <span className="font-semibold text-slate-700 dark:text-slate-200">Introduction: </span>
          {entry.lessonIntroduction}
        </p>
      )}

      {(entry.dailyTeachingSummary || entry.learningObjectives) && (
        <p
          dir="rtl"
          className="font-kashmiri text-base text-slate-800 dark:text-slate-200 leading-relaxed line-clamp-2 pt-1 border-t border-slate-200/70 dark:border-slate-700/70"
        >
          {entry.dailyTeachingSummary || entry.learningObjectives}
        </p>
      )}
    </div>
  );

  return (
    <div ref={formTopRef} className="space-y-5">
      {/* Institutional Context Header (Auto-Loaded — Zero Extra Teacher Inputs Needed) */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
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
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
              Automatic AI Teacher&apos;s Daily Diary Generator
            </h2>
            <p className="text-xs text-slate-300 truncate mt-0.5">
              {school.name} · Kashmiri Script (<span className="font-kashmiri text-sm text-amber-300">کٲشُر</span>) · Teacher: {currentUser.name}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleStartNewDiary}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Diary</span>
          </button>
          <button
            type="button"
            disabled={isExportingPdf || (!activeDiary && entries.length === 0)}
            onClick={() => void handleDownloadDiaryPdf(activeDiary)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExportingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>
          <button
            type="button"
            data-testid="diary-download-all-zip-btn"
            disabled={isExportingZip || entries.length === 0}
            onClick={() => void handleDownloadAllRecordsZip()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/40 text-white text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-50"
            title="Bundle all monthly teacher diary entries into a single ZIP file containing one formatted PDF per month"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>
              {isExportingZip
                ? 'Bundling Monthly PDFs...'
                : distinctMonthCount > 0
                ? `Download All Records (${distinctMonthCount} ${distinctMonthCount === 1 ? 'Month' : 'Months'})`
                : 'Download All Records'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Dashboard Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setActiveSection('composer')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              activeSection === 'composer'
                ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{editingId ? 'Edit Diary & AI Generator' : 'Automatic AI Generator'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('saved')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              activeSection === 'saved'
                ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="tabular-nums">Saved Diaries ({entries.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            disabled={isExportingZip || entries.length === 0}
            onClick={() => void handleDownloadAllRecordsZip()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold hover:border-emerald-400 whitespace-nowrap disabled:opacity-50"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>{isExportingZip ? 'Bundling ZIP...' : 'Download All Records (ZIP)'}</span>
          </button>
          <button
            type="button"
            onClick={() => handlePrintDiary()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold hover:border-slate-300 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
          <button
            type="button"
            disabled={entries.length === 0}
            onClick={() => void handleDownloadCsv()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold hover:border-slate-300 whitespace-nowrap disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: 5-FIELD MANUAL INPUTS + AUTOMATIC KASHMIRI AI PREVIEW */}
      {activeSection === 'composer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Strictly ONLY the 5 Permitted Manual Input Fields */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpenCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{editingId ? 'Edit 5 Permitted Fields' : 'Create New Diary (5 Manual Fields)'}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enter only these five fields. All remaining diary sections are automatically generated in Kashmiri Script (<span className="font-kashmiri text-sm">کٲشُر</span>) and saved.
                </p>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={handleStartNewDiary}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                >
                  New
                </button>
              )}
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {statusMessage && !formError && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-semibold flex items-start gap-2">
                {isGeneratingAi ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{statusMessage}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-3.5 text-xs">
              {/* Field 1: Topic Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="diary-topic" className="font-bold text-slate-700 dark:text-slate-200">
                    1. Topic Name <span className="text-rose-500">*</span>
                  </label>
                  {topic && (
                    <button
                      type="button"
                      onClick={() => setTopic('')}
                      className="text-[11px] text-slate-400 hover:text-rose-600 font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  id="diary-topic"
                  data-testid="diary-input-topic"
                  type="text"
                  dir="auto"
                  required
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Water Cycle / آبُک چکر"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Field 2: Date */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="diary-date" className="font-bold text-slate-700 dark:text-slate-200">
                    2. Date <span className="text-rose-500">*</span>
                  </label>
                  {date !== todayIso && (
                    <button
                      type="button"
                      onClick={() => setDate(todayIso)}
                      className="text-[11px] text-slate-400 hover:text-indigo-600 font-medium"
                    >
                      Today
                    </button>
                  )}
                </div>
                <input
                  id="diary-date"
                  data-testid="diary-input-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Field 3: Subject */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="diary-subject" className="font-bold text-slate-700 dark:text-slate-200">
                    3. Subject <span className="text-rose-500">*</span>
                  </label>
                  {subject && (
                    <button
                      type="button"
                      onClick={() => setSubject('')}
                      className="text-[11px] text-slate-400 hover:text-rose-600 font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  id="diary-subject"
                  data-testid="diary-input-subject"
                  type="text"
                  dir="auto"
                  list="kashmiri-diary-subjects"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Science, Mathematics, Kashmiri"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="kashmiri-diary-subjects">
                  {subjectSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              {/* Field 4: Lesson Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="diary-lesson" className="font-bold text-slate-700 dark:text-slate-200">
                    4. Lesson Name <span className="text-rose-500">*</span>
                  </label>
                  {lessonName && (
                    <button
                      type="button"
                      onClick={() => setLessonName('')}
                      className="text-[11px] text-slate-400 hover:text-rose-600 font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  id="diary-lesson"
                  data-testid="diary-input-lesson"
                  type="text"
                  dir="auto"
                  required
                  value={lessonName}
                  onChange={(e) => setLessonName(e.target.value)}
                  placeholder="e.g., Sources of Water / آبٕک ذرایع"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Field 5: Introduction (Minimal) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="diary-intro" className="font-bold text-slate-700 dark:text-slate-200">
                    5. Introduction (Minimal)
                  </label>
                  {introduction && (
                    <button
                      type="button"
                      onClick={() => setIntroduction('')}
                      className="text-[11px] text-slate-400 hover:text-rose-600 font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <textarea
                  id="diary-intro"
                  data-testid="diary-input-introduction"
                  rows={2}
                  dir="auto"
                  value={introduction}
                  onChange={(e) => setIntroduction(e.target.value)}
                  placeholder="Brief 1-line intro (optional) — AI builds the complete Kashmiri diary automatically."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Auto-regenerate toggle when editing saved diary */}
              {editingId && (
                <label className="flex items-center gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRegenerateOnEdit}
                    onChange={(e) => setAutoRegenerateOnEdit(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Automatically regenerate Kashmiri AI sections whenever any approved field changes</span>
                </label>
              )}

              <div className="pt-2 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  data-testid="generate-daily-diary-btn"
                  disabled={
                    isGeneratingAi ||
                    !topic.trim() ||
                    !date.trim() ||
                    !subject.trim() ||
                    !lessonName.trim()
                  }
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition-colors disabled:opacity-55 whitespace-nowrap"
                >
                  {isGeneratingAi ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : editingId ? (
                    <RefreshCw className="w-4 h-4 shrink-0" />
                  ) : (
                    <Sparkles className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {isGeneratingAi
                      ? 'Generating Kashmiri Diary...'
                      : editingId
                      ? 'Update & Regenerate Kashmiri Diary'
                      : 'Generate & Auto-Save Diary (کٲشُر)'}
                  </span>
                </button>

                {editingId && activeDiary && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteEntry(activeDiary)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 text-xs font-bold whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right Column: Complete AI-Generated Diary in Kashmiri Script (Strictly Read-Only) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Generated Diary Preview</span>
                  <span className="font-kashmiri text-base text-indigo-700 dark:text-indigo-300">
                    (کٲشُر روزنامچہٕ)
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <Lock className="w-3 h-3 shrink-0" />
                  <span>AI-generated Kashmiri sections are automatic &amp; read-only — edit the 5 fields on the left to regenerate.</span>
                </p>
              </div>

              {activeDiary && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isExportingPdf}
                    onClick={() => void handleDownloadDiaryPdf(activeDiary)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isExportingPdf ? 'Building PDF...' : 'Download PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintDiary(activeDiary)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                </div>
              )}
            </div>

            {hasApprovedFieldChanges && !isGeneratingAi && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  Approved field changed — regenerating Kashmiri diary automatically...
                </span>
                <button
                  type="button"
                  onClick={() => void runGenerateAndAutoSave(currentFiveFields, editingId, 'update')}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold text-[11px] whitespace-nowrap"
                >
                  Regenerate Now
                </button>
              </div>
            )}

            {isGeneratingAi ? (
              <div className="py-16 text-center space-y-3">
                <Loader2 className="w-7 h-7 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto" />
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Creating your Teacher&apos;s Daily Diary in Kashmiri Script...
                </p>
                <p dir="rtl" className="font-kashmiri text-lg text-indigo-700 dark:text-indigo-300">
                  کٲشُر روزنامچہٕ چُھ تیار گژھان...
                </p>
              </div>
            ) : !activeDiary ? (
              <div className="py-14 px-4 text-center space-y-2.5">
                <p dir="rtl" className="font-kashmiri text-2xl font-bold text-slate-800 dark:text-slate-200">
                  اُستاد سُند روزانہ روزنامچہٕ
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Fill in <strong>Topic Name</strong>, <strong>Date</strong>, <strong>Subject</strong>, <strong>Lesson Name</strong>, and optional <strong>Introduction</strong> on the left, then click <strong>Generate &amp; Auto-Save Diary</strong> to automatically create a complete Kashmiri Script diary ready for PDF download.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary Strip of the 5 Approved Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Topic Name: </span>
                    <span className="font-bold text-slate-900 dark:text-white">{activeDiary.topic}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Date: </span>
                    <span className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {activeDiary.date}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Subject: </span>
                    <span className="font-bold text-slate-900 dark:text-white">{activeDiary.subject}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Lesson Name: </span>
                    <span className="font-bold text-slate-900 dark:text-white">{activeDiary.lessonName}</span>
                  </div>
                  {activeDiary.lessonIntroduction && (
                    <div className="sm:col-span-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-slate-500 dark:text-slate-400 font-semibold">Introduction: </span>
                      <span className="text-slate-800 dark:text-slate-200">
                        {activeDiary.lessonIntroduction}
                      </span>
                    </div>
                  )}
                </div>

                {activeDiary.kashmiriHeaderSummary && (
                  <div
                    dir="rtl"
                    className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60"
                  >
                    <p className="font-kashmiri text-lg font-bold text-indigo-950 dark:text-indigo-200 leading-relaxed">
                      {activeDiary.kashmiriHeaderSummary}
                    </p>
                  </div>
                )}

                {/* Read-Only Kashmiri Script AI-Generated Sections */}
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {KASHMIRI_AI_SECTIONS.map((sec) => {
                    const value = String(activeDiary[sec.key] || '').trim();
                    if (!value) return null;
                    return (
                      <div key={sec.key} className="p-4 bg-white dark:bg-slate-900/80 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            {sec.englishLabel}
                          </span>
                          <h4
                            dir="rtl"
                            className="font-kashmiri text-base font-bold text-indigo-800 dark:text-indigo-300"
                          >
                            {sec.kashmiriLabel}
                          </h4>
                        </div>
                        <p
                          dir="rtl"
                          className="font-kashmiri text-lg text-slate-900 dark:text-slate-100 whitespace-pre-wrap leading-loose"
                        >
                          {value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: SAVED DIARIES ORGANIZED DATE-WISE & SUBJECT-WISE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="tabular-nums">Saved Diaries ({filteredEntries.length})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Automatically saved diaries organized date-wise or subject-wise. Select any diary to view, edit the 5 permitted fields, delete, or download as Kashmiri PDF.
            </p>
          </div>

          {/* Date-wise vs Subject-wise Switcher */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setOrganizationMode('date')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${
                organizationMode === 'date'
                  ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Date-wise
            </button>
            <button
              type="button"
              onClick={() => setOrganizationMode('subject')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${
                organizationMode === 'subject'
                  ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Subject-wise
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topic, lesson, or Kashmiri text..."
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>

          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            aria-label="Filter by Date"
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 tabular-nums"
          />

          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            aria-label="Filter by Subject"
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          >
            <option value="ALL">All Subjects</option>
            {allSubjectsInSaved.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No saved diaries found yet. Fill in the 5 fields above and click{' '}
            <strong>Generate &amp; Auto-Save Diary (کٲشُر)</strong> to create your first entry.
          </div>
        ) : organizationMode === 'date' ? (
          <div className="space-y-5">
            {groupedByDate.map(([dateKey, dayEntries]) => (
              <div key={dateKey} className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="font-mono tabular-nums">{dateKey}</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    · {dayEntries.length} diar{dayEntries.length === 1 ? 'y' : 'ies'}
                  </span>
                </div>
                <div className="space-y-2.5">{dayEntries.map(renderSavedDiaryCard)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {groupedBySubject.map(([subjectKey, subjEntries]) => (
              <div key={subjectKey} className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                  <BookOpenCheck className="w-3.5 h-3.5" />
                  <span>{subjectKey}</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    · {subjEntries.length} diar{subjEntries.length === 1 ? 'y' : 'ies'}
                  </span>
                </div>
                <div className="space-y-2.5">{subjEntries.map(renderSavedDiaryCard)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Full Saved Diary Modal (Kashmiri RTL Reader) */}
      {viewingEntry && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  {viewingEntry.lessonName}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {viewingEntry.date} · {viewingEntry.subject || 'General'} · Topic: {viewingEntry.topic}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleEditEntry(viewingEntry)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold whitespace-nowrap"
                >
                  Edit 5 Fields
                </button>
                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={() => void handleDownloadDiaryPdf(viewingEntry)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-bold whitespace-nowrap disabled:opacity-50"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintDiary(viewingEntry)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold whitespace-nowrap"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setViewingEntry(null)}
                  aria-label="Close Preview"
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-slate-500 font-semibold">Topic Name: </span>
                  <span className="font-bold text-slate-900 dark:text-white">{viewingEntry.topic}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Date: </span>
                  <span className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {viewingEntry.date}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Subject: </span>
                  <span className="font-bold text-slate-900 dark:text-white">{viewingEntry.subject}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Lesson Name: </span>
                  <span className="font-bold text-slate-900 dark:text-white">{viewingEntry.lessonName}</span>
                </div>
                {viewingEntry.lessonIntroduction && (
                  <div className="sm:col-span-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500 font-semibold">Introduction: </span>
                    <span className="text-slate-800 dark:text-slate-200">{viewingEntry.lessonIntroduction}</span>
                  </div>
                )}
              </div>

              {KASHMIRI_AI_SECTIONS.map((sec) => {
                const body = String(viewingEntry[sec.key] || '').trim();
                if (!body) return null;
                return (
                  <div
                    key={sec.key}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {sec.englishLabel}
                      </span>
                      <span
                        dir="rtl"
                        className="font-kashmiri text-base font-bold text-indigo-700 dark:text-indigo-300"
                      >
                        {sec.kashmiriLabel}
                      </span>
                    </div>
                    <p
                      dir="rtl"
                      className="font-kashmiri text-lg text-slate-900 dark:text-slate-100 whitespace-pre-wrap leading-loose"
                    >
                      {body}
                    </p>
                  </div>
                );
              })}

              {viewingEntry.auditHistory && viewingEntry.auditHistory.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                  <p className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" />
                    <span>History</span>
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
                  Delete Saved Diary
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Permanently delete <strong>&ldquo;{confirmDeleteEntry.lessonName}&rdquo;</strong> ({confirmDeleteEntry.subject}, {confirmDeleteEntry.date})? This action cannot be undone.
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
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
