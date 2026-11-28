import { apiFetch } from "../utils/apiConfig";
import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Languages,
  Loader2,
  MessageSquarePlus,
  Send,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { SchoolProfile } from '../types';

export type AiLanguageMode = 'auto' | 'English' | 'Urdu' | 'Kashmiri';

interface AiMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  imagePreview?: string;
  subject?: string;
  languageLabel?: string;
  isRtl?: boolean;
  timestamp: string;
}

interface DashboardAiAssistantProps {
  school: SchoolProfile;
  userName?: string;
  defaultLanguage?: 'en' | 'ur';
}

const STORAGE_KEY = 'sm_dashboard_multilingual_ai_v1';

const SUBJECT_OPTIONS = [
  'General Studies',
  'Mathematics',
  'Science',
  'Social Science',
  'English',
  'Urdu',
  'Kashmiri',
  'Translation (EN / UR / KS)',
];

const CLASS_LEVEL_OPTIONS = [
  'Primary (Classes 1–5)',
  'Middle (Classes 6–8)',
  'Secondary (Classes 9–10)',
  'Higher Secondary (Classes 11–12)',
];

const QUICK_PROMPTS: Array<{ label: string; lang: AiLanguageMode; subject: string; prompt: string }> = [
  {
    label: 'Solve Fraction Step-by-Step',
    lang: 'English',
    subject: 'Mathematics',
    prompt: 'Explain step by step how to solve 3/4 + 5/6 and simplify the final answer.',
  },
  {
    label: 'Photosynthesis (اردو)',
    lang: 'Urdu',
    subject: 'Science',
    prompt: 'ضیائی تالیف (Photosynthesis) کیا ہے؟ آسان اردو میں مرحلہ وار وضاحت کریں۔',
  },
  {
    label: 'Kashmiri Translation (کٲشُر)',
    lang: 'Kashmiri',
    subject: 'Kashmiri',
    prompt: 'کٲشِر زَبانہِ مَنٛز "علم چھُ اکھ روشنی" ہُنٛد مطلب تہٕ اہمیت بیان کٔرِو۔',
  },
];

function isRtlText(text: string, lang?: string): boolean {
  if (lang === 'Urdu' || lang === 'Kashmiri') return true;
  return /[\u0600-\u06FF\u0750-\u077F]/.test(text);
}

