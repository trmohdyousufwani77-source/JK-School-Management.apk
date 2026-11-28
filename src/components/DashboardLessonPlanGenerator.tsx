import { apiFetch } from "../utils/apiConfig";
import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  Download,
  Edit3,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Save,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { SchoolProfile } from '../types';
import { guardSensitiveExport } from '../utils/biometricProtection';

export type LessonPlanLanguage = 'English' | 'Urdu' | 'Kashmiri';

export interface StructuredLessonPlan {
  title: string;
  generalObjectives: string;
  specificLearningOutcomes: string;
  previousKnowledge: string;
  introduction: string;
  teachingLearningActivities: string;
  teacherActivities: string;
  studentActivities: string;
  teachingLearningMaterials: string;
  blackboardWork: string;
  assessmentQuestions: string;
  homework: string;
  inclusiveTeachingStrategies: string;
  learningOutcomeEvaluation: string;
}

export interface SavedLessonPlanRecord {
  id: string;
  classLevel: string;
  subject: string;
  topic: string;
  outputLanguage: LessonPlanLanguage;
  mediumOfInstruction: string;
  duration: string;
  teachingMethodology: string;
  availableTlm: string;
  createdAt: string;
  updatedAt: string;
  plan: StructuredLessonPlan;
}

interface DashboardLessonPlanGeneratorProps {
  school: SchoolProfile;
  teacherName?: string;
}

const STORAGE_KEY = 'sm_saved_lesson_plans_v1';

