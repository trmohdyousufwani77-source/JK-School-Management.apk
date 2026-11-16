import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocFromServer,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  writeBatch,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import {
  getMessaging,
  getToken,
  isSupported as isMessagingSupported,
  onMessage,
  MessagePayload,
} from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';
import { ExcelMappingSchema, OcrImportBatchHistory, PrincipalRecord, SchoolProfile, Student } from './types';
import { MissingLigatureReport } from './utils/urduTypography';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return { ok: false, error: msg };
  }
}

export async function signInWithGoogleAdmin(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebaseAdmin(): Promise<void> {
  await signOut(auth);
}

export function subscribeFirebaseAuth(cb: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

const sanitizeDocId = (raw: string, prefix: string): string => {
  const cleaned = (raw || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
  return cleaned || `${prefix}_${Date.now()}`;
};

export async function syncSchoolProfileToFirestore(school: SchoolProfile): Promise<void> {
  if (!auth.currentUser) return;
  const docId = sanitizeDocId(school.code || 'gms_pamposh', 'school');
  const path = `schools/${docId}`;
  try {
    await setDoc(
      doc(db, 'schools', docId),
      {
        name: (school.name || '').slice(0, 160),
        nameUrdu: (school.nameUrdu || '').slice(0, 200),
        code: (school.code || '09240104502').slice(0, 32),
        address: (school.address || '').slice(0, 300),
        district: (school.district || 'Srinagar').slice(0, 80),
        state: (school.state || 'Jammu and Kashmir').slice(0, 80),
        pinCode: (school.pinCode || '190017').slice(0, 16),
        academicSession: (school.academicSession || '2026-2027').slice(0, 32),
        headTeacherName: (school.headTeacherName || '').slice(0, 120),
        motto: (school.motto || 'LEARN • GROW • EXCEL').slice(0, 120),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncPrincipalToFirestore(
  principal: PrincipalRecord,
  isNew: boolean
): Promise<void> {
  if (!auth.currentUser) return;
  const safeId = sanitizeDocId(principal.id, 'prin');
  const path = `principals/${safeId}`;
  try {
    const payload: Record<string, any> = {
      id: safeId,
      fullName: principal.fullName.slice(0, 120),
      designation: principal.designation,
      joiningDate: (principal.joiningDate || '').slice(0, 32),
      contactNumber: (principal.contactNumber || '').slice(0, 32),
      qualification: (principal.qualification || '').slice(0, 160),
      description: (principal.description || '').slice(0, 1000),
      isCurrent: Boolean(principal.isCurrent),
      updatedAt: serverTimestamp(),
    };
    if (principal.leavingDate) payload.leavingDate = principal.leavingDate.slice(0, 32);
    if (principal.email) payload.email = principal.email.slice(0, 120);
    if (isNew) {
      payload.createdByUid = auth.currentUser.uid;
      payload.createdAt = serverTimestamp();
    }
    await setDoc(doc(db, 'principals', safeId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deletePrincipalFromFirestore(principalId: string): Promise<void> {
  if (!auth.currentUser) return;
  const safeId = sanitizeDocId(principalId, 'prin');
  const path = `principals/${safeId}`;
  try {
    await deleteDoc(doc(db, 'principals', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncStudentsBatchToFirestore(studentsList: Student[]): Promise<number> {
  if (!auth.currentUser || studentsList.length === 0) return 0;
  const uid = auth.currentUser.uid;
  const CHUNK_SIZE = 400;
  let synced = 0;

  for (let i = 0; i < studentsList.length; i += CHUNK_SIZE) {
    const slice = studentsList.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const s of slice) {
      const safeId = sanitizeDocId(s.id, 'stu');
      const ref = doc(db, 'students', safeId);
      batch.set(
        ref,
        {
          id: safeId,
          admissionNumber: (s.admissionNumber || safeId).slice(0, 64),
          fullName: (s.fullName || 'Student').slice(0, 140),
          fatherName: (s.fatherName || '').slice(0, 140),
          motherName: (s.motherName || '').slice(0, 140),
          gender: s.gender || 'Male',
          dob: (s.dob || '').slice(0, 32),
          classNumber: (s.classNumber || '1').slice(0, 24),
          section: (s.section || 'A').slice(0, 16),
          rollNumber: Number.isInteger(s.rollNumber) ? s.rollNumber : 1,
          category: (s.category || 'General').slice(0, 40),
          religion: (s.religion || '').slice(0, 40),
          nationality: (s.nationality || 'Indian').slice(0, 60),
          address: (s.address || '').slice(0, 300),
          mobileNumber: (s.mobileNumber || '').slice(0, 32),
          previousSchool: (s.previousSchool || '').slice(0, 160),
          admissionDate: (s.admissionDate || '').slice(0, 32),
          academicSession: (s.academicSession || '2026-2027').slice(0, 32),
          status: s.status || 'Active',
          createdByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      synced++;
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'students');
    }
  }
  return synced;
}

export async function syncOcrBatchToFirestore(batchLog: OcrImportBatchHistory): Promise<void> {
  if (!auth.currentUser) return;
  const safeId = sanitizeDocId(batchLog.id, 'batch');
  const path = `ocrBatches/${safeId}`;
  try {
    await setDoc(doc(db, 'ocrBatches', safeId), {
      id: safeId,
      sourceName: (batchLog.sourceName || 'Upload').slice(0, 200),
      sourceType: batchLog.sourceType,
      totalScanned: Math.round(batchLog.totalScanned),
      importedCount: Math.round(batchLog.importedCount),
      failedCount: Math.round(batchLog.failedCount),
      duplicateCount: Math.round(batchLog.duplicateCount),
      undone: Boolean(batchLog.undone),
      actorUid: auth.currentUser.uid,
      actorName: (batchLog.actorName || auth.currentUser.displayName || 'Admin').slice(0, 120),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteStudentsBatchFromFirestore(studentIds: string[]): Promise<number> {
  if (!auth.currentUser || !auth.currentUser.emailVerified || studentIds.length === 0) return 0;
  const CHUNK_SIZE = 400;
  let deleted = 0;
  for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
    const slice = studentIds.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const id of slice) {
      const safeId = sanitizeDocId(id, 'stu');
      batch.delete(doc(db, 'students', safeId));
      deleted++;
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'students');
    }
  }
  return deleted;
}

export async function markOcrBatchUndoneInFirestore(batchId: string): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const safeId = sanitizeDocId(batchId, 'batch');
  const path = `ocrBatches/${safeId}`;
  try {
    await updateDoc(doc(db, 'ocrBatches', safeId), {
      undone: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncExcelMappingSchemaToFirestore(
  schema: ExcelMappingSchema,
  isNew: boolean
): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const safeId = sanitizeDocId(schema.id, 'schema');
  const path = `excelMappingSchemas/${safeId}`;
  const normalizedCols = schema.columns.slice(0, 60).map((col, idx) => ({
    index: Number.isInteger(col.index) ? col.index : idx,
    sourceHeader: String(col.sourceHeader || `Column ${idx + 1}`).slice(0, 120),
    targetField: String(col.targetField || '').slice(0, 64),
    defaultValue: String(col.defaultValue || '').slice(0, 160),
    required: Boolean(col.required),
  }));
  try {
    if (isNew) {
      await setDoc(doc(db, 'excelMappingSchemas', safeId), {
        id: safeId,
        name: (schema.name || 'Custom Excel Schema').slice(0, 120),
        description: (schema.description || '').slice(0, 300),
        sheetName: (schema.sheetName || 'Student_Register').slice(0, 80),
        columns: normalizedCols,
        columnsCount: normalizedCols.length,
        isDefault: Boolean(schema.isDefault),
        createdByUid: auth.currentUser.uid,
        createdByName: (schema.createdByName || auth.currentUser.displayName || 'Admin').slice(0, 120),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'excelMappingSchemas', safeId), {
        name: (schema.name || 'Custom Excel Schema').slice(0, 120),
        description: (schema.description || '').slice(0, 300),
        sheetName: (schema.sheetName || 'Student_Register').slice(0, 80),
        columns: normalizedCols,
        columnsCount: normalizedCols.length,
        isDefault: Boolean(schema.isDefault),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteExcelMappingSchemaFromFirestore(schemaId: string): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const safeId = sanitizeDocId(schemaId, 'schema');
  const path = `excelMappingSchemas/${safeId}`;
  try {
    await deleteDoc(doc(db, 'excelMappingSchemas', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncLigatureReportToFirestore(report: MissingLigatureReport): Promise<void> {
  if (!auth.currentUser) return;
  const safeId = sanitizeDocId(report.id, 'lig');
  const path = `ligatureReports/${safeId}`;
  try {
    await setDoc(doc(db, 'ligatureReports', safeId), {
      id: safeId,
      word: report.word.slice(0, 120),
      unicodeHex: report.unicodeHex.slice(0, 250),
      issueType: report.issueType,
      notes: (report.notes || '').slice(0, 400),
      reportedByUid: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchMyStudentsFromFirestore(): Promise<Student[]> {
  if (!auth.currentUser) return [];
  const path = 'students';
  try {
    const q = query(collection(db, 'students'), where('createdByUid', '==', auth.currentUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Student);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export interface FcmRegistrationResult {
  status: 'registered' | 'permission-denied' | 'unsupported' | 'sw-ready-no-vapid' | 'error';
  token?: string;
  message: string;
}

export async function registerFcmPushNotifications(
  role: 'teacher' | 'admin' | 'principal' = 'admin'
): Promise<FcmRegistrationResult> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return { status: 'unsupported', message: 'Notifications API unavailable in this browser.' };
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { status: 'permission-denied', message: 'Browser notification permission was denied.' };
    }

    let swReg: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const sw = swReg.active || swReg.waiting || swReg.installing;
      if (sw) {
        sw.postMessage({ type: 'INIT_FCM', config: firebaseConfig });
      }
    }

    const supported = await isMessagingSupported().catch(() => false);
    if (!supported) {
      return {
        status: 'sw-ready-no-vapid',
        message: 'Browser push active (FCM Service Worker initialized).',
      };
    }

    const messaging = getMessaging(app);
    const vapidKey = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY as string | undefined;

    let fcmToken = '';
    try {
      fcmToken = await getToken(messaging, {
        ...(vapidKey ? { vapidKey } : {}),
        ...(swReg ? { serviceWorkerRegistration: swReg } : {}),
      });
    } catch {
      return {
        status: 'sw-ready-no-vapid',
        message: 'FCM Service Worker ready; Web Notifications active for real-time alerts.',
      };
    }

    if (fcmToken) {
      localStorage.setItem('sm_fcm_token_v1', fcmToken);
      if (auth.currentUser && auth.currentUser.emailVerified) {
        const safeId = sanitizeDocId(`fcm_${auth.currentUser.uid}`, 'fcm');
        const path = `fcmTokens/${safeId}`;
        try {
          await setDoc(
            doc(db, 'fcmTokens', safeId),
            {
              id: safeId,
              uid: auth.currentUser.uid,
              token: fcmToken.slice(0, 512),
              role,
              platform: 'web',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
      }
      return {
        status: 'registered',
        token: fcmToken,
        message: 'Firebase Cloud Messaging (FCM) active and token synced.',
      };
    }

    return {
      status: 'sw-ready-no-vapid',
      message: 'Notification channel initialized.',
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unable to register FCM channel.',
    };
  }
}

export async function subscribeFcmForegroundMessages(
  handler: (payload: MessagePayload) => void
): Promise<() => void> {
  try {
    const supported = await isMessagingSupported().catch(() => false);
    if (!supported) return () => {};
    const messaging = getMessaging(app);
    return onMessage(messaging, handler);
  } catch {
    return () => {};
  }
}

export async function persistPushNotificationToFirestore(notif: {
  id: string;
  title: string;
  message: string;
  category: 'System' | 'Academic' | 'Attendance' | 'Inspection' | 'Leave' | 'Exam';
  targetRole?: 'teacher' | 'admin' | 'all';
  priority?: 'high' | 'normal';
}): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const safeId = sanitizeDocId(notif.id, 'notif');
  const path = `notifications/${safeId}`;
  try {
    await setDoc(doc(db, 'notifications', safeId), {
      id: safeId,
      title: (notif.title || 'School Alert').slice(0, 180),
      message: (notif.message || '').slice(0, 600),
      category: notif.category,
      targetRole: notif.targetRole || 'all',
      priority: notif.priority || 'normal',
      senderUid: auth.currentUser.uid,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeFirestoreNotifications(
  onIncoming: (items: { id: string; title: string; message: string; category: any; targetRole: any; priority: any }[]) => void
): () => void {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return () => {};
  const path = 'notifications';
  const q = query(
    collection(db, 'notifications'),
    where('targetRole', 'in', ['all', 'teacher']),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as any);
      onIncoming(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

