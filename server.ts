import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import {
  FIXED_ADMINISTRATOR_IDENTITY,
  denyUnauthorizedRequest,
  requireAdminPrivilege,
  validateAdminPrivilege,
} from './server/utils/adminAuthGuard';
import { registerSmartAttendanceRoutes } from './server/smartAttendanceRouter';
import { registerShortLessonPlanRoutes } from './server/shortLessonPlanRouter';

const PORT = 3000;
const JKEPM_STORE_PATH = path.resolve(process.cwd(), '.jkepm-portal-store.json');
const LEAVE_STORE_PATH = path.resolve(process.cwd(), '.teacher-leave-store.json');
const TEACHER_ATTENDANCE_STORE_PATH = path.resolve(process.cwd(), '.teacher-attendance-store.json');
const TEACHER_DIARY_STORE_PATH = path.resolve(process.cwd(), '.teacher-diary-store.json');
const PRIMARY_INSTITUTION_STORE_PATH = path.resolve(process.cwd(), '.primary-institution-store.json');

interface JkepmServerStore {
  reports: any[];
  cpisMigrations: any[];
  auditLogs: any[];
  updatedAt: string;
}

interface TeacherLeaveServerStore {
  leaves: any[];
  auditLogs: any[];
  updatedAt: string;
}

interface TeacherAttendanceServerStore {
  records: any[];
  updatedAt: string;
}

interface TeacherDiaryServerStore {
  entries: any[];
  updatedAt: string;
}