const SUBJECTS = ['Mathematics', 'Science', 'Social Science', 'Urdu', 'English', 'Kashmiri'];
const CLASSES = [
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
const DURATIONS = ['30 minutes', '35 minutes', '40 minutes', '45 minutes', '60 minutes'];

const SECTION_LABELS: Array<{ key: keyof StructuredLessonPlan; number: string; label: string }> = [
  { key: 'generalObjectives', number: '01', label: 'General Learning Objectives' },
  { key: 'specificLearningOutcomes', number: '02', label: 'Specific Learning Outcomes' },
  { key: 'previousKnowledge', number: '03', label: 'Previous Knowledge' },
  { key: 'introduction', number: '04', label: 'Introduction' },
  { key: 'teachingLearningActivities', number: '05', label: 'Teaching-Learning Activities' },
  { key: 'teacherActivities', number: '06', label: 'Teacher Activities' },
  { key: 'studentActivities', number: '07', label: 'Student Activities' },
  { key: 'teachingLearningMaterials', number: '08', label: 'Teaching-Learning Materials (TLM)' },
  { key: 'blackboardWork', number: '09', label: 'Blackboard Work' },
  { key: 'assessmentQuestions', number: '10', label: 'Assessment Questions' },
  { key: 'homework', number: '11', label: 'Homework' },
  { key: 'inclusiveTeachingStrategies', number: '12', label: 'Inclusive Teaching Strategies' },
  { key: 'learningOutcomeEvaluation', number: '13', label: 'Learning Outcome Evaluation' },
];

export const DashboardLessonPlanGenerator: React.FC<DashboardLessonPlanGeneratorProps> = ({
  school,
  teacherName = 'Class Teacher',
}) => {
  const [classLevel, setClassLevel] = useState<string>('Class 5');
  const [subject, setSubject] = useState<string>('Science');
  const [topic, setTopic] = useState<string>('');
  const [outputLanguage, setOutputLanguage] = useState<LessonPlanLanguage>('English');
  const [mediumOfInstruction, setMediumOfInstruction] = useState<string>('English');
  const [duration, setDuration] = useState<string>('40 minutes');
  const [learningObjectives, setLearningObjectives] = useState<string>('');
  const [teachingMethodology, setTeachingMethodology] = useState<string>(
    'Interactive Activity-Based & Inquiry Learning'
  );
  const [availableTlm, setAvailableTlm] = useState<string>(
    'Textbook, Chalkboard, Diagrams, Flashcards'
  );

  const [activePlan, setActivePlan] = useState<StructuredLessonPlan | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [savedPlans, setSavedPlans] = useState<SavedLessonPlanRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPlans));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedPlans]);

  const showToast = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3200);
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setErrorMessage('Please enter a lesson topic to generate a lesson plan.');
      return;
    }
    setErrorMessage(null);
    setIsGenerating(true);
    setIsEditing(false);

    try {
      const response = await apiFetch('/api/lesson-plan-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classLevel,
          subject,
          topic: topic.trim(),
          outputLanguage,
          mediumOfInstruction,
          duration,
          learningObjectives,
          teachingMethodology,
          availableTlm,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.plan) {
        throw new Error(data?.error || `Lesson plan request failed (${response.status}).`);
      }

      setActivePlan(data.plan as StructuredLessonPlan);
      setActiveRecordId(null);
      showToast(`Generated 13-section ${outputLanguage} lesson plan for "${topic.trim()}".`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to generate lesson plan.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSavePlan = () => {
    if (!activePlan) return;
    const nowIso = new Date().toISOString();
    const recordId = activeRecordId || `lp-${Date.now()}`;
    const record: SavedLessonPlanRecord = {
      id: recordId,
      classLevel,
      subject,
      topic: topic.trim() || activePlan.title,
      outputLanguage,
      mediumOfInstruction,
      duration,
      teachingMethodology,
      availableTlm,
      createdAt:
        savedPlans.find((p) => p.id === recordId)?.createdAt || nowIso,
      updatedAt: nowIso,
      plan: activePlan,
    };

    setSavedPlans((prev) => [record, ...prev.filter((p) => p.id !== recordId)]);
    setActiveRecordId(recordId);
    setIsEditing(false);
    showToast('Lesson plan saved to your school library.');
  };

  const handleDeleteSavedPlan = (id: string) => {
    setSavedPlans((prev) => prev.filter((p) => p.id !== id));
    if (activeRecordId === id) {
      setActiveRecordId(null);
      setActivePlan(null);
    }
    setConfirmDeleteId(null);
    showToast('Saved lesson plan deleted.');
  };

  const handleLoadSavedPlan = (rec: SavedLessonPlanRecord) => {
    setClassLevel(rec.classLevel);
    setSubject(rec.subject);
    setTopic(rec.topic);
    setOutputLanguage(rec.outputLanguage);
    setMediumOfInstruction(rec.mediumOfInstruction);
    setDuration(rec.duration);
    setTeachingMethodology(rec.teachingMethodology);
    setAvailableTlm(rec.availableTlm);
    setActivePlan(rec.plan);
    setActiveRecordId(rec.id);
    setIsEditing(false);
    setErrorMessage(null);
  };

  const formatPlainTextPlan = (): string => {
    if (!activePlan) return '';
    const header = [
      `${school.name} — LESSON PLAN`,
      `Title: ${activePlan.title}`,
      `Class: ${classLevel} | Subject: ${subject} | Topic: ${topic || activePlan.title}`,
      `Language: ${outputLanguage} | Medium: ${mediumOfInstruction} | Duration: ${duration}`,
      `Teacher: ${teacherName}`,
      '------------------------------------------------------------',
    ].join('\n');

    const body = SECTION_LABELS.map(
      (sec) => `${sec.number}. ${sec.label}\n${activePlan[sec.key] || ''}`
    ).join('\n\n');

    return `${header}\n\n${body}`;
  };

  const handleDownloadPdf = async () => {
    if (!activePlan) return;
    const allowed = await guardSensitiveExport(`Lesson Plan PDF (${activePlan.title})`);
    if (!allowed) return;
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const isRtl = outputLanguage === 'Urdu' || outputLanguage === 'Kashmiri';

      if (isRtl) {
        // Multi-page canvas rasterization for crisp Urdu / Kashmiri Nastaleeq script
        const renderCanvasPage = (sectionsSlice: typeof SECTION_LABELS, isFirst: boolean) => {
          const canvas = document.createElement('canvas');
          canvas.width = 1240;
          canvas.height = 1754;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          let y = 80;
          if (isFirst) {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, canvas.width, 175);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 34px "Plus Jakarta Sans", Arial, sans-serif';
            ctx.fillText(school.name || 'SchoolMaster Lesson Plan', 60, 72);
            ctx.fillStyle = '#cbd5e1';
            ctx.font = '22px "Plus Jakarta Sans", Arial, sans-serif';
            ctx.fillText(
              `${classLevel}  |  ${subject}  |  ${duration}  |  ${outputLanguage}  |  Teacher: ${teacherName}`,
              60,
              120
            );
            y = 230;
          }

          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          const xRight = canvas.width - 64;
          const maxW = canvas.width - 128;

          for (const sec of sectionsSlice) {
            if (y > canvas.height - 100) break;
            ctx.fillStyle = '#312e81';
            ctx.font = 'bold 26px "Plus Jakarta Sans", Arial, sans-serif';
            ctx.fillText(`${sec.number}. ${sec.label}`, xRight, y);
            y += 42;

            ctx.fillStyle = '#0f172a';
            ctx.font = '24px "Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", "Noto Sans Arabic", serif';
            const content = String(activePlan[sec.key] || '');
            const words = content.split(/\s+/).filter(Boolean);
            let line = '';
            for (const word of words) {
              const cand = line ? `${line} ${word}` : word;
              if (ctx.measureText(cand).width > maxW && line) {
                if (y > canvas.height - 70) break;
                ctx.fillText(line, xRight, y);
                y += 42;
                line = word;
              } else {
                line = cand;
              }
            }
            if (line && y <= canvas.height - 70) {
              ctx.fillText(line, xRight, y);
              y += 52;
            }
          }
          return canvas.toDataURL('image/png');
        };

        const chunks = [SECTION_LABELS.slice(0, 5), SECTION_LABELS.slice(5, 10), SECTION_LABELS.slice(10)];
        chunks.forEach((slice, idx) => {
          const dataUrl = renderCanvasPage(slice, idx === 0);
          if (dataUrl) {
            if (idx > 0) doc.addPage();
            doc.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH);
          }
        });
      } else {
        const margin = 14;
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageW, 30, 'F');
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 30, pageW, 1.5, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text((school.name || 'SCHOOLMASTER').toUpperCase(), margin, 11.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(203, 213, 225);
        doc.text(
          `Lesson Plan  |  ${classLevel}  |  ${subject}  |  Duration: ${duration}  |  Medium: ${mediumOfInstruction}`,
          margin,
          18.5
        );
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(199, 210, 254);
        doc.text(`Topic: ${(activePlan.title || topic).slice(0, 85)}`, margin, 25.5);

        let y = 39;
        for (const sec of SECTION_LABELS) {
          const textVal = String(activePlan[sec.key] || '—');
          const wrapped = doc.splitTextToSize(textVal, pageW - margin * 2 - 4);
          const blockHeight = 7 + wrapped.length * 4.6 + 5;
          if (y + blockHeight > pageH - 16) {
            doc.addPage();
            y = 18;
          }
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(margin, y, pageW - margin * 2, blockHeight - 2, 1.5, 1.5, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(49, 46, 129);
          doc.text(`${sec.number}. ${sec.label}`, margin + 3, y + 5.5);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(30, 41, 59);
          doc.text(wrapped, margin + 3, y + 11);

          y += blockHeight;
        }
      }

      const safeTopic = (topic || activePlan.title || 'LessonPlan').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
      doc.save(`LessonPlan_${subject}_${safeTopic}.pdf`);
      showToast('Downloaded Lesson Plan as PDF.');
    } catch {
      showToast('Could not generate Lesson Plan PDF.');
    }
  };

  const handleDownloadWord = () => {
    if (!activePlan) return;
    const isRtl = outputLanguage === 'Urdu' || outputLanguage === 'Kashmiri';
    const escHtml = (str: string) =>
      String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');

    const sectionsHtml = SECTION_LABELS.map(
      (sec) => `
        <div style="margin-bottom:14px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;">
          <h3 style="margin:0 0 6px 0;color:#1e1b4b;font-size:13pt;">${sec.number}. ${escHtml(sec.label)}</h3>
          <p style="margin:0;font-size:11pt;line-height:1.6;color:#0f172a;">${escHtml(activePlan[sec.key])}</p>
        </div>`
    ).join('');

    const htmlDoc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(activePlan.title || topic)}</title>
