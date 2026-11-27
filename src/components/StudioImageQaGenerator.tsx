import React, { useEffect, useMemo, useState } from 'react';
import {
  HelpCircle,
  Plus,
  Edit3,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Save,
  Download,
  Printer,
  Bookmark,
  AlertCircle,
  X,
  FileText,
  Mic,
  MicOff,
  Image as ImageIcon,
  Layers,
  CheckSquare,
  Square,
} from 'lucide-react';
import { SchoolProfile, User } from '../types';
import {
  StudioUploadedImage,
  extractBase64Payload,
  printHtmlDocumentSafely,
} from '../utils/studioMediaStore';
import { StudioImageUploader } from './StudioImageUploader';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { exportTextToDocx } from '../utils/docxExport';
import { exportBrandedSchoolJpeg, exportBrandedSchoolPdf } from '../utils/schoolDocumentExport';

export type QaLang = 'English' | 'Urdu' | 'Kashmiri';
export type QaKashmiriScript = 'perso-arabic' | 'devanagari';
export type QaExamType = 'T1 Examination' | 'T2 Examination';

export type StudioQaType =
  | 'MCQ'
  | 'Very Short Answer'
  | 'Short Answer'
  | 'Long Answer'
  | 'Fill in the Blanks'
  | 'True/False'
  | 'Match the Following';

export interface StudioQaItem {
  id: string;
  type: StudioQaType;
  question: string;
  options?: string[];
  correctOption?: string;
  answer: string;
  explanation?: string;
  marks?: number;
  selected?: boolean;
}

export interface SavedQaSet {
  id: string;
  title: string;
  detectedTopic: string;
  subject: string;
  classLevel: string;
  section?: string;
  examType?: QaExamType;
  academicSession?: string;
  language: QaLang;
  kashmiriScript: QaKashmiriScript;
  isRtl: boolean;
  items: StudioQaItem[];
  savedAt: string;
  updatedAt: string;
}

const ALL_QA_TYPES: StudioQaType[] = [
  'MCQ',
  'Very Short Answer',
  'Short Answer',
  'Long Answer',
  'Fill in the Blanks',
  'True/False',
  'Match the Following',
];

const DEFAULT_MARKS_BY_TYPE: Record<StudioQaType, number> = {
  MCQ: 1,
  'Very Short Answer': 1,
  'Fill in the Blanks': 1,
  'True/False': 1,
  'Short Answer': 2,
  'Match the Following': 4,
  'Long Answer': 5,
};

const QA_SETS_STORAGE_KEY = 'sm_studio_image_qa_sets_v1';

