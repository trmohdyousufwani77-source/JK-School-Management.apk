import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Save,
  Copy,
  Printer,
  FileDown,
  Plus,
  Trash2,
  Bookmark,
  CheckCircle2,
  AlertTriangle,
  Clock,
  BookOpen,
  Languages,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { SchoolProfile } from '../types';
import { guardSensitiveExport } from '../utils/biometricProtection';
import { printHtmlDocumentSafely } from '../utils/studioMediaStore';

export type ShortLessonLanguage = 'English' | 'Urdu' | 'Kashmiri';

interface TimeAllocationStage {
  id: string;
  stage: string;
  activity: string;
  minutes: number;
}

interface ShortLessonPlan {
  id?: string;
  classLevel: string;
  subject: string;
  topic: string;
  durationMinutes: number;
  language: ShortLessonLanguage;
  teachingMethod: string;
  recommendedMethodUsed: string;
  ageTierNote: string;
  learningObjectives: string[];
  introduction: {
    activity: string;
    dailyLifeConnection: string;
  };
  teachingActivities: {
    activities: string[];
    teacherRole: string;
    studentParticipation: string;
    tlm: string[];
  };
  timeAllocation: TimeAllocationStage[];
  assessment: {
    questions: string[];
    quickActivity: string;
    expectedIndicators: string[];
  };
  homework: string;
  savedAt?: string;
}

interface ShortLessonPlanGeneratorProps {
  school: SchoolProfile;
}