</head>
<body style="font-family:${isRtl ? "'Jameel Noori Nastaleeq','Noto Nastaliq Urdu',serif" : 'Calibri,Arial,sans-serif'};padding:20px;">
  <h1 style="margin:0 0 6px 0;color:#0f172a;">${escHtml(school.name)} — Lesson Plan</h1>
  <p style="margin:0 0 16px 0;color:#475569;font-size:10.5pt;">
    <strong>Title:</strong> ${escHtml(activePlan.title || topic)} &nbsp;|&nbsp;
    <strong>Class:</strong> ${escHtml(classLevel)} &nbsp;|&nbsp;
    <strong>Subject:</strong> ${escHtml(subject)} &nbsp;|&nbsp;
    <strong>Duration:</strong> ${escHtml(duration)} &nbsp;|&nbsp;
    <strong>Language:</strong> ${escHtml(outputLanguage)}
  </p>
  ${sectionsHtml}
</body>
</html>`;

    const blob = new Blob(['\ufeff', htmlDoc], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTopic = (topic || activePlan.title || 'LessonPlan').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    link.href = url;
    link.download = `LessonPlan_${subject}_${safeTopic}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Downloaded Lesson Plan as Word document (.doc).');
  };

  const handlePrintPlan = () => {
    if (!activePlan) return;
    window.print();
  };

  const handleSharePlan = async () => {
    const content = formatPlainTextPlan();
    if (!content) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Lesson Plan: ${activePlan?.title || topic}`,
          text: content,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(content);
      showToast('Lesson plan copied to clipboard for sharing.');
    } catch {
      showToast('Unable to share lesson plan on this browser.');
    }
  };

  const isRtlPlan = outputLanguage === 'Urdu' || outputLanguage === 'Kashmiri';

  return (
    <section
      aria-label="AI Lesson Plan Generator"
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600 shrink-0" />
            <h3 className="text-base font-bold text-slate-900">
              AI Lesson Plan Generator (English · اردو · کٲشُر)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Generate, edit, save, print, and export complete 13-section NEP 2020 lesson plans in PDF or Word format.
          </p>
        </div>
        <span className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap shrink-0">
          Saved Plans: {savedPlans.length}
        </span>
      </div>

      {/* Form Inputs */}
      <div className="p-5 border-b border-slate-100 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">Class</span>
            <select
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">Subject</span>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">Output Language</span>
            <select
              value={outputLanguage}
              onChange={(e) => setOutputLanguage(e.target.value as LessonPlanLanguage)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="English">English</option>
              <option value="Urdu">Urdu (اردو)</option>
              <option value="Kashmiri">Kashmiri (کٲشُر)</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">Duration</span>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
          <label className="space-y-1 lg:col-span-2">
            <span className="font-semibold text-slate-700 block">Lesson Topic *</span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Water Cycle & Conservation, Fractions, Mughal Architecture, Kashmiri Folk Poetry..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">Medium of Instruction</span>
            <select
              value={mediumOfInstruction}
              onChange={(e) => setMediumOfInstruction(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="English">English Medium</option>
              <option value="Urdu">Urdu Medium</option>
              <option value="Kashmiri">Kashmiri / Bilingual</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">Learning Objectives (Optional)</span>
            <input
              type="text"
              value={learningObjectives}
              onChange={(e) => setLearningObjectives(e.target.value)}
              placeholder="Specific outcomes you want students to achieve"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">Teaching Methodology</span>
            <input
              type="text"
              value={teachingMethodology}
              onChange={(e) => setTeachingMethodology(e.target.value)}
              placeholder="Activity-based, demonstration, group discussion..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">Available TLM</span>
            <input
              type="text"
              value={availableTlm}
              onChange={(e) => setAvailableTlm(e.target.value)}
              placeholder="Charts, models, chalkboard, flashcards..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            disabled={isGenerating || !topic.trim()}
            onClick={() => void handleGenerate()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating Lesson Plan...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{activePlan ? 'Regenerate Lesson Plan' : 'Generate Lesson Plan'}</span>
              </>
            )}
          </button>

          {notice && <span className="text-xs font-semibold text-emerald-700">{notice}</span>}
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-center justify-between gap-2">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-600 hover:text-rose-900"
              aria-label="Dismiss lesson plan error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Generated / Active Lesson Plan Preview & Editor */}
      {activePlan && (
        <div className="p-5 space-y-4 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div dir={isRtlPlan ? 'rtl' : 'ltr'} className="min-w-0">
              <h4 className={`text-base font-bold text-slate-900 ${isRtlPlan ? 'font-noori text-lg' : ''}`}>
                {activePlan.title || topic}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                {classLevel} · {subject} · {duration} · {outputLanguage}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditing((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  isEditing
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditing ? 'Done Editing' : 'Edit'}</span>
              </button>
              <button
                type="button"
                onClick={handleSavePlan}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Plan</span>
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Regenerate</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadWord}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Word (.doc)</span>
              </button>
              <button
                type="button"
                onClick={handlePrintPlan}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSharePlan()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {SECTION_LABELS.map((sec) => (
              <div
                key={sec.key}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5"
              >
                <div className="text-xs font-bold text-indigo-900">
                  {sec.number}. {sec.label}
                </div>
                {isEditing ? (
                  <textarea
                    rows={3}
                    dir={isRtlPlan ? 'rtl' : 'ltr'}
                    value={activePlan[sec.key] || ''}
                    onChange={(e) =>
                      setActivePlan((prev) =>
                        prev ? { ...prev, [sec.key]: e.target.value } : prev
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p
                    dir={isRtlPlan ? 'rtl' : 'ltr'}
                    className={`whitespace-pre-wrap text-slate-700 leading-relaxed ${
                      isRtlPlan ? 'text-right font-noori text-sm leading-loose' : 'text-xs'
                    }`}
                  >
                    {activePlan[sec.key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Lesson Plans Library */}
      {savedPlans.length > 0 && (
        <div className="p-5 space-y-3 bg-slate-50/40">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800">Saved Lesson Plans ({savedPlans.length})</h4>
            <span className="text-[11px] text-slate-500">Click any saved plan to view, edit, or export</span>
          </div>
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white overflow-hidden">
            {savedPlans.map((rec) => (
              <div
                key={rec.id}
                className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <button
                  type="button"
                  onClick={() => handleLoadSavedPlan(rec)}
                  className="text-left min-w-0 flex-1 hover:text-indigo-700 transition-colors"
                >
                  <p className="font-bold text-slate-900 truncate">{rec.plan.title || rec.topic}</p>
                  <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {rec.classLevel} · {rec.subject} · {rec.outputLanguage} · {rec.duration}
                  </p>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  {activeRecordId === rec.id && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <Check className="w-3.5 h-3.5" />
                      <span>Open</span>
                    </span>
                  )}
                  {confirmDeleteId === rec.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded-md border border-slate-300 bg-white text-slate-700 font-semibold text-[11px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedPlan(rec.id)}
                        className="px-2 py-1 rounded-md bg-rose-600 text-white font-semibold text-[11px]"
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(rec.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      aria-label={`Delete saved lesson plan ${rec.topic}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