interface StudioImageQaGeneratorProps {
  school: SchoolProfile;
  currentUser: User;
  subject: string;
  classLevel: string;
  selectedLang: QaLang;
  kashmiriScript: QaKashmiriScript;
  images: StudioUploadedImage[];
  onAddImages: (newImages: StudioUploadedImage[]) => Promise<void> | void;
  onUpdateImage: (updated: StudioUploadedImage) => Promise<void> | void;
  onDeleteImage: (id: string) => Promise<void> | void;
  onToggleSelectImage: (id: string) => void;
  onDownloadPdf: (title: string, text: string, isRtl: boolean, lang: QaLang) => Promise<void>;
  onSaveToGlobalLibrary: (title: string, content: string, isRtl: boolean) => void;
  onNotify: (msg: string) => void;
  renderLanguageBar: () => React.ReactNode;
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const StudioImageQaGenerator: React.FC<StudioImageQaGeneratorProps> = ({
  school,
  currentUser,
  subject,
  classLevel,
  selectedLang,
  kashmiriScript,
  images,
  onAddImages,
  onUpdateImage,
  onDeleteImage,
  onToggleSelectImage,
  onDownloadPdf,
  onSaveToGlobalLibrary,
  onNotify,
  renderLanguageBar,
}) => {
  const [selectedTypes, setSelectedTypes] = useState<StudioQaType[]>([...ALL_QA_TYPES]);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [examType, setExamType] = useState<QaExamType>('T1 Examination');
  const [section, setSection] = useState<string>('A');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Mixed'>('Mixed');
  const [topicHint, setTopicHint] = useState<string>('');
  const [extraInstructions, setExtraInstructions] = useState<string>('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingItemId, setRegeneratingItemId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qaViewMode, setQaViewMode] = useState<'combined' | 'separate'>('combined');

  // Active Q&A Set state
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [setTitle, setSetTitle] = useState<string>('');
  const [detectedTopic, setDetectedTopic] = useState<string>('');
  const [qaItems, setQaItems] = useState<StudioQaItem[]>([]);
  const [qaIsRtl, setQaIsRtl] = useState<boolean>(false);
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('ALL');

  // Saved Q&A Sets (auto-persisted)
  const [savedSets, setSavedSets] = useState<SavedQaSet[]>(() => {
    try {
      const raw = localStorage.getItem(QA_SETS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedQaSet[]) : [];
    } catch {
      return [];
    }
  });

  // Inline Edit & Add Q&A State
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<StudioQaItem | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemType, setNewItemType] = useState<StudioQaType>('Short Answer');
  const [newQuestion, setNewQuestion] = useState('');
  const [newOptions, setNewOptions] = useState<[string, string, string, string]>(['', '', '', '']);
  const [newCorrectOption, setNewCorrectOption] = useState('A');
  const [newAnswer, setNewAnswer] = useState('');
  const [newExplanation, setNewExplanation] = useState('');
  const [newMarks, setNewMarks] = useState<number>(2);

  // Confirmations (no window.confirm)
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<boolean>(false);
  const [confirmDeleteSetId, setConfirmDeleteSetId] = useState<string | null>(null);

  const {
    isSupported: isVoiceSupported,
    isListening: isVoiceListening,
    activeField: voiceActiveField,
    voiceError,
    startDictation,
  } = useVoiceDictation(selectedLang);

  useEffect(() => {
    try {
      localStorage.setItem(QA_SETS_STORAGE_KEY, JSON.stringify(savedSets));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedSets]);

  const isCurrentLangRtl =
    selectedLang === 'Urdu' || (selectedLang === 'Kashmiri' && kashmiriScript === 'perso-arabic');

  const selectedImages = useMemo(() => images.filter((i) => i.selectedForAi), [images]);

  const toggleQaType = (t: StudioQaType) => {
    setSelectedTypes((prev) => {
      if (prev.includes(t)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter((item) => item !== t);
      }
      return [...prev, t];
    });
  };

  const persistCurrentSet = (
    itemsToSave: StudioQaItem[],
    titleToSave: string,
    topicToSave: string,
    rtlFlag: boolean,
    explicitSetId?: string | null
  ) => {
    if (itemsToSave.length === 0) return;
    const now = new Date().toISOString();
    const id = explicitSetId || activeSetId || `qaset-${Date.now()}`;
    const record: SavedQaSet = {
      id,
      title: titleToSave || `${subject} ${examType} Q&A Set`,
      detectedTopic: topicToSave || topicHint || 'Uploaded Educational Material',
      subject,
      classLevel,
      section,
      examType,
      academicSession: school.academicSession || '',
      language: selectedLang,
      kashmiriScript,
      isRtl: rtlFlag,
      items: itemsToSave,
      savedAt: now,
      updatedAt: now,
    };
    setActiveSetId(id);
    setSavedSets((prev) => {
      const existing = prev.find((s) => s.id === id);
      if (existing) {
        return prev.map((s) => (s.id === id ? { ...record, savedAt: existing.savedAt } : s));
      }
      return [record, ...prev];
    });
  };

  const handleGenerateQa = async () => {
    if (selectedImages.length === 0 && !topicHint.trim() && !extraInstructions.trim()) {
      setErrorMsg(
        'Please capture or upload at least one image (textbook page, notes, worksheet, or diagram) or enter a topic below.'
      );
      return;
    }

    // Hard cap: maximum 10 questions per generation request
    const cappedCount = Math.min(10, Math.max(1, Number(questionCount) || 10));

    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const payloadImages = selectedImages.slice(0, 6).map((img) => {
        const { base64, mimeType } = extractBase64Payload(img.dataUrl);
        return { base64, mimeType, name: img.name };
      });

      const res = await fetch('/api/smart-edu/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'image_qa_suite',
          subject,
          classLevel,
          section,
          examType,
          academicSession: school.academicSession || '',
          language: selectedLang,
          kashmiriScript,
          topic: topicHint.trim(),
          question: extraInstructions.trim(),
          difficulty,
          questionCount: cappedCount,
          questionTypes: selectedTypes,
          images: payloadImages,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || `Generation failed (${res.status})`);
      }

      const rawItems = (Array.isArray(data.items) ? data.items : []).slice(0, 10);
      const normalized: StudioQaItem[] = rawItems.map((it: any, idx: number) => {
        const resolvedType: StudioQaType = ALL_QA_TYPES.includes(it.type) ? it.type : 'Short Answer';
        const parsedMarks = Number(it.marks);
        return {
          id: `qa-${Date.now()}-${idx}`,
          type: resolvedType,
          question: String(it.question || '').trim(),
          options: Array.isArray(it.options) && it.options.length > 0 ? it.options.map(String) : undefined,
          correctOption: it.correctOption ? String(it.correctOption).trim() : undefined,
          answer: String(it.answer || '').trim(),
          explanation: it.explanation ? String(it.explanation).trim() : undefined,
          marks: Number.isFinite(parsedMarks) && parsedMarks > 0 ? parsedMarks : DEFAULT_MARKS_BY_TYPE[resolvedType],
          selected: true,
        };
      });

      const nextTitle =
        data.title || `${subject} ${examType} Q&A — ${topicHint || 'Uploaded Material'}`;
      const nextTopic = data.detectedTopic || topicHint || 'Uploaded Educational Material';
      const rtl = Boolean(data.isRtl);

      setSetTitle(nextTitle);
      setDetectedTopic(nextTopic);
      setQaItems(normalized);
      setQaIsRtl(rtl);
      setActiveTypeFilter('ALL');
      setEditingItemId(null);
      setEditDraft(null);

      // Automatically save generated Q&A set securely
      persistCurrentSet(normalized, nextTitle, nextTopic, rtl, `qaset-${Date.now()}`);
      onNotify(
        `Generated and auto-saved ${normalized.length} ${examType} Q&As (max 10/request) in ${selectedLang}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate questions and answers.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateSingleQuestion = async (item: StudioQaItem) => {
    setRegeneratingItemId(item.id);
    setErrorMsg(null);
    try {
      const payloadImages = selectedImages.slice(0, 4).map((img) => {
        const { base64, mimeType } = extractBase64Payload(img.dataUrl);
        return { base64, mimeType, name: img.name };
      });
      const res = await fetch('/api/smart-edu/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'image_qa_suite',
          subject,
          classLevel,
          section,
          examType,
          academicSession: school.academicSession || '',
          language: selectedLang,
          kashmiriScript,
          topic: detectedTopic || topicHint.trim() || `${subject} ${classLevel}`,
          question: `Generate ONE fresh alternative ${item.type} question (different from: "${item.question.slice(0, 120)}") for ${examType}.`,
          difficulty,
          questionCount: 1,
          questionTypes: [item.type],
          images: payloadImages,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !Array.isArray(data.items) || data.items.length === 0) {
        throw new Error(data?.error || 'Could not regenerate this question.');
      }
      const fresh = data.items[0];
      const replacement: StudioQaItem = {
        ...item,
        question: String(fresh.question || item.question).trim(),
        options: Array.isArray(fresh.options) && fresh.options.length > 0 ? fresh.options.map(String) : undefined,
        correctOption: fresh.correctOption ? String(fresh.correctOption).trim() : undefined,
        answer: String(fresh.answer || item.answer).trim(),
        explanation: fresh.explanation ? String(fresh.explanation).trim() : undefined,
        marks: Number(fresh.marks) > 0 ? Number(fresh.marks) : item.marks || DEFAULT_MARKS_BY_TYPE[item.type],
      };
      const updated = qaItems.map((q) => (q.id === item.id ? replacement : q));
      setQaItems(updated);
      persistCurrentSet(updated, setTitle, detectedTopic, qaIsRtl);
      onNotify(`Regenerated ${item.type} question cleanly.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to regenerate question.');
    } finally {
      setRegeneratingItemId(null);
    }
  };

  const handleStartEditItem = (item: StudioQaItem) => {
    setEditingItemId(item.id);
    setEditDraft({
      ...item,
      options: item.options ? [...item.options] : item.type === 'MCQ' ? ['', '', '', ''] : undefined,
    });
  };

  const handleSaveEditItem = () => {
    if (!editDraft || !editDraft.question.trim() || !editDraft.answer.trim()) return;
    const updatedList = qaItems.map((item) => (item.id === editDraft.id ? editDraft : item));
    setQaItems(updatedList);
    setEditingItemId(null);
    setEditDraft(null);
    persistCurrentSet(updatedList, setTitle, detectedTopic, qaIsRtl);
    onNotify('Question & answer updated and saved.');
  };

  const handleAddNewItem = () => {
    if (!newQuestion.trim() || !newAnswer.trim()) {
      setErrorMsg('Please enter both a Question and an Answer before adding.');
      return;
    }
    setErrorMsg(null);
    const created: StudioQaItem = {
      id: `qa-manual-${Date.now()}`,
      type: newItemType,
      question: newQuestion.trim(),
      options:
        newItemType === 'MCQ'
          ? newOptions.map((o, idx) => o.trim() || `Option ${['A', 'B', 'C', 'D'][idx]}`)
          : undefined,
      correctOption: newItemType === 'MCQ' ? newCorrectOption : undefined,
      answer: newAnswer.trim(),
      explanation: newExplanation.trim() || undefined,
      marks: Math.max(1, Number(newMarks) || DEFAULT_MARKS_BY_TYPE[newItemType]),
      selected: true,
    };
    const nextTitle = setTitle || `${subject} ${examType} Q&A — ${topicHint || classLevel}`;
    const nextTopic = detectedTopic || topicHint || `${subject} (${classLevel})`;
    const rtlFlag = qaItems.length > 0 ? qaIsRtl : isCurrentLangRtl;
    const updatedList = [...qaItems, created];
    setSetTitle(nextTitle);
    setDetectedTopic(nextTopic);
    setQaIsRtl(rtlFlag);
    setQaItems(updatedList);
    persistCurrentSet(updatedList, nextTitle, nextTopic, rtlFlag);

    setNewQuestion('');
    setNewOptions(['', '', '', '']);
    setNewCorrectOption('A');
    setNewAnswer('');
    setNewExplanation('');
    setNewMarks(2);
    setShowAddForm(false);
    onNotify('Added new question & answer to the set.');
  };

  const handleConfirmDeleteItem = () => {
    if (!confirmDeleteItemId) return;
    const updatedList = qaItems.filter((item) => item.id !== confirmDeleteItemId);
    setQaItems(updatedList);
    setConfirmDeleteItemId(null);
    persistCurrentSet(updatedList, setTitle, detectedTopic, qaIsRtl);
    onNotify('Deleted question & answer.');
  };

  const handleToggleItemSelection = (id: string) => {
    setQaItems((prev) => prev.map((it) => (it.id === id ? { ...it, selected: it.selected === false } : it)));
  };

  const handleSelectAllItems = (checked: boolean) => {
    setQaItems((prev) => prev.map((it) => ({ ...it, selected: checked })));
  };

  const handleConfirmBulkDelete = () => {
    const remaining = qaItems.filter((it) => it.selected === false);
    const removedCount = qaItems.length - remaining.length;
    setQaItems(remaining);
    setConfirmBulkDelete(false);
    persistCurrentSet(remaining, setTitle, detectedTopic, qaIsRtl);
    onNotify(`Deleted ${removedCount} selected question(s).`);
  };

  const selectedQaItems = useMemo(
    () => qaItems.filter((it) => it.selected !== false),
    [qaItems]
  );

  const activeExportItems = selectedQaItems.length > 0 ? selectedQaItems : qaItems;

  const totalSelectedMarks = useMemo(
    () =>
      activeExportItems.reduce(
        (acc, it) => acc + (Number(it.marks) || DEFAULT_MARKS_BY_TYPE[it.type] || 1),
        0
      ),
    [activeExportItems]
  );

  const formatQaSetAsText = (separateAnswers = qaViewMode === 'separate'): string => {
    const items = activeExportItems;
    const lines: string[] = [
      setTitle || `${subject} ${examType} Questions & Answers`,
      `${school.name ? `${school.name} | ` : ''}${examType}${school.academicSession ? ` | Session: ${school.academicSession}` : ''}`,
      `Class: ${classLevel} - Section ${section} | Subject: ${subject} | Language: ${selectedLang} | Total Marks: ${totalSelectedMarks}`,
      detectedTopic ? `Chapter / Topic: ${detectedTopic}` : '',
      '',
    ];

    if (separateAnswers) {
      lines.push('SECTION 1: QUESTIONS');
      lines.push('');
      items.forEach((item, idx) => {
        const m = item.marks || DEFAULT_MARKS_BY_TYPE[item.type] || 1;
        lines.push(`Q${idx + 1}. [${item.type} · ${m} Mark${m > 1 ? 's' : ''}] ${item.question}`);
        if (item.type === 'MCQ' && item.options && item.options.length > 0) {
          const labels = ['A', 'B', 'C', 'D'];
          item.options.forEach((opt, oIdx) => {
            lines.push(`   ${labels[oIdx] || oIdx + 1}) ${opt}`);
          });
        }
        lines.push('');
      });
      lines.push('SECTION 2: MODEL ANSWER KEY');
      lines.push('');
      items.forEach((item, idx) => {
        lines.push(
          `Ans ${idx + 1}. ${item.correctOption ? `(${item.correctOption}) ` : ''}${item.answer}`
        );
        if (item.explanation) {
          lines.push(`   Note: ${item.explanation}`);
        }
      });
    } else {
      items.forEach((item, idx) => {
        const m = item.marks || DEFAULT_MARKS_BY_TYPE[item.type] || 1;
        lines.push(`Q${idx + 1}. [${item.type} · ${m} Mark${m > 1 ? 's' : ''}] ${item.question}`);
        if (item.type === 'MCQ' && item.options && item.options.length > 0) {
          const labels = ['A', 'B', 'C', 'D'];
          item.options.forEach((opt, oIdx) => {
            lines.push(`   ${labels[oIdx] || oIdx + 1}) ${opt}`);
          });
        }
        lines.push(`Answer: ${item.correctOption ? `(${item.correctOption}) ` : ''}${item.answer}`);
        if (item.explanation) {
          lines.push(`Explanation: ${item.explanation}`);
        }
        lines.push('');
      });
    }
    return lines.filter((l) => l !== undefined).join('\n');
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(formatQaSetAsText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      onNotify(`Copied ${activeExportItems.length} selected Q&As to clipboard.`);
    } catch {
      setErrorMsg('Clipboard access is unavailable in this browser.');
    }
  };

  const handleDownloadWordDoc = async () => {
    const slug = (setTitle || `${subject}_${examType}_qa`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 40);
    const ok = await exportTextToDocx({
      title: setTitle || `${subject} ${examType} Questions & Answers`,
      subtitle: `${examType}${school.academicSession ? ` • Session ${school.academicSession}` : ''} • ${classLevel} (${section}) • ${subject} • Max Marks: ${totalSelectedMarks}`,
      schoolName: school.name || undefined,
      bodyText: formatQaSetAsText(),
      filename: `${slug}.docx`,
    });
    if (ok) onNotify(`Downloaded Word (.docx) with ${activeExportItems.length} Q&As.`);
  };

  const handleDownloadBrandedPdf = async () => {
    const res = await exportBrandedSchoolPdf({
      school,
      documentType: `${examType} — Q&A Bank`,
      title: setTitle || `${subject} ${examType} Questions & Answers`,
      teacherName: currentUser.name,
      className: classLevel,
      section,
      subject,
      examName: examType,
      maxMarks: totalSelectedMarks,
      date: new Date().toISOString().slice(0, 10),
      isRtl: qaIsRtl,
      bodyText: formatQaSetAsText(),
      filenameBase: `${subject}_${examType}_qa`,
    });
    if (res.exported) {
      onNotify(`Downloaded branded PDF (${res.pageCount} page${res.pageCount > 1 ? 's' : ''}) with School Logo & Name.`);
    }
  };

  const handleDownloadBrandedJpeg = async () => {
    const res = await exportBrandedSchoolJpeg({
      school,
      documentType: `${examType} — Q&A Bank`,
      title: setTitle || `${subject} ${examType} Questions & Answers`,
      teacherName: currentUser.name,
      className: classLevel,
      section,
      subject,
      examName: examType,
      maxMarks: totalSelectedMarks,
      date: new Date().toISOString().slice(0, 10),
      isRtl: qaIsRtl,
      bodyText: formatQaSetAsText(),
      filenameBase: `${subject}_${examType}_qa`,
    });
    if (res.exported) {
      onNotify(`Downloaded branded JPEG (${res.pageCount} image${res.pageCount > 1 ? 's' : ''}).`);
    }
  };

  const handlePrintQaSet = () => {
    const dir = qaIsRtl ? 'rtl' : 'ltr';
    const fontFamily = qaIsRtl
      ? '"Noto Nastaliq Urdu", "Noto Sans Arabic", serif'
      : '"Plus Jakarta Sans", Arial, sans-serif';
    const items = activeExportItems;
    const logoHtml = school.logoDataUrl
      ? `<img src="${escapeHtml(school.logoDataUrl)}" alt="School Logo" style="width:58px;height:58px;object-fit:contain;border-radius:8px;background:#fff;padding:4px;border:1px solid #cbd5e1;" />`
      : '';
    const html = `<!DOCTYPE html>
<html dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(setTitle || 'Questions & Answers')}</title>
<style>
  body { font-family: ${fontFamily}; color: #0f172a; padding: 24px; line-height: 1.75; }
  .header { display:flex; align-items:center; gap:14px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0 0 2px 0; }
  .school { font-size: 16px; font-weight: 800; color: #0f172a; }
  .meta { font-size: 11px; color: #475569; }
  .item { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 10px; break-inside: avoid; }
  .type { font-size: 11px; font-weight: 700; color: #4338ca; margin-bottom: 4px; display:flex; justify-content:space-between; }
  .q { font-weight: 700; margin-bottom: 6px; }
  .ans { color: #065f46; }
  .exp { font-size: 12px; color: #475569; margin-top: 4px; }
</style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <div>
      ${school.name ? `<div class="school">${escapeHtml(school.name)}</div>` : ''}
      ${school.address ? `<div class="meta">${escapeHtml(school.address)}${school.code ? ` · U-DISE: ${escapeHtml(school.code)}` : ''}</div>` : ''}
      <h1>${escapeHtml(setTitle || `${subject} ${examType} Questions & Answers`)}</h1>
      <div class="meta">${escapeHtml(examType)}${school.academicSession ? ` · Session: ${escapeHtml(school.academicSession)}` : ''} · ${escapeHtml(classLevel)} (${escapeHtml(section)}) · ${escapeHtml(subject)} · Total Marks: ${totalSelectedMarks}</div>
    </div>
  </div>
  ${
    qaViewMode === 'separate'
      ? `<h3>Section A — Questions</h3>${items
          .map(
            (item, idx) => `<div class="item">
          <div class="type"><span>Q${idx + 1} · ${escapeHtml(item.type)}</span><span>[${item.marks || DEFAULT_MARKS_BY_TYPE[item.type] || 1} Marks]</span></div>
          <div class="q">${escapeHtml(item.question)}</div>
          ${item.type === 'MCQ' && item.options?.length ? `<ol type="A">${item.options.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ol>` : ''}
        </div>`
          )
          .join('')}<h3>Section B — Model Answers</h3>${items
          .map(
            (item, idx) => `<div class="item">
          <div class="ans"><strong>Ans ${idx + 1}:</strong> ${item.correctOption ? `(${escapeHtml(item.correctOption)}) ` : ''}${escapeHtml(item.answer)}</div>
          ${item.explanation ? `<div class="exp">${escapeHtml(item.explanation)}</div>` : ''}
        </div>`
          )
          .join('')}`
      : items
          .map(
            (item, idx) => `<div class="item">
          <div class="type"><span>Q${idx + 1} · ${escapeHtml(item.type)}</span><span>[${item.marks || DEFAULT_MARKS_BY_TYPE[item.type] || 1} Marks]</span></div>
          <div class="q">${escapeHtml(item.question)}</div>
          ${item.type === 'MCQ' && item.options?.length ? `<ol type="A">${item.options.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ol>` : ''}
          <div class="ans"><strong>Answer:</strong> ${item.correctOption ? `(${escapeHtml(item.correctOption)}) ` : ''}${escapeHtml(item.answer)}</div>
          ${item.explanation ? `<div class="exp">${escapeHtml(item.explanation)}</div>` : ''}
        </div>`
          )
          .join('')
  }
</body>
</html>`;
    printHtmlDocumentSafely(html);
  };

  const displayedItems = useMemo(() => {
    if (activeTypeFilter === 'ALL') return qaItems;
    return qaItems.filter((item) => item.type === activeTypeFilter);
  }, [qaItems, activeTypeFilter]);

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Automatic Question &amp; Answer Generator (Image &amp; Multilingual AI)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Capture or upload textbook pages, handwritten notes, worksheets, or diagrams to generate editable MCQs, Very Short, Short, Long, Fill-in-the-Blanks, and True/False Q&amp;As in English, Urdu, or Kashmiri.
          </p>
        </div>

        {renderLanguageBar()}

        {/* Direct Camera & Gallery Image Uploader */}
        <StudioImageUploader
          images={images}
          onAddImages={onAddImages}
          onUpdateImage={onUpdateImage}
          onDeleteImage={onDeleteImage}
          onToggleSelect={onToggleSelectImage}
        />

        {/* Question Type Checkboxes & Configuration */}
        <div className="space-y-3 text-xs">
          {/* Examination Term (T1 / T2), Section & Auto-Fetched Academic Session */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Examination Term
              </label>
              <div className="inline-flex w-full p-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
                {(['T1 Examination', 'T2 Examination'] as QaExamType[]).map((term) => (
                  <button
                    key={term}
                    type="button"
                    data-testid={`qa-exam-${term.startsWith('T1') ? 't1' : 't2'}`}
                    onClick={() => setExamType(term)}
                    className={`flex-1 py-1.5 rounded-md font-bold text-xs transition-colors ${
                      examType === term
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Class Section
              </label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
              >
                {['A', 'B', 'C', 'D', 'All Sections'].map((sec) => (
                  <option key={sec} value={sec}>
                    Section {sec}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Academic Session (Auto-Fetched)
              </label>
              <div className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 font-bold text-indigo-700 dark:text-indigo-300 truncate">
                {school.academicSession || 'From School Profile'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-slate-800 dark:text-slate-100">
              Select Question Types to Generate
            </span>
            <button
              type="button"
              onClick={() => setSelectedTypes([...ALL_QA_TYPES])}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
            >
              Select All 7 Types
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {ALL_QA_TYPES.map((t) => {
              const active = selectedTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleQaType(t)}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold transition-colors flex items-center gap-2 ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                      active ? 'bg-white text-indigo-600 border-white' : 'border-slate-400'
                    }`}
                  >
                    {active && <Check className="w-3 h-3" />}
                  </span>
                  <span className="truncate">{t}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
            <div className="md:col-span-5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block font-bold text-slate-700 dark:text-slate-200">
                  Textbook Title / Chapter / Topic
                </label>
                {isVoiceListening && voiceActiveField === 'qa-topic' && (
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    Listening ({selectedLang})...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
                  value={topicHint}
                  onChange={(e) => setTopicHint(e.target.value)}
                  placeholder={
                    selectedLang === 'Urdu'
                      ? 'مثلاً: باب 3 — پودوں میں غذائیت (اختیاری)'
                      : selectedLang === 'Kashmiri'
                      ? 'مثال: سبق یا عنوان (اختیاری)'
                      : 'e.g., Chapter 5: Light & Reflection (optional if image uploaded)'
                  }
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <button
                  type="button"
                  data-testid="qa-voice-input-btn"
                  title={
                    isVoiceSupported
                      ? 'Dictate textbook title or topic using microphone'
                      : 'Web Speech API not supported in this browser'
                  }
                  onClick={() =>
                    startDictation('qa-topic', (spoken) => {
                      setTopicHint((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
                      onNotify(`Voice input captured: "${spoken}"`);
                    })
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                    isVoiceListening && voiceActiveField === 'qa-topic'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {isVoiceListening && voiceActiveField === 'qa-topic' ? (
                    <MicOff className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  )}
                  <span>{isVoiceListening && voiceActiveField === 'qa-topic' ? 'Stop' : 'Voice Input'}</span>
                </button>
              </div>
              {voiceError && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-medium">{voiceError}</p>
              )}
            </div>

            <div className="md:col-span-3">
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Total Questions (Max 10)
              </label>
              <select
                data-testid="qa-question-count-select"
                value={Math.min(10, questionCount)}
                onChange={(e) => setQuestionCount(Math.min(10, Math.max(1, Number(e.target.value))))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold tabular-nums"
              >
                {[3, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} Questions{n === 10 ? ' (Max)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-4">
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Difficulty Level
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                <option value="Mixed">Mixed (Balanced Classroom Set)</option>
                <option value="Easy">Easy / Foundational</option>
                <option value="Medium">Medium / Standard Exam</option>
                <option value="Hard">Hard / Higher Order Thinking</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
              Additional Focus or Custom Passage (Optional)
            </label>
            <textarea
              rows={2}
              dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
              value={extraInstructions}
              onChange={(e) => setExtraInstructions(e.target.value)}
              placeholder="Optional: specify specific paragraphs, diagrams, or learning level notes..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-testid="generate-image-qa-btn"
            disabled={isGenerating}
            onClick={() => void handleGenerateQa()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>
              {isGenerating
                ? 'Reading Images & Generating Q&As...'
                : selectedImages.length > 0
                ? `Generate Q&A from ${selectedImages.length} Image${selectedImages.length > 1 ? 's' : ''} (${selectedLang})`
                : `Generate Q&A Set (${selectedLang})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Add Custom Q&amp;A</span>
          </button>
        </div>

        {/* Add New Question & Answer Inline Form */}
        {showAddForm && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-indigo-200 dark:border-indigo-800 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-white">Add New Question &amp; Answer</h4>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="p-1 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Question Type
                </label>
                <select
                  value={newItemType}
                  onChange={(e) => {
                    const nextType = e.target.value as StudioQaType;
                    setNewItemType(nextType);
                    setNewMarks(DEFAULT_MARKS_BY_TYPE[nextType]);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {ALL_QA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Marks
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={newMarks}
                  onChange={(e) => setNewMarks(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
              {newItemType === 'MCQ' && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Correct Option
                  </label>
                  <select
                    value={newCorrectOption}
                    onChange={(e) => setNewCorrectOption(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    {['A', 'B', 'C', 'D'].map((opt) => (
                      <option key={opt} value={opt}>
                        Option {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Question
              </label>
              <textarea
                rows={2}
                dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Enter question..."
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            {newItemType === 'MCQ' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(['A', 'B', 'C', 'D'] as const).map((label, idx) => (
                  <input
                    key={label}
                    type="text"
                    dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
                    value={newOptions[idx]}
                    onChange={(e) => {
                      const next: [string, string, string, string] = [...newOptions] as any;
                      next[idx] = e.target.value;
                      setNewOptions(next);
                    }}
                    placeholder={`Option ${label}`}
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                ))}
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Answer
              </label>
              <textarea
                rows={2}
                dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                placeholder="Enter model answer..."
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Explanation / Teaching Note (Optional)
              </label>
              <input
                type="text"
                dir={isCurrentLangRtl ? 'rtl' : 'ltr'}
                value={newExplanation}
                onChange={(e) => setNewExplanation(e.target.value)}
                placeholder="Optional brief explanation..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddNewItem}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Q&amp;A List</span>
              </button>
            </div>
          </div>
        )}

        {/* Generated / Active Q&A Results */}
        {qaItems.length > 0 && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="min-w-0">
                <input
                  type="text"
                  dir={qaIsRtl ? 'rtl' : 'ltr'}
                  value={setTitle}
                  onChange={(e) => setSetTitle(e.target.value)}
                  onBlur={() => persistCurrentSet(qaItems, setTitle, detectedTopic, qaIsRtl)}
                  className="text-base font-extrabold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none w-full"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {examType} · {detectedTopic} · {selectedQaItems.length}/{qaItems.length} Selected · Total Marks: {totalSelectedMarks} · {selectedLang}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setQaViewMode((m) => (m === 'combined' ? 'separate' : 'combined'))
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                    qaViewMode === 'separate'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{qaViewMode === 'separate' ? 'Separate Q & A' : 'Combined View'}</span>
                </button>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => void handleGenerateQa()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>Regenerate All</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAll()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    persistCurrentSet(activeExportItems, setTitle, detectedTopic, qaIsRtl);
                    onSaveToGlobalLibrary(
                      setTitle || `${subject} ${examType} Q&A Set`,
                      formatQaSetAsText(),
                      qaIsRtl
                    );
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save ({activeExportItems.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintQaSet}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadWordDoc()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>DOCX</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadBrandedJpeg()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold whitespace-nowrap"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>JPEG</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadBrandedPdf()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            {/* Bulk Selection & Type Filters Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectAllItems(selectedQaItems.length < qaItems.length)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-semibold"
                >
                  {selectedQaItems.length === qaItems.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>
                    {selectedQaItems.length === qaItems.length ? 'Deselect All' : 'Select All'}
                  </span>
                </button>
                {selectedQaItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Bulk Delete Selected ({selectedQaItems.length})</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTypeFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                    activeTypeFilter === 'ALL'
                      ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  All ({qaItems.length})
                </button>
                {ALL_QA_TYPES.map((t) => {
                  const count = qaItems.filter((i) => i.type === t).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setActiveTypeFilter(t)}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                        activeTypeFilter === t
                          ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {t} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Q&A Cards (Combined or Separate Questions & Answers View) */}
            {qaViewMode === 'separate' ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    Section 1 — Questions ({displayedItems.length})
                  </h4>
                  {displayedItems.map((item, idx) => (
                    <div key={item.id} className="pb-2.5 border-b border-slate-200/70 dark:border-slate-700/70 last:border-b-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-indigo-700 dark:text-indigo-300">
                          Q{idx + 1}. {item.type}
                        </span>
                        <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                          [{item.marks || DEFAULT_MARKS_BY_TYPE[item.type] || 1} Marks]
                        </span>
                      </div>
                      <p dir={qaIsRtl ? 'rtl' : 'ltr'} className={`font-bold text-slate-900 dark:text-white ${qaIsRtl ? 'font-urdu text-base leading-loose' : 'text-sm'}`}>
                        {item.question}
                      </p>
                      {item.type === 'MCQ' && item.options && item.options.length > 0 && (
                        <div dir={qaIsRtl ? 'rtl' : 'ltr'} className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                          {item.options.map((opt, oIdx) => (
                            <div key={oIdx} className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                              <span className="font-mono font-bold mr-1.5">{['A', 'B', 'C', 'D'][oIdx] || oIdx + 1})</span>
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2.5">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Section 2 — Model Answer Key
                  </h4>
                  {displayedItems.map((item, idx) => (
                    <div key={item.id} dir={qaIsRtl ? 'rtl' : 'ltr'} className={`text-xs text-slate-800 dark:text-slate-100 ${qaIsRtl ? 'font-urdu text-sm leading-loose' : 'leading-relaxed'}`}>
                      <span className="font-bold text-emerald-800 dark:text-emerald-300">Ans {idx + 1}: </span>
                      {item.correctOption ? `(${item.correctOption}) ` : ''}
                      {item.answer}
                      {item.explanation && (
                        <span className="text-slate-600 dark:text-slate-300"> — {item.explanation}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedItems.map((item, idx) => {
                  const isEditing = editingItemId === item.id && editDraft;
                  const isChecked = item.selected !== false;
                  const itemMarks = item.marks || DEFAULT_MARKS_BY_TYPE[item.type] || 1;
                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border space-y-2.5 transition-colors ${
                        isChecked
                          ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                          : 'bg-slate-100/50 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-700 opacity-70'
                      }`}
                    >
                      {isEditing ? (
                        <div className="space-y-2.5 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <select
                              value={editDraft.type}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, type: e.target.value as StudioQaType } : prev
                                )
                              }
                              className="px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-semibold"
                            >
                              {ALL_QA_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={editDraft.marks || 1}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, marks: Math.max(1, Number(e.target.value) || 1) } : prev
                                )
                              }
                              aria-label="Question marks"
                              className="px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                            />
                            {editDraft.type === 'MCQ' && (
                              <select
                                value={editDraft.correctOption || 'A'}
                                onChange={(e) =>
                                  setEditDraft((prev) =>
                                    prev ? { ...prev, correctOption: e.target.value } : prev
                                  )
                                }
                                className="px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-semibold"
                              >
                                {['A', 'B', 'C', 'D'].map((opt) => (
                                  <option key={opt} value={opt}>
                                    Correct Option: {opt}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <textarea
                            rows={2}
                            dir={qaIsRtl ? 'rtl' : 'ltr'}
                            value={editDraft.question}
                            onChange={(e) =>
                              setEditDraft((prev) => (prev ? { ...prev, question: e.target.value } : prev))
                            }
                            className="w-full p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                          />
                          {editDraft.type === 'MCQ' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {(['A', 'B', 'C', 'D'] as const).map((lbl, oIdx) => (
                                <input
                                  key={lbl}
                                  type="text"
                                  dir={qaIsRtl ? 'rtl' : 'ltr'}
                                  value={editDraft.options?.[oIdx] || ''}
                                  onChange={(e) =>
                                    setEditDraft((prev) => {
                                      if (!prev) return prev;
                                      const nextOpts = [...(prev.options || ['', '', '', ''])];
                                      nextOpts[oIdx] = e.target.value;
                                      return { ...prev, options: nextOpts };
                                    })
                                  }
                                  placeholder={`Option ${lbl}`}
                                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                                />
                              ))}
                            </div>
                          )}
                          <textarea
                            rows={3}
                            dir={qaIsRtl ? 'rtl' : 'ltr'}
                            value={editDraft.answer}
                            onChange={(e) =>
                              setEditDraft((prev) => (prev ? { ...prev, answer: e.target.value } : prev))
                            }
                            className="w-full p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                          />
                          <input
                            type="text"
                            dir={qaIsRtl ? 'rtl' : 'ltr'}
                            value={editDraft.explanation || ''}
                            onChange={(e) =>
                              setEditDraft((prev) =>
                                prev ? { ...prev, explanation: e.target.value } : prev
                              )
                            }
                            placeholder="Explanation (optional)"
                            className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItemId(null);
                                setEditDraft(null);
                              }}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveEditItem}
                              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save Changes</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                              <button
                                type="button"
                                onClick={() => handleToggleItemSelection(item.id)}
                                aria-label={`Select question ${idx + 1}`}
                                className="text-indigo-600 dark:text-indigo-400"
                              >
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </button>
                              <span>
                                Q{idx + 1} · {item.type}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 font-mono text-[11px]">
                                {itemMarks} Mark{itemMarks > 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={regeneratingItemId === item.id}
                                onClick={() => void handleRegenerateSingleQuestion(item)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:border-indigo-400 disabled:opacity-50"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 ${regeneratingItemId === item.id ? 'animate-spin' : ''}`}
                                />
                                <span>Regenerate</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartEditItem(item)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteItemId(item.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>

                          <p
                            dir={qaIsRtl ? 'rtl' : 'ltr'}
                            className={`font-bold text-slate-900 dark:text-white whitespace-pre-wrap ${
                              qaIsRtl ? 'font-urdu text-base leading-loose' : 'text-sm leading-relaxed'
                            }`}
                          >
                            {item.question}
                          </p>

                          {item.type === 'MCQ' && item.options && item.options.length > 0 && (
                            <div
                              dir={qaIsRtl ? 'rtl' : 'ltr'}
                              className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1"
                            >
                              {item.options.map((opt, oIdx) => {
                                const letter = ['A', 'B', 'C', 'D'][oIdx] || String(oIdx + 1);
                                const isCorrect =
                                  (item.correctOption || '').toUpperCase().slice(0, 1) === letter;
                                return (
                                  <div
                                    key={oIdx}
                                    className={`px-3 py-1.5 rounded-lg border text-xs ${
                                      isCorrect
                                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-semibold'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <span className="font-mono font-bold mr-1.5">{letter})</span>
                                    <span>{opt}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div
                            dir={qaIsRtl ? 'rtl' : 'ltr'}
                            className={`p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60 text-slate-800 dark:text-slate-100 whitespace-pre-wrap ${
                              qaIsRtl ? 'font-urdu text-sm leading-loose' : 'text-xs leading-relaxed'
                            }`}
                          >
                            <span className="font-bold text-emerald-800 dark:text-emerald-300">
                              Answer:{' '}
                            </span>
                            {item.correctOption ? `(${item.correctOption}) ` : ''}
                            {item.answer}
                            {item.explanation && (
                              <div className="mt-1 text-slate-600 dark:text-slate-300">
                                <span className="font-semibold">Note: </span>
                                {item.explanation}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Saved Q&A Sets History (Editable Anytime) */}
      {savedSets.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Saved Question &amp; Answer Sets ({savedSets.length})</span>
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Click Load &amp; Edit to reopen any saved Q&amp;A set
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {savedSets.map((s) => (
              <div
                key={s.id}
                className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                  activeSetId === s.id
                    ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-400'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{s.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                    {s.subject} · {s.classLevel} · {s.language} · {s.items.length} Q&amp;As
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSetId(s.id);
                      setSetTitle(s.title);
                      setDetectedTopic(s.detectedTopic);
                      setQaItems(s.items);
                      setQaIsRtl(s.isRtl);
                      setActiveTypeFilter('ALL');
                      onNotify(`Loaded "${s.title}" for editing.`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold"
                  >
                    Load &amp; Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteSetId(s.id)}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                    title="Delete saved Q&A set"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Single Q&A Item */}
      {confirmDeleteItemId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Delete Question"
          className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Delete Question &amp; Answer?
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Are you sure you want to remove this question and answer from the current set?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteItemId(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteItem}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Bulk Delete Selected Questions */}
      {confirmBulkDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Bulk Delete Questions"
          className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Delete {selectedQaItems.length} Selected Question{selectedQaItems.length === 1 ? '' : 's'}?
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              All currently checked questions will be permanently removed from this Q&amp;A set.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Confirm Bulk Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Saved Q&A Set */}
      {confirmDeleteSetId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Delete Saved Q&A Set"
          className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Delete Saved Q&amp;A Set?
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Are you sure you want to permanently delete this saved Question &amp; Answer set?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteSetId(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setSavedSets((prev) => prev.filter((item) => item.id !== confirmDeleteSetId));
                  if (activeSetId === confirmDeleteSetId) setActiveSetId(null);
                  setConfirmDeleteSetId(null);
                  onNotify('Deleted saved Q&A set.');
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
