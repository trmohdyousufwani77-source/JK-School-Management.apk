import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Bot,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { Language } from '../utils/translations';

interface SchoolMasterAiChatbotProps {
  language: Language;
  schoolName?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  subject: string;
  timestamp: string;
}

const SUBJECTS = [
  'Mathematics',
  'Science',
  'English',
  'Urdu & Languages',
  'Social Studies',
  'Computer & Coding',
  'Exam Prep & Tips',
];

const STARTER_PROMPTS = [
  { subject: 'Mathematics', text: 'Explain fractions and how to add 2/3 + 3/4 step by step.' },
  { subject: 'Science', text: 'What is photosynthesis and why is chlorophyll important?' },
  { subject: 'English', text: 'Write a short paragraph on the importance of daily school attendance.' },
  { subject: 'Exam Prep & Tips', text: 'Give me a 5-point revision checklist for Class 8 final exams.' },
];

const CHAT_STORAGE_KEY = 'school_master_ai_chatbot_history_v1';

export const SchoolMasterAiChatbot: React.FC<SchoolMasterAiChatbotProps> = ({
  language,
  schoolName = 'SchoolMaster Platform',
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('Mathematics');
  const [audience, setAudience] = useState<'Student' | 'Teacher' | 'Parent'>('Student');
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as ChatMessage[];
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'welcome-1',
        role: 'model',
        subject: 'General Studies',
        timestamp: new Date().toISOString(),
        text: `Welcome to **School Master AI**! I am your smart learning companion for ${schoolName}. Pick any subject above and ask a homework question, concept doubt, or exam prep query — I will guide you step by step.`,
      },
    ];
  });

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      // ignore quota
    }
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSendMessage = async (overrideText?: string, overrideSubject?: string) => {
    const query = (overrideText ?? inputText).trim();
    const activeSubject = overrideSubject ?? selectedSubject;
    if (!query || isSending) return;

    setErrorMsg(null);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
      subject: activeSubject,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInputText('');
    setIsSending(true);

    try {
      const response = await fetch('/api/ai-chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          subject: activeSubject,
          audience,
          history: nextHistory
            .filter((m) => m.id !== 'welcome-1')
            .slice(-8)
            .map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.reply) {
        throw new Error(data?.error || `AI request failed (HTTP ${response.status}).`);
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'model',
        text: String(data.reply),
        subject: activeSubject,
        timestamp: data.timestamp || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach School Master AI service.');
    } finally {
      setIsSending(false);
    }
  };

  const handleClearChat = () => {
    setErrorMsg(null);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'model',
        subject: selectedSubject,
        timestamp: new Date().toISOString(),
        text: `Chat cleared! Ask me any question in ${selectedSubject} or switch subjects anytime.`,
      },
    ]);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Branded Promotional Showcase Banner */}
      <section className="rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-950 text-white p-6 sm:p-8 shadow-xl border border-indigo-800/60 overflow-hidden relative">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs font-extrabold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{language === 'ur' ? 'اسمارٹ لرننگ ساتھی' : 'Your Smart Learning Companion!'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              SCHOOL MASTER AI CHATBOT – Your Smart Learning Companion!
            </h1>
            <p className="text-sm text-indigo-100/90 leading-relaxed">
              Instant study help, multi-subject step-by-step explanations, homework guidance, and 24/7 academic support designed for students, teachers, and parents.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
              {[
                '24/7 Instant Homework & Doubt Solving',
                'Multi-Subject Step-by-Step Explanations (Math, Science, English, Urdu)',
                'Exam Preparation Quizzes & Revision Checklists',
                'Student, Teacher & Parent Learning Modes',
                'NCERT & JKBOSE Curriculum-Aligned Study Guidance',
                'Safe, Student-Friendly Academic Companion',
              ].map((feat) => (
                <div key={feat} className="flex items-start gap-2 text-emerald-100">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="font-medium">{feat}</span>
                </div>
              ))}
            </div>
            <p className="text-sm font-extrabold text-amber-300 pt-1 italic">
              &ldquo;School Master AI – Learn Smart, Learn Better!&rdquo;
            </p>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
            <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center shadow-lg">
              <Bot className="w-11 h-11 text-amber-300" />
            </div>
            <a
              href="https://play.google.com/store/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg transition-colors"
            >
              <span>Download on Google Play Store</span>
              <ExternalLink className="w-4 h-4" />
            </a>
            <span className="text-[11px] text-indigo-200 font-medium">
              Powered by SchoolMaster Smart Learning Engine
            </span>
          </div>
        </div>
      </section>

      {/* Interactive Learning Companion Workspace */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Controls Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-indigo-600" />
              <h2 className="text-sm sm:text-base font-black text-slate-900">
                Interactive AI Study Assistant
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Role Selector */}
              <div className="inline-flex rounded-xl bg-white border border-slate-200 p-1 text-xs">
                {(['Student', 'Teacher', 'Parent'] as const).map((roleOption) => (
                  <button
                    key={roleOption}
                    type="button"
                    onClick={() => setAudience(roleOption)}
                    className={`px-3 py-1 rounded-lg font-bold transition-colors flex items-center gap-1 ${
                      audience === roleOption
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {roleOption === 'Parent' ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    <span>{roleOption}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleClearChat}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 text-xs font-bold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Chat</span>
              </button>
            </div>
          </div>

          {/* Subject Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
              Subject:
            </span>
            {SUBJECTS.map((subj) => (
              <button
                key={subj}
                type="button"
                onClick={() => setSelectedSubject(subj)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                  selectedSubject === subj
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                }`}
              >
                {subj}
              </button>
            ))}
          </div>
        </div>

        {/* Starter Prompts */}
        <div className="px-4 sm:px-5 py-3 bg-indigo-50/40 border-b border-indigo-100/70 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-extrabold text-indigo-800 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            Try asking:
          </span>
          {STARTER_PROMPTS.map((item) => (
            <button
              key={item.text}
              type="button"
              disabled={isSending}
              onClick={() => {
                setSelectedSubject(item.subject);
                void handleSendMessage(item.text, item.subject);
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-white border border-indigo-200/80 text-indigo-900 hover:bg-indigo-600 hover:text-white font-semibold transition-colors disabled:opacity-50"
            >
              {item.text}
            </button>
          ))}
        </div>

        {/* Messages Feed */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[460px] overflow-y-auto bg-slate-50/40">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isUser
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-amber-300 border border-slate-700'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-2xs ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1 text-[10px] opacity-75 font-bold">
                    <span>{isUser ? `${audience} • ${msg.subject}` : `School Master AI • ${msg.subject}`}</span>
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                </div>
              </div>
            );
          })}

          {isSending && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-900 text-amber-300 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 text-xs text-slate-600 flex items-center gap-2 shadow-2xs">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span className="font-semibold">School Master AI is preparing your explanation...</span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendMessage();
          }}
          className="p-4 bg-white border-t border-slate-200 flex items-center gap-2.5"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ask a ${selectedSubject} question as a ${audience}...`}
            disabled={isSending}
            className="flex-1 px-4 py-3 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending || !inputText.trim()}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-extrabold shadow-sm transition-colors disabled:opacity-50"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>Ask AI</span>
          </button>
        </form>
      </section>
    </div>
  );
};
