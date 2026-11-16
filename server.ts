import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '32mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
            'You are a high-precision school admission register OCR engine. Extract tabular and form-based student records accurately without hallucinating missing data.',
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
                    category: { type: Type.STRING },
                    religion: { type: Type.STRING },
                    nationality: { type: Type.STRING },
                    address: { type: Type.STRING },
                    mobileNumber: { type: Type.STRING },
                    previousSchool: { type: Type.STRING },
                    admissionDate: { type: Type.STRING },
                    academicSession: { type: Type.STRING },
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
