import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  RefreshCw,
  Edit3,
  Save,
  Download,
  Copy,
  Check,
  Trash2,
  AlertCircle,
  Globe,
  Clock,
  BookOpen,
  Share2,
  Mail,
  MessageCircle,
  HardDrive,
  WifiOff,
  Search,
  X,
  Mic,
  MicOff,
} from 'lucide-react';
import { SchoolProfile, User } from '../types';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { guardSensitiveExport } from '../utils/biometricProtection';
import {
  LESSON_SECTIONS,
  OfflineStorageEngine,
  OutputLang,
  SavedLessonPlanRecord,
  ShareChannel,
  StructuredLessonPlan,
} from '../types/lessonPlan';
import {
  exportLessonPlanPdf,
  LessonPlanPdfParams,
  lessonPlanToPlainText,
} from '../utils/lessonPlanPdf';
import {
  deleteOfflineLessonPlan,
  getOfflineStorageEngine,
  loadOfflineLessonPlans,
  saveOfflineLessonPlan,
  ShareLessonPlanResult,
  shareLessonPlanPdf,
} from '../utils/lessonPlanOfflineStore';

export interface LessonPlanGeneratorProps {
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
  'Environmental Studies',
  'Computer Science',
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

const DURATIONS = ['30 minutes', '40 minutes', '45 minutes', '60 minutes', '90 minutes'];

function storageEngineLabel(engine: OfflineStorageEngine): string {
  if (engine === 'room') return 'Room Database (Offline Ready)';
  if (engine === 'indexeddb') return 'Offline Local Database';
  return 'Local Offline Storage';
}

export const LessonPlanGenerator: React.FC<LessonPlanGeneratorProps> = ({
  school,
  currentUser,
}) => {
  const [subject, setSubject] = useState<string>('Science');
  const [classLevel, setClassLevel] = useState<string>('Class 8');
  const [topic, setTopic] = useState<string>('');
  const [chapter, setChapter] = useState<string>('');
  const [duration, setDuration] = useState<string>('40 minutes');
  const [language, setLanguage] = useState<OutputLang>('English');
  const [kashmiriScript, setKashmiriScript] = useState<'perso-arabic' | 'devanagari'>('perso-arabic');

  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [lessonPlan, setLessonPlan] = useState<StructuredLessonPlan | null>(null);
  const [isRtl, setIsRtl] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [sharingChannel, setSharingChannel] = useState<ShareChannel | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [savedSearch, setSavedSearch] = useState<string>('');
  const [shareAssist, setShareAssist] = useState<ShareLessonPlanResult | null>(null);

  const {
    isSupported: isVoiceSupported,
    isListening: isVoiceListening,
    activeField: voiceActiveField,
    voiceError,
    startDictation,
  } = useVoiceDictation(language);

  const [savedPlans, setSavedPlans] = useState<SavedLessonPlanRecord[]>([]);
  const [storageEngine, setStorageEngine] = useState<OfflineStorageEngine>(() =>
    getOfflineStorageEngine()
  );
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    let mounted = true;
    void loadOfflineLessonPlans().then(({ plans, engine }) => {
      if (!mounted) return;
      setSavedPlans(plans);
      setStorageEngine(engine);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const filteredSavedPlans = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return savedPlans;
    return savedPlans.filter((item) =>
      [item.plan.title, item.subject, item.classLevel, item.topic, item.chapter || '', item.language]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [savedPlans, savedSearch]);

  const showToast = (msg: string) => {
    setNoticeText(msg);
    window.setTimeout(() => setNoticeText((p) => (p === msg ? null : p)), 4200);
  };

  const buildPdfParams = (record?: SavedLessonPlanRecord): LessonPlanPdfParams | null => {
    if (record) {
      return {
        schoolName: record.schoolName || school.name || 'SchoolMaster Institution',
        schoolCode: school.code,
        teacherName: record.teacherName || currentUser.name,
        subject: record.subject,
        classLevel: record.classLevel,
        chapter: record.chapter || '',
        topic: record.topic,
        duration: record.duration,
        language: record.language,
        isRtl: record.isRtl,
        plan: record.plan,
      };
    }
    if (!lessonPlan) return null;
    return {
      schoolName: school.name || 'SchoolMaster Institution',
      schoolCode: school.code,
      teacherName: currentUser.name,
      subject,
      classLevel,
      chapter: chapter.trim(),
      topic: topic.trim() || lessonPlan.title,
      duration,
      language,
      isRtl,
      plan: lessonPlan,
    };
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTopic = topic.trim();
    if (!cleanTopic) {
      setErrorMsg('Please enter a lesson topic to generate a structured lesson plan.');
      return;
    }
    if (!isOnline) {
      setErrorMsg(
        'You are currently offline. You can open, edit, export PDF, and share any saved lesson plan below; internet is required only to generate a new AI plan.'
      );
      return;
    }

    setErrorMsg(null);
    setShareAssist(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/smart-edu/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'lesson_plan',
          subject,
          classLevel,
          chapter: chapter.trim() || cleanTopic,
          topic: cleanTopic,
          duration,
          language,
          kashmiriScript,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.lessonPlan) {
        throw new Error(data?.error || 'Failed to generate lesson plan.');
      }

      setLessonPlan(data.lessonPlan as StructuredLessonPlan);
      setActivePlanId(null);
      setIsRtl(Boolean(data.isRtl));
      setIsEditing(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate lesson plan right now.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCurrentPlan = async () => {
    if (!lessonPlan) return;
    const planId = activePlanId || `lp-${Date.now()}`;
    const record: SavedLessonPlanRecord = {
      id: planId,
      subject,
      classLevel,
      chapter: chapter.trim(),
      topic: topic.trim() || lessonPlan.title,
      duration,
      language,
      isRtl,
      teacherName: currentUser.name,
      schoolName: school.name || 'SchoolMaster Institution',
      plan: lessonPlan,
      savedAt: new Date().toISOString(),
      storageEngine,
    };
    const { engine } = await saveOfflineLessonPlan(record);
    setStorageEngine(engine);
    setActivePlanId(planId);
    setSavedPlans((prev) => [
      { ...record, storageEngine: engine },
      ...prev.filter((p) => p.id !== planId),
    ]);
    showToast(
      engine === 'room'
        ? 'Lesson plan saved offline in Room Database.'
        : 'Lesson plan saved offline for no-internet access.'
    );
  };

  const handleDeleteSavedPlan = async (id: string) => {
    await deleteOfflineLessonPlan(id);
    setSavedPlans((prev) => prev.filter((p) => p.id !== id));
    if (activePlanId === id) {
      setActivePlanId(null);
    }
    setConfirmDeleteId(null);
    showToast('Removed saved lesson plan from offline storage.');
  };

  const handleCopy = async () => {
    if (!lessonPlan) return;
    try {
      await navigator.clipboard.writeText(lessonPlanToPlainText(lessonPlan));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const handleExportPdf = async (record?: SavedLessonPlanRecord) => {
    const params = buildPdfParams(record);
    if (!params) return;
    const allowed = await guardSensitiveExport(`Lesson Plan PDF (${params.topic || params.subject})`);
    if (!allowed) return;
    setIsExportingPdf(true);
    setErrorMsg(null);
    try {
      const { fileName } = await exportLessonPlanPdf(params);
      showToast(`Exported structured PDF: ${fileName}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to export PDF right now.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleSharePdf = async (channel: ShareChannel, record?: SavedLessonPlanRecord) => {
    const params = buildPdfParams(record);
    if (!params) return;
    setSharingChannel(channel);
    setErrorMsg(null);
    setShareAssist(null);
    try {
      const result = await shareLessonPlanPdf(params, channel);
      showToast(result.message);
      if (result.method === 'desktop-download-assisted') {
        setShareAssist(result);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to prepare lesson plan PDF for sharing.');
    } finally {
      setSharingChannel(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>Lesson Plan Generator</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-1">
            <span>13 structured sections</span>
            <span aria-hidden="true">·</span>
            <span>jsPDF export</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
              <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
              {storageEngineLabel(storageEngine)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{savedPlans.length} saved offline</span>
          </div>
        </div>
        {noticeText && (
          <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            {noticeText}
          </div>
        )}
      </div>

      {/* Offline Status Banner (Functional guidance when disconnected) */}
      {!isOnline && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2.5">
          <WifiOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Offline Mode Active</p>
            <p className="text-amber-800 mt-0.5">
              All {savedPlans.length} lesson plans stored in {storageEngineLabel(storageEngine)} are available below to view, edit, export as PDF, and share. Reconnect to generate new AI plans.
            </p>
          </div>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={handleGenerate}
        className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 text-xs"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Class / Grade</label>
            <select
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {CLASSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Duration</span>
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-indigo-600" />
              <span>Teaching Language</span>
            </label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['English', 'Urdu', 'Kashmiri'] as OutputLang[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className={`flex-1 py-1.5 rounded-md font-semibold whitespace-nowrap transition-colors ${
                    language === lang
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5">
            <label className="block font-semibold text-slate-700 mb-1">
              Lesson Topic <span className="text-rose-600">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Photosynthesis in Green Plants, Fractions Addition..."
                className="flex-1 min-w-0 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <button
                type="button"
                title={isVoiceSupported ? 'Dictate lesson topic' : 'Web Speech API unavailable'}
                onClick={() =>
                  startDictation('standalone-lp-topic', (spoken) => {
                    setTopic((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
                  })
                }
                className={`inline-flex items-center gap-1 px-2.5 py-2.5 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 ${
                  isVoiceListening && voiceActiveField === 'standalone-lp-topic'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-slate-100 hover:bg-indigo-50 text-slate-800 border-slate-300'
                }`}
              >
                {isVoiceListening && voiceActiveField === 'standalone-lp-topic' ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : (
                  <Mic className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>{isVoiceListening && voiceActiveField === 'standalone-lp-topic' ? 'Stop' : 'Voice Input'}</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-4">
            <label className="block font-semibold text-slate-700 mb-1">Textbook Title / Chapter Name (Optional)</label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                placeholder="e.g., Chapter 1: Nutrition in Plants"
                className="flex-1 min-w-0 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                title={isVoiceSupported ? 'Dictate textbook title or chapter name' : 'Web Speech API unavailable'}
                onClick={() =>
                  startDictation('standalone-lp-chapter', (spoken) => {
                    setChapter((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
                  })
                }
                className={`inline-flex items-center gap-1 px-2.5 py-2.5 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 ${
                  isVoiceListening && voiceActiveField === 'standalone-lp-chapter'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-slate-100 hover:bg-indigo-50 text-slate-800 border-slate-300'
                }`}
              >
                {isVoiceListening && voiceActiveField === 'standalone-lp-chapter' ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : (
                  <Mic className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>{isVoiceListening && voiceActiveField === 'standalone-lp-chapter' ? 'Stop' : 'Voice Input'}</span>
              </button>
            </div>
          </div>
          {voiceError && (
            <div className="lg:col-span-12 text-[11px] font-medium text-rose-600">{voiceError}</div>
          )}

          {language === 'Kashmiri' && (
            <div className="lg:col-span-3">
              <label className="block font-semibold text-slate-700 mb-1">Kashmiri Script</label>
              <select
                value={kashmiriScript}
                onChange={(e) => setKashmiriScript(e.target.value as 'perso-arabic' | 'devanagari')}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700"
              >
                <option value="perso-arabic">Perso-Arabic (RTL)</option>
                <option value="devanagari">Devanagari (LTR)</option>
              </select>
            </div>
          )}

          <div className={language === 'Kashmiri' ? 'lg:col-span-12' : 'lg:col-span-3'}>
            <button
              type="submit"
              disabled={isLoading || !isOnline}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Generating Plan...' : 'Generate Lesson Plan'}</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-medium text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}
      </form>

      {/* Generated / Opened Structured Lesson Plan */}
      {lessonPlan && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={lessonPlan.title}
                  onChange={(e) => setLessonPlan({ ...lessonPlan, title: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-indigo-300 text-sm font-bold text-slate-900"
                />
              ) : (
                <h2 className="text-base font-bold text-slate-900">{lessonPlan.title}</h2>
              )}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-1">
                <span>{subject}</span>
                <span aria-hidden="true">·</span>
                <span>{classLevel}</span>
                <span aria-hidden="true">·</span>
                <span>{duration}</span>
                <span aria-hidden="true">·</span>
                <span>{language}</span>
                {chapter.trim() && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{chapter.trim()}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditing((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                  isEditing
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditing ? 'Finish Editing' : 'Edit Plan'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleSaveCurrentPlan()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{activePlanId ? 'Update Offline' : 'Save Offline'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={isExportingPdf}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExportingPdf ? 'Building PDF...' : 'Export PDF'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleSharePdf('whatsapp')}
                disabled={sharingChannel !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{sharingChannel === 'whatsapp' ? 'Preparing...' : 'WhatsApp PDF'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleSharePdf('email')}
                disabled={sharingChannel !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{sharingChannel === 'email' ? 'Preparing...' : 'Email PDF'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleSharePdf('chooser')}
                disabled={sharingChannel !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-50 text-slate-800 border border-slate-300 hover:bg-slate-100 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                title="Share PDF via system share sheet"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-50 text-slate-800 border border-slate-300 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Desktop Assisted Share Bar (when browser downloads PDF and provides 1-click WhatsApp/Email links) */}
          {shareAssist && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="text-indigo-950">
                <p className="font-semibold">PDF Ready to Attach: {shareAssist.fileName}</p>
                <p className="text-indigo-800 mt-0.5">
                  The structured PDF has been downloaded. Open WhatsApp or your Email app below and attach the file.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {shareAssist.whatsappHref && (
                  <a
                    href={shareAssist.whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold whitespace-nowrap"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Open WhatsApp</span>
                  </a>
                )}
                {shareAssist.mailtoHref && (
                  <a
                    href={shareAssist.mailtoHref}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold whitespace-nowrap"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Open Email</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShareAssist(null)}
                  className="p-1.5 rounded-lg text-indigo-700 hover:bg-indigo-100"
                  aria-label="Dismiss share helper"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div dir={isRtl ? 'rtl' : 'ltr'} className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {LESSON_SECTIONS.map(({ key, label }) => (
              <div
                key={key}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1.5"
              >
                <h3 className="text-xs font-bold text-indigo-950">{label}</h3>
                {isEditing ? (
                  <textarea
                    value={lessonPlan[key] || ''}
                    onChange={(e) => setLessonPlan({ ...lessonPlan, [key]: e.target.value })}
                    rows={4}
                    className={`w-full p-2.5 rounded-lg border border-indigo-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isRtl ? 'font-urdu text-sm leading-loose' : 'text-xs leading-relaxed'
                    }`}
                  />
                ) : (
                  <p
                    className={`text-slate-700 whitespace-pre-line ${
                      isRtl ? 'font-urdu text-sm leading-loose' : 'text-xs leading-relaxed'
                    }`}
                  >
                    {lessonPlan[key] || '—'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Offline Lesson Plans Library (Room Database on Android / IndexedDB on Web) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>Saved Offline Lesson Plans</span>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                ({savedPlans.length})
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Stored in {storageEngineLabel(storageEngine)} — accessible anytime without internet.
            </p>
          </div>

          {savedPlans.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                placeholder="Filter saved plans..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        {savedPlans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
            No offline lesson plans saved yet. Generate a lesson plan above and click{' '}
            <span className="font-semibold text-slate-700">Save Offline</span> to store it for offline classroom use.
          </div>
        ) : filteredSavedPlans.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 text-center text-xs text-slate-500">
            No saved lesson plans match &ldquo;{savedSearch}&rdquo;.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            {filteredSavedPlans.map((item) => (
              <div
                key={item.id}
                className="p-3.5 bg-white hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{item.plan.title}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                    <span>{item.subject}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.classLevel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.duration}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.language}</span>
                    {item.savedAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {new Date(item.savedAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActivePlanId(item.id);
                      setSubject(item.subject);
                      setClassLevel(item.classLevel);
                      setChapter(item.chapter || '');
                      setTopic(item.topic);
                      setDuration(item.duration);
                      setLanguage(item.language);
                      setIsRtl(item.isRtl);
                      setLessonPlan(item.plan);
                      setIsEditing(false);
                      setShareAssist(null);
                      showToast('Loaded saved offline lesson plan.');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] font-semibold whitespace-nowrap"
                  >
                    Open
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleExportPdf(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold whitespace-nowrap"
                    title="Export structured PDF"
                  >
                    <Download className="w-3 h-3" />
                    <span>PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSharePdf('whatsapp', item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-800 border border-green-200 text-[11px] font-semibold whitespace-nowrap"
                    title="Share PDF via WhatsApp"
                  >
                    <MessageCircle className="w-3 h-3" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSharePdf('email', item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold whitespace-nowrap"
                    title="Share PDF via Email"
                  >
                    <Mail className="w-3 h-3" />
                    <span>Email</span>
                  </button>

                  {confirmDeleteId === item.id ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDeleteSavedPlan(item.id)}
                        className="px-2 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-semibold whitespace-nowrap"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-[11px] whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                      title="Delete saved lesson plan"
                      aria-label="Delete saved lesson plan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