const CLASS_LIST = Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`);
const SUBJECT_LIST = [
  'Science',
  'Mathematics',
  'English',
  'Urdu',
  'Kashmiri',
  'Environmental Studies',
  'Social Science',
  'Computer Science',
  'General Knowledge',
];
const DURATION_PRESETS = [15, 20, 30, 35, 40, 45, 60];
const TEACHING_METHODS = [
  'AI-Recommended',
  'Activity-Based',
  'Discussion',
  'Demonstration',
  'Storytelling',
  'Experiential Learning',
];

const UI_LABELS: Record<
  ShortLessonLanguage,
  {
    headerSubtitle: string;
    objectives: string;
    introduction: string;
    activities: string;
    timeAllocation: string;
    assessment: string;
    homework: string;
    teacherRole: string;
    studentParticipation: string;
    tlm: string;
    dailyLife: string;
    quickCheck: string;
    indicators: string;
    stage: string;
    activityCol: string;
    timeCol: string;
    total: string;
    minUnit: string;
  }
> = {
  English: {
    headerSubtitle: 'AI-Powered Short Lesson Plan Generator · One-View Classroom Dashboard',
    objectives: '1. Learning Objectives',
    introduction: '2. Introduction / Warm-up',
    activities: '3. Teaching & Learning Activities',
    timeAllocation: '4. Time Allocation',
    assessment: '5. Assessment / Quick Check',
    homework: '6. Homework / Follow-up',
    teacherRole: "Teacher's Role",
    studentParticipation: "Students' Participation",
    tlm: 'Teaching-Learning Materials (TLM)',
    dailyLife: 'Daily-Life Connection',
    quickCheck: 'Quick Understanding Activity',
    indicators: 'Expected Learning Indicators',
    stage: 'Teaching Stage',
    activityCol: 'Activities',
    timeCol: 'Time',
    total: 'Total',
    minUnit: 'min',
  },
  Urdu: {
    headerSubtitle: 'اے آئی مختصر سبق منصوبہ ساز · یک صفحہ تدریسی ڈیش بورڈ',
    objectives: '1. تدریسی مقاصد',
    introduction: '2. تعارف / تمہید',
    activities: '3. تدریسی و تعلیمی سرگرمیاں',
    timeAllocation: '4. وقت کی تقسیم',
    assessment: '5. جائزہ / فوری جانچ',
    homework: '6. ہوم ورک / گھر کا کام',
    teacherRole: 'استاد کا کردار',
    studentParticipation: 'طلبہ کی شرکت',
    tlm: 'تدریسی و تعلیمی مواد (TLM)',
    dailyLife: 'روزمرہ زندگی سے ربط',
    quickCheck: 'فوری فہم جانچ سرگرمی',
    indicators: 'متوقع تعلیمی اشارے',
    stage: 'تدریسی مرحلہ',
    activityCol: 'سرگرمیاں',
    timeCol: 'وقت',
    total: 'کل وقت',
    minUnit: 'منٹ',
  },
  Kashmiri: {
    headerSubtitle: 'اے آئی مختصر سبق منصوبہ ساز · کٲشُر تدریسی ڈیش بورڈ',
    objectives: '1. تعلیمی مقصد',
    introduction: '2. تعارف / شروعات',
    activities: '3. تدریسی تہٕ تعلیمی سرگرمیہٕ',
    timeAllocation: '4. وقتُک تقسیم',
    assessment: '5. جانچ / فوری جائزہ',
    homework: '6. گَرُک کٲم / ہوم ورک',
    teacherRole: 'استادُن کردار',
    studentParticipation: 'طلبہ ہُنٛد شمولیت',
    tlm: 'تدریسی سامان (TLM)',
    dailyLife: 'روزمرہ زِندگی سۭتؠ ربط',
    quickCheck: 'فوری سمجھ جانچ سرگرمی',
    indicators: 'متوقع تعلیمی نٔتیجہٕ',
    stage: 'تدریسی مرحلہ',
    activityCol: 'سرگرمیہٕ',
    timeCol: 'وقت',
    total: 'کُل وقت',
    minUnit: 'مِنٹ',
  },
};

// Exact Sample Default Lesson Plan from specification
const DEFAULT_SAMPLE_PLAN: ShortLessonPlan = {
  classLevel: 'Class 5',
  subject: 'Science',
  topic: 'Water Cycle',
  durationMinutes: 30,
  language: 'English',
  teachingMethod: 'Activity-Based',
  recommendedMethodUsed: 'Activity-Based Learning & Diagram Drawing',
  ageTierNote:
    'Classes 3–5 (Upper Primary): Activity-based learning with relatable daily-life examples and group participation.',
  learningObjectives: [
    'Identify and define the three main stages of the water cycle: evaporation, condensation, and precipitation.',
    'Explain how the Sun drives the continuous movement of water in nature using everyday examples.',
    'Draw and accurately label a simple diagram of the water cycle.',
  ],
  introduction: {
    activity: 'Ask students where rain comes from and what happens to wet clothes dried in the sunlight.',
    dailyLifeConnection:
      'Connect rain, morning dew, steam rising from hot tea, and drying puddles after a shower to the water cycle.',
  },
  teachingActivities: {
    activities: [
      'Demonstrate evaporation and condensation using warm water in a covered transparent bowl or simple blackboard diagram.',
      'In pairs, students trace the journey of a water droplet from a river to clouds and back as rain.',
      'Students draw and label the four stages (Evaporation, Condensation, Precipitation, Collection) in their notebooks.',
    ],
    teacherRole:
      'Guide discussion with probing questions, demonstrate key stages clearly on the board, and support struggling pairs.',
    studentParticipation:
      'Share daily observations of rain and drying puddles, answer oral prompts, and collaboratively label their diagrams.',
    tlm: ['Blackboard & colored chalk', 'Water Cycle wall chart', 'Student notebooks & pencils', 'Warm water & clear lid (optional demo)'],
  },
  timeAllocation: [
    { id: 'st-1', stage: 'Introduction', activity: 'Ask students where rain comes from', minutes: 5 },
    {
      id: 'st-2',
      stage: 'Explanation',
      activity: 'Explain evaporation, condensation and precipitation',
      minutes: 10,
    },
    { id: 'st-3', stage: 'Activity', activity: 'Students draw and label the water cycle', minutes: 8 },
    { id: 'st-4', stage: 'Assessment', activity: 'Ask three quick questions', minutes: 5 },
    {
      id: 'st-5',
      stage: 'Conclusion',
      activity: 'Recap key concepts and assign homework',
      minutes: 2,
    },
  ],
  assessment: {
    questions: [
      'What causes water from rivers and ponds to turn into water vapour?',
      'How do clouds form in the sky?',
      'Name two forms in which water returns to the Earth.',
    ],
    quickActivity:
      'Point to three unlabeled arrows on the board diagram and have students call out the stage name in unison.',
    expectedIndicators: [
      'Students accurately distinguish evaporation from condensation in their own words.',
      'At least 80% of students correctly label all stages on their notebook diagram.',
    ],
  },
  homework:
    'Observe one example of evaporation or condensation at home (such as steam on a cooking lid or drying clothes) and write 3 lines about it in your science notebook.',
};

/**
 * Proportionally redistributes stage minutes so they ALWAYS sum exactly to targetTotalMinutes.
 */
function redistributeMinutesExact(
  stages: TimeAllocationStage[],
  targetTotalMinutes: number
): TimeAllocationStage[] {
  const totalTarget = Math.max(5, Math.min(240, Math.round(targetTotalMinutes) || 30));
  if (stages.length === 0) return [];
  const currentSum = stages.reduce((acc, s) => acc + Math.max(1, s.minutes), 0) || stages.length;
  const scaled = stages.map((s) => ({
    ...s,
    minutes: Math.max(1, Math.round((Math.max(1, s.minutes) / currentSum) * totalTarget)),
  }));

  let diff = totalTarget - scaled.reduce((acc, s) => acc + s.minutes, 0);
  let cursor = 0;
  let guard = 0;
  while (diff !== 0 && guard < 300) {
    if (diff > 0) {
      scaled[cursor % scaled.length].minutes += 1;
      diff -= 1;
    } else {
      let maxIdx = -1;
      let maxVal = 1;
      for (let i = 0; i < scaled.length; i++) {
        if (scaled[i].minutes > maxVal) {
          maxVal = scaled[i].minutes;
          maxIdx = i;
        }
      }
      if (maxIdx === -1) break;
      scaled[maxIdx].minutes -= 1;
      diff += 1;
    }
    cursor += 1;
    guard += 1;
  }
  return scaled;
}

function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const ShortLessonPlanGenerator: React.FC<ShortLessonPlanGeneratorProps> = ({ school }) => {
  // Teacher Input Section state (preserved across language switches)
  const [classLevel, setClassLevel] = useState('Class 5');
  const [subject, setSubject] = useState('Science');
  const [topic, setTopic] = useState('Water Cycle');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [language, setLanguage] = useState<ShortLessonLanguage>('English');
  const [teachingMethod, setTeachingMethod] = useState('Activity-Based');

  // Active Editable Lesson Plan
  const [plan, setPlan] = useState<ShortLessonPlan>(DEFAULT_SAMPLE_PLAN);
  const [savedPlans, setSavedPlans] = useState<ShortLessonPlan[]>([]);
  const [showSavedDrawer, setShowSavedDrawer] = useState(false);

  // Loading & feedback
  const [generating, setGenerating] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null);

  const notify = (msg: string, tone: 'success' | 'error' = 'success') => {
    setToast({ msg, tone });
    setTimeout(() => setToast((cur) => (cur?.msg === msg ? null : cur)), 3800);
  };

  useEffect(() => {
    fetch('/api/short-lesson-plan/saved')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.plans)) setSavedPlans(data.plans);
      })
      .catch(() => undefined);
  }, []);

  const isRtl = plan.language === 'Urdu' || plan.language === 'Kashmiri';
  const labels = UI_LABELS[plan.language] || UI_LABELS.English;

  const totalAllocatedMinutes = useMemo(
    () => plan.timeAllocation.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0),
    [plan.timeAllocation]
  );

  // Changing total duration automatically redistributes stage minutes proportionally!
  const handleDurationChange = (nextDuration: number) => {
    const safeDur = Math.max(5, Math.min(240, Math.round(nextDuration) || 30));
    setDurationMinutes(safeDur);
    setPlan((prev) => ({
      ...prev,
      durationMinutes: safeDur,
      timeAllocation: redistributeMinutesExact(prev.timeAllocation, safeDur),
    }));
  };

  const handleGenerateFullPlan = async () => {
    if (!topic.trim()) {
      notify('Please enter a Topic / Chapter first.', 'error');
      return;
    }
    setGenerating(true);
    try {
      const resp = await fetch('/api/short-lesson-plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classLevel,
          subject,
          topic: topic.trim(),
          durationMinutes,
          language,
          teachingMethod,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok || !data.plan) {
        throw new Error(data?.error || 'Could not generate lesson plan.');
      }
      setPlan(data.plan);
      notify(`Generated ${classLevel} ${subject} lesson plan (${durationMinutes} min, ${language}).`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Lesson generation failed.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Switch teaching language WITHOUT losing inputs — translates ALL sections naturally
  const handleLanguageSwitch = async (nextLang: ShortLessonLanguage) => {
    setLanguage(nextLang);
    if (plan.language === nextLang) return;
    setTranslating(true);
    try {
      const resp = await fetch('/api/short-lesson-plan/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: nextLang,
          plan: { ...plan, classLevel, subject, topic, durationMinutes, teachingMethod },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok || !data.plan) {
        throw new Error(data?.error || 'Translation request failed.');
      }
      setPlan(data.plan);
      notify(`Translated entire lesson plan into ${nextLang}.`);
    } catch (err) {
      // Keep teacher inputs intact and notify clearly
      notify(
        err instanceof Error
          ? `${err.message} Click Generate to create directly in ${nextLang}.`
          : `Could not translate into ${nextLang}.`,
        'error'
      );
    } finally {
      setTranslating(false);
    }
  };

  const handleRegenerateSection = async (
    section:
      | 'learningObjectives'
      | 'introduction'
      | 'teachingActivities'
      | 'timeAllocation'
      | 'assessment'
      | 'homework'
  ) => {
    setRegeneratingSection(section);
    try {
      const resp = await fetch('/api/short-lesson-plan/regenerate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section,
          plan: { ...plan, classLevel, subject, topic, durationMinutes, language, teachingMethod },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok || !data.data) {
        throw new Error(data?.error || 'Section regeneration failed.');
      }
      setPlan((prev) => ({
        ...prev,
        ...data.data,
      }));
      notify('Selected section regenerated.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not regenerate section.', 'error');
    } finally {
      setRegeneratingSection(null);
    }
  };

  const handleSavePlan = async () => {
    setSaving(true);
    try {
      const resp = await fetch('/api/short-lesson-plan/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: {
            ...plan,
            classLevel,
            subject,
            topic: topic.trim() || plan.topic,
            durationMinutes,
            language: plan.language,
            teachingMethod,
          },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Unable to save lesson plan.');
      setPlan(data.plan);
      if (Array.isArray(data.plans)) setSavedPlans(data.plans);
      notify('Lesson plan saved to library.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSaved = async (id: string) => {
    try {
      const resp = await fetch(`/api/short-lesson-plan/saved/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await resp.json();
      if (resp.ok && data?.ok && Array.isArray(data.plans)) {
        setSavedPlans(data.plans);
        notify('Saved lesson plan deleted.');
      }
    } catch {
      notify('Could not delete saved plan.', 'error');
    }
  };

  const buildPlainTextPlan = (): string => {
    const lines = [
      `AI TEACHING & LEARNING STUDIO — SHORT LESSON PLAN`,
      `${school.name || 'School'} | Class: ${plan.classLevel} | Subject: ${plan.subject} | Topic: ${plan.topic} | Duration: ${plan.durationMinutes} min | Language: ${plan.language}`,
      ``,
      `${labels.objectives}`,
      ...plan.learningObjectives.map((o, i) => `  ${i + 1}. ${o}`),
      ``,
      `${labels.introduction}`,
      `  • ${plan.introduction.activity}`,
      `  • ${labels.dailyLife}: ${plan.introduction.dailyLifeConnection}`,
      ``,
      `${labels.activities}`,
      ...plan.teachingActivities.activities.map((a) => `  • ${a}`),
      `  • ${labels.teacherRole}: ${plan.teachingActivities.teacherRole}`,
      `  • ${labels.studentParticipation}: ${plan.teachingActivities.studentParticipation}`,
      `  • ${labels.tlm}: ${plan.teachingActivities.tlm.join(', ')}`,
      ``,
      `${labels.timeAllocation}`,
      ...plan.timeAllocation.map((s) => `  - ${s.stage}: ${s.activity} (${s.minutes} ${labels.minUnit})`),
      `  ${labels.total}: ${totalAllocatedMinutes} ${labels.minUnit}`,
      ``,
      `${labels.assessment}`,
      ...plan.assessment.questions.map((q, i) => `  Q${i + 1}. ${q}`),
      `  • ${labels.quickCheck}: ${plan.assessment.quickActivity}`,
      `  • ${labels.indicators}: ${plan.assessment.expectedIndicators.join('; ')}`,
      ``,
      `${labels.homework}`,
      `  ${plan.homework}`,
    ];
    return lines.join('\n');
  };

  const handleCopyPlan = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainTextPlan());
      notify('Lesson plan copied to clipboard.');
    } catch {
      notify('Copy failed. Please copy manually.', 'error');
    }
  };

  const handlePrintOrPdf = async (mode: 'print' | 'pdf') => {
    const allowed = await guardSensitiveExport(`Short Lesson Plan (${plan.topic})`);
    if (!allowed) return;

    // For Urdu & Kashmiri (or Print mode), use Unicode/RTL-native print sheet so Perso-Arabic script renders crisply
    if (mode === 'print' || isRtl) {
      const dir = isRtl ? 'rtl' : 'ltr';
      const fontFamily = isRtl
        ? "'Scheherazade New', 'Noto Nastaliq Urdu', serif"
        : "'Plus Jakarta Sans', system-ui, sans-serif";
      const html = `<!doctype html><html dir="${dir}"><head><meta charset="utf-8" />
        <title>${escapeHtml(plan.topic)} — Short Lesson Plan</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&display=swap" />
        <style>
          body { font-family: ${fontFamily}; color: #0f172a; margin: 24px; line-height: 1.6; font-size: ${isRtl ? '17px' : '13px'}; }
          .hdr { border-bottom: 2px solid #0d9488; padding-bottom: 10px; margin-bottom: 14px; }
          .hdr h1 { margin: 0; font-size: ${isRtl ? '24px' : '18px'}; color: #0f172a; }
          .meta { color: #475569; margin-top: 4px; font-size: ${isRtl ? '15px' : '12px'}; }
          h2 { font-size: ${isRtl ? '19px' : '14px'}; color: #0f766e; margin: 14px 0 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
          ul { margin: 4px 0 8px; padding-inline-start: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: start; }
          th { background: #f1f5f9; font-weight: 700; }
        </style>
      </head><body>
        <div class="hdr">
          <h1>AI Teaching &amp; Learning Studio — ${escapeHtml(school.name || 'Lesson Plan')}</h1>
          <div class="meta">${escapeHtml(plan.classLevel)} · ${escapeHtml(plan.subject)} · ${escapeHtml(plan.topic)} · ${plan.durationMinutes} ${escapeHtml(labels.minUnit)} · ${escapeHtml(plan.language)}</div>
        </div>
        <h2>${escapeHtml(labels.objectives)}</h2>
        <ul>${plan.learningObjectives.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>
        <h2>${escapeHtml(labels.introduction)}</h2>
        <p>${escapeHtml(plan.introduction.activity)}</p>
        <p><strong>${escapeHtml(labels.dailyLife)}:</strong> ${escapeHtml(plan.introduction.dailyLifeConnection)}</p>
        <h2>${escapeHtml(labels.activities)}</h2>
        <ul>${plan.teachingActivities.activities.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
        <p><strong>${escapeHtml(labels.teacherRole)}:</strong> ${escapeHtml(plan.teachingActivities.teacherRole)}</p>
        <p><strong>${escapeHtml(labels.studentParticipation)}:</strong> ${escapeHtml(plan.teachingActivities.studentParticipation)}</p>
        <p><strong>${escapeHtml(labels.tlm)}:</strong> ${escapeHtml(plan.teachingActivities.tlm.join(', '))}</p>
        <h2>${escapeHtml(labels.timeAllocation)}</h2>
        <table>
          <thead><tr><th>${escapeHtml(labels.stage)}</th><th>${escapeHtml(labels.activityCol)}</th><th>${escapeHtml(labels.timeCol)}</th></tr></thead>
          <tbody>
            ${plan.timeAllocation
              .map(
                (s) =>
                  `<tr><td><strong>${escapeHtml(s.stage)}</strong></td><td>${escapeHtml(s.activity)}</td><td>${s.minutes} ${escapeHtml(labels.minUnit)}</td></tr>`
              )
              .join('')}
            <tr><td colspan="2"><strong>${escapeHtml(labels.total)}</strong></td><td><strong>${totalAllocatedMinutes} ${escapeHtml(labels.minUnit)}</strong></td></tr>
          </tbody>
        </table>
        <h2>${escapeHtml(labels.assessment)}</h2>
        <ul>${plan.assessment.questions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ul>
        <p><strong>${escapeHtml(labels.quickCheck)}:</strong> ${escapeHtml(plan.assessment.quickActivity)}</p>
        <p><strong>${escapeHtml(labels.indicators)}:</strong> ${escapeHtml(plan.assessment.expectedIndicators.join(' · '))}</p>
        <h2>${escapeHtml(labels.homework)}</h2>
        <p>${escapeHtml(plan.homework)}</p>
      </body></html>`;
      printHtmlDocumentSafely(html);
      notify(isRtl ? 'Opened print / Save-as-PDF preview with full Unicode RTL script.' : 'Opened print / PDF preview.');
      return;
    }

    // Direct jsPDF download for English
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 14;
    const margin = 14;
    const maxW = pageW - margin * 2;

    const addHeading = (text: string) => {
      if (y > 268) {
        doc.addPage();
        y = 16;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 118, 110);
      doc.text(text, margin, y);
      y += 5.5;
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
    };

    const addWrapped = (text: string, prefix = '') => {
      const lines = doc.splitTextToSize(`${prefix}${text}`, maxW);
      if (y + lines.length * 4.6 > 282) {
        doc.addPage();
        y = 16;
      }
      doc.text(lines, margin, y);
      y += lines.length * 4.6 + 1;
    };

    doc.setFillColor(15, 23, 42);
    doc.rect(margin, 10, maxW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('AI Teaching & Learning Studio — Short Lesson Plan', margin + 4, 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `${plan.classLevel}  |  ${plan.subject}  |  ${plan.topic}  |  ${plan.durationMinutes} min  |  ${plan.language}`,
      margin + 4,
      24
    );
    y = 35;

    addHeading(labels.objectives);
    plan.learningObjectives.forEach((o, i) => addWrapped(o, `${i + 1}. `));

    addHeading(labels.introduction);
    addWrapped(plan.introduction.activity, '• ');
    addWrapped(plan.introduction.dailyLifeConnection, `${labels.dailyLife}: `);

    addHeading(labels.activities);
    plan.teachingActivities.activities.forEach((a) => addWrapped(a, '• '));
    addWrapped(plan.teachingActivities.teacherRole, `${labels.teacherRole}: `);
    addWrapped(plan.teachingActivities.studentParticipation, `${labels.studentParticipation}: `);
    addWrapped(plan.teachingActivities.tlm.join(', '), `${labels.tlm}: `);

    addHeading(labels.timeAllocation);
    plan.timeAllocation.forEach((s) =>
      addWrapped(`${s.stage} (${s.minutes} min): ${s.activity}`, '• ')
    );
    addWrapped(`${labels.total}: ${totalAllocatedMinutes} min`);

    addHeading(labels.assessment);
    plan.assessment.questions.forEach((q, i) => addWrapped(q, `Q${i + 1}. `));
    addWrapped(plan.assessment.quickActivity, `${labels.quickCheck}: `);
    addWrapped(plan.assessment.expectedIndicators.join('; '), `${labels.indicators}: `);

    addHeading(labels.homework);
    addWrapped(plan.homework);

    doc.save(`Short_Lesson_Plan_${plan.classLevel.replace(/\s+/g, '_')}_${plan.topic.replace(/\s+/g, '_').slice(0, 28)}.pdf`);
    notify('Short Lesson Plan exported as PDF.');
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 max-w-md ${
            toast.tone === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-800'
          }`}
        >
          {toast.tone === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 dark:text-emerald-600" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            AI Teaching &amp; Learning Studio
          </h2>
          <p className={`text-xs text-slate-500 dark:text-slate-400 mt-0.5 ${isRtl ? 'font-kashmiri text-sm' : ''}`}>
            {labels.headerSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Language Quick Switcher (Preserves inputs & translates full lesson plan) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {(
              [
                { id: 'English', label: 'English' },
                { id: 'Urdu', label: 'اردو' },
                { id: 'Kashmiri', label: 'کٲشُر' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={translating}
                onClick={() => handleLanguageSwitch(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  language === opt.id
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowSavedDrawer((v) => !v)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Bookmark className="w-3.5 h-3.5 text-teal-600" />
            Saved ({savedPlans.length})
          </button>
        </div>
      </div>

      {/* Saved Plans Drawer */}
      {showSavedDrawer && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">
              Saved Short Lesson Plans
            </h3>
            <button
              type="button"
              onClick={() => setShowSavedDrawer(false)}
              className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {savedPlans.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No saved short lesson plans yet. Click Save Plan to keep a copy here.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {savedPlans.map((sp) => (
                <div
                  key={sp.id}
                  className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPlan(sp);
                      setClassLevel(sp.classLevel);
                      setSubject(sp.subject);
                      setTopic(sp.topic);
                      setDurationMinutes(sp.durationMinutes);
                      setLanguage(sp.language);
                      setTeachingMethod(sp.teachingMethod || 'AI-Recommended');
                      setShowSavedDrawer(false);
                      notify(`Loaded "${sp.topic}".`);
                    }}
                    className="text-left min-w-0 flex-1"
                  >
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {sp.topic}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {sp.classLevel} · {sp.subject} · {sp.durationMinutes} min · {sp.language}
                    </div>
                  </button>
                  {sp.id && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSaved(sp.id!)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                      aria-label="Delete saved lesson plan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Teacher Input Section */}
      <div className="bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* 1. Class (1-12) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Class (1–12)
            </label>
            <select
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            >
              {CLASS_LIST.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Subject */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Subject
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            >
              {SUBJECT_LIST.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Topic / Chapter */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Topic / Chapter
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Water Cycle, Fractions, Photosynthesis..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {/* 4. Duration (15, 20, 30, 35, 40, 45, 60, Custom) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Duration (min)
            </label>
            <div className="flex gap-1.5">
              <select
                value={isCustomDuration ? 'custom' : String(durationMinutes)}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setIsCustomDuration(true);
                  } else {
                    setIsCustomDuration(false);
                    handleDurationChange(Number(e.target.value));
                  }
                }}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              >
                {DURATION_PRESETS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
              {isCustomDuration && (
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={durationMinutes}
                  onChange={(e) => handleDurationChange(Number(e.target.value))}
                  className="w-20 px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-white"
                />
              )}
            </div>
          </div>

          {/* 6. Teaching Method */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Teaching Method
            </label>
            <select
              value={teachingMethod}
              onChange={(e) => setTeachingMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            >
              {TEACHING_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span>
              Class-oriented AI adapts pedagogy automatically for {classLevel}. Changing duration
              redistributes all stages automatically.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={generating || translating}
              onClick={handleGenerateFullPlan}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {generating
                ? 'Generating Class-Oriented Plan...'
                : translating
                ? `Translating to ${language}...`
                : 'Generate Short Lesson Plan'}
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
       * ONE-VIEW EDITABLE LESSON PLAN DASHBOARD
       * ====================================================================*/}
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 ${
          isRtl ? 'font-kashmiri text-base' : ''
        }`}
      >
        {/* Lesson Information Strip + Export/Save Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-teal-700 dark:text-teal-400">{plan.classLevel}</span>
              <span aria-hidden="true">·</span>
              <span>{plan.subject}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {plan.durationMinutes} {labels.minUnit}
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1">
                <Languages className="w-3.5 h-3.5" />
                {plan.language}
              </span>
              <span aria-hidden="true">·</span>
              <span>{plan.recommendedMethodUsed || plan.teachingMethod}</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-teal-600 shrink-0" />
              <span>{plan.topic}</span>
            </h3>
            {plan.ageTierNote && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{plan.ageTierNote}</p>
            )}
          </div>

          <div dir="ltr" className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={generating}
              onClick={handleGenerateFullPlan}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
              Regenerate
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSavePlan}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5 text-teal-600" />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleCopyPlan}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </button>
            <button
              type="button"
              onClick={() => handlePrintOrPdf('print')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              type="button"
              onClick={() => handlePrintOrPdf('pdf')}
              className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </button>
          </div>
        </div>

        {/* Compact 2-Column Grid for One-View Readability */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left Column (Sections 1, 2, 3) */}
          <div className="xl:col-span-6 space-y-5">
            {/* 1. Learning Objectives */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {labels.objectives}
                </h4>
                <div dir="ltr" className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setPlan((p) => ({
                        ...p,
                        learningObjectives: [...p.learningObjectives, ''],
                      }))
                    }
                    className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                  <button
                    type="button"
                    disabled={regeneratingSection === 'learningObjectives'}
                    onClick={() => handleRegenerateSection('learningObjectives')}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        regeneratingSection === 'learningObjectives' ? 'animate-spin' : ''
                      }`}
                    />
                    Regenerate
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {plan.learningObjectives.map((obj, idx) => (
                  <div key={`obj-${idx}`} className="flex items-start gap-2">
                    <span className="text-xs font-bold text-teal-700 dark:text-teal-400 mt-2 tabular-nums">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={obj}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPlan((p) => ({
                          ...p,
                          learningObjectives: p.learningObjectives.map((item, i) =>
                            i === idx ? val : item
                          ),
                        }));
                      }}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-sm text-slate-800 dark:text-slate-100"
                    />
                    {plan.learningObjectives.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPlan((p) => ({
                            ...p,
                            learningObjectives: p.learningObjectives.filter((_, i) => i !== idx),
                          }))
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600"
                        aria-label="Remove objective"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* 2. Introduction / Warm-up */}
            <section className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {labels.introduction}
                </h4>
                <button
                  dir="ltr"
                  type="button"
                  disabled={regeneratingSection === 'introduction'}
                  onClick={() => handleRegenerateSection('introduction')}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${
                      regeneratingSection === 'introduction' ? 'animate-spin' : ''
                    }`}
                  />
                  Regenerate
                </button>
              </div>
              <textarea
                rows={2}
                value={plan.introduction.activity}
                onChange={(e) =>
                  setPlan((p) => ({
                    ...p,
                    introduction: { ...p.introduction, activity: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-sm text-slate-800 dark:text-slate-100"
              />
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  {labels.dailyLife}
                </label>
                <input
                  type="text"
                  value={plan.introduction.dailyLifeConnection}
                  onChange={(e) =>
                    setPlan((p) => ({
                      ...p,
                      introduction: { ...p.introduction, dailyLifeConnection: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-sm text-slate-800 dark:text-slate-100"
                />
              </div>
            </section>

            {/* 3. Teaching & Learning Activities */}
            <section className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {labels.activities}
                </h4>
                <div dir="ltr" className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setPlan((p) => ({
                        ...p,
                        teachingActivities: {
                          ...p.teachingActivities,
                          activities: [...p.teachingActivities.activities, ''],
                        },
                      }))
                    }
                    className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> Add Step
                  </button>
                  <button
                    type="button"
                    disabled={regeneratingSection === 'teachingActivities'}
                    onClick={() => handleRegenerateSection('teachingActivities')}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        regeneratingSection === 'teachingActivities' ? 'animate-spin' : ''
                      }`}
                    />
                    Regenerate
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {plan.teachingActivities.activities.map((act, idx) => (
                  <div key={`act-${idx}`} className="flex items-start gap-2">
                    <span className="text-xs font-bold text-slate-400 mt-2">•</span>
                    <input
                      type="text"
                      value={act}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPlan((p) => ({
                          ...p,
                          teachingActivities: {
                            ...p.teachingActivities,
                            activities: p.teachingActivities.activities.map((x, i) =>
                              i === idx ? val : x
                            ),
                          },
                        }));
                      }}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-sm text-slate-800 dark:text-slate-100"
                    />
                    {plan.teachingActivities.activities.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPlan((p) => ({
                            ...p,
                            teachingActivities: {
                              ...p.teachingActivities,
                              activities: p.teachingActivities.activities.filter(
                                (_, i) => i !== idx
                              ),
                            },
                          }))
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600"
                        aria-label="Remove activity step"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    {labels.teacherRole}
                  </label>
                  <textarea
                    rows={2}
                    value={plan.teachingActivities.teacherRole}
                    onChange={(e) =>
                      setPlan((p) => ({
                        ...p,
                        teachingActivities: {
                          ...p.teachingActivities,
                          teacherRole: e.target.value,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-xs text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    {labels.studentParticipation}
                  </label>
                  <textarea
                    rows={2}
                    value={plan.teachingActivities.studentParticipation}
                    onChange={(e) =>
                      setPlan((p) => ({
                        ...p,
                        teachingActivities: {
                          ...p.teachingActivities,
                          studentParticipation: e.target.value,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-xs text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  {labels.tlm} (comma-separated)
                </label>
                <input
                  type="text"
                  value={plan.teachingActivities.tlm.join(', ')}
                  onChange={(e) =>
                    setPlan((p) => ({
                      ...p,
                      teachingActivities: {
                        ...p.teachingActivities,
                        tlm: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-xs text-slate-800 dark:text-slate-100"
                />
              </div>
            </section>
          </div>

          {/* Right Column (Sections 4, 5, 6) */}
          <div className="xl:col-span-6 space-y-5">
            {/* 4. Time Allocation Table (Editable + Exact Duration Sum) */}
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-teal-600" />
                  {labels.timeAllocation}
                </h4>
                <div dir="ltr" className="flex items-center gap-2">
                  {totalAllocatedMinutes !== plan.durationMinutes && (
                    <button
                      type="button"
                      onClick={() =>
                        setPlan((p) => ({
                          ...p,
                          timeAllocation: redistributeMinutesExact(
                            p.timeAllocation,
                            p.durationMinutes
                          ),
                        }))
                      }
                      className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                    >
                      Auto-Balance ({plan.durationMinutes}m)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setPlan((p) => ({
                        ...p,
                        timeAllocation: [
                          ...p.timeAllocation,
                          {
                            id: `st-${Date.now()}`,
                            stage: 'Practice',
                            activity: 'Guided practice step',
                            minutes: 2,
                          },
                        ],
                      }))
                    }
                    className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> Add Stage
                  </button>
                  <button
                    type="button"
                    disabled={regeneratingSection === 'timeAllocation'}
                    onClick={() => handleRegenerateSection('timeAllocation')}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        regeneratingSection === 'timeAllocation' ? 'animate-spin' : ''
                      }`}
                    />
                    Regenerate
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                      <th className="py-2 px-2.5 text-start font-semibold w-28">{labels.stage}</th>
                      <th className="py-2 px-2.5 text-start font-semibold">{labels.activityCol}</th>
                      <th className="py-2 px-2.5 text-end font-semibold w-20">{labels.timeCol}</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {plan.timeAllocation.map((row, idx) => (
                      <tr key={row.id || idx}>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.stage}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPlan((p) => ({
                                ...p,
                                timeAllocation: p.timeAllocation.map((r, i) =>
                                  i === idx ? { ...r, stage: val } : r
                                ),
                              }));
                            }}
                            className="w-full px-2 py-1 rounded-md border border-transparent focus:border-teal-500 bg-transparent font-semibold text-slate-900 dark:text-white"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.activity}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPlan((p) => ({
                                ...p,
                                timeAllocation: p.timeAllocation.map((r, i) =>
                                  i === idx ? { ...r, activity: val } : r
                                ),
                              }));
                            }}
                            className="w-full px-2 py-1 rounded-md border border-transparent focus:border-teal-500 bg-transparent text-slate-700 dark:text-slate-300"
                          />
                        </td>
                        <td className="p-1.5 text-end">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              min={1}
                              max={180}
                              value={row.minutes}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value) || 1);
                                setPlan((p) => ({
                                  ...p,
                                  timeAllocation: p.timeAllocation.map((r, i) =>
                                    i === idx ? { ...r, minutes: val } : r
                                  ),
                                }));
                              }}
                              className="w-12 px-1.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-end font-mono tabular-nums text-slate-900 dark:text-white"
                            />
                            <span className="text-[11px] text-slate-400">{labels.minUnit}</span>
                          </div>
                        </td>
                        <td className="p-1 text-center">
                          {plan.timeAllocation.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setPlan((p) => ({
                                  ...p,
                                  timeAllocation: redistributeMinutesExact(
                                    p.timeAllocation.filter((_, i) => i !== idx),
                                    p.durationMinutes
                                  ),
                                }))
                              }
                              className="p-1 text-slate-400 hover:text-rose-600"
                              aria-label="Remove stage"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 font-bold">
                      <td colSpan={2} className="py-2 px-2.5 text-slate-900 dark:text-white">
                        {labels.total}
                      </td>
                      <td
                        className={`py-2 px-2.5 text-end font-mono tabular-nums ${
                          totalAllocatedMinutes === plan.durationMinutes
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {totalAllocatedMinutes} {labels.minUnit}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* 5. Assessment / Quick Check */}
            <section className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {labels.assessment}
                </h4>
                <div dir="ltr" className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setPlan((p) => ({
                        ...p,
                        assessment: {
                          ...p.assessment,
                          questions: [...p.assessment.questions, ''],
                        },
                      }))
                    }
                    className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> Add Q
                  </button>
                  <button
                    type="button"
                    disabled={regeneratingSection === 'assessment'}
                    onClick={() => handleRegenerateSection('assessment')}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        regeneratingSection === 'assessment' ? 'animate-spin' : ''
                      }`}
                    />
                    Regenerate
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {plan.assessment.questions.map((q, idx) => (
                  <div key={`q-${idx}`} className="flex items-start gap-2">
                    <span className="text-xs font-bold text-teal-700 dark:text-teal-400 mt-2">
                      Q{idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPlan((p) => ({
                          ...p,
                          assessment: {
                            ...p.assessment,
                            questions: p.assessment.questions.map((x, i) => (i === idx ? val : x)),
                          },
                        }));
                      }}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-sm text-slate-800 dark:text-slate-100"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  {labels.quickCheck}
                </label>
                <input
                  type="text"
                  value={plan.assessment.quickActivity}
                  onChange={(e) =>
                    setPlan((p) => ({
                      ...p,
                      assessment: { ...p.assessment, quickActivity: e.target.value },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-xs text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  {labels.indicators}
                </label>
                <textarea
                  rows={2}
                  value={plan.assessment.expectedIndicators.join('\n')}
                  onChange={(e) =>
                    setPlan((p) => ({
                      ...p,
                      assessment: {
                        ...p.assessment,
                        expectedIndicators: e.target.value.split('\n'),
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-xs text-slate-800 dark:text-slate-100"
                />
              </div>
            </section>

            {/* 6. Homework / Follow-up */}
            <section className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {labels.homework}
                </h4>
                <button
                  dir="ltr"
                  type="button"
                  disabled={regeneratingSection === 'homework'}
                  onClick={() => handleRegenerateSection('homework')}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${
                      regeneratingSection === 'homework' ? 'animate-spin' : ''
                    }`}
                  />
                  Regenerate
                </button>
              </div>
              <textarea
                rows={2}
                value={plan.homework}
                onChange={(e) => setPlan((p) => ({ ...p, homework: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-sm text-slate-800 dark:text-slate-100"
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
