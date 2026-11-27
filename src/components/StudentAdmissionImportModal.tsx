import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Download,
  RotateCcw,
  Trash2,
  Loader2,
  ShieldCheck,
  History,
  UserPlus,
} from 'lucide-react';
import { SchoolProfile, Student } from '../types';
import { downloadStudentImportTemplate, exportStudentRegisterToExcel } from '../utils/excelExport';
import { guardSensitiveExport } from '../utils/biometricProtection';
import { exportBrandedSchoolPdf } from '../utils/schoolDocumentExport';

export interface ImportedStudentCandidate {
  tempId: string;
  sourceFile: string;
  sourceFormat: 'XLSX' | 'CSV' | 'PDF' | 'DOCX' | 'IMAGE';
  include: boolean;
  admissionNumber: string;
  fullName: string;
  fatherName: string;
  motherName: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other' | '';
  classNumber: string;
  section: string;
  rollNumber: string;
  academicSession: string;
  admissionDate: string;
  previousSchool: string;
  address: string;
  villageCity: string;
  district: string;
  state: string;
  pinCode: string;
  mobileNumber: string;
  parentMobile: string;
  email: string;
  category: string;
  religion: string;
  bloodGroup: string;
  aadhaarNumber: string;
  confidenceScore?: number;
  uncertainFields: string[];
}

export interface StudentImportHistoryRecord {
  id: string;
  importedAt: string;
  actorName: string;
  fileNames: string[];
  importedStudentIds: string[];
  count: number;
  rolledBack?: boolean;
}

const IMPORT_HISTORY_STORAGE_KEY = 'sm_student_admission_import_history_v1';

const TARGET_FIELD_KEYS = [
  { key: 'admissionNumber', label: 'Admission No *' },
  { key: 'fullName', label: 'Student Name *' },
  { key: 'fatherName', label: "Father's Name *" },
  { key: 'motherName', label: "Mother's Name" },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'classNumber', label: 'Class *' },
  { key: 'section', label: 'Section' },
  { key: 'rollNumber', label: 'Roll Number' },
  { key: 'academicSession', label: 'Academic Session' },
  { key: 'admissionDate', label: 'Admission Date' },
  { key: 'previousSchool', label: 'Previous School' },
  { key: 'address', label: 'Address' },
  { key: 'villageCity', label: 'Village / City' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'pinCode', label: 'PIN Code' },
  { key: 'mobileNumber', label: 'Student Mobile' },
  { key: 'parentMobile', label: 'Parent Mobile' },
  { key: 'email', label: 'Email' },
  { key: 'category', label: 'Category' },
  { key: 'religion', label: 'Religion' },
  { key: 'bloodGroup', label: 'Blood Group' },
  { key: 'aadhaarNumber', label: 'Aadhaar Number' },
] as const;

type TargetFieldKey = (typeof TARGET_FIELD_KEYS)[number]['key'];

function guessFieldForHeader(header: string): TargetFieldKey | '' {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^(adm|admission|reg|registration|srno|enrollment)/.test(h)) return 'admissionNumber';
  if (/^(studentname|fullname|pupilname|name|nameofstudent)$/.test(h)) return 'fullName';
  if (/father|guardian|parentname/.test(h)) return 'fatherName';
  if (/mother/.test(h)) return 'motherName';
  if (/dob|birth/.test(h)) return 'dob';
  if (/gender|sex/.test(h)) return 'gender';
  if (/^(class|std|grade|standard|classnumber)/.test(h)) return 'classNumber';
  if (/section|sec/.test(h)) return 'section';
  if (/roll/.test(h)) return 'rollNumber';
  if (/session|academicyear/.test(h)) return 'academicSession';
  if (/admissiondate|doa|dateofadmission/.test(h)) return 'admissionDate';
  if (/previousschool|lastschool/.test(h)) return 'previousSchool';
  if (/village|city|town|locality/.test(h)) return 'villageCity';
  if (/district|dist/.test(h)) return 'district';
  if (/^state$/.test(h)) return 'state';
  if (/pin|zip|postal/.test(h)) return 'pinCode';
  if (/address|residence/.test(h)) return 'address';
  if (/parentmobile|guardianmobile|fathermobile/.test(h)) return 'parentMobile';
  if (/mobile|phone|contact/.test(h)) return 'mobileNumber';
  if (/email|mail/.test(h)) return 'email';
  if (/category|caste/.test(h)) return 'category';
  if (/religion/.test(h)) return 'religion';
  if (/blood/.test(h)) return 'bloodGroup';
  if (/aadhar|aadhaar|uid/.test(h)) return 'aadhaarNumber';
  return '';
}

