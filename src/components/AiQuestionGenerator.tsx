import React, { useState } from 'react';
import {
  FileText,
  ListChecks,
  CheckCircle2,
  XCircle,
  Download,
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  Sparkles,
  Globe,
  Edit3,
  Mic,
  MicOff,
} from 'lucide-react';
import { SchoolProfile, User } from '../types';
import { useVoiceDictation } from '../hooks/useVoiceDictation';

type QuestionMode = 'mcq' | 'true_false' | 'question_paper';
type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | 'Mixed';
type OutputLang = 'English' | 'Urdu' | 'Kashmiri';

interface McqItem {
  question: string;
  options: string[];
  correctOption: string;
  explanation: string;
}

interface TrueFalseItem {
  statement: string;
  isTrue: boolean;
  explanation: string;
}

export interface AiQuestionGeneratorProps {
  school: SchoolProfile;
  currentUser: User;
}

const SUBJECTS = [
  'English',
  'Urdu',
  'Science',
  'Social Science',
  'Kashmiri',
  'Mathematics',
  'Computer Science',
  'Environmental Studies',
];

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

async function exportQuestionSetPdf(params: {
  schoolName: string;
  title: string;
  subtitle: string;
  bodyText: string;
  isRtl: boolean;
  filename: string;
}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasNonLatin = /[\u0600-\u06FF\u0900-\u097F]/.test(params.bodyText);

  if (params.isRtl || hasNonLatin) {
    const canvasW = 1240;
    const canvasH = 1754;
    const margin = 80;
    const contentW = canvasW - margin * 2;
    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = canvasW;
    measureCanvas.height = canvasH;
    const mCtx = measureCanvas.getContext('2d');
    if (!mCtx) return;

    const fontStack = params.isRtl
      ? '28px "Noori Nastaleeq", "Noto Nastaliq Urdu", "Noto Sans Arabic", serif'
      : '26px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif';
    mCtx.font = fontStack;

    const wrapped: string[] = [];
    for (const para of params.bodyText.split('\n')) {
      const trimmed = para.trimEnd();
      if (!trimmed) {
        wrapped.push('');
        continue;
      }
      let line = '';
      for (const word of trimmed.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (mCtx.measureText(next).width > contentW && line) {
          wrapped.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      if (line) wrapped.push(line);
    }

    const lineH = params.isRtl ? 48 : 40;
    const linesPerFirst = Math.floor((canvasH - 270 - margin) / lineH);
    const linesPerNext = Math.floor((canvasH - margin * 2 - 60) / lineH);
    const pages: string[][] = [];
    let cursor = 0;
    pages.push(wrapped.slice(0, linesPerFirst));
    cursor = linesPerFirst;
    while (cursor < wrapped.length) {
      pages.push(wrapped.slice(cursor, cursor + linesPerNext));
      cursor += linesPerNext;
    }

    pages.forEach((lines, pageIdx) => {
      if (pageIdx > 0) doc.addPage();
      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);

      let y = margin;
      if (pageIdx === 0) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(margin, margin, contentW, 155);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(params.schoolName.slice(0, 56), margin + 28, margin + 52);
        ctx.fillStyle = '#CBD5E1';
        ctx.font = '22px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(params.subtitle.slice(0, 86), margin + 28, margin + 92);
        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(params.title.slice(0, 74), margin + 28, margin + 132);
        y = margin + 200;
      }

      ctx.fillStyle = '#1E293B';
      ctx.font = fontStack;
      ctx.direction = params.isRtl ? 'rtl' : 'ltr';
      ctx.textAlign = params.isRtl ? 'right' : 'left';
      const drawX = params.isRtl ? canvasW - margin : margin;

      lines.forEach((ln) => {
        if (ln) ctx.fillText(ln, drawX, y);
        y += lineH;
      });

      doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
    });
  } else {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const maxW = pageW - margin * 2;

    doc.setFillColor(15, 23, 42);
    doc.rect(margin, 12, maxW, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(params.schoolName.slice(0, 68), margin + 4, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(params.subtitle.slice(0, 96), margin + 4, 26.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(253, 230, 138);
    doc.text(params.title.slice(0, 86), margin + 4, 33);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let y = 45;
    const lines = doc.splitTextToSize(params.bodyText, maxW) as string[];
    lines.forEach((line) => {
      if (y > pageH - 16) {
        doc.addPage();
        y = 18;
      }
      doc.text(line, margin, y);
      y += 5.3;
    });
  }

  doc.save(params.filename);
}

export const AiQuestionGenerator: React.FC<AiQuestionGeneratorProps> = ({
  school,
  currentUser,
}) => {
  const [mode, setMode] = useState<QuestionMode>('mcq');
  const [subject, setSubject] = useState<string>('Science');
  const [classLevel, setClassLevel] = useState<string>('Class 8');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Medium');
  const [language, setLanguage] = useState<OutputLang>('English');
  const [kashmiriScript, setKashmiriScript] = useState<'perso-arabic' | 'devanagari'>('perso-arabic');
  const [chapterOrTopic, setChapterOrTopic] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [totalMarks, setTotalMarks] = useState<number>(50);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [showAnswerKey, setShowAnswerKey] = useState<boolean>(true);
  const [outputRtl, setOutputRtl] = useState<boolean>(false);

  // Results
  const [mcqs, setMcqs] = useState<McqItem[]>([]);
  const [mcqPicks, setMcqPicks] = useState<Record<number, string>>({});
  const [trueFalseList, setTrueFalseList] = useState<TrueFalseItem[]>([]);
  const [tfPicks, setTfPicks] = useState<Record<number, boolean>>({});
  const [questionPaperText, setQuestionPaperText] = useState<string>('');
  const [isEditingPaper, setIsEditingPaper] = useState<boolean>(false);

  const {
    isSupported: isVoiceSupported,
    isListening: isVoiceListening,
    activeField: voiceActiveField,
    voiceError,
    startDictation,
  } = useVoiceDictation(language);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const scope = chapterOrTopic.trim();
    if (!scope) {
      setErrorMsg('Please enter a chapter name, topic, or syllabus scope first.');
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/smart-edu/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          subject,
          classLevel,
          difficulty,
          language,
          kashmiriScript,
          chapter: scope,
          topic: scope,
          questionCount,
          totalMarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to generate questions.');
      }

      setOutputRtl(Boolean(data.isRtl));

      if (mode === 'mcq') {
        setMcqs(Array.isArray(data.mcqs) ? data.mcqs : []);
        setMcqPicks({});
      } else if (mode === 'true_false') {
        setTrueFalseList(Array.isArray(data.trueFalseItems) ? data.trueFalseItems : []);
        setTfPicks({});
      } else {
        setQuestionPaperText(String(data.content || ''));
        setIsEditingPaper(false);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate questions right now.');
    } finally {
      setIsLoading(false);
    }
  };

  const buildPlainTextForExport = (includeAnswers: boolean): string => {
    if (mode === 'mcq' && mcqs.length > 0) {
      const letters = ['A', 'B', 'C', 'D'];
      const body = mcqs
        .map((m, i) => {
          const opts = (m.options || [])
            .map((o, oi) => `   ${letters[oi] || oi + 1}) ${o}`)
            .join('\n');
          return `Q${i + 1}. ${m.question}\n${opts}`;
        })
        .join('\n\n');
      if (!includeAnswers) return body;
      const key = mcqs
        .map((m, i) => `Q${i + 1}: ${m.correctOption} — ${m.explanation}`)
        .join('\n');
      return `${body}\n\n================ ANSWER KEY ================\n${key}`;
    }

    if (mode === 'true_false' && trueFalseList.length > 0) {
      const body = trueFalseList
        .map((item, i) => `Q${i + 1}. ${item.statement}   [ True / False ]`)
        .join('\n\n');
      if (!includeAnswers) return body;
      const key = trueFalseList
        .map((item, i) => `Q${i + 1}: ${item.isTrue ? 'TRUE' : 'FALSE'} — ${item.explanation}`)
        .join('\n');
      return `${body}\n\n================ ANSWER KEY ================\n${key}`;
    }

    return questionPaperText;
  };

  const hasOutput =
    (mode === 'mcq' && mcqs.length > 0) ||
    (mode === 'true_false' && trueFalseList.length > 0) ||
    (mode === 'question_paper' && Boolean(questionPaperText.trim()));

  const handleCopy = async () => {
    const text = buildPlainTextForExport(showAnswerKey);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleDownloadPdf = async (includeAnswers: boolean) => {
    const bodyText = buildPlainTextForExport(includeAnswers);
    if (!bodyText) return;
    const modeLabel =
      mode === 'mcq'
        ? 'MCQ Assessment'
        : mode === 'true_false'
        ? 'True / False Assessment'
        : `Full Question Paper (${totalMarks} Marks)`;
    await exportQuestionSetPdf({
      schoolName: school.name || 'SchoolMaster Institution',
      title: `${subject} — ${modeLabel} (${chapterOrTopic})`,
      subtitle: `${classLevel} · Difficulty: ${difficulty} · Language: ${language} · Prepared by ${currentUser.name}`,
      bodyText,
      isRtl: outputRtl,
      filename: `${subject.replace(/\s+/g, '_')}_${mode}_${classLevel.replace(/\s+/g, '')}.pdf`,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-600" />
            <span>AI Question Generator</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Generate custom MCQs, True/False quizzes, and balanced full Question Papers with Answer Keys using Gemini AI.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 gap-1 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setMode('mcq')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
              mode === 'mcq' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-white'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>MCQs</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('true_false')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
              mode === 'true_false' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>True / False</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('question_paper')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
              mode === 'question_paper' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Question Paper</span>
          </button>
        </div>
      </div>

      {/* Configuration Form */}
      <form
        onSubmit={handleGenerate}
        className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-slate-800"
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Class / Grade</label>
            <select
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-slate-800"
            >
              {CLASSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Difficulty Level</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-slate-800"
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
              <option value="Mixed">Mixed (Board Pattern)</option>
            </select>
          </div>

          {mode === 'question_paper' ? (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Total Marks</label>
              <select
                value={totalMarks}
                onChange={(e) => setTotalMarks(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-slate-800 font-mono"
              >
                {[20, 25, 30, 40, 50, 80, 100].map((m) => (
                  <option key={m} value={m}>{m} Marks</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Number of Questions</label>
              <select
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-slate-800 font-mono"
              >
                {[5, 8, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>{n} Questions</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Language & Topic Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end text-xs">
          <div className="lg:col-span-6">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block font-bold text-slate-700">
                Textbook Title / Chapter Name / Topic <span className="text-rose-600">*</span>
              </label>
              {isVoiceListening && voiceActiveField === 'standalone-qa-topic' && (
                <span className="text-[11px] font-semibold text-rose-600">Listening ({language})...</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={chapterOrTopic}
                onChange={(e) => setChapterOrTopic(e.target.value)}
                placeholder="e.g., Force and Pressure, Photosynthesis, Chapters 1–4 Revision..."
                className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <button
                type="button"
                data-testid="standalone-qa-voice-input-btn"
                title={isVoiceSupported ? 'Dictate topic using microphone' : 'Web Speech API unsupported in this browser'}
                onClick={() =>
                  startDictation('standalone-qa-topic', (spoken) => {
                    setChapterOrTopic((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
                  })
                }
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                  isVoiceListening && voiceActiveField === 'standalone-qa-topic'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-slate-100 hover:bg-indigo-50 text-slate-800 border-slate-300'
                }`}
              >
                {isVoiceListening && voiceActiveField === 'standalone-qa-topic' ? (
                  <MicOff className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Mic className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                )}
                <span>{isVoiceListening && voiceActiveField === 'standalone-qa-topic' ? 'Stop' : 'Voice Input'}</span>
              </button>
            </div>
            {voiceError && <p className="text-[11px] text-rose-600 mt-1 font-medium">{voiceError}</p>}
          </div>

          <div className="lg:col-span-4">
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-indigo-600" />
              <span>Language</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['English', 'Urdu', 'Kashmiri'] as OutputLang[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className={`px-3 py-2 rounded-xl border font-bold transition-colors ${
                    language === lang
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {lang}
                </button>
              ))}
              {language === 'Kashmiri' && (
                <select
                  value={kashmiriScript}
                  onChange={(e) => setKashmiriScript(e.target.value as 'perso-arabic' | 'devanagari')}
                  className="px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700"
                >
                  <option value="perso-arabic">Perso-Arabic (RTL)</option>
                  <option value="devanagari">Devanagari (LTR)</option>
                </select>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Generating...' : 'Generate'}</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}
      </form>

      {/* Output Area */}
      {hasOutput && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-black text-slate-900">
                {subject} · {classLevel} · {difficulty} ({language})
              </h2>
              <p className="text-xs text-slate-500">Topic: {chapterOrTopic}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {mode !== 'question_paper' && (
                <button
                  type="button"
                  onClick={() => setShowAnswerKey((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100"
                >
                  {showAnswerKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showAnswerKey ? 'Hide Answer Key' : 'Show Answer Key'}</span>
                </button>
              )}
              {mode === 'question_paper' && (
                <button
                  type="button"
                  onClick={() => setIsEditingPaper((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingPaper ? 'Done Editing' : 'Edit Paper'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF (with Key)</span>
              </button>
              {mode !== 'question_paper' && (
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Student PDF</span>
                </button>
              )}
            </div>
          </div>

          {/* 1. MCQs Output */}
          {mode === 'mcq' && (
            <div dir={outputRtl ? 'rtl' : 'ltr'} className="space-y-3">
              {mcqs.map((m, idx) => {
                const picked = mcqPicks[idx];
                const correctLetter = (m.correctOption || '').trim().toUpperCase().slice(0, 1);
                const letters = ['A', 'B', 'C', 'D'];
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5 ${
                      outputRtl ? 'font-urdu text-sm leading-loose' : 'text-xs'
                    }`}
                  >
                    <p className="font-extrabold text-slate-900">
                      Q{idx + 1}. {m.question}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(m.options || []).map((opt, oi) => {
                        const letter = letters[oi] || String(oi + 1);
                        const isSelected = picked === letter;
                        const isRight = letter === correctLetter;
                        const reveal = showAnswerKey || Boolean(picked);
                        let btnStyle = 'bg-white border-slate-200 text-slate-800 hover:border-indigo-300';
                        if (reveal && isRight) {
                          btnStyle = 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold';
                        } else if (isSelected && !isRight) {
                          btnStyle = 'bg-rose-50 border-rose-400 text-rose-900';
                        }
                        return (
                          <button
                            key={oi}
                            type="button"
                            onClick={() => setMcqPicks((prev) => ({ ...prev, [idx]: letter }))}
                            className={`text-left px-3 py-2 rounded-lg border transition-colors ${btnStyle}`}
                          >
                            <span className="font-mono font-bold mr-1.5">{letter})</span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                    {(showAnswerKey || picked) && (
                      <div className="rounded-lg bg-emerald-50/80 border border-emerald-200 px-3 py-2 text-emerald-900">
                        <span className="font-extrabold">Answer: {m.correctOption}</span> — {m.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. True / False Output */}
          {mode === 'true_false' && (
            <div dir={outputRtl ? 'rtl' : 'ltr'} className="space-y-3">
              {trueFalseList.map((item, idx) => {
                const picked = tfPicks[idx];
                const hasPicked = typeof picked === 'boolean';
                const reveal = showAnswerKey || hasPicked;
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5 ${
                      outputRtl ? 'font-urdu text-sm leading-loose' : 'text-xs'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="font-extrabold text-slate-900">
                        Q{idx + 1}. {item.statement}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {[true, false].map((val) => {
                          const isChoice = picked === val;
                          const isCorrectChoice = item.isTrue === val;
                          let cls = 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100';
                          if (reveal && isCorrectChoice) {
                            cls = 'bg-emerald-600 border-emerald-600 text-white';
                          } else if (isChoice && !isCorrectChoice) {
                            cls = 'bg-rose-600 border-rose-600 text-white';
                          }
                          return (
                            <button
                              key={String(val)}
                              type="button"
                              onClick={() => setTfPicks((prev) => ({ ...prev, [idx]: val }))}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border font-bold text-xs transition-colors ${cls}`}
                            >
                              {val ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                              <span>{val ? 'True' : 'False'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {reveal && (
                      <div className="rounded-lg bg-emerald-50/80 border border-emerald-200 px-3 py-2 text-emerald-900">
                        <span className="font-extrabold">
                          Answer: {item.isTrue ? 'True' : 'False'}
                        </span>{' '}
                        — {item.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. Full Question Paper Output */}
          {mode === 'question_paper' && (
            <div dir={outputRtl ? 'rtl' : 'ltr'}>
              {isEditingPaper ? (
                <textarea
                  value={questionPaperText}
                  onChange={(e) => setQuestionPaperText(e.target.value)}
                  rows={22}
                  className={`w-full p-4 rounded-xl border border-indigo-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 whitespace-pre-wrap ${
                    outputRtl ? 'font-urdu text-sm leading-loose' : 'text-xs font-mono leading-relaxed'
                  }`}
                />
              ) : (
                <div
                  className={`p-4 rounded-xl border border-slate-200 bg-slate-50/70 whitespace-pre-wrap leading-relaxed text-slate-800 ${
                    outputRtl ? 'font-urdu text-sm leading-loose' : 'text-xs'
                  }`}
                >
                  {questionPaperText}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
