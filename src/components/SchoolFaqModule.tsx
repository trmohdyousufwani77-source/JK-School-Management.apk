import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Edit2,
  Eye,
  Flame,
  HelpCircle,
  Lock,
  Mic,
  MicOff,
  Plus,
  Printer,
  Save,
  Search,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { FaqCategory, SchoolFaqItem } from '../types';
import { deleteSchoolFaqFromFirestore, syncSchoolFaqToFirestore } from '../firebase';

interface SchoolFaqModuleProps {
  schoolName: string;
  canEdit: boolean;
  actorName: string;
  onNotify: (text: string, type?: 'success' | 'error') => void;
  onAuditFaqChange?: (summary: string, fields: string[]) => void;
}

const FAQ_STORAGE_KEY = 'school_master_v1_faqs';
const FAQ_FEEDBACK_VOTES_KEY = 'school_master_v1_faq_user_votes';

const FAQ_CATEGORIES: FaqCategory[] = [
  'Admission',
  'Attendance',
  'Curriculum',
  'Examinations',
  'Scholarships',
  'General',
];

const DEFAULT_FAQS: SchoolFaqItem[] = [
  {
    id: 'faq-adm-01',
    question: 'What documents are required for new student admission in Classes 1 to 8?',
    answer:
      'Parents should submit the student Birth Certificate (or Municipal/Hospital record), previous school Transfer Certificate (for Class 2 onwards), 2 passport-size photographs, and parent contact details. Aadhaar is optional and alternative IDs (Ration Card / Birth Certificate) are accepted.',
    category: 'Admission',
    views: 42,
    helpfulYes: 18,
    helpfulNo: 1,
    createdAt: '2026-04-01T08:00:00.000Z',
    updatedAt: '2026-04-01T08:00:00.000Z',
    updatedByName: 'School Administration',
  },
  {
    id: 'faq-att-01',
    question: 'How does Touchless QR Daily Attendance work when internet is unavailable?',
    answer:
      'Teachers can scan Student Smart ID Cards using the Daily Attendance QR Scanner even completely offline. Scans are saved immediately in the local browser database and Offline Sync Queue, then automatically uploaded to Cloud Firestore once internet connectivity returns.',
    category: 'Attendance',
    views: 37,
    helpfulYes: 15,
    helpfulNo: 0,
    createdAt: '2026-04-05T09:30:00.000Z',
    updatedAt: '2026-04-05T09:30:00.000Z',
    updatedByName: 'School Administration',
  },
  {
    id: 'faq-cur-01',
    question: 'How is the NEP 2020 Holistic Progress Card (HPC) evaluated?',
    answer:
      'The 13-section Holistic Progress Card combines scholastic subject assessments with co-scholastic domains including Cognitive Skills, Socio-Emotional Development, Physical & Creative Education, Life Skills, Attendance, and concise Teacher Remarks.',
    category: 'Curriculum',
    views: 29,
    helpfulYes: 12,
    helpfulNo: 2,
    createdAt: '2026-04-10T10:15:00.000Z',
    updatedAt: '2026-04-10T10:15:00.000Z',
    updatedByName: 'School Administration',
  },
  {
    id: 'faq-exm-01',
    question: 'When are Half-Yearly and Annual Examination result cards published?',
    answer:
      'Half-Yearly Progress Cards are published within 10 working days of exam completion, and Annual Holistic Progress Cards are distributed during the end-of-session Parent-Teacher Meeting (PTM) in March.',
    category: 'Examinations',
    views: 24,
    helpfulYes: 9,
    helpfulNo: 1,
    createdAt: '2026-04-14T11:00:00.000Z',
    updatedAt: '2026-04-14T11:00:00.000Z',
    updatedByName: 'School Administration',
  },
  {
    id: 'faq-sch-01',
    question: 'Are Mid-Day Meals (PM POSHAN) and free textbooks provided to eligible students?',
    answer:
      'Yes. All enrolled elementary students receive nutritious hot cooked Mid-Day Meals under PM POSHAN as well as prescribed JKBOSE textbooks distributed free of cost at the start of each academic session.',
    category: 'Scholarships',
    views: 31,
    helpfulYes: 14,
    helpfulNo: 0,
    createdAt: '2026-04-18T12:00:00.000Z',
    updatedAt: '2026-04-18T12:00:00.000Z',
    updatedByName: 'School Administration',
  },
  {
    id: 'faq-gen-01',
    question: 'How can parents contact the Headmaster or update their WhatsApp mobile number?',
    answer:
      'Parents can visit the school office during working hours (10:00 AM – 3:30 PM, Monday to Saturday) or call/email the school contact details listed in the About Us section to update parent phone or WhatsApp notification records.',
    category: 'General',
    views: 19,
    helpfulYes: 6,
    helpfulNo: 3,
    createdAt: '2026-04-20T09:00:00.000Z',
    updatedAt: '2026-04-20T09:00:00.000Z',
    updatedByName: 'School Administration',
  },
];