function readJkepmStore(): JkepmServerStore {
  try {
    if (fs.existsSync(JKEPM_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(JKEPM_STORE_PATH, 'utf-8'));
      return {
        reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        cpisMigrations: Array.isArray(parsed.cpisMigrations) ? parsed.cpisMigrations : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('JKEPM store read warning:', err);
  }
  return { reports: [], cpisMigrations: [], auditLogs: [], updatedAt: new Date().toISOString() };
}

function writeJkepmStore(store: JkepmServerStore): void {
  try {
    store.updatedAt = new Date().toISOString();
    fs.writeFileSync(JKEPM_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('JKEPM store write warning:', err);
  }
}

function readLeaveStore(): TeacherLeaveServerStore {
  try {
    if (fs.existsSync(LEAVE_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LEAVE_STORE_PATH, 'utf-8'));
      return {
        leaves: Array.isArray(parsed.leaves) ? parsed.leaves : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('Leave store read warning:', err);
  }
  return { leaves: [], auditLogs: [], updatedAt: new Date().toISOString() };
}

function writeLeaveStore(store: TeacherLeaveServerStore): void {
  try {
    store.updatedAt = new Date().toISOString();
    fs.writeFileSync(LEAVE_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Leave store write warning:', err);
  }
}

function readTeacherAttendanceStore(): TeacherAttendanceServerStore {
  try {
    if (fs.existsSync(TEACHER_ATTENDANCE_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(TEACHER_ATTENDANCE_STORE_PATH, 'utf-8'));
      return {
        records: Array.isArray(parsed.records) ? parsed.records : [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('Teacher attendance store read warning:', err);
  }
  return { records: [], updatedAt: new Date().toISOString() };
}

function writeTeacherAttendanceStore(store: TeacherAttendanceServerStore): void {
  try {
    store.updatedAt = new Date().toISOString();
    fs.writeFileSync(TEACHER_ATTENDANCE_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Teacher attendance store write warning:', err);
  }
}

function readTeacherDiaryStore(): TeacherDiaryServerStore {
  try {
    if (fs.existsSync(TEACHER_DIARY_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(TEACHER_DIARY_STORE_PATH, 'utf-8'));
      return {
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('Teacher diary store read warning:', err);
  }
  return { entries: [], updatedAt: new Date().toISOString() };
}

function writeTeacherDiaryStore(store: TeacherDiaryServerStore): void {
  try {
    store.updatedAt = new Date().toISOString();
    fs.writeFileSync(TEACHER_DIARY_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Teacher diary store write warning:', err);
  }
}

function hasOverlappingActiveLeave(
  leaves: any[],
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): any | undefined {
  const normEmp = String(employeeId || '').trim().toUpperCase();
  return leaves.find((l) => {
    if (excludeId && l.id === excludeId) return false;
    if (l.deletedStatus === 'Deleted' || l.status === 'Rejected') return false;
    if (String(l.employeeId || '').trim().toUpperCase() !== normEmp) return false;
    return l.startDate <= endDate && l.endDate >= startDate;
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '32mb' }));

  app.get(/\.apk$/i, (req, res, next) => {
    const requestedName = path.basename(req.path);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${requestedName === 'SchoolMaster-release.apk' ? 'SchoolMaster-v1.0.4-release.apk' : requestedName}"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    next();
  });

  // Cross-platform CORS middleware for Android WebView (file:// -> Origin: null),
  // iOS WKWebView, Capacitor, and Desktop PWA clients calling production /api/* endpoints.
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    const configuredAppUrl = (
      process.env.APP_URL ||
      process.env.VITE_APP_URL ||
      'https://ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app'
    ).replace(/\/+$/, '');

    const isAllowedOrigin =
      !origin ||
      origin === 'null' ||
      origin === configuredAppUrl ||
      origin.startsWith('capacitor://') ||
      origin.startsWith('ionic://') ||
      origin.startsWith('file://') ||
      /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/i.test(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

    if (isAllowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin && origin !== 'null' ? origin : '*');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-SchoolMaster-Role, X-Admin-Email'
      );
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  });

  app.get('/api/health', (_req, res) => {
    res.setHeader('X-SchoolMaster-Version', '1.0.4');
    res.setHeader('X-Routing-Fallback', 'active');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      status: 'ok',
      version: '1.0.4',
      service: 'SchoolMaster Production API',
      routingFallback: 'spa-index-html',
      routingMode: 'hash-and-spa-fallback',
      appUrl:
        process.env.APP_URL ||
        process.env.VITE_APP_URL ||
        'https://ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app',
      timestamp: new Date().toISOString(),
    });
  });

  // =========================================================================
  // SCHOOL MASTER AI CHATBOT – SMART LEARNING COMPANION API (SERVER-SIDE)
  // =========================================================================
  app.post('/api/ai-chatbot', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server.',
        });
      }

      const {
        message = '',
        subject = 'General Studies',
        audience = 'Student',
        history = [],
      } = (req.body || {}) as {
        message?: string;
        subject?: string;
        audience?: 'Student' | 'Teacher' | 'Parent';
        history?: Array<{ role: 'user' | 'model'; text: string }>;
      };

      const trimmedMessage = String(message || '').trim();
      if (!trimmedMessage) {
        return res.status(400).json({ error: 'Please enter a question or topic to ask School Master AI.' });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = [
        'You are "School Master AI", a friendly, accurate, and encouraging educational learning companion for Indian school students (Classes 1–12), teachers, and parents.',
        `Active Subject Focus: ${String(subject).slice(0, 60)}.`,
        `User Role: ${String(audience).slice(0, 30)}.`,
        'Provide clear, step-by-step explanations suitable for NCERT / JKBOSE curricula.',
        'Include short worked examples or practice check-questions when helpful, keep tone supportive, and format answers cleanly with short sections or bullet points.',
      ].join(' ');

      const conversationTurns = Array.isArray(history)
        ? history
            .slice(-8)
            .filter((item) => item && typeof item.text === 'string' && item.text.trim())
            .map((item) => ({
              role: item.role === 'model' ? 'model' : 'user',
              parts: [{ text: item.text.slice(0, 2000) }],
            }))
        : [];

      conversationTurns.push({
        role: 'user',
        parts: [{ text: trimmedMessage.slice(0, 3000) }],
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: conversationTurns,
        config: {
          systemInstruction,
        },
      });

      const replyText = (response.text || '').trim();
      if (!replyText) {
        return res.status(502).json({ error: 'AI service returned an empty response. Please try again.' });
      }

      return res.json({
        ok: true,
        reply: replyText,
        subject,
        audience,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate AI learning response.';
      console.error('School Master AI Chatbot Error:', message);
      return res.status(500).json({ error: message });
    }
  });

  // =========================================================================
  // DASHBOARD MULTILINGUAL MULTIMODAL AI ASSISTANT (ENGLISH, URDU, KASHMIRI)
  // =========================================================================
  const ALLOWED_AI_IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

  app.post('/api/dashboard-ai', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets.',
        });
      }

      const {
        question = '',
        languageMode = 'auto',
        subject = 'General Studies',
        classLevel = 'School Level (Classes 1-12)',
        imageBase64 = '',
        imageMimeType = '',
        history = [],
      } = (req.body || {}) as {
        question?: string;
        languageMode?: 'auto' | 'English' | 'Urdu' | 'Kashmiri';
        subject?: string;
        classLevel?: string;
        imageBase64?: string;
        imageMimeType?: string;
        history?: Array<{ role: 'user' | 'model'; text: string }>;
      };

      const trimmedQuestion = String(question || '').trim().slice(0, 4000);
      const rawBase64 = String(imageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
      const normalizedMime = String(imageMimeType || '').toLowerCase().trim();

      if (!trimmedQuestion && !rawBase64) {
        return res.status(400).json({ error: 'Please type a question or attach an educational image.' });
      }

      if (rawBase64) {
        if (!ALLOWED_AI_IMAGE_MIMES.has(normalizedMime)) {
          return res.status(400).json({ error: 'Unsupported image format. Use JPEG, PNG, WebP, or GIF.' });
        }
        if (rawBase64.length > 16 * 1024 * 1024) {
          return res.status(413).json({ error: 'Uploaded image is too large. Please use an image under 10 MB.' });
        }
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const languageDirective =
        languageMode === 'Urdu'
          ? 'Respond strictly in clear, natural, properly punctuated Urdu (Nastaleeq / Perso-Arabic script).'
          : languageMode === 'Kashmiri'
          ? 'Respond strictly in clear, authentic Kashmiri (Koshur) written in standard Perso-Arabic Kashmiri script with proper diacritics where helpful.'
          : languageMode === 'English'
          ? 'Respond strictly in clear, student-friendly English.'
          : 'Automatically detect the language of the user question (or text inside the uploaded image) among English, Urdu, and Kashmiri, and respond in that exact same language by default. If the user explicitly asks to translate between English, Urdu, and Kashmiri, provide the accurate translation cleanly.';

      const systemInstruction = [
        'You are SchoolMaster AI, an expert multilingual school tutor and academic assistant for Jammu & Kashmir (JKBOSE / NCERT) students and teachers.',
        'You are fluent in English, Urdu (اردو), and Kashmiri (کٲشُر).',
        languageDirective,
        `Active Subject: ${String(subject).slice(0, 60)}. Target Level: ${String(classLevel).slice(0, 60)}.`,
        'When an image is provided, carefully read any printed or handwritten text, equations, diagrams, or textbook questions inside the image first, then solve or explain them step by step in an easy-to-follow structured format.',
        'For Mathematics, show clear step-by-step calculations and the final verified answer. For Science and Social Science, explain concepts clearly with real-world examples.',
      ].join(' ');

      const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
      if (Array.isArray(history)) {
        for (const item of history.slice(-8)) {
          if (item && typeof item.text === 'string' && item.text.trim()) {
            contents.push({
              role: item.role === 'model' ? 'model' : 'user',
              parts: [{ text: item.text.slice(0, 2000) }],
            });
          }
        }
      }

      const currentParts: any[] = [];
      if (rawBase64) {
        currentParts.push({
          inlineData: {
            mimeType: normalizedMime === 'image/jpg' ? 'image/jpeg' : normalizedMime,
            data: rawBase64,
          },
        });
      }
      currentParts.push({
        text:
          trimmedQuestion ||
          'Please carefully read the educational question or content shown in this image and provide a clear, step-by-step explanation and answer.',
      });

      contents.push({
        role: 'user',
        parts: currentParts,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
        },
      });

      const replyText = (response.text || '').trim();
      if (!replyText) {
        return res.status(502).json({ error: 'Gemini AI returned an empty response. Please retry.' });
      }

      const hasArabicScript = /[\u0600-\u06FF\u0750-\u077F]/.test(replyText);
      const hasKashmiriMarkers = /[ٲٳۄۆۉؠےٚ]/.test(replyText);
      const detectedLanguage =
        languageMode !== 'auto'
          ? languageMode
          : hasKashmiriMarkers
          ? 'Kashmiri'
          : hasArabicScript
          ? 'Urdu'
          : 'English';

      return res.json({
        ok: true,
        reply: replyText,
        detectedLanguage,
        languageMode,
        subject,
        hasImage: Boolean(rawBase64),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process AI question.';
      console.error('Dashboard Multilingual AI Error:', message);
      return res.status(500).json({ error: message });
    }
  });

  // =========================================================================
  // AI LESSON PLAN GENERATOR (ENGLISH, URDU, KASHMIRI — 13-SECTION SCHEMA)
  // =========================================================================
  app.post('/api/lesson-plan-generator', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets.',
        });
      }

      const {
        classLevel = 'Class 5',
        subject = 'Science',
        topic = '',
        outputLanguage = 'English',
        mediumOfInstruction = 'English',
        duration = '40 minutes',
        learningObjectives = '',
        teachingMethodology = 'Interactive & Activity-Based Learning',
        availableTlm = 'Textbook, Chalkboard, Flashcards',
      } = (req.body || {}) as {
        classLevel?: string;
        subject?: string;
        topic?: string;
        outputLanguage?: 'English' | 'Urdu' | 'Kashmiri';
        mediumOfInstruction?: string;
        duration?: string;
        learningObjectives?: string;
        teachingMethodology?: string;
        availableTlm?: string;
      };

      const cleanTopic = String(topic || '').trim().slice(0, 200);
      if (!cleanTopic) {
        return res.status(400).json({ error: 'Please enter a lesson topic before generating a lesson plan.' });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const langInstruction =
        outputLanguage === 'Urdu'
          ? 'Write EVERY field of the JSON lesson plan in clear, academic Urdu (اردو) script.'
          : outputLanguage === 'Kashmiri'
          ? 'Write EVERY field of the JSON lesson plan in clear, authentic Kashmiri (کٲشُر) Perso-Arabic script.'
          : 'Write EVERY field of the JSON lesson plan in clear, professional English.';

      const prompt = [
        'Generate a complete, classroom-ready school lesson plan aligned with NCERT / JKBOSE / NEP 2020 pedagogy.',
        langInstruction,
        `Class: ${String(classLevel).slice(0, 40)}`,
        `Subject: ${String(subject).slice(0, 60)}`,
        `Topic: ${cleanTopic}`,
        `Medium of Instruction: ${String(mediumOfInstruction).slice(0, 40)}`,
        `Duration: ${String(duration).slice(0, 40)}`,
        learningObjectives ? `Teacher Specified Learning Objectives: ${String(learningObjectives).slice(0, 600)}` : '',
        `Teaching Methodology: ${String(teachingMethodology).slice(0, 200)}`,
        `Available Teaching-Learning Materials (TLM): ${String(availableTlm).slice(0, 300)}`,
        'Ensure all 13 sections are detailed, practical, age-appropriate, and directly actionable in a real classroom.',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a senior curriculum designer and master school educator creating comprehensive, NEP-2020-compliant lesson plans in English, Urdu, or Kashmiri.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              generalObjectives: { type: Type.STRING },
              specificLearningOutcomes: { type: Type.STRING },
              previousKnowledge: { type: Type.STRING },
              introduction: { type: Type.STRING },
              teachingLearningActivities: { type: Type.STRING },
              teacherActivities: { type: Type.STRING },
              studentActivities: { type: Type.STRING },
              teachingLearningMaterials: { type: Type.STRING },
              blackboardWork: { type: Type.STRING },
              assessmentQuestions: { type: Type.STRING },
              homework: { type: Type.STRING },
              inclusiveTeachingStrategies: { type: Type.STRING },
              learningOutcomeEvaluation: { type: Type.STRING },
            },
            required: [
              'title',
              'generalObjectives',
              'specificLearningOutcomes',
              'previousKnowledge',
              'introduction',
              'teachingLearningActivities',
              'teacherActivities',
              'studentActivities',
              'teachingLearningMaterials',
              'blackboardWork',
              'assessmentQuestions',
              'homework',
              'inclusiveTeachingStrategies',
              'learningOutcomeEvaluation',
            ],
          },
        },
      });

      const rawJson = (response.text || '').trim();
      if (!rawJson) {
        return res.status(502).json({ error: 'Gemini AI returned an empty lesson plan response.' });
      }

      const plan = JSON.parse(rawJson);
      return res.json({
        ok: true,
        plan,
        meta: {
          classLevel,
          subject,
          topic: cleanTopic,
          outputLanguage,
          mediumOfInstruction,
          duration,
          teachingMethodology,
          availableTlm,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate lesson plan.';
      console.error('AI Lesson Plan Generator Error:', message);
      return res.status(500).json({ error: message });
    }
  });

  // =========================================================================
  // AI SMART EDUCATION — MULTILINGUAL ENGINE (ENGLISH, URDU, KASHMIRI)
  // Supports Q&A (5 formats), Lesson Plan (13 sections), Question Paper,
  // Notes, MCQs (JSON), Worksheets & Natural Translation (Perso-Arabic / Devanagari)
  // =========================================================================
  app.post('/api/smart-edu/generate', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets.',
        });
      }

      const body = (req.body || {}) as {
        mode?:
          | 'qa'
          | 'image_qa_suite'
          | 'chatbot'
          | 'lesson_plan'
          | 'question_paper'
          | 'notes'
          | 'mcq'
          | 'true_false'
          | 'worksheet'
          | 'translate';
        subject?: string;
        classLevel?: string;
        language?: 'English' | 'Urdu' | 'Kashmiri';
        kashmiriScript?: 'perso-arabic' | 'devanagari';
        chapter?: string;
        topic?: string;
        question?: string;
        chatHistory?: Array<{ role: 'user' | 'assistant'; text: string }>;
        answerFormat?:
          | 'Very Short Answer'
          | 'Short Answer'
          | 'Long Answer'
          | 'Detailed Explanation'
          | 'Point-wise Answer';
        duration?: string;
        difficulty?: 'Easy' | 'Medium' | 'Hard' | 'Mixed';
        totalMarks?: number;
        questionCount?: number;
        questionTypes?: string[];
        examType?: 'T1 Examination' | 'T2 Examination' | string;
        section?: string;
        academicSession?: string;
        targetLanguage?: 'English' | 'Urdu' | 'Kashmiri';
        images?: Array<{ base64: string; mimeType: string; name?: string }>;
      };

      const mode = body.mode || 'qa';
      const subject = String(body.subject || 'Science').trim().slice(0, 60);
      const classLevel = String(body.classLevel || 'Class 8').trim().slice(0, 40);
      const language = body.language === 'Urdu' || body.language === 'Kashmiri' ? body.language : 'English';
      const kashmiriScript = body.kashmiriScript === 'devanagari' ? 'devanagari' : 'perso-arabic';
      const chapter = String(body.chapter || '').trim().slice(0, 200);
      const topic = String(body.topic || '').trim().slice(0, 250);
      const question = String(body.question || '').trim().slice(0, 3000);
      const answerFormat = body.answerFormat || 'Short Answer';
      const duration = String(body.duration || '40 minutes').trim().slice(0, 40);
      const difficulty = body.difficulty || 'Medium';
      const totalMarks = Math.max(10, Math.min(100, Number(body.totalMarks) || 50));
      const questionCount = Math.max(3, Math.min(24, Number(body.questionCount) || 10));
      const targetLanguage = body.targetLanguage || language;

      const sanitizedImages: Array<{ inlineData: { mimeType: string; data: string } }> = [];
      if (Array.isArray(body.images)) {
        for (const img of body.images.slice(0, 6)) {
          if (!img || typeof img.base64 !== 'string') continue;
          const cleanedB64 = img.base64.replace(/^data:[^;]+;base64,/, '').trim();
          const mime = String(img.mimeType || 'image/jpeg').toLowerCase().trim();
          if (!cleanedB64 || !ALLOWED_AI_IMAGE_MIMES.has(mime)) continue;
          if (cleanedB64.length > 14 * 1024 * 1024) {
            return res.status(413).json({
              error: 'One of the uploaded images is too large. Please keep each image under 10 MB.',
            });
          }
          sanitizedImages.push({
            inlineData: {
              mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime,
              data: cleanedB64,
            },
          });
        }
      }

      const allowedModes = new Set([
        'qa',
        'image_qa_suite',
        'chatbot',
        'lesson_plan',
        'question_paper',
        'notes',
        'mcq',
        'true_false',
        'worksheet',
        'translate',
      ]);
      if (!allowedModes.has(mode)) {
        return res.status(400).json({ error: 'Invalid AI Smart Education mode specified.' });
      }

      if (mode === 'image_qa_suite' && sanitizedImages.length === 0 && !topic && !chapter && !question) {
        return res.status(400).json({
          error: 'Please upload at least one image (from Camera or Gallery) or enter a topic/passage.',
        });
      }
      if ((mode === 'qa' || mode === 'chatbot' || mode === 'translate') && !question && sanitizedImages.length === 0) {
        return res.status(400).json({ error: 'Please enter a question, text, or attach an educational image.' });
      }
      if (
        mode !== 'qa' &&
        mode !== 'image_qa_suite' &&
        mode !== 'chatbot' &&
        mode !== 'translate' &&
        !chapter &&
        !topic &&
        sanitizedImages.length === 0
      ) {
        return res.status(400).json({
          error: 'Please enter a chapter name/topic or upload an educational image.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const resolveLangDirective = (lang: 'English' | 'Urdu' | 'Kashmiri') => {
        if (lang === 'Urdu') {
          return 'Write ALL content naturally, idiomatically, and grammatically accurately in Urdu using standard Urdu Perso-Arabic script (اردو). Do NOT translate word-for-word from English.';
        }
        if (lang === 'Kashmiri') {
          return kashmiriScript === 'devanagari'
            ? 'Write ALL content naturally, authentically, and idiomatically in Kashmiri (कॉशुर) using standard Devanagari script (देवनागरी). Do NOT translate word-for-word from English.'
            : 'Write ALL content naturally, authentically, and idiomatically in Kashmiri (کٲشُر) using standard Kashmiri Perso-Arabic script with accurate Kashmiri vowel diacritics. Do NOT translate word-for-word from English.';
        }
        return 'Write ALL content in clear, natural, age-appropriate academic English.';
      };

      const baseTeacherRules = [
        'You are an experienced school teacher and subject-matter specialist for school classes (NCERT / JKBOSE curriculum).',
        'Provide factually reliable, syllabus-aligned, age-appropriate educational content.',
        'Explain difficult ideas with clear classroom examples. Never fabricate facts or citations.',
        'If a question is incomplete or ambiguous, answer the most likely classroom intent and politely note what clarification would help further.',
        resolveLangDirective(mode === 'translate' ? targetLanguage : language),
      ].join(' ');

      if (mode === 'mcq') {
        const mcqPrompt = [
          `Generate ${questionCount} curriculum-aligned multiple-choice questions (MCQs).`,
          `Subject: ${subject}`,
          `Class/Grade: ${classLevel}`,
          `Chapter/Topic: ${[chapter, topic].filter(Boolean).join(' — ')}`,
          `Difficulty Level: ${difficulty}`,
          'Each MCQ must have exactly 4 distinct options (A, B, C, D), one verified correctOption ("A" | "B" | "C" | "D"), and a concise pedagogical explanation of why the answer is correct.',
        ].join('\n');

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: mcqPrompt,
          config: {
            systemInstruction: baseTeacherRules,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      optionA: { type: Type.STRING },
                      optionB: { type: Type.STRING },
                      optionC: { type: Type.STRING },
                      optionD: { type: Type.STRING },
                      correctOption: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: [
                      'question',
                      'optionA',
                      'optionB',
                      'optionC',
                      'optionD',
                      'correctOption',
                      'explanation',
                    ],
                  },
                },
              },
              required: ['title', 'items'],
            },
          },
        });

        const parsed = JSON.parse((response.text || '{}').trim());
        return res.json({
          ok: true,
          mode,
          title: parsed.title || `${subject} MCQs`,
          mcqs: Array.isArray(parsed.items) ? parsed.items : [],
          language,
          kashmiriScript,
          isRtl: language === 'Urdu' || (language === 'Kashmiri' && kashmiriScript === 'perso-arabic'),
          generatedAt: new Date().toISOString(),
        });
      }

      if (mode === 'image_qa_suite') {
        const validQaTypes = [
          'MCQ',
          'Very Short Answer',
          'Short Answer',
          'Long Answer',
          'Fill in the Blanks',
          'True/False',
          'Match the Following',
        ];
        const requestedTypes = Array.isArray(body.questionTypes)
          ? body.questionTypes.filter((t) => validQaTypes.includes(t))
          : validQaTypes;
        const effectiveTypes = requestedTypes.length > 0 ? requestedTypes : validQaTypes;
        // Mandatory rule: Maximum 10 questions per generation request
        const cappedQaCount = Math.max(1, Math.min(10, Number(body.questionCount) || 10));
        const examTypeLabel = String(body.examType || 'T1 Examination').trim().slice(0, 40);
        const sectionLabel = String(body.section || '').trim().slice(0, 12);
        const sessionLabel = String(body.academicSession || '').trim().slice(0, 32);

        const qaSuitePrompt = [
          sanitizedImages.length > 0
            ? `Carefully read, transcribe, and understand ALL text, diagrams, formulas, tables, or handwritten notes in the ${sanitizedImages.length} uploaded educational image(s).`
            : 'Use the provided curriculum topic/passage carefully.',
          `Generate EXACTLY ${cappedQaCount} (never more than 10) distinct, non-duplicate, syllabus-relevant, age-appropriate Questions and Answers strictly grounded in the material${
            topic || chapter ? ` (Chapter/Topic: ${[chapter, topic].filter(Boolean).join(' — ')})` : ''
          }.`,
          `Examination Type: ${examTypeLabel}${sessionLabel ? ` | Academic Session: ${sessionLabel}` : ''}`,
          `Subject: ${subject} | Class/Grade: ${classLevel}${sectionLabel ? ` (Section ${sectionLabel})` : ''} | Difficulty: ${difficulty}`,
          question ? `Additional teacher instructions: ${question}` : '',
          `Target Language: ${language}${
            language === 'Kashmiri'
              ? ` (${kashmiriScript === 'devanagari' ? 'Devanagari' : 'Perso-Arabic'} script)`
              : ''
          }`,
          `Distribute the ${cappedQaCount} questions across these requested question types: ${effectiveTypes.join(', ')}.`,
          'Strict field rules:',
          '- For every item, set "type" to one of: "MCQ", "Very Short Answer", "Short Answer", "Long Answer", "Fill in the Blanks", "True/False", or "Match the Following".',
          '- Assign appropriate integer "marks" to every question (e.g., 1 for MCQ/Fill in the Blanks/True-False/Very Short, 2-3 for Short Answer/Match the Following, 4-5 for Long Answer).',
          '- For "MCQ" items, provide exactly 4 distinct strings in "options" (without A/B/C/D prefixes), set "correctOption" to "A", "B", "C", or "D", and put the full correct answer text in "answer".',
          '- For "True/False" items, put the statement in "question", put "True" or "False" (or its natural equivalent in the target language) in "answer", and briefly justify why in "explanation".',
          '- For "Fill in the Blanks" items, include "________" in "question" and put the exact missing word/phrase in "answer".',
          '- For "Match the Following" items, list Column A (1-4) and Column B (a-d) clearly in "question" and provide the exact matched pairs in "answer".',
          '- For "Very Short Answer", "Short Answer", and "Long Answer" items, provide complete, accurate, classroom-ready model answers.',
          '- Do NOT produce duplicate questions or generic unrelated filler.',
        ]
          .filter(Boolean)
          .join('\n');

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents:
            sanitizedImages.length > 0
              ? { parts: [...sanitizedImages, { text: qaSuitePrompt }] }
              : qaSuitePrompt,
          config: {
            systemInstruction: baseTeacherRules,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                detectedTopic: { type: Type.STRING },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING },
                      marks: { type: Type.INTEGER },
                      question: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      correctOption: { type: Type.STRING },
                      answer: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: ['type', 'marks', 'question', 'answer'],
                  },
                },
              },
              required: ['title', 'detectedTopic', 'items'],
            },
          },
        });

        const parsed = JSON.parse((response.text || '{}').trim());
        const normalizedItems = (Array.isArray(parsed.items) ? parsed.items : [])
          .slice(0, 10)
          .map((item: any) => ({
            ...item,
            marks: Math.max(1, Math.min(20, Number(item?.marks) || 2)),
          }));
        return res.json({
          ok: true,
          mode,
          examType: examTypeLabel,
          academicSession: sessionLabel,
          title: parsed.title || `${subject} ${examTypeLabel} Q&A — ${topic || chapter || 'Material'}`,
          detectedTopic: parsed.detectedTopic || topic || chapter || 'Educational Content',
          items: normalizedItems,
          language,
          kashmiriScript,
          isRtl: language === 'Urdu' || (language === 'Kashmiri' && kashmiriScript === 'perso-arabic'),
          imageCount: sanitizedImages.length,
          generatedAt: new Date().toISOString(),
        });
      }

      if (mode === 'lesson_plan') {
        const lpPrompt = [
          sanitizedImages.length > 0
            ? `Carefully read and analyze the ${sanitizedImages.length} uploaded textbook page / diagram / educational image(s) FIRST, then build a complete, classroom-ready 13-section Lesson Plan grounded directly in the uploaded material.`
            : 'Create a complete, classroom-ready 13-section Lesson Plan.',
          `Subject: ${subject}`,
          `Class/Grade: ${classLevel}`,
          chapter ? `Chapter Name: ${chapter}` : '',
          topic ? `Topic: ${topic}` : '',
          question ? `Teacher Focus / Notes: ${question}` : '',
          `Duration of Lesson: ${duration}`,
          `Teaching Language: ${language}${language === 'Kashmiri' ? ` (${kashmiriScript === 'devanagari' ? 'Devanagari' : 'Perso-Arabic'} script)` : ''}`,
          'Return all 13 sections cleanly with practical classroom activities, clear blackboard notes, assessment questions, homework, and conclusion directly tied to the uploaded material and topic.',
        ]
          .filter(Boolean)
          .join('\n');

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents:
            sanitizedImages.length > 0
              ? { parts: [...sanitizedImages, { text: lpPrompt }] }
              : lpPrompt,
          config: {
            systemInstruction: baseTeacherRules,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                generalObjectives: { type: Type.STRING },
                specificLearningOutcomes: { type: Type.STRING },
                previousKnowledge: { type: Type.STRING },
                teachingLearningMaterials: { type: Type.STRING },
                introduction: { type: Type.STRING },
                presentationOfTopic: { type: Type.STRING },
                teacherActivities: { type: Type.STRING },
                studentActivities: { type: Type.STRING },
                teachingMethodology: { type: Type.STRING },
                blackboardWork: { type: Type.STRING },
                assessmentQuestions: { type: Type.STRING },
                homework: { type: Type.STRING },
                conclusion: { type: Type.STRING },
              },
              required: [
                'title',
                'generalObjectives',
                'specificLearningOutcomes',
                'previousKnowledge',
                'teachingLearningMaterials',
                'introduction',
                'presentationOfTopic',
                'teacherActivities',
                'studentActivities',
                'teachingMethodology',
                'blackboardWork',
                'assessmentQuestions',
                'homework',
                'conclusion',
              ],
            },
          },
        });

        const lessonPlan = JSON.parse((response.text || '{}').trim());
        return res.json({
          ok: true,
          mode,
          lessonPlan,
          language,
          kashmiriScript,
          imageCount: sanitizedImages.length,
          isRtl: language === 'Urdu' || (language === 'Kashmiri' && kashmiriScript === 'perso-arabic'),
          generatedAt: new Date().toISOString(),
        });
      }

      if (mode === 'true_false') {
        const tfPrompt = [
          `Generate ${questionCount} factually accurate True/False classroom questions with an Answer Key and brief explanations.`,
          `Subject: ${subject} | Class: ${classLevel} | Difficulty: ${difficulty}`,
          `Chapter / Topic: ${[chapter, topic].filter(Boolean).join(' — ')}`,
          'Ensure a balanced mix of True and False statements that test conceptual understanding.',
        ].join('\n');

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: tfPrompt,
          config: {
            systemInstruction: baseTeacherRules,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      statement: { type: Type.STRING },
                      isTrue: { type: Type.BOOLEAN },
                      explanation: { type: Type.STRING },
                    },
                    required: ['statement', 'isTrue', 'explanation'],
                  },
                },
              },
              required: ['items'],
            },
          },
        });

        const parsed = JSON.parse((response.text || '{"items":[]}').trim());
        return res.json({
          ok: true,
          mode,
          trueFalseItems: Array.isArray(parsed.items) ? parsed.items : [],
          language,
          kashmiriScript,
          isRtl: language === 'Urdu' || (language === 'Kashmiri' && kashmiriScript === 'perso-arabic'),
          generatedAt: new Date().toISOString(),
        });
      }

      let userPrompt = '';
      if (mode === 'qa') {
        userPrompt = [
          `Subject: ${subject} | Class: ${classLevel}`,
          `Requested Answer Format: ${answerFormat}`,
          `Student/Teacher Question: ${question}`,
          `Follow the exact requested format (${answerFormat}):`,
          '- Very Short Answer: 1–2 concise factual sentences.',
          '- Short Answer: 3–5 clear sentences with core reasoning.',
          '- Long Answer: Comprehensive structured essay/explanation with headings and examples.',
          '- Detailed Explanation: Step-by-step teaching breakdown with everyday examples and a quick summary.',
          '- Point-wise Answer: Numbered, crisp, exam-ready bullet points.',
        ].join('\n');
      } else if (mode === 'chatbot') {
        const recentHistory = Array.isArray(body.chatHistory)
          ? body.chatHistory
              .slice(-8)
              .map((m) => `${m.role === 'assistant' ? 'Teacher AI' : 'Student'}: ${String(m.text || '').slice(0, 600)}`)
              .join('\n')
          : '';
        userPrompt = [
          `You are an interactive AI Study Assistant helping a ${classLevel} student studying ${subject}.`,
          'Explain step-by-step in clear, friendly, syllabus-oriented language, distinguish verified facts clearly, and end with 1 brief follow-up check question to reinforce understanding.',
          recentHistory ? `Conversation so far:\n${recentHistory}` : '',
          `Latest Student Question: ${question}`,
        ]
          .filter(Boolean)
          .join('\n\n');
      } else if (mode === 'question_paper') {
        userPrompt = [
          `Generate a formal, balanced school Question Paper with a separate Complete Answer Key at the end.`,
          `Subject: ${subject} | Class: ${classLevel}`,
          `Scope (Chapter / Syllabus): ${[chapter, topic].filter(Boolean).join(' — ')}`,
          `Difficulty Level: ${difficulty} | Total Marks: ${totalMarks}`,
          'Include: School/Exam header line, General Instructions, Section A (MCQs / Fill-in-the-blanks / True-False), Section B (Very Short & Short Answer Questions), Section C (Long Answer / Application Questions) whose marks sum EXACTLY to Total Marks, followed by a clearly separated ANSWER KEY.',
        ].join('\n');
      } else if (mode === 'notes') {
        userPrompt = [
          `Create comprehensive, exam-ready Chapter Study Notes.`,
          `Subject: ${subject} | Class: ${classLevel}`,
          `Chapter / Topic: ${[chapter, topic].filter(Boolean).join(' — ')}`,
          'Organize clearly into 5 sections: 1) Chapter Summary, 2) Key Points & Concepts, 3) Important Definitions & Terms, 4) Important Questions & Answers, 5) Quick Revision Tips.',
        ].join('\n');
      } else if (mode === 'worksheet') {
        userPrompt = [
          `Create an engaging, printable Student Practice Worksheet with a Complete Answer Key.`,
          `Subject: ${subject} | Class: ${classLevel}`,
          `Chapter / Topic: ${[chapter, topic].filter(Boolean).join(' — ')}`,
          `Difficulty: ${difficulty}`,
          'Include: Part A — Fill in the Blanks (5 questions), Part B — True or False (5 questions), Part C — Short Answer Practice (4 questions), Part D — Thinking / Classroom Activity (1 creative task), and a clearly separated Answer Key for teachers/students.',
        ].join('\n');
      } else {
        userPrompt = [
          `Translate the following educational text accurately and naturally into ${targetLanguage}${
            targetLanguage === 'Kashmiri'
              ? ` (${kashmiriScript === 'devanagari' ? 'Devanagari script' : 'Perso-Arabic Kashmiri script'})`
              : ''
          } while preserving subject terminology and classroom clarity for ${classLevel} (${subject}):`,
          question,
        ].join('\n\n');
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents:
          sanitizedImages.length > 0
            ? { parts: [...sanitizedImages, { text: userPrompt }] }
            : userPrompt,
        config: {
          systemInstruction: baseTeacherRules,
        },
      });

      const content = (response.text || '').trim();
      if (!content) {
        return res.status(502).json({ error: 'Gemini AI returned an empty response. Please try again.' });
      }

      const activeLang = mode === 'translate' ? targetLanguage : language;
      return res.json({
        ok: true,
        mode,
        content,
        language: activeLang,
        kashmiriScript,
        isRtl: activeLang === 'Urdu' || (activeLang === 'Kashmiri' && kashmiriScript === 'perso-arabic'),
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate AI educational content.';
      console.error('AI Smart Education Endpoint Error:', message);
      return res.status(500).json({ error: message });
    }
  });

  // =========================================================================
  // DAILY TEACHER'S DIARY PERSISTENT REST API (DATE-WISE RECORDS)
  // =========================================================================
  app.get('/api/smart-edu/diary', (req, res) => {
    const store = readTeacherDiaryStore();
    const { date, from, to, q } = req.query as Record<string, string | undefined>;
    let list = [...store.entries];
    if (date) {
      list = list.filter((e) => e.date === date);
    }
    if (from) {
      list = list.filter((e) => String(e.date || '') >= from);
    }
    if (to) {
      list = list.filter((e) => String(e.date || '') <= to);
    }
    if (q) {
      const needle = q.trim().toLowerCase();
      list = list.filter((e) =>
        `${e.date} ${e.lessonNo} ${e.lessonName} ${e.topic} ${e.subTopic} ${e.language || ''}`
          .toLowerCase()
          .includes(needle)
      );
    }
    list.sort((a, b) => {
      const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateCmp !== 0) return dateCmp;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    return res.json({ ok: true, count: list.length, entries: list });
  });

  // =========================================================================
  // DAILY TEACHER'S DIARY — AUTOMATIC KASHMIRI-FIRST AI GENERATOR (5 FIELDS)
  // =========================================================================
  app.post('/api/smart-edu/diary/generate', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          ok: false,
          error: 'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets.',
        });
      }

      const payload = req.body || {};
      const topic = String(payload.topic || '').trim().slice(0, 300);
      const date = String(payload.date || '').trim().slice(0, 20);
      const subject = String(payload.subject || '').trim().slice(0, 120);
      const lessonName = String(payload.lessonName || '').trim().slice(0, 300);
      const introduction = String(payload.introduction ?? payload.lessonIntroduction ?? '').trim().slice(0, 1200);
      const classNumber = String(payload.classNumber || '').trim().slice(0, 40);
      const section = String(payload.section || '').trim().slice(0, 12);
      const teacherName = String(payload.teacherName || 'Teacher').trim().slice(0, 120);
      const schoolName = String(payload.schoolName || '').trim().slice(0, 200);
      const academicSession = String(payload.academicSession || '').trim().slice(0, 40);
      const language =
        payload.language === 'English' || payload.language === 'Urdu'
          ? payload.language
          : 'Kashmiri';
      const kashmiriScript = payload.kashmiriScript === 'devanagari' ? 'devanagari' : 'perso-arabic';

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          ok: false,
          error: 'Please enter a valid Date (YYYY-MM-DD).',
        });
      }
      if (!topic || !subject || !lessonName) {
        return res.status(400).json({
          ok: false,
          error: 'Please enter Topic Name, Date, Subject, and Lesson Name to automatically generate the diary.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const langInstruction =
        language === 'Urdu'
          ? 'Write ALL generated diary sections in simple, short, professional educational Urdu (اردو Perso-Arabic script).'
          : language === 'English'
          ? 'Write ALL generated diary sections in simple, short, professional educational English.'
          : kashmiriScript === 'devanagari'
          ? 'Write ALL generated diary sections strictly in simple, short, professional Kashmiri (Devanagari script) with proper Kashmiri grammar.'
          : [
              'Write ALL generated diary sections STRICTLY in authentic Kashmiri Script (کٲشُر — Perso-Arabic Kashmiri Unicode script).',
              'Use proper Kashmiri Unicode letters and vowel marks (such as کٲشُر، ٲ، ؠ، ۍ، ژ، ٹ، ڈ، ڑ، ں، ہ، ے) and natural, grammatically accurate Kashmiri school terminology (e.g., تٔعلیمی مقصَد، سبق، طالب عٔلِم، کلاس روم، گھرٕچ کٲم، اُستاد).',
              'Do NOT write English or Urdu paragraphs — every generated section must be in genuine Kashmiri script.',
            ].join(' ');

      const prompt = [
        'Automatically generate a complete, concise Teacher\'s Daily Diary from the teacher\'s five approved manual inputs:',
        `1. Topic Name: ${topic}`,
        `2. Date: ${date}`,
        `3. Subject: ${subject}`,
        `4. Lesson Name: ${lessonName}`,
        `5. Introduction (Minimal): ${introduction || '(Minimal introduction not entered — infer brief context directly from Topic Name, Subject, and Lesson Name)'}`,
        classNumber ? `School Context (auto-loaded, do not ask teacher): Class ${classNumber}${section ? `-${section}` : ''}` : '',
        schoolName ? `School: ${schoolName}` : '',
        academicSession ? `Academic Session: ${academicSession}` : '',
        teacherName ? `Teacher: ${teacherName}` : '',
        '',
        langInstruction,
        '',
        'STYLE & QUALITY RULES:',
        '- Use simple, professional, educational language.',
        '- Keep EVERY section short, crisp, and meaningful (1 to 3 concise sentences or 2 to 3 short bullet points per field).',
        '- Avoid unnecessary or lengthy explanations.',
        '- Align all sections accurately with the given Topic Name, Subject, Lesson Name, and Introduction.',
        '- NEVER invent student attendance numbers or unverified classroom incidents.',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a Kashmiri-first educational pedagogy expert who creates short, clean, grammatically accurate Teacher Daily Diaries in authentic Kashmiri Script (کٲشُر — Perso-Arabic Unicode). Always return valid, concise JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              kashmiriHeaderSummary: {
                type: Type.STRING,
                description: 'One short Kashmiri line summarizing the lesson & topic title in Kashmiri script.',
              },
              learningObjectives: {
                type: Type.STRING,
                description: '2-3 short bullet points of learning objectives in Kashmiri script.',
              },
              teachingMethodology: {
                type: Type.STRING,
                description: '1-2 short sentences describing the teaching method in Kashmiri script.',
              },
              classroomTeachingActivities: {
                type: Type.STRING,
                description: '2-3 short classroom activities in Kashmiri script.',
              },
              teachingLearningMaterials: {
                type: Type.STRING,
                description: 'Short list of teaching aids / TLM in Kashmiri script.',
              },
              lessonExplanation: {
                type: Type.STRING,
                description: '2-3 short, clear sentences explaining the core concept in Kashmiri script.',
              },
              studentParticipationActivities: {
                type: Type.STRING,
                description: '1-2 short sentences on student participation/Q&A in Kashmiri script.',
              },
              learningOutcomes: {
                type: Type.STRING,
                description: '2 short expected learning outcomes in Kashmiri script.',
              },
              homeworkAssigned: {
                type: Type.STRING,
                description: '1-2 brief, meaningful homework tasks in Kashmiri script.',
              },
              teachersRemarks: {
                type: Type.STRING,
                description: '1 short professional teacher remark in Kashmiri script.',
              },
              dailyTeachingSummary: {
                type: Type.STRING,
                description: '2 short sentences summarizing the daily teaching record in Kashmiri script.',
              },
            },
            required: [
              'kashmiriHeaderSummary',
              'learningObjectives',
              'teachingMethodology',
              'classroomTeachingActivities',
              'teachingLearningMaterials',
              'lessonExplanation',
              'studentParticipationActivities',
              'learningOutcomes',
              'homeworkAssigned',
              'teachersRemarks',
              'dailyTeachingSummary',
            ],
          },
        },
      });

      const generated = JSON.parse((response.text || '{}').trim());
      return res.json({
        ok: true,
        diary: {
          ...generated,
          topic,
          subject,
          lessonName,
          lessonIntroduction: introduction,
        },
        language,
        kashmiriScript,
        isRtl: language === 'Urdu' || (language === 'Kashmiri' && kashmiriScript === 'perso-arabic'),
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to generate Daily Teacher Diary right now.';
      console.error('AI Daily Teacher Diary Generate Error:', message);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/smart-edu/diary', (req, res) => {
    const payload = req.body || {};
    const date = String(payload.date || '').trim().slice(0, 20);
    const lessonName = String(payload.lessonName || '').trim().slice(0, 300);
    const lessonNo = String(payload.lessonNo || '-').trim().slice(0, 60);
    const topic = String(payload.topic || lessonName).trim().slice(0, 300);
    const subTopic = String(payload.subTopic || '-').trim().slice(0, 300);
    const subject = String(payload.subject || 'General').trim().slice(0, 120);

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !lessonName) {
      return res.status(400).json({
        ok: false,
        error: 'A valid Date (YYYY-MM-DD) and Lesson Name are required for a Daily Teacher Diary entry.',
      });
    }

    const rawId = String(payload.id || `diary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(rawId)) {
      return res.status(400).json({ ok: false, error: 'Invalid diary entry identifier.' });
    }

    const store = readTeacherDiaryStore();
    const now = new Date().toISOString();
    const record: Record<string, any> = {
      id: rawId,
      date,
      lessonName,
      lessonNo,
      topic,
      subTopic,
      classNumber: String(payload.classNumber || '').trim().slice(0, 40),
      section: String(payload.section || '').trim().slice(0, 12),
      subject,
      academicSession: String(payload.academicSession || '').trim().slice(0, 40),
      lessonIntroduction: String(payload.lessonIntroduction ?? payload.introduction ?? '').trim().slice(0, 2000),
      kashmiriHeaderSummary: String(payload.kashmiriHeaderSummary || '').trim().slice(0, 500),
      learningObjectives: String(payload.learningObjectives || '').trim().slice(0, 2000),
      topicsCovered: String(payload.topicsCovered || '').trim().slice(0, 2000),
      teachingMethodology: String(payload.teachingMethodology || '').trim().slice(0, 2000),
      classroomTeachingActivities: String(payload.classroomTeachingActivities || '').trim().slice(0, 2000),
      lessonExplanation: String(payload.lessonExplanation || '').trim().slice(0, 3000),
      teachingLearningMaterials: String(payload.teachingLearningMaterials || '').trim().slice(0, 2000),
      studentParticipationActivities: String(payload.studentParticipationActivities || '').trim().slice(0, 2000),
      learningOutcomes: String(payload.learningOutcomes || '').trim().slice(0, 2000),
      homeworkAssigned: String(payload.homeworkAssigned || '').trim().slice(0, 2000),
      teachersRemarks: String(payload.teachersRemarks || '').trim().slice(0, 2000),
      dailyTeachingSummary: String(payload.dailyTeachingSummary || '').trim().slice(0, 2000),
      ocrExtractedText: String(payload.ocrExtractedText || '').trim().slice(0, 8000),
      auditHistory: Array.isArray(payload.auditHistory) ? payload.auditHistory.slice(0, 30) : [],
      language:
        payload.language === 'Urdu' || payload.language === 'English'
          ? payload.language
          : 'Kashmiri',
      kashmiriScript: payload.kashmiriScript === 'devanagari' ? 'devanagari' : 'perso-arabic',
      teacherName: String(payload.teacherName || 'Teacher').trim().slice(0, 120),
      createdAt: String(payload.createdAt || now),
      updatedAt: now,
    };

    const idx = store.entries.findIndex((e) => e.id === rawId);
    if (idx >= 0) {
      store.entries[idx] = record as any;
    } else {
      store.entries.unshift(record as any);
    }
    writeTeacherDiaryStore(store);
    return res.status(idx >= 0 ? 200 : 201).json({ ok: true, entry: record });
  });

  app.put('/api/smart-edu/diary/:id', (req, res) => {
    const { id } = req.params;
    if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid diary entry identifier.' });
    }
    const payload = req.body || {};
    const store = readTeacherDiaryStore();
    const idx = store.entries.findIndex((e) => e.id === id);
    const now = new Date().toISOString();
    const existing: any = idx >= 0 ? store.entries[idx] : null;
    const nextDate = String(payload.date ?? existing?.date ?? '').trim().slice(0, 20);
    if (!nextDate || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      return res.status(400).json({ ok: false, error: 'Invalid Date format (YYYY-MM-DD required).' });
    }
    const updated: Record<string, any> = {
      ...(existing || {}),
      id,
      date: nextDate,
      lessonName: String(payload.lessonName ?? existing?.lessonName ?? '').trim().slice(0, 300),
      lessonNo: String(payload.lessonNo ?? existing?.lessonNo ?? '-').trim().slice(0, 60),
      topic: String(payload.topic ?? existing?.topic ?? payload.lessonName ?? '').trim().slice(0, 300),
      subTopic: String(payload.subTopic ?? existing?.subTopic ?? '-').trim().slice(0, 300),
      classNumber: String(payload.classNumber ?? existing?.classNumber ?? '').trim().slice(0, 40),
      section: String(payload.section ?? existing?.section ?? '').trim().slice(0, 12),
      subject: String(payload.subject ?? existing?.subject ?? '').trim().slice(0, 120),
      academicSession: String(payload.academicSession ?? existing?.academicSession ?? '').trim().slice(0, 40),
      lessonIntroduction: String(
        payload.lessonIntroduction ?? payload.introduction ?? existing?.lessonIntroduction ?? ''
      )
        .trim()
        .slice(0, 2000),
      kashmiriHeaderSummary: String(
        payload.kashmiriHeaderSummary ?? existing?.kashmiriHeaderSummary ?? ''
      )
        .trim()
        .slice(0, 500),
      learningObjectives: String(payload.learningObjectives ?? existing?.learningObjectives ?? '').trim().slice(0, 2000),
      topicsCovered: String(payload.topicsCovered ?? existing?.topicsCovered ?? '').trim().slice(0, 2000),
      teachingMethodology: String(payload.teachingMethodology ?? existing?.teachingMethodology ?? '').trim().slice(0, 2000),
      classroomTeachingActivities: String(payload.classroomTeachingActivities ?? existing?.classroomTeachingActivities ?? '').trim().slice(0, 2000),
      lessonExplanation: String(payload.lessonExplanation ?? existing?.lessonExplanation ?? '').trim().slice(0, 3000),
      teachingLearningMaterials: String(payload.teachingLearningMaterials ?? existing?.teachingLearningMaterials ?? '').trim().slice(0, 2000),
      studentParticipationActivities: String(payload.studentParticipationActivities ?? existing?.studentParticipationActivities ?? '').trim().slice(0, 2000),
      learningOutcomes: String(payload.learningOutcomes ?? existing?.learningOutcomes ?? '').trim().slice(0, 2000),
      homeworkAssigned: String(payload.homeworkAssigned ?? existing?.homeworkAssigned ?? '').trim().slice(0, 2000),
      teachersRemarks: String(payload.teachersRemarks ?? existing?.teachersRemarks ?? '').trim().slice(0, 2000),
      dailyTeachingSummary: String(payload.dailyTeachingSummary ?? existing?.dailyTeachingSummary ?? '').trim().slice(0, 2000),
      ocrExtractedText: String(payload.ocrExtractedText ?? existing?.ocrExtractedText ?? '').trim().slice(0, 8000),
      auditHistory: Array.isArray(payload.auditHistory)
        ? payload.auditHistory.slice(0, 30)
        : existing?.auditHistory || [],
      language:
        payload.language === 'Urdu' || payload.language === 'English' || payload.language === 'Kashmiri'
          ? payload.language
          : existing?.language || 'Kashmiri',
      kashmiriScript:
        payload.kashmiriScript === 'devanagari'
          ? 'devanagari'
          : existing?.kashmiriScript || 'perso-arabic',
      teacherName: String(payload.teacherName ?? existing?.teacherName ?? 'Teacher').trim().slice(0, 120),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (idx >= 0) {
      store.entries[idx] = updated as any;
    } else {
      store.entries.unshift(updated as any);
    }
    writeTeacherDiaryStore(store);
    return res.json({ ok: true, entry: updated });
  });

  app.delete('/api/smart-edu/diary/:id', (req, res) => {
    const { id } = req.params;
    if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid diary entry identifier.' });
    }
    const store = readTeacherDiaryStore();
    const before = store.entries.length;
    store.entries = store.entries.filter((e) => e.id !== id);
    if (store.entries.length !== before) {
      writeTeacherDiaryStore(store);
    }
    return res.json({ ok: true });
  });

  // =========================================================================
  // ROLE-AWARE SMART NOTIFICATION CENTER REST API (SCHOOL-ISOLATED)
  // =========================================================================
  interface ServerNotificationRecord {
    id: string;
    schoolCode: string;
    title: string;
    titleUrdu?: string;
    message: string;
    messageUrdu?: string;
    category: 'System' | 'Academic' | 'Attendance' | 'Inspection' | 'Leave' | 'Exam';
    targetRole: 'teacher' | 'admin' | 'principal' | 'student' | 'all';
    targetUserId?: string;
    actionTab?: string;
    entityId?: string;
    priority: 'high' | 'normal';
    read: boolean;
    createdAt: string;
    createdByRole?: string;
  }
  const serverNotifications: ServerNotificationRecord[] = [];
  const ADMIN_ROLES_SET = new Set(['admin', 'primary_admin', 'senior_admin', 'junior_admin', 'head_teacher', 'principal', 'super_admin']);

  app.get('/api/notifications', (req, res) => {
    const schoolCode = String(req.query.schoolCode || '').trim().slice(0, 64);
    const role = String(req.query.role || req.headers['x-user-role'] || 'teacher').toLowerCase().trim();
    const userId = String(req.query.userId || '').trim().slice(0, 100);
    const isAdminOrPrincipal = ADMIN_ROLES_SET.has(role);

    const visible = serverNotifications.filter((n) => {
      if (schoolCode && n.schoolCode && n.schoolCode !== schoolCode) return false;
      if (n.targetRole === 'all') return true;
      if (n.targetRole === 'admin' || n.targetRole === 'principal') return isAdminOrPrincipal;
      if (n.targetRole === 'teacher') {
        if (role !== 'teacher' && !isAdminOrPrincipal) return false;
        if (n.targetUserId && userId && role === 'teacher') return n.targetUserId === userId;
        return role === 'teacher';
      }
      if (n.targetRole === 'student') return role === 'student';
      return false;
    });

    return res.json({
      ok: true,
      count: visible.length,
      unreadCount: visible.filter((n) => !n.read).length,
      notifications: visible.slice(0, 80),
    });
  });

  app.post('/api/notifications', (req, res) => {
    const body = req.body || {};
    const actorRole = String(req.headers['x-user-role'] || body.actorRole || 'teacher').toLowerCase().trim();
    const category = ['System', 'Academic', 'Attendance', 'Inspection', 'Leave', 'Exam'].includes(body.category)
      ? body.category
      : 'System';
    const targetRole = ['teacher', 'admin', 'principal', 'student', 'all'].includes(body.targetRole)
      ? body.targetRole
      : 'all';

    // Server-side RBAC: Only administrators/principals may broadcast school-wide System/Inspection announcements
    if ((category === 'System' || category === 'Inspection') && targetRole === 'all' && !ADMIN_ROLES_SET.has(actorRole)) {
      return res.status(403).json({
        ok: false,
        error: 'Only authorized School Administrators or Principals can publish school-wide announcements.',
      });
    }

    const title = String(body.title || '').trim().slice(0, 200);
    const message = String(body.message || '').trim().slice(0, 1000);
    if (!title || !message) {
      return res.status(400).json({ ok: false, error: 'Notification title and message are required.' });
    }

    const record: ServerNotificationRecord = {
      id: String(body.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`).slice(0, 80),
      schoolCode: String(body.schoolCode || '').trim().slice(0, 64),
      title,
      titleUrdu: body.titleUrdu ? String(body.titleUrdu).trim().slice(0, 250) : undefined,
      message,
      messageUrdu: body.messageUrdu ? String(body.messageUrdu).trim().slice(0, 1000) : undefined,
      category,
      targetRole,
      targetUserId: body.targetUserId ? String(body.targetUserId).trim().slice(0, 100) : undefined,
      actionTab: body.actionTab ? String(body.actionTab).trim().slice(0, 48) : undefined,
      entityId: body.entityId ? String(body.entityId).trim().slice(0, 80) : undefined,
      priority: body.priority === 'high' ? 'high' : 'normal',
      read: false,
      createdAt: new Date().toISOString(),
      createdByRole: actorRole,
    };

    const existingIdx = serverNotifications.findIndex((n) => n.id === record.id);
    if (existingIdx >= 0) {
      serverNotifications[existingIdx] = record;
    } else {
      serverNotifications.unshift(record);
      if (serverNotifications.length > 250) serverNotifications.length = 250;
    }

    return res.status(201).json({ ok: true, notification: record });
  });

  app.patch('/api/notifications/:id/read', (req, res) => {
    const { id } = req.params;
    const read = req.body?.read !== false;
    const target = serverNotifications.find((n) => n.id === id);
    if (target) {
      target.read = Boolean(read);
    }
    return res.json({ ok: true, id, read: Boolean(read) });
  });

  app.post('/api/notifications/mark-all-read', (req, res) => {
    const schoolCode = String(req.body?.schoolCode || '').trim();
    const role = String(req.body?.role || req.headers['x-user-role'] || '').toLowerCase().trim();
    const isAdminOrPrincipal = ADMIN_ROLES_SET.has(role);
    serverNotifications.forEach((n) => {
      if (schoolCode && n.schoolCode && n.schoolCode !== schoolCode) return;
      if (
        n.targetRole === 'all' ||
        (isAdminOrPrincipal && (n.targetRole === 'admin' || n.targetRole === 'principal')) ||
        (!isAdminOrPrincipal && n.targetRole === role)
      ) {
        n.read = true;
      }
    });
    return res.json({ ok: true });
  });

  // =========================================================================
  // JKEPM QUARTERLY APPRAISAL & CPIS CODE MIGRATION REST API
  // =========================================================================
  app.get('/api/jkepm/state', (_req, res) => {
    const store = readJkepmStore();
    res.json(store);
  });

  app.get('/api/jkepm/submissions', (req, res) => {
    const store = readJkepmStore();
    const { teacherId, cpisCode, quarter, status, udise } = req.query as Record<string, string | undefined>;
    let list = store.reports.filter((r) => !r.isArchivedDeleted);
    if (teacherId) list = list.filter((r) => r.teacherId === teacherId);
    if (cpisCode) list = list.filter((r) => String(r.cpisCode || '').toLowerCase().includes(cpisCode.toLowerCase()));
    if (quarter) list = list.filter((r) => r.quarter === quarter);
    if (status) list = list.filter((r) => r.status === status);
    if (udise) list = list.filter((r) => String(r.schoolUdiseCode || '').includes(udise));
    res.json({ count: list.length, submissions: list });
  });

  app.post('/api/jkepm/submissions', (req, res) => {
    const payload = req.body;
    if (!payload || !payload.id || !payload.teacherId || !payload.cpisCode) {
      return res.status(400).json({ error: 'Invalid JKEPM appraisal payload: id, teacherId, and cpisCode are required.' });
    }
    const store = readJkepmStore();
    const idx = store.reports.findIndex((r) => r.id === payload.id);
    if (idx >= 0) {
      store.reports[idx] = { ...store.reports[idx], ...payload, updatedAt: new Date().toISOString() };
    } else {
      store.reports.unshift({ ...payload, createdAt: payload.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    writeJkepmStore(store);
    return res.status(idx >= 0 ? 200 : 201).json({ ok: true, report: idx >= 0 ? store.reports[idx] : store.reports[0] });
  });

  app.put('/api/jkepm/submissions/:id', (req, res) => {
    const { id } = req.params;
    const payload = req.body;
    const store = readJkepmStore();
    const idx = store.reports.findIndex((r) => r.id === id);
    if (idx < 0) {
      store.reports.unshift({ ...payload, id, updatedAt: new Date().toISOString() });
    } else {
      store.reports[idx] = { ...store.reports[idx], ...payload, id, updatedAt: new Date().toISOString() };
    }
    writeJkepmStore(store);
    return res.json({ ok: true, report: store.reports[idx >= 0 ? idx : 0] });
  });

  app.delete('/api/jkepm/submissions/:id', (req, res) => {
    const { id } = req.params;
    const { authorizedAdmin } = req.query as { authorizedAdmin?: string };
    const store = readJkepmStore();
    const idx = store.reports.findIndex((r) => r.id === id);
    if (idx < 0) return res.status(404).json({ error: 'Submission not found.' });
    const target = store.reports[idx];
    if (target.status !== 'Draft' && authorizedAdmin !== 'true') {
      return res.status(403).json({ error: 'Submitted reports cannot be permanently deleted without administrative authorization.' });
    }
    if (target.status === 'Draft') {
      store.reports.splice(idx, 1);
    } else {
      store.reports[idx] = { ...target, isArchivedDeleted: true, updatedAt: new Date().toISOString() };
    }
    writeJkepmStore(store);
    return res.json({ ok: true });
  });

  app.post('/api/jkepm/cpis-migrations', (req, res) => {
    const migration = req.body;
    if (!migration || !migration.id || !migration.oldCpisCode || !migration.newCpisCode) {
      return res.status(400).json({ error: 'Invalid CPIS migration payload.' });
    }
    const store = readJkepmStore();
    const normalizedNew = String(migration.newCpisCode).trim().toUpperCase();
    const duplicate = store.cpisMigrations.find(
      (m) =>
        m.id !== migration.id &&
        m.teacherId !== migration.teacherId &&
        m.status !== 'Rejected' &&
        String(m.newCpisCode || '').trim().toUpperCase() === normalizedNew
    );
    if (duplicate) {
      return res.status(409).json({
        error: `Duplicate CPIS Code "${migration.newCpisCode}" is already assigned to ${duplicate.teacherName}.`,
      });
    }
    const idx = store.cpisMigrations.findIndex((m) => m.id === migration.id);
    if (idx >= 0) {
      store.cpisMigrations[idx] = { ...store.cpisMigrations[idx], ...migration };
    } else {
      store.cpisMigrations.unshift(migration);
    }
    writeJkepmStore(store);
    return res.json({ ok: true, migration });
  });

  app.post('/api/jkepm/audit', (req, res) => {
    const entry = req.body;
    if (!entry || !entry.id || !entry.action) {
      return res.status(400).json({ error: 'Invalid audit entry.' });
    }
    const store = readJkepmStore();
    store.auditLogs = [entry, ...store.auditLogs.filter((a) => a.id !== entry.id)].slice(0, 500);
    writeJkepmStore(store);
    return res.status(201).json({ ok: true });
  });

  // =========================================================================
  // TEACHER LEAVE MANAGEMENT REST API (CRUD, REVIEW, APPROVE, REJECT, AUDIT)
  // =========================================================================
  app.get('/api/leaves', (req, res) => {
    const store = readLeaveStore();
    const { employeeId, status, includeDeleted } = req.query as Record<string, string | undefined>;
    let list = store.leaves;
    if (includeDeleted !== 'true') {
      list = list.filter((l) => l.deletedStatus !== 'Deleted');
    }
    if (employeeId) {
      list = list.filter((l) => String(l.employeeId || '').toUpperCase() === employeeId.toUpperCase());
    }
    if (status) {
      list = list.filter((l) => l.status === status);
    }
    res.json({ count: list.length, leaves: list, auditLogs: store.auditLogs });
  });

  app.post('/api/leaves', (req, res) => {
    const payload = req.body;
    if (!payload || !payload.id || !payload.employeeId || !payload.startDate || !payload.endDate || !payload.reason) {
      return res.status(400).json({ error: 'Missing required leave application fields.' });
    }
    if (payload.endDate < payload.startDate) {
      return res.status(400).json({ error: 'End date cannot be earlier than start date.' });
    }
    const store = readLeaveStore();
    const overlap = hasOverlappingActiveLeave(store.leaves, payload.employeeId, payload.startDate, payload.endDate, payload.id);
    if (overlap) {
      return res.status(409).json({
        error: `Overlapping leave application (${overlap.startDate} to ${overlap.endDate}) already exists.`,
      });
    }
    const now = new Date().toISOString();
    const record = {
      ...payload,
      status: payload.status || 'Pending',
      deletedStatus: payload.deletedStatus || 'Active',
      createdAt: payload.createdAt || now,
      updatedAt: now,
    };
    const idx = store.leaves.findIndex((l) => l.id === record.id);
    if (idx >= 0) {
      store.leaves[idx] = record;
    } else {
      store.leaves.unshift(record);
    }
    writeLeaveStore(store);
    return res.status(idx >= 0 ? 200 : 201).json({ ok: true, leave: record });
  });

  app.put('/api/leaves/:id', (req, res) => {
    const { id } = req.params;
    const payload = req.body;
    const store = readLeaveStore();
    const idx = store.leaves.findIndex((l) => l.id === id);
    const existing = idx >= 0 ? store.leaves[idx] : null;
    const isAdminActor = req.query.isHeadmaster === 'true';
    if (existing && (existing.status === 'Approved' || existing.status === 'Rejected') && !isAdminActor) {
      return res.status(403).json({ error: 'Approved or rejected leave applications are read-only.' });
    }
    if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
      return res.status(400).json({ error: 'End date cannot be earlier than start date.' });
    }
    if (payload.employeeId && payload.startDate && payload.endDate) {
      const overlap = hasOverlappingActiveLeave(store.leaves, payload.employeeId, payload.startDate, payload.endDate, id);
      if (overlap) {
        return res.status(409).json({
          error: `Dates overlap with existing application (${overlap.startDate} to ${overlap.endDate}).`,
        });
      }
    }
    const now = new Date().toISOString();
    const updated = { ...(existing || {}), ...payload, id, updatedAt: now };
    if (idx >= 0) {
      store.leaves[idx] = updated;
    } else {
      store.leaves.unshift(updated);
    }
    writeLeaveStore(store);
    return res.json({ ok: true, leave: updated });
  });

  app.post('/api/leaves/:id/decision', (req, res) => {
    const { id } = req.params;
    const { status, actorName, headmasterRemarks, rejectionReason } = req.body || {};
    if (!['Under_Review', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid decision status.' });
    }
    if (status === 'Rejected' && !String(rejectionReason || '').trim()) {
      return res.status(400).json({ error: 'Mandatory rejection reason is required.' });
    }
    const store = readLeaveStore();
    const idx = store.leaves.findIndex((l) => l.id === id);
    if (idx < 0) return res.status(404).json({ error: 'Leave application not found.' });
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    store.leaves[idx] = {
      ...store.leaves[idx],
      status,
      approvedBy: status === 'Under_Review' ? store.leaves[idx].approvedBy : actorName || 'Headmaster',
      reviewedBy: actorName || 'Headmaster',
      reviewDate: today,
      approvalDate: status === 'Under_Review' ? store.leaves[idx].approvalDate : today,
      decisionDate: status === 'Under_Review' ? store.leaves[idx].decisionDate : today,
      headmasterRemarks: headmasterRemarks || store.leaves[idx].headmasterRemarks || '',
      remarks: headmasterRemarks || rejectionReason || store.leaves[idx].remarks || '',
      rejectionReason: status === 'Rejected' ? String(rejectionReason).trim() : store.leaves[idx].rejectionReason,
      updatedAt: now,
    };
    writeLeaveStore(store);
    return res.json({ ok: true, leave: store.leaves[idx] });
  });

  app.delete('/api/leaves/:id', (req, res) => {
    const { id } = req.params;
    const { deletedBy, reason } = req.body || {};
    const store = readLeaveStore();
    const idx = store.leaves.findIndex((l) => l.id === id);
    if (idx < 0) return res.status(404).json({ error: 'Leave application not found.' });
    const target = store.leaves[idx];
    if (target.status === 'Approved' || target.status === 'Rejected') {
      return res.status(403).json({ error: 'Approved or rejected applications cannot be deleted.' });
    }
    const now = new Date().toISOString();
    store.leaves[idx] = {
      ...target,
      deletedStatus: 'Deleted',
      deletedAt: now,
      deletedBy: deletedBy || 'Teacher',
      deletionReason: reason || 'Withdrawn by applicant',
      updatedAt: now,
    };
    writeLeaveStore(store);
    return res.json({ ok: true, leave: store.leaves[idx] });
  });

  app.post('/api/ocr/extract-students', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured in server secrets.',
          fallbackAvailable: true,
        });
      }

      const { files = [], rawText = '' } = req.body as {
        files?: { name?: string; mimeType: string; base64Data: string }[];
        rawText?: string;
      };

      if ((!Array.isArray(files) || files.length === 0) && !String(rawText || '').trim()) {
        return res.status(400).json({ error: 'Provide at least one image/PDF file or OCR text.' });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const parts: any[] = [];
      for (const file of files.slice(0, 8)) {
        if (file?.base64Data && file?.mimeType) {
          parts.push({
            inlineData: {
              mimeType: file.mimeType,
              data: file.base64Data,
            },
          });
        }
      }

      const promptText = [
        'Extract ALL student records from these school admission forms, registers, or scanned sheets.',
        'Intelligently map column headings (e.g. Name/Student Name/Pupil Name -> fullName; Father/Father\'s Name/Guardian Name -> fatherName; DOB/Date of Birth/Birth Date -> dob).',
        'CRITICAL: NEVER invent, guess, or fabricate missing student information. If a field is blank or absent on the document, return an empty string "".',
        'Do NOT mix fields from adjacent rows. Normalize dates to YYYY-MM-DD when unambiguous; otherwise keep exact scanned string and list that field inside uncertainFields.',
        'Estimate confidenceScore from 0 to 100 for each extracted student row.',
        rawText ? `Additional scanned text:\n${rawText}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction:
            'You are a high-precision school admission register OCR engine. Extract tabular and form-based student records accurately without ever inventing or hallucinating missing data.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedHeaders: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              records: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    admissionNumber: { type: Type.STRING },
                    fullName: { type: Type.STRING },
                    fatherName: { type: Type.STRING },
                    motherName: { type: Type.STRING },
                    dob: { type: Type.STRING },
                    gender: { type: Type.STRING },
                    classNumber: { type: Type.STRING },
                    section: { type: Type.STRING },
                    rollNumber: { type: Type.STRING },
                    academicSession: { type: Type.STRING },
                    admissionDate: { type: Type.STRING },
                    previousSchool: { type: Type.STRING },
                    address: { type: Type.STRING },
                    villageCity: { type: Type.STRING },
                    district: { type: Type.STRING },
                    state: { type: Type.STRING },
                    pinCode: { type: Type.STRING },
                    mobileNumber: { type: Type.STRING },
                    parentMobile: { type: Type.STRING },
                    email: { type: Type.STRING },
                    category: { type: Type.STRING },
                    religion: { type: Type.STRING },
                    bloodGroup: { type: Type.STRING },
                    aadhaarNumber: { type: Type.STRING },
                    nationality: { type: Type.STRING },
                    confidenceScore: { type: Type.NUMBER },
                    uncertainFields: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        detectedHeaders: Array.isArray(parsed.detectedHeaders) ? parsed.detectedHeaders : [],
        records: Array.isArray(parsed.records) ? parsed.records : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR extraction failed.';
      console.error('OCR API Error:', message);
      return res.status(500).json({ error: message });
    }
  });

  // =========================================================================
  // TEACHER ATTENDANCE & SERVICE BOOK DAILY REGISTER API (DATE-WISE SYNC)
  // =========================================================================
  app.get('/api/teacher-attendance', (req, res) => {
    const store = readTeacherAttendanceStore();
    const { teacherId, date } = req.query as { teacherId?: string; date?: string };
    let list = store.records;
    if (teacherId) list = list.filter((r) => r.teacherId === teacherId);
    if (date) list = list.filter((r) => r.date === date);
    return res.json({ count: list.length, records: list });
  });

  app.post('/api/teacher-attendance', (req, res) => {
    const payload = req.body;
    if (!payload || !payload.teacherId || !payload.date || !payload.status) {
      return res.status(400).json({ error: 'Missing required teacher attendance fields (teacherId, date, status).' });
    }
    const store = readTeacherAttendanceStore();
    const now = new Date().toISOString();
    const id = payload.id || `att-${payload.teacherId}-${payload.date}`;
    const idx = store.records.findIndex((r) => r.teacherId === payload.teacherId && r.date === payload.date);
    const mergedRecord = {
      ...(idx >= 0 ? store.records[idx] : {}),
      ...payload,
      id,
      updatedAt: now,
    };
    if (idx >= 0) {
      store.records[idx] = mergedRecord;
    } else {
      store.records.unshift(mergedRecord);
    }
    writeTeacherAttendanceStore(store);
    return res.status(idx >= 0 ? 200 : 201).json({ ok: true, record: mergedRecord });
  });

  app.put('/api/teacher-attendance/:id', (req, res) => {
    const { id } = req.params;
    const payload = req.body;
    const store = readTeacherAttendanceStore();
    const now = new Date().toISOString();
    const idx = store.records.findIndex(
      (r) => r.id === id || (payload?.teacherId && payload?.date && r.teacherId === payload.teacherId && r.date === payload.date)
    );
    const mergedRecord = {
      ...(idx >= 0 ? store.records[idx] : {}),
      ...payload,
      id,
      updatedAt: now,
    };
    if (idx >= 0) {
      store.records[idx] = mergedRecord;
    } else {
      store.records.unshift(mergedRecord);
    }
    writeTeacherAttendanceStore(store);
    return res.json({ ok: true, record: mergedRecord });
  });

  // =========================================================================
  // PROTECTED SCHOOL CONFIGURATION, ABOUT US, APP INFO & ADMINISTRATOR API
  // Enforced via centralized backend validation utility (adminAuthGuard.ts)
  // =========================================================================
  const readPrimaryInstitutionStore = (): { primaryInstitution: string; updatedAt: string } => {
    try {
      if (fs.existsSync(PRIMARY_INSTITUTION_STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(PRIMARY_INSTITUTION_STORE_PATH, 'utf-8'));
        const name = typeof parsed?.primaryInstitution === 'string' ? parsed.primaryInstitution.trim() : '';
        return {
          primaryInstitution: name,
          updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        };
      }
    } catch {
      // fallback to empty unconfigured primary institution
    }
    return { primaryInstitution: '', updatedAt: new Date().toISOString() };
  };

  const writePrimaryInstitutionStore = (primaryInstitution: string) => {
    const payload = {
      primaryInstitution: primaryInstitution.trim().slice(0, 180),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(PRIMARY_INSTITUTION_STORE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    return payload;
  };

  let schoolAboutUsRecord: Record<string, any> = {
    id: 'school-about-main',
    schoolName: readPrimaryInstitutionStore().primaryInstitution,
    schoolAddress: '',
    appName: 'SchoolMaster (HPC & JKHRMS)',
    appVersion: 'v1.0.4 (Android / iOS / Windows / Web)',
    updatedAt: new Date().toISOString(),
  };
  const schoolInfoAuditLogStore: Array<Record<string, any>> = [];

  // Fixed, immutable App Developer & Administrator identity (NEVER editable via UI or standard API)
  const protectedDeveloperRecord = FIXED_ADMINISTRATOR_IDENTITY;

  const ALLOWED_SCHOOL_INFO_FIELDS = new Set([
    'schoolName',
    'schoolIntroduction',
    'schoolHistory',
    'schoolVision',
    'schoolMission',
    'schoolObjectives',
    'schoolAddress',
    'schoolContactNumber',
    'schoolEmail',
    'schoolWebsite',
    'schoolFacilities',
    'principalsMessage',
    'otherSchoolInfo',
    'appName',
    'appDescription',
    'appVersion',
    'appFeatures',
    'appPurpose',
    'appSupportEmail',
    'appSupportContactNumber',
    'privacyPolicy',
    'termsAndConditions',
    'copyrightInfo',
  ]);

  // Independent Primary Institution configuration (never linked to Administrator identity)
  app.get('/api/primary-institution', (_req, res) => {
    const stored = readPrimaryInstitutionStore();
    return res.json({
      ok: true,
      primaryInstitution: stored.primaryInstitution,
      updatedAt: stored.updatedAt,
      administrator: { ...protectedDeveloperRecord },
    });
  });

  app.put('/api/primary-institution', (req, res) => {
    const forbiddenAdminKeys = [
      'administrator',
      'adminName',
      'developerName',
      'designation',
      'administratorName',
      'developerProfile',
    ];
    const bodyObj = req.body && typeof req.body === 'object' ? req.body : {};
    if (forbiddenAdminKeys.some((key) => key in bodyObj)) {
      return denyUnauthorizedRequest(
        res,
        'Administrator Identity',
        'Forbidden: Administrator identity is fixed and cannot be modified via Primary Institution settings.',
        false
      );
    }
    const rawName = bodyObj.primaryInstitution;
    if (typeof rawName !== 'string') {
      return res.status(400).json({ ok: false, error: 'primaryInstitution must be a string.' });
    }
    const sanitizedName = rawName.trim().slice(0, 180);
    const saved = writePrimaryInstitutionStore(sanitizedName);
    schoolAboutUsRecord = {
      ...schoolAboutUsRecord,
      schoolName: saved.primaryInstitution,
      updatedAt: saved.updatedAt,
    };
    return res.json({
      ok: true,
      primaryInstitution: saved.primaryInstitution,
      updatedAt: saved.updatedAt,
    });
  });

  app.delete(
    '/api/primary-institution',
    requireAdminPrivilege('Primary Institution Record', { forbidDelete: true })
  );

  // About Us & App Information — Protected via centralized admin privilege validator
  app.get('/api/school-about-us', (_req, res) => {
    const stored = readPrimaryInstitutionStore();
    return res.json({
      ok: true,
      readOnly: true,
      data: {
        ...schoolAboutUsRecord,
        schoolName: stored.primaryInstitution || schoolAboutUsRecord.schoolName || '',
      },
      administrator: { ...protectedDeveloperRecord },
      auditLogs: schoolInfoAuditLogStore.slice(0, 100),
    });
  });

  app.get('/api/app-information', (_req, res) => {
    return res.json({
      ok: true,
      readOnly: true,
      data: {
        appName: schoolAboutUsRecord.appName,
        appDescription: schoolAboutUsRecord.appDescription,
        appVersion: schoolAboutUsRecord.appVersion,
        appFeatures: schoolAboutUsRecord.appFeatures,
        appPurpose: schoolAboutUsRecord.appPurpose,
        appSupportEmail: schoolAboutUsRecord.appSupportEmail,
        appSupportContactNumber: schoolAboutUsRecord.appSupportContactNumber,
        privacyPolicy: schoolAboutUsRecord.privacyPolicy,
        termsAndConditions: schoolAboutUsRecord.termsAndConditions,
        copyrightInfo: schoolAboutUsRecord.copyrightInfo,
      },
      administrator: { ...protectedDeveloperRecord },
    });
  });

  app.all(
    '/api/school-about-us',
    requireAdminPrivilege('About Us and App Information', { forbidDelete: true }),
    (req, res) => {
      if (req.method !== 'PUT' && req.method !== 'PATCH') {
        return denyUnauthorizedRequest(res, 'About Us and App Information', undefined, false);
      }

      const incomingData =
        req.body?.data && typeof req.body.data === 'object' ? req.body.data : req.body;
      const sanitizedPatch: Record<string, string> = {};
      const changedFields: string[] = [];

      for (const [key, val] of Object.entries(incomingData || {})) {
        if (!ALLOWED_SCHOOL_INFO_FIELDS.has(key)) continue;
        const strVal = String(val ?? '').trim().slice(0, 3000);
        if (schoolAboutUsRecord[key] !== strVal) {
          changedFields.push(key);
        }
        sanitizedPatch[key] = strVal;
      }

      if (sanitizedPatch.schoolName !== undefined && sanitizedPatch.schoolName.length < 2) {
        return res
          .status(400)
          .json({ ok: false, error: 'School Name must be at least 2 characters.' });
      }
      if (sanitizedPatch.appName !== undefined && sanitizedPatch.appName.length < 2) {
        return res.status(400).json({ ok: false, error: 'App Name must be at least 2 characters.' });
      }

      const now = new Date().toISOString();
      schoolAboutUsRecord = {
        ...schoolAboutUsRecord,
        ...sanitizedPatch,
        updatedByName: 'System Administration',
        updatedByRole: 'system_admin',
        updatedAt: now,
      };

      const section =
        req.body?.section === 'App Information' || req.body?.section === 'School Logo'
          ? req.body.section
          : 'About Us';
      const auditEntry = {
        id: `about-audit-${Date.now()}`,
        section,
        action: 'SYSTEM_UPDATE',
        changedFields,
        summary: `System-level update to ${section} (${changedFields.length > 0 ? changedFields.join(', ') : 'metadata confirmed'})`,
        actorName: 'System Administration',
        actorRole: 'system_admin',
        timestamp: now,
      };
      schoolInfoAuditLogStore.unshift(auditEntry);

      return res.json({
        ok: true,
        readOnly: true,
        data: { ...schoolAboutUsRecord },
        auditEntry,
      });
    }
  );

  app.all(
    '/api/app-information',
    requireAdminPrivilege('App Information', { immutableOverHttp: true, forbidDelete: true })
  );

  // Read-only protected Administrator & Developer ownership record endpoints
  app.get('/api/protected-developer-profile', (_req, res) => {
    return res.json({
      ok: true,
      readOnly: true,
      readOnlyForSchoolAdmin: true,
      profile: { ...protectedDeveloperRecord },
    });
  });

  app.get('/api/administrator-info', (_req, res) => {
    return res.json({
      ok: true,
      readOnly: true,
      protected: true,
      administrator: { ...protectedDeveloperRecord },
    });
  });

  app.all(
    '/api/protected-developer-profile',
    requireAdminPrivilege('Administrator and Developer Profile', {
      immutableOverHttp: true,
      forbidDelete: true,
    })
  );

  app.all(
    '/api/administrator-info',
    requireAdminPrivilege('Administrator Information', {
      immutableOverHttp: true,
      forbidDelete: true,
    })
  );

  // Protected School Configuration write/delete guard route
  app.all('/api/school-config/*', (req, res) => {
    const check = validateAdminPrivilege(req, { forbidDelete: true });
    if (!check.authorized) {
      return denyUnauthorizedRequest(
        res,
        'Protected School Configuration',
        check.reason,
        req.method.toUpperCase() === 'DELETE'
      );
    }
    return res.json({
      ok: true,
      protected: true,
      administrator: { ...protectedDeveloperRecord },
      primaryInstitution: readPrimaryInstitutionStore().primaryInstitution,
    });
  });

  // =========================================================================
  // SMART DIGITAL SCHOOL ATTENDANCE MANAGEMENT SYSTEM — PERSISTENT SYNC API
  // =========================================================================
  const DIGITAL_ATTENDANCE_STORE_PATH = path.resolve(process.cwd(), '.digital-attendance-store.json');
  const ALLOWED_ATTENDANCE_ROLES = new Set([
    'super administrator',
    'headmaster/principal',
    'attendance administrator',
    'teaching staff',
    'non-teaching staff',
    'admin',
    'head_teacher',
    'teacher',
  ]);

  app.get('/api/digital-attendance/state', (_req, res) => {
    try {
      if (!fs.existsSync(DIGITAL_ATTENDANCE_STORE_PATH)) {
        return res.json({ ok: true, state: null });
      }
      const raw = fs.readFileSync(DIGITAL_ATTENDANCE_STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return res.json({ ok: true, state: parsed });
    } catch {
      return res.status(500).json({ ok: false, error: 'Unable to read digital attendance store.' });
    }
  });

  app.put('/api/digital-attendance/state', (req, res) => {
    try {
      const roleHeader = String(req.headers['x-user-role'] || '').toLowerCase().trim();
      if (roleHeader && !ALLOWED_ATTENDANCE_ROLES.has(roleHeader)) {
        return res.status(403).json({ ok: false, error: 'Unauthorized role header.' });
      }
      const nextState = req.body?.state;
      if (!nextState || typeof nextState !== 'object' || !Array.isArray(nextState.employees)) {
        return res.status(400).json({ ok: false, error: 'Invalid digital attendance state payload.' });
      }
      const serialized = JSON.stringify(nextState);
      if (serialized.length > 12 * 1024 * 1024) {
        return res.status(413).json({ ok: false, error: 'Attendance payload exceeds size limit.' });
      }
      fs.writeFileSync(DIGITAL_ATTENDANCE_STORE_PATH, serialized, 'utf-8');
      return res.json({ ok: true, savedAt: new Date().toISOString() });
    } catch {
      return res.status(500).json({ ok: false, error: 'Unable to persist digital attendance state.' });
    }
  });

  // =========================================================================
  // AI TEACHING & LEARNING STUDIO UPGRADE:
  // 1. AI SCIENCE HANDWRITTEN IMAGE CREATOR (SCIENCE-ONLY, GEMINI STRUCTURED)
  // 2. AI OCR TOOL (IMAGE & PDF TO EDITABLE TEXT, IN-MEMORY PROCESSING)
  // =========================================================================
  const ALLOWED_SCIENCE_SUBJECTS = new Set([
    'Physics',
    'Chemistry',
    'Biology',
    'Environmental Science',
    'General Science',
  ]);

  const NON_SCIENCE_GUARD_PATTERNS = [
    /\b(shakespeare|sonnet|poem|poetry|grammar|tenses|essay on|urdu ghazal|history of mughal|world war|french revolution|civics|constitution|geography of|accounting|balance sheet|journal entry|commerce|economics|macroeconomics|stock market|political party|election manifesto)\b/i,
  ];

  app.post('/api/ai/science-handwritten-image', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          ok: false,
          error: 'GEMINI_API_KEY is not configured on the server. Please configure your Gemini API key to generate science notes.',
        });
      }

      const {
        subject = '',
        topic = '',
        classLevel = 'Class 10',
        focusHint = '',
        pageNumber = 1,
        regenerateSeed = 0,
      } = (req.body || {}) as {
        subject?: string;
        topic?: string;
        classLevel?: string;
        focusHint?: string;
        pageNumber?: number;
        regenerateSeed?: number;
      };

      const cleanSubject = String(subject || '').trim();
      const cleanTopic = String(topic || '').trim().slice(0, 500);
      const cleanClass = String(classLevel || 'Class 10').trim().slice(0, 40);
      const cleanFocus = String(focusHint || '').trim().slice(0, 300);
      const safePageNum = Math.max(1, Math.min(50, Number(pageNumber) || 1));

      if (!ALLOWED_SCIENCE_SUBJECTS.has(cleanSubject)) {
        return res.status(400).json({
          ok: false,
          error:
            'This tool is strictly limited to Science subjects: Physics, Chemistry, Biology, Environmental Science, or General Science.',
        });
      }

      if (!cleanTopic || cleanTopic.length < 3) {
        return res.status(400).json({
          ok: false,
          error: 'Please enter a valid Science topic, law, formula, or concept (at least 3 characters).',
        });
      }

      if (NON_SCIENCE_GUARD_PATTERNS.some((re) => re.test(cleanTopic))) {
        return res.status(400).json({
          ok: false,
          error:
            'Only Science topics (Physics, Chemistry, Biology, Environmental Science, General Science) are supported in the Science Handwritten Image Creator.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = [
        `You are an expert ${cleanSubject} educator preparing Page ${safePageNum} of realistic handwritten student notebook notes for ${cleanClass}.`,
        `Topic requested: "${cleanTopic}"`,
        cleanFocus ? `Extra focus / diagram request: "${cleanFocus}"` : '',
        regenerateSeed ? `Variation attempt #${Number(regenerateSeed) || 1}: provide a fresh clear diagram angle and crisp explanation.` : '',
        '',
        'STRICT RULES:',
        '1. First verify whether the requested topic genuinely belongs to Science (Physics, Chemistry, Biology, Environmental Science, or General Science). If it is NOT a science topic (e.g., history, literature, grammar, finance, politics), set isScienceTopic=false and explain politely in rejectionReason.',
        '2. If isScienceTopic=true, write concise, clear, accurate English textbook-grade notes suitable for fitting neatly on ONE ruled notebook page:',
        '   - title: Clear topic heading (max 60 chars)',
        '   - subheading: Concise chapter/concept subheading',
        '   - sections: 2 to 3 structured sections, each with a short heading, 2 to 3 clear bullet points (each max 115 chars), and 1 to 3 underlinedTerms (exact words appearing in the bullets to underline in ink)',
        '   - formulas: 1 to 3 accurate scientific formulas, laws, or balanced chemical equations (use clean Unicode subscripts/superscripts like H₂O, CO₂, v² = u² + 2as, F = ma, ΔH, →)',
        '   - diagram: Design a clear, labelled educational science diagram on a 520x260 coordinate canvas (x in 15..505, y in 18..245) using 8 to 20 geometric elements (rect, circle, ellipse, line, arrow, text). Ensure text labels do NOT overlap shapes or each other! Choose ink colors from #1E3A8A (blue ink), #B91C1C (red ink), #047857 (green ink), #1F2937 (black ink).',
        '   - keyTakeaway: 1 short exam-ready summary line (max 120 chars).',
        '3. Do not fabricate uncertain constants; stick to established school-level science principles.',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a strict Science-only educational illustrator and teacher creating structured handwritten notebook pages for Physics, Chemistry, Biology, Environmental Science, and General Science. Output valid JSON strictly matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isScienceTopic: { type: Type.BOOLEAN },
              rejectionReason: { type: Type.STRING },
              title: { type: Type.STRING },
              subheading: { type: Type.STRING },
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    heading: { type: Type.STRING },
                    points: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    underlinedTerms: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['heading', 'points'],
                },
              },
              formulas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    expression: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                  },
                  required: ['title', 'expression'],
                },
              },
              diagram: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  caption: { type: Type.STRING },
                  elements: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        type: { type: Type.STRING },
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                        x2: { type: Type.NUMBER },
                        y2: { type: Type.NUMBER },
                        w: { type: Type.NUMBER },
                        h: { type: Type.NUMBER },
                        r: { type: Type.NUMBER },
                        rx: { type: Type.NUMBER },
                        ry: { type: Type.NUMBER },
                        label: { type: Type.STRING },
                        color: { type: Type.STRING },
                        dashed: { type: Type.BOOLEAN },
                      },
                      required: ['type', 'x', 'y'],
                    },
                  },
                },
                required: ['title', 'caption', 'elements'],
              },
              keyTakeaway: { type: Type.STRING },
            },
            required: ['isScienceTopic', 'title', 'sections', 'formulas', 'diagram', 'keyTakeaway'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        return res.status(502).json({ ok: false, error: 'AI returned an empty response. Please try again.' });
      }

      const parsed = JSON.parse(rawText);
      if (parsed.isScienceTopic === false) {
        return res.status(400).json({
          ok: false,
          error:
            parsed.rejectionReason ||
            'The entered topic does not appear to be a Science subject. Please enter a Physics, Chemistry, Biology, Environmental Science, or General Science topic.',
        });
      }

      return res.json({
        ok: true,
        subject: cleanSubject,
        classLevel: cleanClass,
        topic: cleanTopic,
        pageNumber: safePageNum,
        noteSheet: {
          title: String(parsed.title || cleanTopic).slice(0, 80),
          subheading: String(parsed.subheading || `${cleanSubject} · ${cleanClass}`).slice(0, 120),
          sections: Array.isArray(parsed.sections) ? parsed.sections.slice(0, 4) : [],
          formulas: Array.isArray(parsed.formulas) ? parsed.formulas.slice(0, 4) : [],
          diagram: parsed.diagram && typeof parsed.diagram === 'object' ? parsed.diagram : { title: cleanTopic, caption: '', elements: [] },
          keyTakeaway: String(parsed.keyTakeaway || '').slice(0, 180),
        },
        accuracyVerificationNote:
          'AI-generated educational draft. Teachers and students should verify formulas, units, and diagram labels against their prescribed science textbook before distribution.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate handwritten science page.';
      console.error('Science Handwritten Image Creator API Error:', message);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  const ALLOWED_OCR_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/pdf',
  ]);

  app.post('/api/ai/ocr-extract', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          ok: false,
          error: 'GEMINI_API_KEY is not configured on the server. Please configure your Gemini API key to use AI OCR.',
        });
      }

      const {
        fileBase64 = '',
        mimeType = '',
        fileName = 'document',
        preserveStructure = true,
      } = (req.body || {}) as {
        fileBase64?: string;
        mimeType?: string;
        fileName?: string;
        preserveStructure?: boolean;
      };

      const normalizedMime = String(mimeType || '').toLowerCase().trim();
      if (!ALLOWED_OCR_MIME_TYPES.has(normalizedMime)) {
        return res.status(400).json({
          ok: false,
          error: 'Unsupported file format. Please upload a JPG, JPEG, PNG image or a PDF document.',
        });
      }

      const cleanBase64 = String(fileBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
      if (!cleanBase64) {
        return res.status(400).json({
          ok: false,
          error: 'No document content received. Please select or capture an image or PDF first.',
        });
      }

      // Enforce 12 MB decoded payload limit (in-memory only, never persisted to disk)
      const estimatedBytes = Math.floor((cleanBase64.length * 3) / 4);
      if (estimatedBytes > 12 * 1024 * 1024) {
        return res.status(413).json({
          ok: false,
          error: 'Uploaded file exceeds the 12 MB limit. Please upload a smaller image or PDF document.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const effectiveMime = normalizedMime === 'image/jpg' ? 'image/jpeg' : normalizedMime;

      const ocrPrompt = [
        'Perform high-accuracy Optical Character Recognition (OCR) on the attached document/image.',
        'Extract ALL readable text accurately, including:',
        '- Printed text and handwritten notes',
        '- Mathematical equations, fractions, exponents, roots, and symbols (render clearly using standard Unicode math symbols like ×, ÷, ±, √, π, ², ³, ≤, ≥, ∑)',
        '- Scientific formulas and chemical notations (render subscripts/arrows cleanly like H₂O, CO₂, H₂SO₄, →, ⇌, Δ)',
        preserveStructure
          ? '- Preserve original headings, subheadings, paragraph breaks, numbered lists, and bullet points faithfully.'
          : '- Return clean continuous plain text.',
        'Do NOT invent or hallucinate text that is not visible in the document. If a word is genuinely illegible, mark it as [illegible].',
        `Source filename: ${String(fileName || 'document').slice(0, 120)}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: effectiveMime,
                data: cleanBase64,
              },
            },
            { text: ocrPrompt },
          ],
        },
        config: {
          systemInstruction:
            'You are a precision academic OCR engine for teachers and students. Accurately transcribe printed text, handwritten notes, mathematical equations, scientific formulas, and chemical notations while preserving document structure. Return JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              extractedText: { type: Type.STRING },
              detectedCategories: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              qualityNote: { type: Type.STRING },
            },
            required: ['extractedText', 'detectedCategories'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        return res.status(502).json({
          ok: false,
          error: 'OCR engine returned an empty response. Please ensure the document is clear and legible.',
        });
      }

      const parsed = JSON.parse(rawText);
      const extractedText = String(parsed.extractedText || '').trim();
      const words = extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0;
      const lines = extractedText ? extractedText.split(/\r?\n/).length : 0;

      return res.json({
        ok: true,
        extractedText,
        detectedCategories: Array.isArray(parsed.detectedCategories)
          ? parsed.detectedCategories.map((c: unknown) => String(c)).slice(0, 8)
          : ['Printed / Handwritten Text'],
        wordCount: words,
        lineCount: lines,
        qualityNote:
          String(parsed.qualityNote || '').trim() ||
          'Review extracted formulas, numbers, and handwritten words carefully before saving or exporting.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR extraction failed. Please try a clearer image or PDF.';
      console.error('AI OCR Tool API Error:', message);
      return res.status(500).json({ ok: false, error: message });
    }
  });

  // Mount Smart Digital School Attendance Management System REST APIs
  registerSmartAttendanceRoutes(app);

  // Mount AI-Powered Short Lesson Plan Generator REST APIs
  registerShortLessonPlanRoutes(app);

  // Return clean JSON 404 for unknown /api/* routes in both development and production
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
