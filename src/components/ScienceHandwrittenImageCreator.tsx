import React, { useState } from 'react';
import {
  FlaskConical,
  PenTool,
  Plus,
  Download,
  Eye,
  RefreshCw,
  Trash2,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  BookOpen,
  ShieldAlert,
} from 'lucide-react';
import {
  NotebookInkTheme,
  ScienceNoteSheet,
  renderScienceNoteToCanvas,
} from '../utils/scienceNotebookCanvas';

export type ScienceSubjectOption =
  | 'Physics'
  | 'Chemistry'
  | 'Biology'
  | 'Environmental Science'
  | 'General Science';

const SCIENCE_SUBJECTS: Array<{ id: ScienceSubjectOption; sample: string }> = [
  { id: 'Physics', sample: "Ohm's Law & Series vs Parallel Circuits" },
  { id: 'Chemistry', sample: 'Structure of Atom & Bohr Atomic Model' },
  { id: 'Biology', sample: 'Photosynthesis Process & Chloroplast Diagram' },
  { id: 'Environmental Science', sample: 'Water Cycle & Carbon Cycle in Ecosystem' },
  { id: 'General Science', sample: 'States of Matter & Change of State' },
];

const CLASS_LEVELS = [
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11',
  'Class 12',
];

interface GeneratedSciencePage {
  id: string;
  pageNumber: number;
  subject: ScienceSubjectOption;
  classLevel: string;
  topic: string;
  focusHint: string;
  inkTheme: NotebookInkTheme;
  noteSheet: ScienceNoteSheet;
  pngDataUrl: string;
  jpgDataUrl: string;
  regenerateCount: number;
  createdAt: string;
}

interface ScienceHandwrittenImageCreatorProps {
  defaultClassLevel?: string;
  onExit: () => void;
  onNotify?: (msg: string) => void;
}