/**
 * Lightweight fuzzy subsequence & token matcher for real-time FAQ search.
 */
function fuzzyMatchScore(text: string, query: string): number {
  const haystack = text.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  if (haystack.includes(needle)) return 100;

  const tokens = needle.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 40;
      continue;
    }
    // Subsequence fuzzy check for minor typos
    let ti = 0;
    for (let hi = 0; hi < haystack.length && ti < token.length; hi++) {
      if (haystack[hi] === token[ti]) ti++;
    }
    if (ti === token.length && token.length >= 3) {
      score += 20;
    } else {
      // Allow 1-character typo in token length >= 4
      if (token.length >= 4 && ti >= token.length - 1) {
        score += 10;
      }
    }
  }
  return score;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const SchoolFaqModule: React.FC<SchoolFaqModuleProps> = ({
  schoolName,
  canEdit,
  actorName,
  onNotify,
  onAuditFaqChange,
}) => {
  const [faqs, setFaqs] = useState<SchoolFaqItem[]>(() => {
    try {
      const raw = localStorage.getItem(FAQ_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as SchoolFaqItem[];
      }
    } catch {
      // ignore
    }
    return DEFAULT_FAQS;
  });

  const [userVotes, setUserVotes] = useState<Record<string, 'yes' | 'no'>>(() => {
    try {
      const raw = localStorage.getItem(FAQ_FEEDBACK_VOTES_KEY);
      if (raw) return JSON.parse(raw) as Record<string, 'yes' | 'no'>;
    } catch {
      // ignore
    }
    return {};
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | FaqCategory>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isListeningVoice, setIsListeningVoice] = useState<boolean>(false);

  // Dedicated Edit / Create FAQ Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [draftQuestion, setDraftQuestion] = useState<string>('');
  const [draftAnswer, setDraftAnswer] = useState<string>('');
  const [draftCategory, setDraftCategory] = useState<FaqCategory>('General');
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete inline confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const speechRecRef = useRef<any>(null);

  useEffect(() => {
    try {
      localStorage.setItem(FAQ_STORAGE_KEY, JSON.stringify(faqs));
    } catch {
      // ignore quota
    }
  }, [faqs]);

  useEffect(() => {
    try {
      localStorage.setItem(FAQ_FEEDBACK_VOTES_KEY, JSON.stringify(userVotes));
    } catch {
      // ignore
    }
  }, [userVotes]);

  // Support deep-link URLs like #faq-adm-01
  useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.startsWith('#faq-')) {
      const targetId = hash.slice(1);
      const found = faqs.find((f) => f.id === targetId);
      if (found) {
        setExpandedId(found.id);
        setSelectedCategory('All');
      }
    }
  }, []);

  // Top 5 Frequently Viewed FAQs
  const topViewedFaqs = useMemo(() => {
    return [...faqs]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 5);
  }, [faqs]);

  // Real-time Fuzzy Filtered FAQs
  const filteredFaqs = useMemo(() => {
    const byCategory =
      selectedCategory === 'All'
        ? faqs
        : faqs.filter((item) => item.category === selectedCategory);

    if (!searchQuery.trim()) return byCategory;

    return byCategory
      .map((item) => ({
        item,
        score: fuzzyMatchScore(`${item.question} ${item.answer} ${item.category}`, searchQuery),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  }, [faqs, selectedCategory, searchQuery]);

  // Admin Aggregated Feedback Statistics
  const feedbackStats = useMemo(() => {
    const totalYes = faqs.reduce((acc, f) => acc + (f.helpfulYes || 0), 0);
    const totalNo = faqs.reduce((acc, f) => acc + (f.helpfulNo || 0), 0);
    const totalVotes = totalYes + totalNo;
    const satisfactionPct = totalVotes > 0 ? Math.round((totalYes / totalVotes) * 100) : 100;
    const needsAttention = faqs.filter((f) => {
      const votes = (f.helpfulYes || 0) + (f.helpfulNo || 0);
      if (votes === 0) return false;
      return f.helpfulNo >= 2 || f.helpfulYes / votes < 0.7;
    });
    return { totalYes, totalNo, totalVotes, satisfactionPct, needsAttention };
  }, [faqs]);

  const handleToggleExpand = (faq: SchoolFaqItem) => {
    if (expandedId === faq.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(faq.id);
    const updated: SchoolFaqItem = {
      ...faq,
      views: (faq.views || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    setFaqs((prev) => prev.map((f) => (f.id === faq.id ? updated : f)));
    void syncSchoolFaqToFirestore(updated, false, actorName).catch(() => {});
  };

  const handleVoteHelpful = (faq: SchoolFaqItem, vote: 'yes' | 'no') => {
    const prevVote = userVotes[faq.id];
    if (prevVote === vote) {
      onNotify('You have already recorded feedback for this FAQ.');
      return;
    }
    const updated: SchoolFaqItem = {
      ...faq,
      helpfulYes:
        (faq.helpfulYes || 0) +
        (vote === 'yes' ? 1 : 0) -
        (prevVote === 'yes' ? 1 : 0),
      helpfulNo:
        (faq.helpfulNo || 0) +
        (vote === 'no' ? 1 : 0) -
        (prevVote === 'no' ? 1 : 0),
      updatedAt: new Date().toISOString(),
    };
    setFaqs((prev) => prev.map((f) => (f.id === faq.id ? updated : f)));
    setUserVotes((prev) => ({ ...prev, [faq.id]: vote }));
    void syncSchoolFaqToFirestore(updated, false, actorName).catch(() => {});
    onNotify(
      vote === 'yes'
        ? 'Thank you for your feedback! Marked as helpful.'
        : 'Thank you for your feedback. Highlighted for School Admin review.'
    );
  };

  const handleCopyFaqLink = async (faq: SchoolFaqItem) => {
    const shareUrl = `${window.location.origin}/#${faq.id}`;
    const copyPayload = `${shareUrl} (ID: ${faq.id})`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedId(faq.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === faq.id ? null : prev)), 2500);
      onNotify(`Copied FAQ share link: ${copyPayload}`);
    } catch {
      onNotify(`Share link ready: ${shareUrl}`);
    }
  };

  const handleToggleVoiceSearch = () => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      onNotify('Voice Search requires Chrome, Edge, or Android WebView with Speech Recognition support.', 'error');
      return;
    }

    if (isListeningVoice && speechRecRef.current) {
      speechRecRef.current.stop();
      setIsListeningVoice(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setIsListeningVoice(true);
      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setSearchQuery(transcript);
          onNotify(`Voice search captured: "${transcript}"`);
        }
      };
      recognition.onerror = () => {
        setIsListeningVoice(false);
        onNotify('Could not capture voice input. Check microphone permissions.', 'error');
      };
      recognition.onend = () => setIsListeningVoice(false);
      speechRecRef.current = recognition;
      recognition.start();
    } catch {
      setIsListeningVoice(false);
      onNotify('Unable to start browser voice recognition.', 'error');
    }
  };

  const openAddModal = () => {
    if (!canEdit) return;
    setEditingFaqId(null);
    setDraftQuestion('');
    setDraftAnswer('');
    setDraftCategory('General');
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (faq: SchoolFaqItem) => {
    if (!canEdit) return;
    setEditingFaqId(faq.id);
    setDraftQuestion(faq.question);
    setDraftAnswer(faq.answer);
    setDraftCategory(faq.category);
    setModalError(null);
    setModalOpen(true);
  };

  const handleSaveFaqModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (draftQuestion.trim().length < 5) {
      setModalError('Question must be at least 5 characters.');
      return;
    }
    if (draftAnswer.trim().length < 5) {
      setModalError('Answer must be at least 5 characters.');
      return;
    }

    const nowIso = new Date().toISOString();
    if (editingFaqId) {
      const existing = faqs.find((f) => f.id === editingFaqId);
      const updated: SchoolFaqItem = {
        id: editingFaqId,
        question: draftQuestion.trim(),
        answer: draftAnswer.trim(),
        category: draftCategory,
        views: existing?.views || 0,
        helpfulYes: existing?.helpfulYes || 0,
        helpfulNo: existing?.helpfulNo || 0,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
        updatedByName: actorName,
      };
      setFaqs((prev) => prev.map((f) => (f.id === editingFaqId ? updated : f)));
      void syncSchoolFaqToFirestore(updated, false, actorName).catch(() => {});
      onAuditFaqChange?.(`Updated FAQ "${updated.question.slice(0, 60)}"`, ['question', 'answer', 'category']);
      onNotify('FAQ updated successfully.');
    } else {
      const newFaq: SchoolFaqItem = {
        id: `faq-${draftCategory.toLowerCase().slice(0, 3)}-${Date.now().toString(36)}`,
        question: draftQuestion.trim(),
        answer: draftAnswer.trim(),
        category: draftCategory,
        views: 0,
        helpfulYes: 0,
        helpfulNo: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedByName: actorName,
      };
      setFaqs((prev) => [newFaq, ...prev]);
      void syncSchoolFaqToFirestore(newFaq, true, actorName).catch(() => {});
      onAuditFaqChange?.(`Added new FAQ in ${newFaq.category}`, ['question', 'answer', 'category']);
      onNotify('New FAQ added successfully.');
    }
    setModalOpen(false);
  };

  const handleDeleteFaq = (faqId: string) => {
    if (!canEdit) return;
    const target = faqs.find((f) => f.id === faqId);
    setFaqs((prev) => prev.filter((f) => f.id !== faqId));
    setConfirmDeleteId(null);
    void deleteSchoolFaqFromFirestore(faqId).catch(() => {});
    if (target) {
      onAuditFaqChange?.(`Deleted FAQ "${target.question.slice(0, 60)}"`, ['faqDeleted']);
    }
    onNotify('FAQ entry deleted.');
  };

  const handleExportCsv = () => {
    const headers = ['ID', 'Category', 'Question', 'Answer', 'Views', 'Helpful_Yes', 'Helpful_No', 'Updated_At'];
    const rows = faqs.map((f) =>
      [
        f.id,
        f.category,
        f.question,
        f.answer,
        f.views || 0,
        f.helpfulYes || 0,
        f.helpfulNo || 0,
        f.updatedAt,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `school_faqs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    onNotify(`Exported ${faqs.length} FAQ entries to CSV.`);
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canEdit) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const lines = content
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        onNotify('CSV must include a header row (Question, Answer, Category) and at least one FAQ row.', 'error');
        return;
      }

      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
      const qIdx = headers.findIndex((h) => h.includes('question'));
      const aIdx = headers.findIndex((h) => h.includes('answer'));
      const cIdx = headers.findIndex((h) => h.includes('category') || h.includes('topic'));

      if (qIdx < 0 || aIdx < 0) {
        onNotify('CSV headers must contain "Question" and "Answer" columns.', 'error');
        return;
      }

      const nowIso = new Date().toISOString();
      const imported: SchoolFaqItem[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const q = (cols[qIdx] || '').trim();
        const a = (cols[aIdx] || '').trim();
        const rawCat = cIdx >= 0 ? (cols[cIdx] || '').trim() : 'General';
        const matchedCat =
          FAQ_CATEGORIES.find((c) => c.toLowerCase() === rawCat.toLowerCase()) || 'General';
        if (q.length >= 3 && a.length >= 2) {
          imported.push({
            id: `faq-csv-${Date.now().toString(36)}-${i}`,
            question: q,
            answer: a,
            category: matchedCat,
            views: 0,
            helpfulYes: 0,
            helpfulNo: 0,
            createdAt: nowIso,
            updatedAt: nowIso,
            updatedByName: actorName,
          });
        }
      }

      if (imported.length === 0) {
        onNotify('No valid FAQ rows found in the uploaded CSV file.', 'error');
        return;
      }

      setFaqs((prev) => [...imported, ...prev]);
      imported.forEach((item) => {
        void syncSchoolFaqToFirestore(item, true, actorName).catch(() => {});
      });
      onAuditFaqChange?.(`Bulk-imported ${imported.length} FAQs from CSV (${file.name})`, ['csvImport']);
      onNotify(`Imported ${imported.length} FAQ entries from CSV.`);
    };
    reader.readAsText(file);
  };

  const handlePrintFaq = () => {
    window.print();
  };

  return (
    <section
      aria-label="Frequently Asked Questions"
      data-testid="school-faq-section"
      className="space-y-5"
    >
      {/* Print-Only Formatted FAQ Sheet */}
      <div className="hidden print:block p-6 bg-white text-slate-900">
        <div className="border-b-2 border-slate-900 pb-3 mb-4">
          <h1 className="text-xl font-black">{schoolName} — Frequently Asked Questions (FAQ)</h1>
          <p className="text-xs text-slate-600 mt-1">
            Generated on {new Date().toLocaleDateString()} • Total Entries: {faqs.length}
          </p>
        </div>
        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <div key={faq.id} className="border-b border-slate-200 pb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                [{faq.category}] • ID: {faq.id}
              </p>
              <h2 className="text-sm font-black mt-0.5">
                {idx + 1}. {faq.question}
              </h2>
              <p className="text-xs text-slate-700 mt-1 whitespace-pre-line">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Screen FAQ Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden no-print">
        {/* Header & Action Bar */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <HelpCircle className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                School Help Desk &amp; Frequently Asked Questions (FAQ)
              </h2>
              <p className="text-xs text-indigo-200 mt-0.5">
                Fuzzy search, voice lookup, categorized topics, direct sharing links &amp; helpfulness feedback analytics.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportCsv}
              className="hidden"
              aria-label="Import FAQ CSV"
            />
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => csvInputRef.current?.click()}
              title={canEdit ? 'Bulk-upload Question, Answer, Category CSV' : 'School Admin Only'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>CSV Import</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export FAQ to CSV</span>
            </button>
            <button
              type="button"
              onClick={handlePrintFaq}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print FAQ</span>
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={openAddModal}
              title={canEdit ? 'Create a new FAQ entry' : 'School Admin Only'}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold shadow-sm disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {canEdit ? <Plus className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>Add FAQ</span>
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* Admin Aggregated Helpfulness Feedback Dashboard */}
          {canEdit && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <span>School Admin FAQ Feedback Analytics</span>
                </h3>
                <span className="text-[11px] font-bold text-slate-500">
                  {feedbackStats.totalVotes} Total Ratings • {feedbackStats.satisfactionPct}% Helpful Rate
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Total FAQs</span>
                  <strong className="text-base font-black text-slate-900">{faqs.length}</strong>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">Thumbs Up</span>
                  <strong className="text-base font-black text-emerald-900">{feedbackStats.totalYes}</strong>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <span className="text-[10px] font-bold uppercase text-rose-700 block">Thumbs Down</span>
                  <strong className="text-base font-black text-rose-900">{feedbackStats.totalNo}</strong>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">Needs Improvement</span>
                  <strong className="text-base font-black text-amber-950">{feedbackStats.needsAttention.length}</strong>
                </div>
              </div>
              {feedbackStats.needsAttention.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-950">
                  <p className="font-extrabold flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Content Highlighted for Improvement (High Thumbs-Down Ratio):</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {feedbackStats.needsAttention.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold hover:bg-amber-100"
                      >
                        Edit: {item.question.slice(0, 48)}... ({item.helpfulNo} 👎)
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top 5 Frequently Viewed Section */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500" />
                <span>Frequently Viewed (Top 5 Most Accessed Questions)</span>
              </h3>
              <span className="text-[10px] font-bold text-indigo-700">Auto-tracked by clicks</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              {topViewedFaqs.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setSearchQuery('');
                    handleToggleExpand(item);
                  }}
                  className="text-left p-2.5 rounded-xl bg-white border border-indigo-200/70 hover:border-indigo-500 hover:shadow-xs transition-all flex flex-col justify-between gap-1.5"
                >
                  <div className="flex items-center justify-between gap-1 text-[10px] font-extrabold text-indigo-600">
                    <span>#{idx + 1} • {item.category}</span>
                    <span className="inline-flex items-center gap-0.5 text-slate-500">
                      <Eye className="w-3 h-3" />
                      {item.views}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-900 line-clamp-2">{item.question}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Search Bar + Voice Search + Pill-Shaped Category Filter Bar */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Fuzzy search FAQs by keyword (e.g. admission, QR attendance, HPC, books)..."
                  className="w-full pl-10 pr-24 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 focus:bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleToggleVoiceSearch}
                  title="Voice Search FAQ (Web Speech API)"
                  aria-label="Voice Search FAQ"
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-xl transition-colors ${
                    isListeningVoice
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                  }`}
                >
                  {isListeningVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Pill-Shaped Category Filter Bar */}
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter FAQs by category">
              {(['All', ...FAQ_CATEGORIES] as const).map((cat) => {
                const count =
                  cat === 'All' ? faqs.length : faqs.filter((f) => f.category === cat).length;
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold border transition-all ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* FAQ Accordion List */}
          <div className="space-y-3">
            {filteredFaqs.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 text-xs text-slate-500">
                No FAQs matched &ldquo;{searchQuery}&rdquo; in {selectedCategory}. Try another keyword or switch to All categories.
              </div>
            ) : (
              filteredFaqs.map((faq) => {
                const isOpen = expandedId === faq.id;
                const vote = userVotes[faq.id];
                const totalVotes = (faq.helpfulYes || 0) + (faq.helpfulNo || 0);
                const helpfulPct =
                  totalVotes > 0 ? Math.round(((faq.helpfulYes || 0) / totalVotes) * 100) : null;
                const needsReview = totalVotes > 0 && (faq.helpfulNo >= 2 || (helpfulPct !== null && helpfulPct < 70));

                return (
                  <div
                    key={faq.id}
                    id={faq.id}
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      isOpen
                        ? 'border-indigo-300 bg-indigo-50/20 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="p-4 flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleExpand(faq)}
                        className="flex-1 text-left space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[10px]">
                          <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-extrabold uppercase tracking-wider">
                            {faq.category}
                          </span>
                          <span className="font-mono text-slate-400">#{faq.id}</span>
                          <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                            <Eye className="w-3 h-3" />
                            {faq.views} views
                          </span>
                          {canEdit && needsReview && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-extrabold">
                              Needs Improvement
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-extrabold text-slate-900">{faq.question}</p>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleCopyFaqLink(faq)}
                          title="Copy unique FAQ share link"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 text-[11px] font-bold transition-colors"
                        >
                          {copiedId === faq.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => openEditModal(faq)}
                          title={canEdit ? 'Edit FAQ in modal' : 'School Admin Only'}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setConfirmDeleteId(confirmDeleteId === faq.id ? null : faq.id)}
                          title={canEdit ? 'Delete FAQ' : 'School Admin Only'}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(faq)}
                          aria-label={isOpen ? 'Collapse FAQ' : 'Expand FAQ'}
                          className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-100"
                        >
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {confirmDeleteId === faq.id && canEdit && (
                      <div className="px-4 py-2.5 bg-rose-50 border-t border-rose-200 flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-rose-900">Delete this FAQ permanently?</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFaq(faq.id)}
                            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold"
                          >
                            Confirm Delete
                          </button>
                        </div>
                      </div>
                    )}

                    {isOpen && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3">
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                          {faq.answer}
                        </p>

                        {/* Was this helpful? Feedback Mechanism */}
                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-600">Was this helpful?</span>
                            <button
                              type="button"
                              onClick={() => handleVoteHelpful(faq, 'yes')}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold transition-colors ${
                                vote === 'yes'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:text-emerald-700'
                              }`}
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              <span>Yes ({faq.helpfulYes || 0})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVoteHelpful(faq, 'no')}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold transition-colors ${
                                vote === 'no'
                                  ? 'bg-rose-600 text-white border-rose-600'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-rose-400 hover:text-rose-700'
                              }`}
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                              <span>No ({faq.helpfulNo || 0})</span>
                            </button>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            {canEdit && helpfulPct !== null && (
                              <span
                                className={`font-extrabold px-2 py-0.5 rounded-md ${
                                  helpfulPct >= 75
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-800'
                                }`}
                              >
                                {helpfulPct}% helpful ({totalVotes} votes)
                              </span>
                            )}
                            <span>Updated {new Date(faq.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Dedicated Edit / Add FAQ Modal */}
      {modalOpen && canEdit && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-300" />
                <h3 className="text-sm font-black">
                  {editingFaqId ? 'Edit FAQ Entry' : 'Add New FAQ Entry'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFaqModal} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Topic Category *</label>
                <select
                  value={draftCategory}
                  onChange={(e) => setDraftCategory(e.target.value as FaqCategory)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {FAQ_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Question *</label>
                <input
                  type="text"
                  value={draftQuestion}
                  onChange={(e) => setDraftQuestion(e.target.value)}
                  placeholder="Enter clear question asked by parents, students, or teachers..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Answer *</label>
                <textarea
                  rows={5}
                  value={draftAnswer}
                  onChange={(e) => setDraftAnswer(e.target.value)}
                  placeholder="Provide a concise, helpful institutional answer..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                  {modalError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingFaqId ? 'Save FAQ Changes' : 'Publish FAQ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