function normalizeGender(val: string): 'Male' | 'Female' | 'Other' | '' {
  const v = String(val || '').trim().toLowerCase();
  if (!v) return '';
  if (v === 'm' || v.startsWith('male') || v === 'boy') return 'Male';
  if (v === 'f' || v.startsWith('female') || v === 'girl') return 'Female';
  if (v.startsWith('other')) return 'Other';
  return '';
}

function loadImportHistory(): StudentImportHistoryRecord[] {
  try {
    const raw = localStorage.getItem(IMPORT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveImportHistory(items: StudentImportHistoryRecord[]): void {
  try {
    localStorage.setItem(IMPORT_HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, 20)));
  } catch {
    // ignore storage errors
  }
}

async function extractTextFromDocxFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) {
    throw new Error(`Could not find Word document XML inside ${file.name}.`);
  }
  const xml = await xmlFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const paragraphs = Array.from(doc.getElementsByTagNameNS('*', 'p'));
  const lines = paragraphs
    .map((p) => {
      const texts = Array.from(p.getElementsByTagNameNS('*', 't')).map((t) => t.textContent || '');
      return texts.join('').trim();
    })
    .filter(Boolean);
  return lines.join('\n');
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      resolve(res.includes(',') ? res.split(',')[1] : res);
    };
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

interface StudentAdmissionImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingStudents: Student[];
  school: SchoolProfile;
  actorName?: string;
  onCommitImportedStudents: (newStudents: Student[]) => void;
  onRollbackImportedStudentIds?: (ids: string[]) => void;
  onNotify?: (msg: string) => void;
}