export const ScienceHandwrittenImageCreator: React.FC<ScienceHandwrittenImageCreatorProps> = ({
  defaultClassLevel = 'Class 10',
  onExit,
  onNotify,
}) => {
  const [subject, setSubject] = useState<ScienceSubjectOption>('Physics');
  const [classLevel, setClassLevel] = useState<string>(
    CLASS_LEVELS.includes(defaultClassLevel) ? defaultClassLevel : 'Class 10'
  );
  const [topic, setTopic] = useState<string>('');
  const [focusHint, setFocusHint] = useState<string>('');
  const [inkTheme, setInkTheme] = useState<NotebookInkTheme>('dual-ink');

  const [pages, setPages] = useState<GeneratedSciencePage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<GeneratedSciencePage | null>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [regeneratingPageId, setRegeneratingPageId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [accuracyNotice, setAccuracyNotice] = useState<string | null>(null);

  const activePage = pages.find((p) => p.id === activePageId) || pages[pages.length - 1] || null;

  const generatePageRequest = async (params: {
    subject: ScienceSubjectOption;
    classLevel: string;
    topic: string;
    focusHint: string;
    pageNumber: number;
    inkTheme: NotebookInkTheme;
    regenerateSeed?: number;
  }): Promise<GeneratedSciencePage> => {
    const res = await fetch('/api/ai/science-handwritten-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: params.subject,
        classLevel: params.classLevel,
        topic: params.topic,
        focusHint: params.focusHint,
        pageNumber: params.pageNumber,
        regenerateSeed: params.regenerateSeed || 0,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data?.ok || !data?.noteSheet) {
      throw new Error(data?.error || 'Unable to generate Science handwritten notebook page.');
    }

    if (data.accuracyVerificationNote) {
      setAccuracyNotice(String(data.accuracyVerificationNote));
    }

    const rendered = await renderScienceNoteToCanvas({
      subject: params.subject,
      classLevel: params.classLevel,
      pageNumber: params.pageNumber,
      noteSheet: data.noteSheet as ScienceNoteSheet,
      inkTheme: params.inkTheme,
    });

    return {
      id: `sci-page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      pageNumber: params.pageNumber,
      subject: params.subject,
      classLevel: params.classLevel,
      topic: params.topic,
      focusHint: params.focusHint,
      inkTheme: params.inkTheme,
      noteSheet: data.noteSheet as ScienceNoteSheet,
      pngDataUrl: rendered.pngDataUrl,
      jpgDataUrl: rendered.jpgDataUrl,
      regenerateCount: params.regenerateSeed || 0,
      createdAt: new Date().toLocaleTimeString(),
    };
  };

  const handleGenerateOrAddPage = async (isAddNext: boolean) => {
    const cleanTopic = topic.trim();
    if (cleanTopic.length < 3) {
      setErrorMsg('Please enter a Science topic, formula, or diagram concept first.');
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    try {
      const nextPageNum = isAddNext ? pages.length + 1 : pages.length === 0 ? 1 : pages.length + 1;
      const created = await generatePageRequest({
        subject,
        classLevel,
        topic: cleanTopic,
        focusHint: focusHint.trim(),
        pageNumber: nextPageNum,
        inkTheme,
      });

      setPages((prev) => [...prev, created]);
      setActivePageId(created.id);
      onNotify?.(`Generated handwritten ${subject} Page ${created.pageNumber} successfully.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate handwritten science image.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegeneratePage = async (target: GeneratedSciencePage) => {
    setErrorMsg(null);
    setRegeneratingPageId(target.id);
    try {
      const nextSeed = target.regenerateCount + 1;
      const regenerated = await generatePageRequest({
        subject: target.subject,
        classLevel: target.classLevel,
        topic: target.topic,
        focusHint: target.focusHint,
        pageNumber: target.pageNumber,
        inkTheme,
        regenerateSeed: nextSeed,
      });

      setPages((prev) =>
        prev.map((p) => (p.id === target.id ? { ...regenerated, id: target.id } : p))
      );
      if (previewPage?.id === target.id) {
        setPreviewPage({ ...regenerated, id: target.id });
      }
      onNotify?.(`Regenerated Page ${target.pageNumber} (${target.subject}).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to regenerate page right now.');
    } finally {
      setRegeneratingPageId(null);
    }
  };

  const handleDownloadImage = (page: GeneratedSciencePage, format: 'png' | 'jpg') => {
    const href = format === 'jpg' ? page.jpgDataUrl : page.pngDataUrl;
    const safeTopic = page.topic
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 36);
    const filename = `Science_Handwritten_${page.subject.replace(/\s+/g, '')}_Page${page.pageNumber}_${safeTopic || 'Notes'}.${format}`;
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotify?.(`Downloaded ${filename}`);
  };

  const handleClearProject = () => {
    setPages([]);
    setActivePageId(null);
    setPreviewPage(null);
    setTopic('');
    setFocusHint('');
    setErrorMsg(null);
    onNotify?.('Cleared all handwritten science pages from this session.');
  };

  const handleRemoveSinglePage = (id: string) => {
    setPages((prev) => {
      const filtered = prev
        .filter((p) => p.id !== id)
        .map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
      if (activePageId === id) {
        setActivePageId(filtered[filtered.length - 1]?.id || null);
      }
      return filtered;
    });
  };

  return (
    <section
      aria-label="AI Science Handwritten Image Creator"
      data-testid="science-handwritten-image-creator"
      className="space-y-5"
    >
      {/* Top Action Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-700 dark:text-sky-300 shrink-0">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span>AI Science Handwritten Image Creator</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Science-only handwritten notebook creator for Physics, Chemistry, Biology, Environmental Science &amp; General Science — with ruled pages, formulas, underlined terms &amp; labelled diagrams.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {pages.length > 0 && (
            <button
              type="button"
              onClick={handleClearProject}
              data-testid="science-clear-btn"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            data-testid="science-exit-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Controls Panel */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          {/* Science-Only Subject Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-800 dark:text-slate-100">
              1. Select Science Subject (Science-Only)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
              {SCIENCE_SUBJECTS.map((item) => {
                const active = subject === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSubject(item.id)}
                    className={`px-3 py-2.5 rounded-xl border text-left text-xs font-bold transition-colors ${
                      active
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-sky-400'
                    }`}
                  >
                    {item.id}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Class Level & Ink Style */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="sci-class-select" className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                Class Level
              </label>
              <select
                id="sci-class-select"
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100"
              >
                {CLASS_LEVELS.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sci-ink-select" className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                Handwriting Ink Style
              </label>
              <select
                id="sci-ink-select"
                value={inkTheme}
                onChange={(e) => setInkTheme(e.target.value as NotebookInkTheme)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="dual-ink">Red Headings + Blue Ink</option>
                <option value="classic-blue">Classic Blue Ballpoint</option>
                <option value="exam-black">Neat Exam Black Ink</option>
              </select>
            </div>
          </div>

          {/* Topic / Concept Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="sci-topic-input" className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                2. Science Topic, Formula, or Concept
              </label>
              <button
                type="button"
                onClick={() => {
                  const sample = SCIENCE_SUBJECTS.find((s) => s.id === subject)?.sample || '';
                  setTopic(sample);
                }}
                className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline"
              >
                Insert Example
              </button>
            </div>
            <textarea
              id="sci-topic-input"
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={`e.g., ${SCIENCE_SUBJECTS.find((s) => s.id === subject)?.sample}`}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          {/* Optional Diagram / Equation Focus */}
          <div className="space-y-1.5">
            <label htmlFor="sci-focus-input" className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              3. Specific Diagram or Formula Focus (Optional)
            </label>
            <input
              id="sci-focus-input"
              type="text"
              value={focusHint}
              onChange={(e) => setFocusHint(e.target.value)}
              placeholder="e.g., Include labelled circuit diagram, SI units, and balanced chemical equation"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Primary Generate & Add (+) Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={isGenerating}
              data-testid="science-generate-btn"
              onClick={() => void handleGenerateOrAddPage(false)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold transition-colors disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Handwritten Page...</span>
                </>
              ) : (
                <>
                  <PenTool className="w-4 h-4" />
                  <span>{pages.length === 0 ? 'Generate Handwritten Page' : 'Generate New Page'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isGenerating}
              data-testid="science-add-page-btn"
              onClick={() => void handleGenerateOrAddPage(true)}
              title="Add another handwritten page to the current Science project"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add (+)</span>
            </button>
          </div>

          {/* Accuracy Disclaimer */}
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              {accuracyNotice ||
                'Science-only educational tool. Always review generated formulas, chemical equations, and diagram labels against your prescribed textbook before classroom distribution.'}
            </span>
          </div>
        </div>

        {/* Right Preview & Multi-Page Project Panel */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>Handwritten Science Notebook Project ({pages.length} Page{pages.length === 1 ? '' : 's'})</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Preview, regenerate, add pages, or download individual pages as crisp PNG or JPG images.
              </p>
            </div>
            {activePage && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewPage(activePage)}
                  data-testid="science-preview-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  disabled={regeneratingPageId === activePage.id}
                  onClick={() => void handleRegeneratePage(activePage)}
                  data-testid="science-regenerate-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 text-xs font-bold transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${regeneratingPageId === activePage.id ? 'animate-spin' : ''}`} />
                  <span>Regenerate</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadImage(activePage, 'png')}
                  data-testid="science-download-png-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadImage(activePage, 'jpg')}
                  data-testid="science-download-jpg-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JPG</span>
                </button>
              </div>
            )}
          </div>

          {!activePage ? (
            <div className="py-16 px-6 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-300 flex items-center justify-center mx-auto">
                <PenTool className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Ready to Create Realistic Handwritten Science Notes
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Choose Physics, Chemistry, Biology, Environmental Science, or General Science on the left, enter a topic, and click Generate to create a ruled notebook page complete with formulas and a labelled diagram.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active Page Canvas Image Display */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 p-3 flex justify-center">
                <img
                  src={activePage.pngDataUrl}
                  alt={`Handwritten ${activePage.subject} notebook page ${activePage.pageNumber}: ${activePage.topic}`}
                  onClick={() => setPreviewPage(activePage)}
                  className="max-h-[560px] w-auto rounded-lg shadow-md border border-amber-200/80 cursor-zoom-in"
                />
              </div>

              {/* Multi-Page Thumbnail Strip */}
              {pages.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                    <span>Project Pages ({pages.length})</span>
                    <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Active: Page {activePage.pageNumber} · {activePage.subject}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                    {pages.map((pg) => {
                      const selected = pg.id === activePage.id;
                      return (
                        <div
                          key={pg.id}
                          className={`relative shrink-0 w-28 rounded-xl border p-1.5 transition-all cursor-pointer ${
                            selected
                              ? 'border-sky-500 ring-2 ring-sky-500/30 bg-sky-50/70 dark:bg-sky-950/50'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-sky-300'
                          }`}
                          onClick={() => setActivePageId(pg.id)}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSinglePage(pg.id);
                            }}
                            aria-label={`Remove page ${pg.pageNumber}`}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <img
                            src={pg.pngDataUrl}
                            alt={`Page ${pg.pageNumber}`}
                            className="w-full h-28 object-cover rounded-lg border border-slate-200"
                          />
                          <p className="text-[10px] font-bold text-slate-800 dark:text-slate-100 mt-1 truncate">
                            Pg {pg.pageNumber} · {pg.subject}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full-Size Preview Lightbox Modal */}
      {previewPage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full-Size Handwritten Science Page Preview"
          className="fixed inset-0 z-[95] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewPage(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Page {previewPage.pageNumber}: {previewPage.noteSheet.title}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {previewPage.subject} · {previewPage.classLevel} · Generated at {previewPage.createdAt}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadImage(previewPage, 'png')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadImage(previewPage, 'jpg')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download JPG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewPage(null)}
                  aria-label="Close preview"
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto bg-slate-100 dark:bg-slate-950 flex justify-center">
              <img
                src={previewPage.pngDataUrl}
                alt={previewPage.noteSheet.title}
                className="max-w-full h-auto rounded-lg shadow-xl border border-amber-200"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
