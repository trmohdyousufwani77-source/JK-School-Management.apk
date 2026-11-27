export type OutputLang = 'English' | 'Urdu' | 'Kashmiri';

export type OfflineStorageEngine = 'room' | 'indexeddb' | 'localstorage';

export type ShareChannel = 'whatsapp' | 'email' | 'chooser';

export interface StructuredLessonPlan {
  title: string;
  generalObjectives: string;
  specificLearningOutcomes: string;
  previousKnowledge: string;
  teachingLearningMaterials: string;
  introduction: string;
  presentationOfTopic: string;
  teacherActivities: string;
  studentActivities: string;
  teachingMethodology: string;
  blackboardWork: string;
  assessmentQuestions: string;
  homework: string;
  conclusion: string;
}

export interface SavedLessonPlanRecord {
  id: string;
  subject: string;
  classLevel: string;
  chapter?: string;
  topic: string;
  duration: string;
  language: OutputLang;
  isRtl: boolean;
  teacherName?: string;
  schoolName?: string;
  plan: StructuredLessonPlan;
  savedAt: string;
  storageEngine?: OfflineStorageEngine;
}

export const LESSON_SECTIONS: Array<{
  key: keyof StructuredLessonPlan;
  number: string;
  label: string;
}> = [
  { key: 'generalObjectives', number: '01', label: '1. General Objectives' },
  { key: 'specificLearningOutcomes', number: '02', label: '2. Specific Learning Outcomes' },
  { key: 'previousKnowledge', number: '03', label: '3. Previous Knowledge' },
  { key: 'teachingLearningMaterials', number: '04', label: '4. Teaching-Learning Materials (TLM)' },
  { key: 'introduction', number: '05', label: '5. Introduction & Warm-Up' },
  { key: 'presentationOfTopic', number: '06', label: '6. Presentation of the Topic' },
  { key: 'teacherActivities', number: '07', label: '7. Teacher Activities' },
  { key: 'studentActivities', number: '08', label: '8. Student Activities' },
  { key: 'teachingMethodology', number: '09', label: '9. Teaching Methodology' },
  { key: 'blackboardWork', number: '10', label: '10. Blackboard Work' },
  { key: 'assessmentQuestions', number: '11', label: '11. Assessment Questions' },
  { key: 'homework', number: '12', label: '12. Homework' },
  { key: 'conclusion', number: '13', label: '13. Conclusion' },
];