export const StudentAdmissionImportModal: React.FC<StudentAdmissionImportModalProps> = ({
  isOpen,
  onClose,
  existingStudents,
  school,
  actorName = 'Administrator',
  onCommitImportedStudents,
  onRollbackImportedStudentIds,
  onNotify,
}) => {
  const [candidates, setCandidates] = useState<ImportedStudentCandidate[]>([]);
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [importHistory, setImportHistory] = useState<StudentImportHistoryRecord[]>(() =>
    loadImportHistory()
  );

  // Excel Column Mapping state for the last uploaded spreadsheet
  const [rawExcelRows, setRawExcelRows] = useState<Array<Record<string, unknown>>>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelSourceName, setExcelSourceName] = useState<string>('');
  const [columnMapping, setColumnMapping] = useState<Record<string, TargetFieldKey | ''>>({});
  const [showMapper, setShowMapper] = useState<boolean>(false);
  const [showExtendedFields, setShowExtendedFields] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const existingAdmSet = useMemo(() => {
    const set = new Set<string>();
    existingStudents.forEach((s) => {
      if (s.admissionNumber) set.add(s.admissionNumber.trim().toLowerCase());
    });
    return set;
  }, [existingStudents]);

  const existingIdentitySet = useMemo(() => {
    const set = new Set<string>();
    existingStudents.forEach((s) => {
      const key = `${(s.fullName || '').trim().toLowerCase()}|${(s.fatherName || '').trim().toLowerCase()}|${(s.dob || '').trim()}`;
      if (key.length > 4) set.add(key);
    });
    return set;
  }, [existingStudents]);

  const analyzedRows = useMemo(() => {
    const seenAdmInBatch = new Set<string>();
    return candidates.map((row) => {
      const missingMandatory: string[] = [];
      if (!row.admissionNumber.trim()) missingMandatory.push('Admission No');
      if (!row.fullName.trim()) missingMandatory.push('Student Name');
      if (!row.fatherName.trim()) missingMandatory.push("Father's Name");
      if (!row.classNumber.trim()) missingMandatory.push('Class');

      const admKey = row.admissionNumber.trim().toLowerCase();
      const identityKey = `${row.fullName.trim().toLowerCase()}|${row.fatherName.trim().toLowerCase()}|${row.dob.trim()}`;

      let duplicateReason: string | null = null;
      if (admKey && existingAdmSet.has(admKey)) {
        duplicateReason = 'Duplicate Admission No (exists in register)';
      } else if (admKey && seenAdmInBatch.has(admKey)) {
        duplicateReason = 'Duplicate Admission No (within import batch)';
      } else if (row.fullName.trim() && row.fatherName.trim() && existingIdentitySet.has(identityKey)) {
        duplicateReason = 'Possible duplicate student (same Name, Father & DOB)';
      }
      if (admKey) seenAdmInBatch.add(admKey);

      const isValid = missingMandatory.length === 0 && !duplicateReason;
      return { row, missingMandatory, duplicateReason, isValid };
    });
  }, [candidates, existingAdmSet, existingIdentitySet]);

  if (!isOpen) return null;

  const readyToImportCount = analyzedRows.filter((r) => r.row.include && r.isValid).length;
  const issueRowCount = analyzedRows.filter((r) => !r.isValid).length;

  const applyExcelMappingToCandidates = (
    rows: Array<Record<string, unknown>>,
    mapping: Record<string, TargetFieldKey | ''>,
    fileName: string,
    format: 'XLSX' | 'CSV'
  ): ImportedStudentCandidate[] => {
    return rows
      .map((raw, idx) => {
        const draft: ImportedStudentCandidate = {
          tempId: `imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          sourceFile: fileName,
          sourceFormat: format,
          include: true,
          admissionNumber: '',
          fullName: '',
          fatherName: '',
          motherName: '',
          dob: '',
          gender: '',
          classNumber: '',
          section: '',
          rollNumber: '',
          academicSession: '',
          admissionDate: '',
          previousSchool: '',
          address: '',
          villageCity: '',
          district: '',
          state: '',
          pinCode: '',
          mobileNumber: '',
          parentMobile: '',
          email: '',
          category: '',
          religion: '',
          bloodGroup: '',
          aadhaarNumber: '',
          uncertainFields: [],
        };

        Object.entries(mapping).forEach(([header, targetKey]) => {
          if (!targetKey) return;
          const rawVal = raw[header];
          if (rawVal === undefined || rawVal === null) return;
          const strVal = String(rawVal).trim();
          if (!strVal) return;
          if (targetKey === 'gender') {
            draft.gender = normalizeGender(strVal);
          } else {
            (draft as unknown as Record<string, unknown>)[targetKey] = strVal;
          }
        });

        return draft;
      })
      .filter((c) => c.fullName || c.admissionNumber || c.fatherName);
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg(null);
    setStatusMessage(null);
    setIsParsing(true);

    const files = Array.from(fileList);
    const addedNames: string[] = [];
    const extractedAll: ImportedStudentCandidate[] = [];
    const aiFilesPayload: Array<{ name: string; mimeType: string; base64Data: string }> = [];
    const docxRawTexts: string[] = [];

    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        addedNames.push(file.name);

        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: 'array' });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
          if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            const autoMap: Record<string, TargetFieldKey | ''> = {};
            headers.forEach((h) => {
              autoMap[h] = guessFieldForHeader(h);
            });
            setRawExcelRows(rows);
            setExcelHeaders(headers);
            setExcelSourceName(file.name);
            setColumnMapping(autoMap);
            setShowMapper(true);
            const mapped = applyExcelMappingToCandidates(
              rows,
              autoMap,
              file.name,
              ext === 'csv' ? 'CSV' : 'XLSX'
            );
            extractedAll.push(...mapped);
          }
        } else if (ext === 'docx') {
          const docText = await extractTextFromDocxFile(file);
          if (docText.trim()) {
            docxRawTexts.push(`--- File: ${file.name} ---\n${docText}`);
          }
        } else if (ext === 'pdf' || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'heic' || ext === 'heif') {
          const base64Data = await readFileAsBase64(file);
          const mimeType =
            ext === 'pdf'
              ? 'application/pdf'
              : ext === 'png'
              ? 'image/png'
              : ext === 'heic' || ext === 'heif'
              ? 'image/heic'
              : 'image/jpeg';
          aiFilesPayload.push({ name: file.name, mimeType, base64Data });
        } else {
          setErrorMsg(
            `Skipped unsupported file "${file.name}". Supported formats: .xlsx, .csv, .pdf, .docx, .jpg, .png, .heic.`
          );
        }
      }

      if (aiFilesPayload.length > 0 || docxRawTexts.length > 0) {
        const res = await fetch('/api/ocr/extract-students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: aiFilesPayload,
            rawText: docxRawTexts.join('\n\n'),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'AI OCR extraction failed for uploaded document(s).');
        }
        const ocrRecords = Array.isArray(data.records) ? data.records : [];
        ocrRecords.forEach((rec: Record<string, unknown>, idx: number) => {
          const sourceFormat: ImportedStudentCandidate['sourceFormat'] =
            docxRawTexts.length > 0 && aiFilesPayload.length === 0
              ? 'DOCX'
              : aiFilesPayload[0]?.mimeType === 'application/pdf'
              ? 'PDF'
              : 'IMAGE';
          extractedAll.push({
            tempId: `ocr-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            sourceFile: aiFilesPayload[0]?.name || files[0]?.name || 'Uploaded Document',
            sourceFormat,
            include: true,
            admissionNumber: String(rec.admissionNumber || '').trim(),
            fullName: String(rec.fullName || '').trim(),
            fatherName: String(rec.fatherName || '').trim(),
            motherName: String(rec.motherName || '').trim(),
            dob: String(rec.dob || '').trim(),
            gender: normalizeGender(String(rec.gender || '')),
            classNumber: String(rec.classNumber || '').trim(),
            section: String(rec.section || '').trim(),
            rollNumber: String(rec.rollNumber || '').trim(),
            academicSession: String(rec.academicSession || '').trim(),
            admissionDate: String(rec.admissionDate || '').trim(),
            previousSchool: String(rec.previousSchool || '').trim(),
            address: String(rec.address || '').trim(),
            villageCity: String(rec.villageCity || '').trim(),
            district: String(rec.district || '').trim(),
            state: String(rec.state || '').trim(),
            pinCode: String(rec.pinCode || '').trim(),
            mobileNumber: String(rec.mobileNumber || '').trim(),
            parentMobile: String(rec.parentMobile || '').trim(),
            email: String(rec.email || '').trim(),
            category: String(rec.category || '').trim(),
            religion: String(rec.religion || '').trim(),
            bloodGroup: String(rec.bloodGroup || '').trim(),
            aadhaarNumber: String(rec.aadhaarNumber || '').trim(),
            confidenceScore: typeof rec.confidenceScore === 'number' ? rec.confidenceScore : undefined,
            uncertainFields: Array.isArray(rec.uncertainFields)
              ? rec.uncertainFields.map((u) => String(u))
              : [],
          });
        });
      }

      setUploadedFileNames((prev) => Array.from(new Set([...prev, ...addedNames])));
      setCandidates((prev) => [...prev, ...extractedAll]);
      setConfirmChecked(false);
      setStatusMessage(
        `Extracted ${extractedAll.length} student record(s) from ${addedNames.length} file(s). Review, edit missing/uncertain cells, and confirm before saving.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to extract student data.');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpdateCandidateField = (tempId: string, field: TargetFieldKey, value: string) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.tempId !== tempId) return c;
        const nextUncertain = c.uncertainFields.filter((u) => u !== field);
        if (field === 'gender') {
          return { ...c, gender: normalizeGender(value), uncertainFields: nextUncertain };
        }
        return { ...c, [field]: value, uncertainFields: nextUncertain };
      })
    );
  };

  const handleReapplyColumnMapping = () => {
    if (rawExcelRows.length === 0) return;
    const remapped = applyExcelMappingToCandidates(
      rawExcelRows,
      columnMapping,
      excelSourceName,
      excelSourceName.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX'
    );
    setCandidates((prev) => [
      ...prev.filter((c) => c.sourceFile !== excelSourceName),
      ...remapped,
    ]);
    setStatusMessage(`Re-mapped ${remapped.length} row(s) from ${excelSourceName} using updated column mapping.`);
  };

  const handleDownloadErrorReportCsv = () => {
    const problemRows = analyzedRows.filter((r) => !r.isValid || r.row.uncertainFields.length > 0);
    if (problemRows.length === 0) return;
    const headers = ['Source File', 'Admission No', 'Student Name', 'Father Name', 'Class', 'Missing Mandatory Fields', 'Duplicate Warning', 'Uncertain OCR Fields'];
    const csvLines = [
      headers.join(','),
      ...problemRows.map(({ row, missingMandatory, duplicateReason }) =>
        [
          row.sourceFile,
          row.admissionNumber,
          row.fullName,
          row.fatherName,
          row.classNumber,
          missingMandatory.join('; '),
          duplicateReason || '',
          row.uncertainFields.join('; '),
        ]
          .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Student_Import_Validation_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  };

  const handleConfirmImport = () => {
    const approvedRows = analyzedRows.filter((r) => r.row.include && r.isValid);
    if (approvedRows.length === 0) {
      setErrorMsg('No valid, non-duplicate student records are selected for import.');
      return;
    }

    const nowIso = new Date().toISOString();
    const newStudents: Student[] = approvedRows.map(({ row }, idx) => {
      const addressParts = [row.address, row.villageCity, row.district, row.state, row.pinCode]
        .map((p) => p.trim())
        .filter(Boolean);
      const id = `STU-IMP-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
      const phone = row.parentMobile.trim() || row.mobileNumber.trim();
      const rawAadhaarDigits = row.aadhaarNumber.replace(/\D/g, '');
      const maskedAadhaar =
        rawAadhaarDigits.length >= 4
          ? `XXXX-XXXX-${rawAadhaarDigits.slice(-4)}`
          : undefined;
      return {
        id,
        admissionNumber: row.admissionNumber.trim(),
        fullName: row.fullName.trim(),
        fatherName: row.fatherName.trim(),
        motherName: row.motherName.trim(),
        dob: row.dob.trim(),
        gender: (row.gender || 'Other') as Student['gender'],
        classNumber: row.classNumber.trim(),
        section: row.section.trim() || 'A',
        rollNumber: Number(row.rollNumber) || existingStudents.length + idx + 1,
        academicSession: row.academicSession.trim() || school.academicSession,
        admissionDate: row.admissionDate.trim() || nowIso.slice(0, 10),
        previousSchool: row.previousSchool.trim() || undefined,
        address: addressParts.join(', '),
        villageTown: row.villageCity.trim() || school.villageTown || '',
        blockTehsil: school.blockTehsil || '',
        district: row.district.trim() || school.district || '',
        state: row.state.trim() || school.state || '',
        pinCode: row.pinCode.trim() || school.pinCode || '',
        mobileNumber: phone,
        parentWhatsAppNumber: phone,
        guardianName: row.fatherName.trim(),
        category: row.category.trim() || 'General',
        religion: row.religion.trim() || undefined,
        aadhaarStatus: maskedAadhaar ? 'Verified' : 'Pending',
        maskedAadhaar,
        status: 'Active',
      };
    });

    onCommitImportedStudents(newStudents);

    const historyEntry: StudentImportHistoryRecord = {
      id: `imphist-${Date.now()}`,
      importedAt: nowIso,
      actorName,
      fileNames: uploadedFileNames.length > 0 ? uploadedFileNames : ['Manual Import'],
      importedStudentIds: newStudents.map((s) => s.id),
      count: newStudents.length,
    };
    const nextHistory = [historyEntry, ...importHistory];
    setImportHistory(nextHistory);
    saveImportHistory(nextHistory);

    setStatusMessage(`Successfully imported ${newStudents.length} verified student record(s) into the Admission Register.`);
    setCandidates([]);
    setUploadedFileNames([]);
    setConfirmChecked(false);
    setShowMapper(false);
    onNotify?.(`Imported ${newStudents.length} verified student record(s) into Student Admission Register.`);
  };

  const handleRollbackBatch = (entry: StudentImportHistoryRecord) => {
    if (!onRollbackImportedStudentIds || entry.rolledBack) return;
    onRollbackImportedStudentIds(entry.importedStudentIds);
    const updated = importHistory.map((h) =>
      h.id === entry.id ? { ...h, rolledBack: true } : h
    );
    setImportHistory(updated);
    saveImportHistory(updated);
    setStatusMessage(`Rolled back import batch of ${entry.count} student(s) from ${new Date(entry.importedAt).toLocaleString()}.`);
    onNotify?.(`Rolled back ${entry.count} imported student record(s).`);
  };

  const handleExportRegisterExcel = async () => {
    const allowed = await guardSensitiveExport('Student Admission Register Excel (.xlsx)');
    if (!allowed) return;
    exportStudentRegisterToExcel(existingStudents, school);
  };

  const handleExportRegisterPdf = async () => {
    const rowsText = existingStudents
      .slice(0, 200)
      .map(
        (s, idx) =>
          `${idx + 1}. Adm#: ${s.admissionNumber || '-'} | ${s.fullName} | Father: ${s.fatherName || '-'} | Class: ${s.classNumber}-${s.section || 'A'} | Roll: ${s.rollNumber || '-'} | DOB: ${s.dob || '-'} | Phone: ${s.mobileNumber || '-'}`
      )
      .join('\n');
    const { exported } = await exportBrandedSchoolPdf({
      school,
      documentType: 'STUDENT ADMISSION REGISTER',
      title: `Verified Admission Register (${existingStudents.length} Students)`,
      teacherName: actorName,
      date: new Date().toISOString().slice(0, 10),
      sections: [
        {
          heading: `Active Student Records (Session ${school.academicSession})`,
          body: rowsText || 'No student records registered yet.',
        },
      ],
      filenameBase: `Student_Admission_Register_${school.code || 'School'}`,
    });
    if (exported) {
      onNotify?.('Exported branded Student Admission Register PDF.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import Student Data into Admission Register"
      data-testid="student-admission-import-modal"
      className="fixed inset-0 z-[90] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">
                Import Student Data — Automatic Admission Register Extraction
              </h2>
              <p className="text-[11px] text-slate-300">
                Bulk upload Excel (.xlsx), CSV (.csv), Word (.docx), PDF (.pdf), or Scanned Images (JPG/PNG) with duplicate detection &amp; human verification.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistory((p) => !p)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200"
            >
              <History className="w-3.5 h-3.5" />
              <span>Import History ({importHistory.length})</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Import Student Data modal"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Quick Action Bar: Upload Files, Sample Template, Export Register */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.pdf,.docx,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => void handleFilesSelected(e.target.files)}
              />
              <button
                type="button"
                disabled={isParsing}
                data-testid="student-import-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition-colors disabled:opacity-60"
              >
                {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>{isParsing ? 'Extracting Student Records...' : 'Select Files (Excel, CSV, PDF, DOCX, Images)'}</span>
              </button>

              <button
                type="button"
                onClick={downloadStudentImportTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Download Sample Template</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExportRegisterExcel()}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600" />
                <span>Export Register (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExportRegisterPdf()}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-amber-300" />
                <span>Export Register (PDF)</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200">
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" /> XLSX / CSV
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200">
                <FileText className="w-3 h-3 text-blue-600" /> PDF / DOCX
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200">
                <ImageIcon className="w-3 h-3 text-indigo-600" /> Image OCR
              </span>
            </div>
          </div>

          {/* Feedback Notices */}
          {statusMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Import History & Rollback Drawer */}
          {showHistory && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  Recent Admission Import History &amp; Rollback
                </h3>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Hide
                </button>
              </div>
              {importHistory.length === 0 ? (
                <p className="text-xs text-slate-500">No previous import batches recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {importHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-900">
                          {item.count} student(s) imported by {item.actorName}{' '}
                          {item.rolledBack && (
                            <span className="ml-1 text-[10px] font-extrabold text-rose-600 uppercase">
                              [Rolled Back]
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(item.importedAt).toLocaleString()} · Files: {item.fileNames.join(', ')}
                        </p>
                      </div>
                      {!item.rolledBack && onRollbackImportedStudentIds && (
                        <button
                          type="button"
                          onClick={() => handleRollbackBatch(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Undo / Rollback</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Excel Column Mapper */}
          {showMapper && excelHeaders.length > 0 && (
            <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold text-indigo-950">
                    Excel / CSV Column Mapping ({excelSourceName})
                  </h3>
                  <p className="text-[11px] text-indigo-700">
                    Verify how spreadsheet columns map to Student Admission Register fields.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReapplyColumnMapping}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                  >
                    Apply Mapping
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMapper(false)}
                    className="text-xs font-semibold text-indigo-700 hover:underline"
                  >
                    Hide Mapper
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {excelHeaders.map((header) => (
                  <div key={header} className="bg-white p-2 rounded-xl border border-indigo-100 space-y-1">
                    <label className="block text-[10px] font-bold text-slate-600 truncate" title={header}>
                      {header}
                    </label>
                    <select
                      value={columnMapping[header] || ''}
                      onChange={(e) =>
                        setColumnMapping((prev) => ({
                          ...prev,
                          [header]: e.target.value as TargetFieldKey | '',
                        }))
                      }
                      className="w-full px-2 py-1 rounded-lg border border-slate-300 text-[11px] font-semibold bg-slate-50"
                    >
                      <option value="">— Ignore Column —</option>
                      {TARGET_FIELD_KEYS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extracted Preview Table */}
          {candidates.length === 0 ? (
            <div className="py-12 px-6 text-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 space-y-2">
              <Upload className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-extrabold text-slate-900">
                Upload One or Multiple Student Admission Files to Begin
              </h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                Missing fields are never invented automatically. Extracted data is shown below for inline editing, duplicate detection, and explicit verification before saving to the Student Admission Register.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                  <span className="text-slate-900">
                    Preview Queue: {candidates.length} row(s)
                  </span>
                  <span className="text-emerald-700">
                    Ready to Import: {readyToImportCount}
                  </span>
                  {issueRowCount > 0 && (
                    <span className="text-rose-600">
                      Needs Review / Duplicate: {issueRowCount}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowExtendedFields((prev) => !prev)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                      showExtendedFields
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                  >
                    <span>{showExtendedFields ? 'Hide Extended Fields' : 'Show All 24 Admission Fields'}</span>
                  </button>
                  {issueRowCount > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadErrorReportCsv}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Error Report (.csv)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setCandidates([]);
                      setUploadedFileNames([]);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Queue</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-[11px]">
                      <th className="p-2.5 font-bold">Use</th>
                      <th className="p-2.5 font-bold">Status / Alerts</th>
                      <th className="p-2.5 font-bold">Admission No *</th>
                      <th className="p-2.5 font-bold">Student Name *</th>
                      <th className="p-2.5 font-bold">Father&apos;s Name *</th>
                      <th className="p-2.5 font-bold">Mother&apos;s Name</th>
                      <th className="p-2.5 font-bold">DOB</th>
                      <th className="p-2.5 font-bold">Gender</th>
                      <th className="p-2.5 font-bold">Class *</th>
                      <th className="p-2.5 font-bold">Sec</th>
                      <th className="p-2.5 font-bold">Roll</th>
                      <th className="p-2.5 font-bold">Parent Mobile</th>
                      <th className="p-2.5 font-bold">Address</th>
                      {showExtendedFields && (
                        <>
                          <th className="p-2.5 font-bold">Session</th>
                          <th className="p-2.5 font-bold">Adm Date</th>
                          <th className="p-2.5 font-bold">Prev School</th>
                          <th className="p-2.5 font-bold">Village/City</th>
                          <th className="p-2.5 font-bold">District</th>
                          <th className="p-2.5 font-bold">PIN</th>
                          <th className="p-2.5 font-bold">Email</th>
                          <th className="p-2.5 font-bold">Category</th>
                          <th className="p-2.5 font-bold">Religion</th>
                          <th className="p-2.5 font-bold">Blood Group</th>
                          <th className="p-2.5 font-bold">Aadhaar (Masked on Save)</th>
                        </>
                      )}
                      <th className="p-2.5 font-bold">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analyzedRows.map(({ row, missingMandatory, duplicateReason, isValid }) => (
                      <tr
                        key={row.tempId}
                        className={
                          duplicateReason
                            ? 'bg-rose-50/70'
                            : missingMandatory.length > 0
                            ? 'bg-amber-50/70'
                            : 'bg-white'
                        }
                      >
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) =>
                              setCandidates((prev) =>
                                prev.map((c) =>
                                  c.tempId === row.tempId ? { ...c, include: e.target.checked } : c
                                )
                              )
                            }
                          />
                        </td>
                        <td className="p-2 min-w-[165px]">
                          {isValid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Verified ({row.sourceFormat})
                            </span>
                          ) : (
                            <div className="space-y-0.5 text-[10px] font-bold">
                              {duplicateReason && (
                                <p className="text-rose-700 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  {duplicateReason}
                                </p>
                              )}
                              {missingMandatory.length > 0 && (
                                <p className="text-amber-800 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  Missing: {missingMandatory.join(', ')}
                                </p>
                              )}
                            </div>
                          )}
                          {row.uncertainFields.length > 0 && (
                            <p className="text-[10px] text-indigo-700 mt-0.5">
                              Verify OCR: {row.uncertainFields.join(', ')}
                            </p>
                          )}
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.admissionNumber}
                            onChange={(e) =>
                              handleUpdateCandidateField(row.tempId, 'admissionNumber', e.target.value)
                            }
                            className={`w-28 px-2 py-1 rounded border text-xs font-mono ${
                              !row.admissionNumber.trim() || duplicateReason
                                ? 'border-rose-400 bg-rose-50'
                                : 'border-slate-300'
                            }`}
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.fullName}
                            onChange={(e) =>
                              handleUpdateCandidateField(row.tempId, 'fullName', e.target.value)
                            }
                            className={`w-36 px-2 py-1 rounded border text-xs ${
                              !row.fullName.trim() ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                            }`}
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.fatherName}
                            onChange={(e) =>
                              handleUpdateCandidateField(row.tempId, 'fatherName', e.target.value)
                            }
                            className={`w-36 px-2 py-1 rounded border text-xs ${
                              !row.fatherName.trim() ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                            }`}
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.motherName}
                            onChange={(e) =>
                              handleUpdateCandidateField(row.tempId, 'motherName', e.target.value)
                            }
                            className="w-32 px-2 py-1 rounded border border-slate-300 text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.dob}
                            placeholder="YYYY-MM-DD"
                            onChange={(e) => handleUpdateCandidateField(row.tempId, 'dob', e.target.value)}
                            className="w-28 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                          />
                        </td>
                        <td className="p-1.5">
                          <select
                            value={row.gender}
                            onChange={(e) =>
                              handleUpdateCandidateField(row.tempId, 'gender', e.target.value)
                            }
                            className="px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                          >
                            <option value="">—</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </select>
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.classNumber}
                            onChange={(e) =>
                              handleUpdateCandidateField(row.tempId, 'classNumber', e.target.value)
                            }
                            className={`w-16 px-2 py-1 rounded border text-xs ${
                              !row.classNumber.trim() ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                            }`}
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.section}
                            placeholder="A"
                            onChange={(e) =>
                              handleUpdateCandidateField(row.tempId, 'section', e.target.value)
                            }
                            className="w-12 px-2 py-1 rounded border border-slate-300 text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.rollNumber}
                            onChange={(e) =>
                              handleUpdateCandidateField(row.tempId, 'rollNumber', e.target.value)
                            }
                            className="w-14 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.parentMobile || row.mobileNumber}
                            onChange={(e) =>
                              handleUpdateCandidateField(row.tempId, 'parentMobile', e.target.value)
                            }
                            className="w-28 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={row.address}
                            onChange={(e) =>
                              handleUpdateCandidateField(row.tempId, 'address', e.target.value)
                            }
                            className="w-40 px-2 py-1 rounded border border-slate-300 text-xs"
                          />
                        </td>
                        {showExtendedFields && (
                          <>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.academicSession}
                                placeholder={school.academicSession}
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'academicSession', e.target.value)}
                                className="w-24 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.admissionDate}
                                placeholder="YYYY-MM-DD"
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'admissionDate', e.target.value)}
                                className="w-28 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.previousSchool}
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'previousSchool', e.target.value)}
                                className="w-32 px-2 py-1 rounded border border-slate-300 text-xs"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.villageCity}
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'villageCity', e.target.value)}
                                className="w-28 px-2 py-1 rounded border border-slate-300 text-xs"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.district}
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'district', e.target.value)}
                                className="w-24 px-2 py-1 rounded border border-slate-300 text-xs"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.pinCode}
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'pinCode', e.target.value)}
                                className="w-20 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="email"
                                value={row.email}
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'email', e.target.value)}
                                className="w-36 px-2 py-1 rounded border border-slate-300 text-xs"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.category}
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'category', e.target.value)}
                                className="w-20 px-2 py-1 rounded border border-slate-300 text-xs"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.religion}
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'religion', e.target.value)}
                                className="w-24 px-2 py-1 rounded border border-slate-300 text-xs"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.bloodGroup}
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'bloodGroup', e.target.value)}
                                className="w-16 px-2 py-1 rounded border border-slate-300 text-xs"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.aadhaarNumber}
                                placeholder="Last 4 kept"
                                onChange={(e) => handleUpdateCandidateField(row.tempId, 'aadhaarNumber', e.target.value)}
                                className="w-32 px-2 py-1 rounded border border-slate-300 text-xs font-mono"
                              />
                            </td>
                          </>
                        )}
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setCandidates((prev) => prev.filter((c) => c.tempId !== row.tempId))
                            }
                            aria-label="Remove row"
                            className="p-1 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Explicit Human Confirmation */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              disabled={readyToImportCount === 0}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                I have reviewed extracted student details, resolved uncertain OCR fields, and authorize saving {readyToImportCount} verified record(s).
              </span>
            </span>
          </label>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!confirmChecked || readyToImportCount === 0}
              data-testid="confirm-student-import-btn"
              onClick={handleConfirmImport}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm &amp; Save ({readyToImportCount}) Students</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
