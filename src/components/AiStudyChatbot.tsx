import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Send,
  Languages,
  Sparkles,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  GraduationCap,
  Globe,
} from 'lucide-react';
import { Language } from '../utils/translations';

type EduLang = 'English' | 'Urdu' | 'Kashmiri';

interface StudyMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  lang: EduLang;
  isRtl: boolean;
  timestamp: string;
  translations?: Partial<Record<EduLang, { text: string; isRtl: boolean }>>;
}

export interface AiStudyChatbotProps {
  language?: Language;
  schoolName?: string;
}

const CHAT_STORAGE_KEY = 'sm_ai_study_chatbot_v2';

const SUBJECTS = [
  'Science',
  'Mathematics',
  'English',
  'Urdu',
  'Social Science',
  'Kashmiri',
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

const STARTER_PROMPTS = [
  { subject: 'Science', text: 'Explain photosynthesis step by step with a simple example.' },
  { subject: 'Mathematics', text: 'How do I solve linear equations with fractions? Show each step.' },
  { subject: 'Social Science', text: 'Explain the water cycle and why conservation of freshwater matters.' },
  { subject: 'English', text: 'Explain active and passive voice with 4 clear classroom examples.' },
];

export const AiStudyChatbot: React.FC<AiStudyChatbotProps> = ({
  language = 'en',
  schoolName = 'SchoolMaster Institution',
}) => {
  const [activeMode, setActiveMode] = useState<'chat' | 'translate'>('chat');
  const [subject, setSubject] = useState<string>('Science');
  const [classLevel, setClassLevel] = useState<string>('Class 8');
  const [selectedLang, setSelectedLang] = useState<EduLang>(language === 'ur' ? 'Urdu' : 'English');
  const [kashmiriScript, setKashmiriScript] = useState<'perso-arabic' | 'devanagari'>('perso-arabic');

  // Chat state
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [translatingKey, setTranslatingKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StudyMessage[]>(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'welcome-study',
        role: 'assistant',
        lang: 'English',
        isRtl: false,
        timestamp: new Date().toISOString(),
        text: `Welcome to the AI Study Assistant for ${schoolName}! Ask any school question to get clear step-by-step explanations, or translate educational content naturally between English, Urdu, and Kashmiri.`,
      },
    ];
  });

  // Standalone Translator panel state
  const [sourceText, setSourceText] = useState<string>('');
  const [targetLang, setTargetLang] = useState<EduLang>('Urdu');
  const [translatedResult, setTranslatedResult] = useState<{ text: string; isRtl: boolean; lang: EduLang } | null>(null);
  const [isTranslatingPanel, setIsTranslatingPanel] = useState<boolean>(false);

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      // ignore
    }
  }, [messages]);

  useEffect(() => {
    if (activeMode === 'chat') {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSending, activeMode]);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
    } catch {
      // ignore
    }
  };

  const handleSendMessage = async (overrideText?: string, overrideSubject?: string) => {
    const prompt = (overrideText ?? inputText).trim();
    const activeSubject = overrideSubject ?? subject;
    if (!prompt || isSending) return;

    setErrorMsg(null);
    const userIsRtl =
      selectedLang === 'Urdu' || (selectedLang === 'Kashmiri' && kashmiriScript === 'perso-arabic');
    const userMsg: StudyMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      text: prompt,
      lang: selectedLang,
      isRtl: userIsRtl,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInputText('');
    setIsSending(true);

    try {
      const res = await fetch('/api/smart-edu/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chatbot',
          subject: activeSubject,
          classLevel,
          language: selectedLang,
          kashmiriScript,
          question: prompt,
          chatHistory: nextHistory
            .filter((m) => m.id !== 'welcome-study')
            .slice(-8)
            .map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI Study Assistant failed to respond.');
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: String(data.content || ''),
          lang: selectedLang,
          isRtl: Boolean(data.isRtl),
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to connect to Gemini Study Assistant.');
    } finally {
      setIsSending(false);
    }
  };

  const handleTranslateMessage = async (msg: StudyMessage, destLang: EduLang) => {
    const key = `${msg.id}-${destLang}`;
    if (translatingKey) return;
    setTranslatingKey(key);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/smart-edu/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'translate',
          subject,
          classLevel,
          language: msg.lang,
          targetLanguage: destLang,
          kashmiriScript,
          question: msg.text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Translation failed.');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                translations: {
                  ...(m.translations || {}),
                  [destLang]: { text: String(data.content || ''), isRtl: Boolean(data.isRtl) },
                },
              }
            : m
        )
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not translate message.');
    } finally {
      setTranslatingKey(null);
    }
  };

  const handleStandaloneTranslate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceText.trim() || isTranslatingPanel) return;
    setIsTranslatingPanel(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/smart-edu/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'translate',
          subject,
          classLevel,
          language: selectedLang,
          targetLanguage: targetLang,
          kashmiriScript,
          question: sourceText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Translation request failed.');
      setTranslatedResult({
        text: String(data.content || ''),
        isRtl: Boolean(data.isRtl),
        lang: targetLang,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to translate educational text.');
    } finally {
      setIsTranslatingPanel(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">
              AI Study Assistant &amp; Multilingual Translator
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Powered by Gemini AI — ask questions for step-by-step explanations and translate between English, Urdu, and Kashmiri.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 gap-1 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setActiveMode('chat')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeMode === 'chat' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-white'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Step-by-Step Tutor</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('translate')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeMode === 'translate' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-white'
            }`}
          >
            <Languages className="w-4 h-4" />
            <span>English · Urdu · Kashmiri Translator</span>
          </button>
        </div>
      </div>

      {/* Shared Context Bar (Subject, Class, Language) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center gap-3 text-xs">
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 font-bold text-slate-800"
        >
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={classLevel}
          onChange={(e) => setClassLevel(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 font-bold text-slate-800"
        >
          {CLASSES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <Globe className="w-4 h-4 text-indigo-600" />
          <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200">
            {(['English', 'Urdu', 'Kashmiri'] as EduLang[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setSelectedLang(lang)}
                className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                  selectedLang === lang ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {selectedLang === 'Kashmiri' || targetLang === 'Kashmiri' ? (
          <select
            value={kashmiriScript}
            onChange={(e) => setKashmiriScript(e.target.value as 'perso-arabic' | 'devanagari')}
            className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700"
          >
            <option value="perso-arabic">Kashmiri: Perso-Arabic (RTL)</option>
            <option value="devanagari">Kashmiri: Devanagari (LTR)</option>
          </select>
        ) : null}

        {activeMode === 'chat' && messages.length > 1 && (
          <button
            type="button"
            onClick={() =>
              setMessages([
                {
                  id: 'welcome-study',
                  role: 'assistant',
                  lang: 'English',
                  isRtl: false,
                  timestamp: new Date().toISOString(),
                  text: `Chat cleared. Ask any ${subject} (${classLevel}) question to get step-by-step explanations!`,
                },
              ])
            }
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Chat</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* MODE 1: STEP-BY-STEP STUDY ASSISTANT CHAT */}
      {activeMode === 'chat' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          {/* Starter Prompts */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              Try asking:
            </span>
            {STARTER_PROMPTS.map((sp, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setSubject(sp.subject);
                  void handleSendMessage(sp.text, sp.subject);
                }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
              >
                {sp.text}
              </button>
            ))}
          </div>

          {/* Messages Stream */}
          <div className="p-4 sm:p-5 space-y-4 min-h-[340px] max-h-[520px] overflow-y-auto bg-slate-50/40">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  dir={msg.isRtl ? 'rtl' : 'ltr'}
                  className={`max-w-[88%] rounded-2xl px-4 py-3 whitespace-pre-wrap leading-relaxed shadow-2xs ${
                    msg.isRtl ? 'font-urdu text-sm leading-loose' : 'text-xs'
                  } ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  {msg.text}
                </div>

                {/* Inline One-Click Translation Bar on AI Replies */}
                {msg.role === 'assistant' && msg.id !== 'welcome-study' && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400">Translate reply:</span>
                    {(['English', 'Urdu', 'Kashmiri'] as EduLang[])
                      .filter((l) => l !== msg.lang)
                      .map((dest) => {
                        const isBusy = translatingKey === `${msg.id}-${dest}`;
                        return (
                          <button
                            key={dest}
                            type="button"
                            disabled={Boolean(translatingKey)}
                            onClick={() => void handleTranslateMessage(msg, dest)}
                            className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold transition-colors disabled:opacity-50"
                          >
                            {isBusy ? `Translating to ${dest}...` : `→ ${dest}`}
                          </button>
                        );
                      })}
                    <button
                      type="button"
                      onClick={() => void handleCopy(msg.text, msg.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-semibold"
                    >
                      {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                {/* Rendered Translations underneath message */}
                {msg.translations &&
                  Object.entries(msg.translations).map(([tLang, tObj]) => {
                    if (!tObj) return null;
                    return (
                      <div
                        key={tLang}
                        dir={tObj.isRtl ? 'rtl' : 'ltr'}
                        className={`mt-2 max-w-[88%] rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2.5 text-slate-800 whitespace-pre-wrap ${
                          tObj.isRtl ? 'font-urdu text-sm leading-loose' : 'text-xs leading-relaxed'
                        }`}
                      >
                        <span
                          dir="ltr"
                          className="block text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 mb-1"
                        >
                          {tLang} Translation
                        </span>
                        {tObj.text}
                      </div>
                    );
                  })}
              </div>
            ))}

            {isSending && (
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Preparing step-by-step explanation in {selectedLang}...</span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendMessage();
            }}
            className="p-4 border-t border-slate-200 bg-white flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Ask any ${subject} (${classLevel}) question in ${selectedLang}...`}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Ask AI</span>
            </button>
          </form>
        </div>
      ) : (
        /* MODE 2: EDUCATIONAL TRANSLATOR (ENGLISH <-> URDU <-> KASHMIRI) */
        <form
          onSubmit={handleStandaloneTranslate}
          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-slate-900">
                Natural Educational Translator (English · Urdu · Kashmiri)
              </h2>
              <p className="text-xs text-slate-500">
                Paste definitions, lesson paragraphs, or exam questions to translate accurately with subject-appropriate phrasing.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-600">Translate to:</span>
              {(['English', 'Urdu', 'Kashmiri'] as EduLang[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setTargetLang(lang)}
                  className={`px-3 py-1.5 rounded-xl border font-bold transition-colors ${
                    targetLang === lang
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Source Educational Content
              </label>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={7}
                placeholder="Paste any educational paragraph, science definition, or homework question..."
                className="w-full p-3.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <button
                type="submit"
                disabled={isTranslatingPanel || !sourceText.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60"
              >
                <Languages className="w-4 h-4" />
                <span>{isTranslatingPanel ? 'Translating...' : `Translate to ${targetLang}`}</span>
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700">
                  Translated Output ({translatedResult?.lang || targetLang})
                </label>
                {translatedResult && (
                  <button
                    type="button"
                    onClick={() => void handleCopy(translatedResult.text, 'trans-out')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline"
                  >
                    {copiedId === 'trans-out' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === 'trans-out' ? 'Copied' : 'Copy Translation'}</span>
                  </button>
                )}
              </div>
              <div
                dir={translatedResult?.isRtl ? 'rtl' : 'ltr'}
                className={`min-h-[180px] p-4 rounded-xl border border-slate-200 bg-slate-50/70 whitespace-pre-wrap text-slate-800 ${
                  translatedResult?.isRtl ? 'font-urdu text-sm leading-loose' : 'text-xs leading-relaxed'
                }`}
              >
                {translatedResult ? (
                  translatedResult.text
                ) : (
                  <span className="text-slate-400">
                    Your natural classroom translation in {targetLang} will appear here.
                  </span>
                )}
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