async function compressImageFile(file: File): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.onload = () => {
      const resultUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid or unsupported image file.'));
      img.onload = () => {
        const maxDim = 1400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const mime = file.type || 'image/jpeg';
          const base64 = resultUrl.replace(/^data:[^;]+;base64,/, '');
          resolve({ dataUrl: resultUrl, base64, mimeType: mime });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(outputMime, 0.85);
        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        resolve({ dataUrl, base64, mimeType: outputMime });
      };
      img.src = resultUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const DashboardAiAssistant: React.FC<DashboardAiAssistantProps> = ({
  school,
  userName = 'Teacher',
  defaultLanguage = 'en',
}) => {
  const [messages, setMessages] = useState<AiMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.slice(-30);
      }
    } catch {
      // Ignore storage error
    }
    return [];
  });

  const [languageMode, setLanguageMode] = useState<AiLanguageMode>(
    defaultLanguage === 'ur' ? 'Urdu' : 'auto'
  );
  const [subject, setSubject] = useState<string>('General Studies');
  const [classLevel, setClassLevel] = useState<string>('Middle (Classes 6–8)');
  const [question, setQuestion] = useState<string>('');
  const [attachedImage, setAttachedImage] = useState<{
    dataUrl: string;
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const storable = messages.slice(-24).map((m) => ({
        ...m,
        // Keep localStorage light by omitting raw base64 thumbnails beyond last 3 messages
        imagePreview: m.imagePreview && m.imagePreview.length < 180000 ? m.imagePreview : undefined,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storable));
    } catch {
      // Ignore quota errors
    }
  }, [messages]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const showToast = (msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => setStatusNotice(null), 3000);
  };

  const handleImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMessage(null);
    try {
      const compressed = await compressImageFile(file);
      setAttachedImage({
        ...compressed,
        name: file.name || 'Captured Image',
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to attach selected image.');
    }
  };

  const handleSend = async (overridePrompt?: string, overrideLang?: AiLanguageMode, overrideSubject?: string) => {
    const textToSend = (overridePrompt !== undefined ? overridePrompt : question).trim();
    const activeLang = overrideLang || languageMode;
    const activeSubject = overrideSubject || subject;

    if (!textToSend && !attachedImage) {
      setErrorMessage('Enter a question or upload/capture an image first.');
      return;
    }

    setErrorMessage(null);
    const userMsg: AiMessage = {
      id: `ai-u-${Date.now()}`,
      role: 'user',
      text: textToSend || 'Analyze this uploaded educational image and explain the solution step by step.',
      imagePreview: attachedImage?.dataUrl,
      subject: activeSubject,
      languageLabel: activeLang === 'auto' ? 'Auto' : activeLang,
      isRtl: isRtlText(textToSend, activeLang === 'auto' ? undefined : activeLang),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const historyPayload = messages.slice(-8).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    const pendingImage = attachedImage;
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setAttachedImage(null);
    setIsLoading(true);

    try {
      const response = await apiFetch('/api/dashboard-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: textToSend,
          languageMode: activeLang,
          subject: activeSubject,
          classLevel,
          imageBase64: pendingImage?.base64 || '',
          imageMimeType: pendingImage?.mimeType || '',
          history: historyPayload,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.reply) {
        throw new Error(data?.error || `AI request failed with status ${response.status}.`);
      }

      const detectedLang = String(data.detectedLanguage || activeLang || 'English');
      const modelMsg: AiMessage = {
        id: `ai-m-${Date.now()}`,
        role: 'model',
        text: String(data.reply),
        subject: activeSubject,
        languageLabel: detectedLang,
        isRtl: isRtlText(String(data.reply), detectedLang),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to reach Gemini AI service.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyAnswer = async (msg: AiMessage) => {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopiedId(msg.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast('Clipboard access unavailable in this browser.');
    }
  };

  const handleShareAnswer = async (msg: AiMessage) => {
    const shareText = `SchoolMaster AI (${msg.subject || 'Academic'}) — ${school.name}\n\n${msg.text}`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `SchoolMaster AI Answer — ${msg.subject || 'Education'}`,
          text: shareText,
        });
        return;
      } catch {
        // User cancelled or share unsupported, fall back to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Answer copied to clipboard for sharing.');
    } catch {
      showToast('Unable to share answer on this device.');
    }
  };

  const handleDownloadAnswerPdf = async (msg: AiMessage) => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 15;

      // Render high-DPI canvas for proper Urdu / Kashmiri / English script preservation in PDF
      const canvas = document.createElement('canvas');
      canvas.width = 1240;
      canvas.height = 1754;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header banner
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, 165);
        ctx.fillStyle = '#4f46e5';
        ctx.fillRect(0, 165, canvas.width, 8);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px "Plus Jakarta Sans", Arial, sans-serif';
        ctx.fillText(school.name || 'SchoolMaster AI', 64, 70);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '22px "Plus Jakarta Sans", Arial, sans-serif';
        ctx.fillText(
          `Multilingual AI Answer Sheet  |  Subject: ${msg.subject || 'General'}  |  Language: ${msg.languageLabel || 'Auto'}`,
          64,
          115
        );
        ctx.fillText(`Prepared for ${userName}  |  ${new Date().toLocaleString()}`, 64, 146);

        // Body text with proper RTL alignment when Urdu or Kashmiri
        const rtl = Boolean(msg.isRtl);
        ctx.direction = rtl ? 'rtl' : 'ltr';
        ctx.textAlign = rtl ? 'right' : 'left';
        ctx.fillStyle = '#0f172a';
        ctx.font = rtl
          ? '28px "Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", "Noto Sans Arabic", serif'
          : '24px "Plus Jakarta Sans", Arial, sans-serif';

        const maxTextW = canvas.width - 128;
        const startX = rtl ? canvas.width - 64 : 64;
        let cursorY = 235;
        const lineHeight = rtl ? 52 : 36;

        const paragraphs = msg.text.split(/\r?\n/);
        for (const para of paragraphs) {
          const words = para.split(/\s+/).filter(Boolean);
          if (words.length === 0) {
            cursorY += Math.round(lineHeight * 0.6);
            continue;
          }
          let line = '';
          for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (ctx.measureText(candidate).width > maxTextW && line) {
              if (cursorY > canvas.height - 90) break;
              ctx.fillText(line, startX, cursorY);
              cursorY += lineHeight;
              line = word;
            } else {
              line = candidate;
            }
          }
          if (line && cursorY <= canvas.height - 90) {
            ctx.fillText(line, startX, cursorY);
            cursorY += lineHeight;
          }
        }

        const imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 0, 0, pageW, pageH);
      } else {
        doc.setFontSize(12);
        doc.text(doc.splitTextToSize(msg.text, pageW - margin * 2), margin, 25);
      }

      const safeSubject = (msg.subject || 'Answer').replace(/[^a-zA-Z0-9_-]+/g, '_');
      doc.save(`SchoolMaster_AI_${safeSubject}_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast('Downloaded AI answer as PDF.');
    } catch {
      showToast('Unable to generate PDF right now.');
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setQuestion('');
    setAttachedImage(null);
    setErrorMessage(null);
    setConfirmClearOpen(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    showToast('Started a fresh AI conversation.');
  };

  const inputIsRtl = isRtlText(question, languageMode === 'auto' ? undefined : languageMode);

  return (
    <section
      aria-label="Multilingual SchoolMaster AI Assistant"
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col"
    >
      {/* Top Bar */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <h3 className="text-base font-bold text-slate-900 truncate">
              Multilingual AI Tutor (English · اردو · کٲشُر)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Ask text questions or upload/capture homework &amp; textbook images for step-by-step explanations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Language Segmented Selector */}
          <div
            role="group"
            aria-label="AI Response Language"
            className="inline-flex items-center p-1 bg-slate-200/75 rounded-lg gap-0.5"
          >
            {(['auto', 'English', 'Urdu', 'Kashmiri'] as AiLanguageMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setLanguageMode(mode)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  languageMode === mode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === 'auto'
                  ? 'Auto'
                  : mode === 'Urdu'
                  ? 'اردو'
                  : mode === 'Kashmiri'
                  ? 'کٲشُر'
                  : 'English'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-indigo-600" />
            <span>New Chat</span>
          </button>

          {messages.length > 0 && !confirmClearOpen && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Clear Confirmation Banner */}
      {confirmClearOpen && (
        <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-rose-800">
            Clear all {messages.length} message(s) in this AI conversation?
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmClearOpen(false)}
              className="px-3 py-1 rounded-md border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleNewChat}
              className="px-3 py-1 rounded-md bg-rose-600 text-white font-semibold hover:bg-rose-700"
            >
              Confirm Clear
            </button>
          </div>
        </div>
      )}

      {/* Subject & Level Filter Row */}
      <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-white text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
            <span>Subject:</span>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SUBJECT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
            <span>Level:</span>
            <select
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {CLASS_LEVEL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Languages className="w-3.5 h-3.5 text-indigo-500" />
          <span>
            {languageMode === 'auto'
              ? 'Auto-detects English, Urdu, or Kashmiri'
              : `Responding in ${languageMode}`}
          </span>
        </div>
      </div>

      {/* Chat Messages Viewport */}
      <div
        ref={chatScrollRef}
        className="p-5 space-y-4 min-h-[300px] max-h-[440px] overflow-y-auto bg-slate-50/40"
      >
        {messages.length === 0 ? (
          <div className="py-8 text-center space-y-4 max-w-xl mx-auto">
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-900">
                Ask any school question in English, Urdu, or Kashmiri
              </p>
              <p className="text-xs text-slate-500">
                Upload a photo of a math equation, science diagram, or textbook page from your gallery or camera for step-by-step guidance.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setLanguageMode(item.lang);
                    setSubject(item.subject);
                    void handleSend(item.prompt, item.lang, item.subject);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/60 text-xs font-medium text-slate-700 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed border ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-800 border-slate-200'
                }`}
              >
                <div
                  className={`flex items-center justify-between gap-3 text-[11px] mb-1.5 ${
                    msg.role === 'user' ? 'text-indigo-100' : 'text-slate-500'
                  }`}
                >
                  <span className="font-semibold">
                    {msg.role === 'user' ? userName : 'SchoolMaster AI'}
                    {msg.subject ? ` · ${msg.subject}` : ''}
                    {msg.languageLabel ? ` · ${msg.languageLabel}` : ''}
                  </span>
                  <span className="font-mono tabular-nums">{msg.timestamp}</span>
                </div>

                {msg.imagePreview && (
                  <img
                    src={msg.imagePreview}
                    alt="Uploaded educational question"
                    referrerPolicy="no-referrer"
                    className="mb-2.5 max-h-52 rounded-xl border border-white/20 object-contain bg-black/10"
                  />
                )}

                <div
                  dir={msg.isRtl ? 'rtl' : 'ltr'}
                  className={`whitespace-pre-wrap break-words ${
                    msg.isRtl ? 'text-right font-noori text-base leading-loose' : 'text-left text-[13.5px]'
                  }`}
                >
                  {msg.text}
                </div>

                {msg.role === 'model' && (
                  <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => void handleCopyAnswer(msg)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold transition-colors"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownloadAnswerPdf(msg)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShareAnswer(msg)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3.5 py-2.5 w-fit">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Analyzing question with Gemini AI...</span>
          </div>
        )}
      </div>

      {/* Status & Error Notifications */}
      {statusNotice && (
        <div className="px-5 py-2 bg-emerald-50 border-t border-emerald-200 text-xs font-semibold text-emerald-800">
          {statusNotice}
        </div>
      )}
      {errorMessage && (
        <div className="px-5 py-2.5 bg-rose-50 border-t border-rose-200 text-xs font-semibold text-rose-800 flex items-center justify-between gap-2">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-900"
            aria-label="Dismiss AI error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Composer & Image Upload Controls */}
      <div className="p-4 border-t border-slate-200 bg-white space-y-3">
        {attachedImage && (
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={attachedImage.dataUrl}
                alt="Attached preview"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-lg object-cover border border-indigo-200 shrink-0"
              />
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-slate-900 truncate">{attachedImage.name}</p>
                <p className="text-[11px] text-slate-500">
                  Image ready for OCR &amp; multimodal explanation
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-semibold shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          </div>
        )}

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageFileSelected}
          className="hidden"
          aria-label="Upload image from gallery"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageFileSelected}
          className="hidden"
          aria-label="Capture image from camera"
        />

        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              title="Capture educational question using camera"
            >
              <Camera className="w-4 h-4 text-indigo-600" />
              <span>Camera</span>
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              title="Upload educational image from gallery"
            >
              <ImageIcon className="w-4 h-4 text-emerald-600" />
              <span>Gallery</span>
            </button>
          </div>

          <textarea
            rows={2}
            value={question}
            dir={inputIsRtl ? 'rtl' : 'ltr'}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              languageMode === 'Urdu'
                ? 'اپنا سوال اردو میں لکھیں یا تصویر اپ لوڈ کریں...'
                : languageMode === 'Kashmiri'
                ? 'پَنُن سوال کٲشِر زَبانہِ مَنٛز لِکھِو یا تصویر اَپلوڈ کٔرِو...'
                : 'Type your question in English, Urdu, or Kashmiri (Shift+Enter for new line)...'
            }
            className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />

          <button
            type="button"
            disabled={isLoading || (!question.trim() && !attachedImage)}
            onClick={() => void handleSend()}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>Ask AI</span>
          </button>
        </div>
      </div>
    </section>
  );
};
