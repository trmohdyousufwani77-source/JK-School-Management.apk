import type { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';

const SHORT_LESSON_STORE_PATH = path.resolve(process.cwd(), '.short-lesson-plans-store.json');

export type ShortLessonLanguage = 'English' | 'Urdu' | 'Kashmiri';

export interface TimeAllocationStage {
  id: string;
  stage: string;
  activity: string;
  minutes: number;
}

export interface ShortLessonPlanPayload {
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

function readSavedPlans(): ShortLessonPlanPayload[] {
  try {
    if (fs.existsSync(SHORT_LESSON_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SHORT_LESSON_STORE_PATH, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fallback empty
  }
  return [];
}

function writeSavedPlans(plans: ShortLessonPlanPayload[]): void {
  try {
    fs.writeFileSync(SHORT_LESSON_STORE_PATH, JSON.stringify(plans.slice(0, 100), null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist short lesson plans:', err);
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getClassPedagogyGuidance(classLevel: string): string {
  const numMatch = String(classLevel || '').match(/\d+/);
  const grade = numMatch ? Number(numMatch[0]) : 5;
  if (grade <= 2) {
    return 'Classes 1–2 (Early Primary): Use play-based learning, visual pictures, rhymes/storytelling, very simple everyday vocabulary, hands-on tactile actions, and joyful oral checks.';
  }
  if (grade <= 5) {
    return 'Classes 3–5 (Upper Primary): Use activity-based learning, relatable daily-life examples, pair/group participation, drawing/labeling tasks, and clear concrete explanations.';
  }
  if (grade <= 8) {
    return 'Classes 6–8 (Middle School): Focus on conceptual understanding, guided classroom experiments/demonstrations, structured peer discussions, cause-and-effect reasoning, and short written/oral checks.';
  }
  if (grade <= 10) {
    return 'Classes 9–10 (Secondary): Emphasize analytical thinking, structured problem-solving, board-exam conceptual clarity, real-world practical applications, and evidence-based evaluation.';
  }
  return 'Classes 11–12 (Senior Secondary): Focus on advanced domain concepts, critical thinking, derivations/case-study analysis, subject-specific inquiry, and higher-order application questions.';
}

function getLanguageScriptInstructions(language: ShortLessonLanguage): string {
  if (language === 'Urdu') {
    return 'Write EVERY single field, stage name, objective, activity, question, indicator, and homework strictly in natural, teacher-friendly Urdu (اردو) using proper Unicode Urdu script. Do NOT leave body text in English.';
  }
  if (language === 'Kashmiri') {
    return 'Write EVERY single field, stage name, objective, activity, question, indicator, and homework strictly in natural, teacher-friendly Kashmiri (کٲشُر) using authentic Perso-Arabic Kashmiri Unicode script with proper Kashmiri diacritics (ٲ ۄ ؠ ے ٹ ڈ ڑ). Do NOT leave body text in English.';
  }
  return 'Write all fields in clear, concise, practical, teacher-friendly English.';
}

/**
 * Guarantees that the sum of minutes across all timeAllocation stages ALWAYS equals targetTotalMinutes exactly.
 */
function normalizeTimeAllocation(
  stages: Array<{ id?: string; stage: string; activity: string; minutes: number }>,
  targetTotalMinutes: number
): TimeAllocationStage[] {
  const totalTarget = Math.max(5, Math.min(240, Math.round(Number(targetTotalMinutes) || 30)));
  const cleaned = (Array.isArray(stages) ? stages : [])
    .filter((s) => s && (String(s.stage || '').trim() || String(s.activity || '').trim()))
    .map((s, idx) => ({
      id: String(s.id || `stage-${idx + 1}`),
      stage: String(s.stage || `Stage ${idx + 1}`).trim(),
      activity: String(s.activity || '').trim(),
      minutes: Math.max(1, Math.round(Number(s.minutes) || 1)),
    }));

  if (cleaned.length === 0) {
    return [
      { id: 'stage-1', stage: 'Introduction', activity: 'Warm-up & daily life connection', minutes: Math.max(1, Math.round(totalTarget * 0.17)) },
      { id: 'stage-2', stage: 'Explanation', activity: 'Core concept demonstration', minutes: Math.max(1, Math.round(totalTarget * 0.33)) },
      { id: 'stage-3', stage: 'Activity', activity: 'Student group or hands-on practice', minutes: Math.max(1, Math.round(totalTarget * 0.27)) },
      { id: 'stage-4', stage: 'Assessment', activity: 'Quick understanding check', minutes: Math.max(1, Math.round(totalTarget * 0.16)) },
      { id: 'stage-5', stage: 'Conclusion', activity: 'Recap & homework', minutes: Math.max(1, totalTarget - (Math.max(1, Math.round(totalTarget * 0.17)) + Math.max(1, Math.round(totalTarget * 0.33)) + Math.max(1, Math.round(totalTarget * 0.27)) + Math.max(1, Math.round(totalTarget * 0.16)))) },
    ];
  }

  const currentSum = cleaned.reduce((acc, s) => acc + s.minutes, 0) || cleaned.length;
  const scaled = cleaned.map((s) => ({
    ...s,
    minutes: Math.max(1, Math.round((s.minutes / currentSum) * totalTarget)),
  }));

  let diff = totalTarget - scaled.reduce((acc, s) => acc + s.minutes, 0);
  let cursor = 0;
  let guard = 0;
  while (diff !== 0 && guard < 300) {
    // Prefer adjusting largest stage when subtracting, or main explanation/activity stages when adding
    if (diff > 0) {
      const idx = cursor % scaled.length;
      scaled[idx].minutes += 1;
      diff -= 1;
    } else {
      // Find stage with minutes > 1 (preferring largest)
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

const FULL_LESSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    recommendedMethodUsed: { type: Type.STRING },
    ageTierNote: { type: Type.STRING },
    learningObjectives: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    introduction: {
      type: Type.OBJECT,
      properties: {
        activity: { type: Type.STRING },
        dailyLifeConnection: { type: Type.STRING },
      },
      required: ['activity', 'dailyLifeConnection'],
    },
    teachingActivities: {
      type: Type.OBJECT,
      properties: {
        activities: { type: Type.ARRAY, items: { type: Type.STRING } },
        teacherRole: { type: Type.STRING },
        studentParticipation: { type: Type.STRING },
        tlm: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['activities', 'teacherRole', 'studentParticipation', 'tlm'],
    },
    timeAllocation: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stage: { type: Type.STRING },
          activity: { type: Type.STRING },
          minutes: { type: Type.INTEGER },
        },
        required: ['stage', 'activity', 'minutes'],
      },
    },
    assessment: {
      type: Type.OBJECT,
      properties: {
        questions: { type: Type.ARRAY, items: { type: Type.STRING } },
        quickActivity: { type: Type.STRING },
        expectedIndicators: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['questions', 'quickActivity', 'expectedIndicators'],
    },
    homework: { type: Type.STRING },
  },
  required: [
    'recommendedMethodUsed',
    'ageTierNote',
    'learningObjectives',
    'introduction',
    'teachingActivities',
    'timeAllocation',
    'assessment',
    'homework',
  ],
};

export function registerShortLessonPlanRoutes(app: Express): void {
  // 1. Generate complete class-oriented short lesson plan
  app.post('/api/short-lesson-plan/generate', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const classLevel = String(body.classLevel || 'Class 5').trim().slice(0, 40);
      const subject = String(body.subject || 'Science').trim().slice(0, 80);
      const topic = String(body.topic || '').trim().slice(0, 200);
      const durationMinutes = Math.max(5, Math.min(240, Math.round(Number(body.durationMinutes) || 30)));
      const language: ShortLessonLanguage =
        body.language === 'Urdu' || body.language === 'Kashmiri' ? body.language : 'English';
      const teachingMethod = String(body.teachingMethod || 'AI-Recommended').trim().slice(0, 80);

      if (!topic) {
        return res.status(400).json({ ok: false, error: 'Please enter a Lesson Topic or Chapter.' });
      }

      const ai = getGeminiClient();
      const pedagogyGuidance = getClassPedagogyGuidance(classLevel);
      const langGuidance = getLanguageScriptInstructions(language);

      const prompt = [
        `Create a concise, practical, classroom-ready SHORT LESSON PLAN for school teachers.`,
        `Class: ${classLevel}`,
        `Subject: ${subject}`,
        `Topic / Chapter: ${topic}`,
        `Total Duration: ${durationMinutes} minutes (ALL timeAllocation stage minutes MUST sum to EXACTLY ${durationMinutes} minutes)`,
        `Requested Teaching Method: ${teachingMethod}`,
        `Pedagogical Level Adaptation: ${pedagogyGuidance}`,
        `Language & Script Requirement: ${langGuidance}`,
        `Structure rules:`,
        `- learningObjectives: 2 to 3 crisp, measurable, age-appropriate learning outcomes.`,
        `- introduction: 1 short warm-up activity + clear connection to students' everyday life.`,
        `- teachingActivities: 2 to 4 concise engaging activities, clear teacherRole, clear studentParticipation, and 2 to 4 practical classroom TLM items.`,
        `- timeAllocation: 5 teaching stages (Introduction, Explanation, Activity, Assessment, Conclusion — translated naturally into ${language}) whose minutes add up to EXACTLY ${durationMinutes}.`,
        `- assessment: 2 to 3 short oral/written questions, 1 quick check-for-understanding activity, and 2 to 3 expected learning indicators.`,
        `- homework: 1 simple, meaningful, topic-related follow-up task.`,
        `Keep every point short, scannable, and designed to fit cleanly on a one-view teacher dashboard.`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an expert multilingual curriculum designer and master school educator. Adapt vocabulary, depth, pedagogy, activities, and assessment strictly to the exact student grade level. Output valid JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: FULL_LESSON_SCHEMA,
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      const plan: ShortLessonPlanPayload = {
        classLevel,
        subject,
        topic,
        durationMinutes,
        language,
        teachingMethod,
        recommendedMethodUsed: String(parsed.recommendedMethodUsed || teachingMethod),
        ageTierNote: String(parsed.ageTierNote || pedagogyGuidance),
        learningObjectives: Array.isArray(parsed.learningObjectives)
          ? parsed.learningObjectives.map((x: unknown) => String(x)).filter(Boolean)
          : [],
        introduction: {
          activity: String(parsed.introduction?.activity || ''),
          dailyLifeConnection: String(parsed.introduction?.dailyLifeConnection || ''),
        },
        teachingActivities: {
          activities: Array.isArray(parsed.teachingActivities?.activities)
            ? parsed.teachingActivities.activities.map((x: unknown) => String(x)).filter(Boolean)
            : [],
          teacherRole: String(parsed.teachingActivities?.teacherRole || ''),
          studentParticipation: String(parsed.teachingActivities?.studentParticipation || ''),
          tlm: Array.isArray(parsed.teachingActivities?.tlm)
            ? parsed.teachingActivities.tlm.map((x: unknown) => String(x)).filter(Boolean)
            : [],
        },
        timeAllocation: normalizeTimeAllocation(parsed.timeAllocation || [], durationMinutes),
        assessment: {
          questions: Array.isArray(parsed.assessment?.questions)
            ? parsed.assessment.questions.map((x: unknown) => String(x)).filter(Boolean)
            : [],
          quickActivity: String(parsed.assessment?.quickActivity || ''),
          expectedIndicators: Array.isArray(parsed.assessment?.expectedIndicators)
            ? parsed.assessment.expectedIndicators.map((x: unknown) => String(x)).filter(Boolean)
            : [],
        },
        homework: String(parsed.homework || ''),
      };

      return res.json({ ok: true, plan });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to generate short lesson plan.';
      console.error('Short Lesson Plan Generate Error:', msg);
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // 2. Regenerate ONLY one selected section
  app.post('/api/short-lesson-plan/regenerate-section', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const section = String(body.section || '').trim();
      const plan = body.plan || {};
      const allowedSections = [
        'learningObjectives',
        'introduction',
        'teachingActivities',
        'timeAllocation',
        'assessment',
        'homework',
      ];
      if (!allowedSections.includes(section)) {
        return res.status(400).json({ ok: false, error: 'Invalid lesson plan section requested.' });
      }

      const classLevel = String(plan.classLevel || 'Class 5').trim().slice(0, 40);
      const subject = String(plan.subject || 'Science').trim().slice(0, 80);
      const topic = String(plan.topic || 'Water Cycle').trim().slice(0, 200);
      const durationMinutes = Math.max(5, Math.min(240, Math.round(Number(plan.durationMinutes) || 30)));
      const language: ShortLessonLanguage =
        plan.language === 'Urdu' || plan.language === 'Kashmiri' ? plan.language : 'English';
      const teachingMethod = String(plan.teachingMethod || 'AI-Recommended').trim().slice(0, 80);

      const ai = getGeminiClient();
      const pedagogyGuidance = getClassPedagogyGuidance(classLevel);
      const langGuidance = getLanguageScriptInstructions(language);

      const sectionSchemas: Record<string, any> = {
        learningObjectives: {
          type: Type.OBJECT,
          properties: {
            learningObjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['learningObjectives'],
        },
        introduction: {
          type: Type.OBJECT,
          properties: {
            introduction: {
              type: Type.OBJECT,
              properties: {
                activity: { type: Type.STRING },
                dailyLifeConnection: { type: Type.STRING },
              },
              required: ['activity', 'dailyLifeConnection'],
            },
          },
          required: ['introduction'],
        },
        teachingActivities: {
          type: Type.OBJECT,
          properties: {
            teachingActivities: {
              type: Type.OBJECT,
              properties: {
                activities: { type: Type.ARRAY, items: { type: Type.STRING } },
                teacherRole: { type: Type.STRING },
                studentParticipation: { type: Type.STRING },
                tlm: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['activities', 'teacherRole', 'studentParticipation', 'tlm'],
            },
          },
          required: ['teachingActivities'],
        },
        timeAllocation: {
          type: Type.OBJECT,
          properties: {
            timeAllocation: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stage: { type: Type.STRING },
                  activity: { type: Type.STRING },
                  minutes: { type: Type.INTEGER },
                },
                required: ['stage', 'activity', 'minutes'],
              },
            },
          },
          required: ['timeAllocation'],
        },
        assessment: {
          type: Type.OBJECT,
          properties: {
            assessment: {
              type: Type.OBJECT,
              properties: {
                questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                quickActivity: { type: Type.STRING },
                expectedIndicators: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['questions', 'quickActivity', 'expectedIndicators'],
            },
          },
          required: ['assessment'],
        },
        homework: {
          type: Type.OBJECT,
          properties: {
            homework: { type: Type.STRING },
          },
          required: ['homework'],
        },
      };

      const prompt = [
        `Regenerate ONLY the "${section}" section with fresh, creative, classroom-ready content for:`,
        `Class: ${classLevel} | Subject: ${subject} | Topic: ${topic} | Duration: ${durationMinutes} min | Method: ${teachingMethod}`,
        `Pedagogy: ${pedagogyGuidance}`,
        `Language: ${langGuidance}`,
        section === 'timeAllocation'
          ? `All stage minutes MUST sum to EXACTLY ${durationMinutes} minutes.`
          : 'Keep responses concise, practical, and age-appropriate.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an expert school educator regenerating one specific lesson plan section in structured JSON.',
          responseMimeType: 'application/json',
          responseSchema: sectionSchemas[section],
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      if (section === 'timeAllocation') {
        parsed.timeAllocation = normalizeTimeAllocation(parsed.timeAllocation || [], durationMinutes);
      }

      return res.json({ ok: true, section, data: parsed });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to regenerate section.';
      console.error('Short Lesson Plan Section Regenerate Error:', msg);
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // 3. Translate ENTIRE lesson plan into English, Urdu (اردو), or Kashmiri (کٲشُر) without losing edits
  app.post('/api/short-lesson-plan/translate', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const plan = body.plan || {};
      const targetLanguage: ShortLessonLanguage =
        body.targetLanguage === 'Urdu' || body.targetLanguage === 'Kashmiri'
          ? body.targetLanguage
          : 'English';
      const durationMinutes = Math.max(5, Math.min(240, Math.round(Number(plan.durationMinutes) || 30)));

      const ai = getGeminiClient();
      const langGuidance = getLanguageScriptInstructions(targetLanguage);

      const prompt = [
        `Translate the ENTIRE lesson plan JSON below into ${targetLanguage}.`,
        langGuidance,
        `Preserve the exact pedagogical meaning, all classroom activities, and exact timeAllocation minutes (summing to ${durationMinutes} min).`,
        `Source Lesson Plan JSON:`,
        JSON.stringify({
          recommendedMethodUsed: plan.recommendedMethodUsed || plan.teachingMethod,
          ageTierNote: plan.ageTierNote || '',
          learningObjectives: plan.learningObjectives || [],
          introduction: plan.introduction || { activity: '', dailyLifeConnection: '' },
          teachingActivities: plan.teachingActivities || {
            activities: [],
            teacherRole: '',
            studentParticipation: '',
            tlm: [],
          },
          timeAllocation: (plan.timeAllocation || []).map((t: any) => ({
            stage: t.stage,
            activity: t.activity,
            minutes: t.minutes,
          })),
          assessment: plan.assessment || {
            questions: [],
            quickActivity: '',
            expectedIndicators: [],
          },
          homework: plan.homework || '',
        }),
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a native-level multilingual education translator fluent in English, Urdu (اردو), and Kashmiri (کٲشُر Perso-Arabic Unicode). Translate ALL content naturally for classroom teachers, never just headings.',
          responseMimeType: 'application/json',
          responseSchema: FULL_LESSON_SCHEMA,
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      const translatedPlan: ShortLessonPlanPayload = {
        ...plan,
        language: targetLanguage,
        durationMinutes,
        recommendedMethodUsed: String(parsed.recommendedMethodUsed || plan.recommendedMethodUsed || ''),
        ageTierNote: String(parsed.ageTierNote || plan.ageTierNote || ''),
        learningObjectives: Array.isArray(parsed.learningObjectives)
          ? parsed.learningObjectives.map((x: unknown) => String(x))
          : plan.learningObjectives,
        introduction: {
          activity: String(parsed.introduction?.activity || plan.introduction?.activity || ''),
          dailyLifeConnection: String(
            parsed.introduction?.dailyLifeConnection || plan.introduction?.dailyLifeConnection || ''
          ),
        },
        teachingActivities: {
          activities: Array.isArray(parsed.teachingActivities?.activities)
            ? parsed.teachingActivities.activities.map((x: unknown) => String(x))
            : plan.teachingActivities?.activities || [],
          teacherRole: String(
            parsed.teachingActivities?.teacherRole || plan.teachingActivities?.teacherRole || ''
          ),
          studentParticipation: String(
            parsed.teachingActivities?.studentParticipation ||
              plan.teachingActivities?.studentParticipation ||
              ''
          ),
          tlm: Array.isArray(parsed.teachingActivities?.tlm)
            ? parsed.teachingActivities.tlm.map((x: unknown) => String(x))
            : plan.teachingActivities?.tlm || [],
        },
        timeAllocation: normalizeTimeAllocation(parsed.timeAllocation || plan.timeAllocation || [], durationMinutes),
        assessment: {
          questions: Array.isArray(parsed.assessment?.questions)
            ? parsed.assessment.questions.map((x: unknown) => String(x))
            : plan.assessment?.questions || [],
          quickActivity: String(
            parsed.assessment?.quickActivity || plan.assessment?.quickActivity || ''
          ),
          expectedIndicators: Array.isArray(parsed.assessment?.expectedIndicators)
            ? parsed.assessment.expectedIndicators.map((x: unknown) => String(x))
            : plan.assessment?.expectedIndicators || [],
        },
        homework: String(parsed.homework || plan.homework || ''),
      };

      return res.json({ ok: true, plan: translatedPlan });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to translate lesson plan.';
      console.error('Short Lesson Plan Translate Error:', msg);
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // 4. Saved Short Lesson Plans CRUD
  app.get('/api/short-lesson-plan/saved', (_req: Request, res: Response) => {
    return res.json({ ok: true, plans: readSavedPlans() });
  });

  app.post('/api/short-lesson-plan/saved', (req: Request, res: Response) => {
    const incoming = req.body?.plan;
    if (!incoming || !incoming.topic) {
      return res.status(400).json({ ok: false, error: 'Valid lesson plan payload is required.' });
    }
    const plans = readSavedPlans();
    const nowIso = new Date().toISOString();
    const id =
      incoming.id && /^[a-zA-Z0-9_-]{4,80}$/.test(String(incoming.id))
        ? String(incoming.id)
        : `slp-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const record: ShortLessonPlanPayload = {
      ...incoming,
      id,
      durationMinutes: Math.max(5, Math.min(240, Math.round(Number(incoming.durationMinutes) || 30))),
      timeAllocation: normalizeTimeAllocation(
        incoming.timeAllocation || [],
        Number(incoming.durationMinutes) || 30
      ),
      savedAt: nowIso,
    };
    const idx = plans.findIndex((p) => p.id === id);
    if (idx >= 0) plans[idx] = record;
    else plans.unshift(record);
    writeSavedPlans(plans);
    return res.status(201).json({ ok: true, plan: record, plans });
  });

  app.delete('/api/short-lesson-plan/saved/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id || !/^[a-zA-Z0-9_-]{4,80}$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid lesson plan ID.' });
    }
    const plans = readSavedPlans().filter((p) => p.id !== id);
    writeSavedPlans(plans);
    return res.json({ ok: true, plans });
  });
}
