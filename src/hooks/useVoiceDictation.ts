import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResult {
  0: SpeechRecognitionResultItem;
  isFinal: boolean;
  length: number;
}

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function mapStudioLangToBcp47(lang: 'English' | 'Urdu' | 'Kashmiri'): string {
  if (lang === 'Urdu') return 'ur-PK';
  if (lang === 'Kashmiri') return 'ur-IN';
  return 'en-IN';
}

export function useVoiceDictation(lang: 'English' | 'Urdu' | 'Kashmiri') {
  const [isListening, setIsListening] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const isSupported = typeof window !== 'undefined' && getSpeechRecognitionCtor() !== null;

  const stopDictation = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop race
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setActiveField(null);
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const startDictation = useCallback(
    (fieldId: string, onTranscript: (spokenText: string) => void) => {
      setVoiceError(null);

      // Toggle off if already dictating into the same field
      if (isListening && activeField === fieldId) {
        stopDictation();
        return;
      }

      stopDictation();

      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setVoiceError(
          'Voice Input requires a browser that supports the Web Speech API (Chrome, Edge, or Safari).'
        );
        return;
      }

      try {
        const recognition = new Ctor();
        recognition.lang = mapStudioLangToBcp47(lang);
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
          const transcripts: string[] = [];
          for (let i = 0; i < event.results.length; i++) {
            const part = event.results[i]?.[0]?.transcript?.trim();
            if (part) transcripts.push(part);
          }
          const combined = transcripts.join(' ').trim();
          if (combined) {
            onTranscript(combined);
          }
        };

        recognition.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setVoiceError('Microphone permission was denied. Allow microphone access to use Voice Input.');
          } else if (event.error === 'no-speech') {
            setVoiceError('No speech detected. Tap Voice Input and speak clearly near the microphone.');
          } else if (event.error !== 'aborted') {
            setVoiceError(`Voice recognition error: ${event.error}`);
          }
          setIsListening(false);
          setActiveField(null);
          recognitionRef.current = null;
        };

        recognition.onend = () => {
          setIsListening(false);
          setActiveField(null);
          recognitionRef.current = null;
        };

        recognitionRef.current = recognition;
        setActiveField(fieldId);
        setIsListening(true);
        recognition.start();
      } catch {
        setVoiceError('Could not start Voice Input in this browser session.');
        setIsListening(false);
        setActiveField(null);
      }
    },
    [activeField, isListening, lang, stopDictation]
  );

  return {
    isSupported,
    isListening,
    activeField,
    voiceError,
    clearVoiceError: () => setVoiceError(null),
    startDictation,
    stopDictation,
  };
}
