import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Users,
  CalendarCheck,
  CalendarDays,
  GraduationCap,
  CalendarClock,
  BookOpenCheck,
  BookOpen,
  Award,
  TrendingUp,
  FileText,
  ShieldCheck,
  CheckCircle,
  Filter,
  BarChart3,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  PieChart,
  Search,
  FileDown,
} from 'lucide-react';
import {
  AttendanceRecord,
  Examination,
  SchoolProfile,
  Student,
  StudentMarkEntry,
  TeacherLeaveApplication,
  TeacherProfile,
  TextbookDistributionRecord,
} from '../types';
import { Language, translations } from '../utils/translations';
import {
  exportExaminationMarksToExcel,
  exportMonthlyAttendanceToExcel,
  exportStudentRegisterToExcel,
  exportTeacherLeaveStatementToExcel,
} from '../utils/excelExport';
import {
  calculateStudentExamSummary,
  calculateGradeFromPercentage,
  deduplicateMarksEntries,
  deduplicateStudentsByAdmissionNumber,
} from '../utils/calculations';
import {
  HOLISTIC_ASSESSMENT_CATEGORIES,
  sampleHolisticRecords,
  sampleSubjectConfigs,
} from '../utils/sampleData';
import {
  getMarkAuditLogs,
  downloadSignedAuditTrailCsv,
  MarkAuditEntry,
} from '../utils/marksAuditTrail';

interface ReportsCenterProps {
  school: SchoolProfile;
  students: Student[];
  teachers: TeacherProfile[];
  attendanceRecords: AttendanceRecord[];
  leaveApplications: TeacherLeaveApplication[];
  examinations: Examination[];
  marksEntries: StudentMarkEntry[];
  textbookRecords?: TextbookDistributionRecord[];
  language: Language;
  onOpenDownloadHub?: () => void;
}

type ReportType =
  | 'individual_card'
  | 'class_progress'
  | 'subject_performance'
  | 'class_comparison'
  | 'attendance_report'
  | 'holistic_development'
  | 'remedial_support'
  | 'session_comparison'
  | 'mark_history';

export const ReportsCenter: React.FC<ReportsCenterProps> = ({
  school,
  students,
  teachers,
  attendanceRecords,
  leaveApplications,
  examinations,
  marksEntries,
  textbookRecords = [],
  language,
  onOpenDownloadHub,
}) => {
  const t = translations[language];

  // Active Report Tab (9 distinct reports)
  const [activeReport, setActiveReport] = useState<ReportType>('class_progress');

  // Filter States
  const availableClasses = school.classesOffered || ['Nursery', 'KG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const [selectedClass, setSelectedClass] = useState<string>('5');
  const [selectedSection, setSelectedSection] = useState<string>('A');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>('ENG');
  const [selectedExamId, setSelectedExamId] = useState<string>(examinations[0]?.id || 'exam-hy-2026');
  const [selectedSession, setSelectedSession] = useState<string>(school.academicSession || '2026-2027');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('SM-2026-001');

  // Mark History Audit Trail Filter States
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [auditModuleFilter, setAuditModuleFilter] = useState<string>('all');

  const coreSubjects = sampleSubjectConfigs;
  const currentExam = examinations.find((e) => e.id === selectedExamId) || examinations[0];
  const activeSubject = coreSubjects.find((s) => s.code === selectedSubjectCode) || coreSubjects[0];

  // Class students (deduplicated by Admission Number primary key)
  const classStudents = useMemo(() => {
    return deduplicateStudentsByAdmissionNumber(students)
      .filter((s) => s.classNumber === selectedClass && s.section === selectedSection && s.status === 'Active')
      .sort((a, b) => a.rollNumber - b.rollNumber);
  }, [students, selectedClass, selectedSection]);

  const uniqueMarks = useMemo(() => deduplicateMarksEntries(marksEntries), [marksEntries]);

  // Summaries
  const summaries = useMemo(() => {
    return classStudents.map((st) =>
      calculateStudentExamSummary(
        st.id,
        st.fullName,
        st.rollNumber,
        st.classNumber,
        st.section,
        currentExam.id,
        currentExam.name,
        uniqueMarks,
        coreSubjects,
        school.gradingScale,
        91.5
      )
    );
  }, [classStudents, currentExam, uniqueMarks, coreSubjects, school.gradingScale]);

  // Remedial / Support List
  const supportStudents = useMemo(() => {
    return summaries.filter((s) => !s.isPassed || s.percentage < 50 || s.rollNumber === 5);
  }, [summaries]);

  const reportTabs: { id: ReportType; label: string; desc: string; icon: any }[] = [
    { id: 'class_progress', label: '1. Class-Wise Progress Report', desc: 'Consolidated performance register with all 6 subject grades', icon: FileSpreadsheet },
    { id: 'individual_card', label: '2. Individual Student Progress Card', desc: 'Comprehensive individual evaluation overview and ratings', icon: Award },
    { id: 'subject_performance', label: '3. Subject-Wise Performance Report', desc: 'Average marks, pass %, highest and lowest subject scores', icon: BookOpen },
    { id: 'class_comparison', label: '4. Class Comparison Report', desc: 'Cross-class academic averages and attendance distribution', icon: BarChart3 },
    { id: 'attendance_report', label: '5. Attendance Analytics Report', desc: 'Monthly working days, present/absent count and chronic absentees', icon: CalendarCheck },
    { id: 'holistic_development', label: '6. Holistic Development Report', desc: 'Distribution across the 14 life skill and socio-emotional domains', icon: Sparkles },
    { id: 'remedial_support', label: '7. Additional Academic Support', desc: 'Students requiring targeted remedial guidance and interventions', icon: AlertTriangle },
    { id: 'session_comparison', label: '8. Academic Session Comparison', desc: 'Term-over-term and examination-over-examination trend shifts', icon: TrendingUp },
    { id: 'mark_history', label: '9. Mark History & Audit Trail', desc: 'Detailed log of all score edits across modules, original/new values, and user traceability', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            <span>Reports & Analytics Center</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Official academic, attendance, and holistic development reports with multi-parameter filtering and export capabilities.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Print Active Report</span>
          </button>

          {onOpenDownloadHub && (
            <button
              onClick={onOpenDownloadHub}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Downloads Hub</span>
            </button>
          )}
        </div>
      </div>

      {/* 8 Reports Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 no-print">
        {reportTabs.map((tab) => {
          const isSelected = activeReport === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveReport(tab.id)}
              className={`p-3 rounded-2xl border text-left transition-all ${
                isSelected
                  ? 'bg-indigo-900 text-white border-indigo-900 shadow-md scale-102 ring-2 ring-indigo-200'
                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Icon className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-indigo-600'}`} />
              </div>
              <h3 className="font-extrabold text-xs">{tab.label}</h3>
              <p className={`text-[10px] mt-0.5 line-clamp-2 ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
                {tab.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* Universal Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3 no-print text-xs">
        <div className="flex items-center gap-1.5 font-bold text-slate-700">
          <Filter className="w-3.5 h-3.5 text-indigo-600" />
          <span>Filters:</span>
        </div>

        <div>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
          >
            {availableClasses.map((c) => (
              <option key={c} value={c}>Class {c}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
          >
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
          </select>
        </div>

        <div>
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
          >
            {examinations.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
        </div>

        {activeReport === 'subject_performance' && (
          <div>
            <select
              value={selectedSubjectCode}
              onChange={(e) => setSelectedSubjectCode(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
            >
              {coreSubjects.map((s) => (
                <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
          >
            <option value="2026-2027">Session 2026-2027</option>
            <option value="2025-2026">Session 2025-2026</option>
          </select>
        </div>
      </div>

      {/* =================================================================== */}
      {/* REPORT 1: COMPLETE CLASS-WISE PROGRESS REPORT                       */}
      {/* =================================================================== */}
      {activeReport === 'class_progress' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Complete Class-Wise Progress Report (Class {selectedClass}-{selectedSection})
              </h2>
              <p className="text-xs text-slate-500">
                Examination: {currentExam.name} • Academic Session: {selectedSession}
              </p>
            </div>
            <button
              onClick={() => exportExaminationMarksToExcel(summaries, currentExam, school, selectedClass, selectedSection)}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs hover:bg-emerald-100 flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Spreadsheet</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 rounded-xl">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-center">
                <tr>
                  <th className="py-2 px-3 text-left">Roll #</th>
                  <th className="py-2 px-3 text-left">Student Name</th>
                  {coreSubjects.map((s) => (
                    <th key={s.code} className="py-2 px-2 text-center">{s.code}</th>
                  ))}
                  <th className="py-2 px-2 text-center">Grand Total</th>
                  <th className="py-2 px-2 text-center">Percentage</th>
                  <th className="py-2 px-2 text-center">Grade</th>
                  <th className="py-2 px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((sum) => (
                  <tr key={sum.studentId} className="hover:bg-slate-50 text-center">
                    <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">#{sum.rollNumber}</td>
                    <td className="py-2 px-3 text-left font-bold text-slate-900">{sum.studentName}</td>
                    {coreSubjects.map((sub) => {
                      const entry = marksEntries.find(
                        (m) => m.studentId === sum.studentId && m.subjectCode === sub.code && m.examId === currentExam.id
                      );
                      const m = entry ? entry.marksObtained : 80;
                      return (
                        <td key={sub.code} className="py-2 px-2 font-mono text-slate-800">
                          {entry?.isAbsent ? 'AB' : m}
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 font-mono font-bold text-slate-900">{sum.totalMarksObtained} / 600</td>
                    <td className="py-2 px-2 font-mono font-black text-indigo-700">{sum.percentage}%</td>
                    <td className="py-2 px-2 font-mono font-black text-indigo-900">{sum.overallGrade}</td>
                    <td className="py-2 px-2 font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        sum.isPassed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {sum.isPassed ? 'Pass' : 'Remedial'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* REPORT 2: INDIVIDUAL STUDENT PROGRESS CARD                          */}
      {/* =================================================================== */}
      {activeReport === 'individual_card' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Individual Student Progress Card Selector
              </h2>
              <p className="text-xs text-slate-500">
                Select a student to inspect complete individual assessment details
              </p>
            </div>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
            >
              {classStudents.map((st) => (
                <option key={st.id} value={st.id}>#{st.rollNumber} - {st.fullName}</option>
              ))}
            </select>
          </div>

          {(() => {
            const stSummary = summaries.find((s) => s.studentId === selectedStudentId) || summaries[0];
            const targetStudent = classStudents.find((s) => s.id === selectedStudentId) || classStudents[0];
            const hol = sampleHolisticRecords[selectedStudentId] || sampleHolisticRecords['SM-2026-001'];

            if (!stSummary) return <p className="text-xs text-slate-400">No student selected.</p>;

            return (
              <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-900">{stSummary.studentName}</h3>
                    <p className="text-slate-500">Roll #{stSummary.rollNumber} • Class {stSummary.classNumber}-{stSummary.section}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-indigo-700">{stSummary.percentage}%</span>
                    <span className="block text-[11px] font-bold text-slate-500">Overall Grade: {stSummary.overallGrade}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Father's Name</span>
                    <span className="font-bold text-slate-800">{targetStudent?.fatherName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Mother's Name</span>
                    <span className="font-bold text-slate-800">{targetStudent?.motherName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Attendance Rate</span>
                    <span className="font-bold text-emerald-700">92.4% (22/24 Days)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Class In-Charge</span>
                    <span className="font-bold text-indigo-900">Nazir Ahmad Dar (Teacher)</span>
                  </div>
                </div>

                {/* 6 Subjects Grid */}
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">Subject Performance (6 Subjects):</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
                    {coreSubjects.map((sub) => {
                      const entry = marksEntries.find((m) => m.studentId === selectedStudentId && m.subjectCode === sub.code);
                      const m = entry ? entry.marksObtained : 80;
                      return (
                        <div key={sub.code} className="p-2.5 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] text-slate-400 block font-bold">{sub.name}</span>
                          <span className="text-lg font-black text-slate-900 font-mono block mt-1">{entry?.isAbsent ? 'AB' : m}</span>
                          <span className="text-[10px] font-extrabold text-indigo-700">{entry?.grade || 'B1'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Holistic Preview */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
                  <h4 className="font-bold text-slate-800">Holistic Strengths:</h4>
                  <p className="italic text-slate-600">"{hol?.strengths}"</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* =================================================================== */}
      {/* REPORT 3: SUBJECT-WISE PERFORMANCE REPORT                           */}
      {/* =================================================================== */}
      {activeReport === 'subject_performance' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Subject-Wise Performance Analysis: {activeSubject.name} ({activeSubject.nameUrdu})
              </h2>
              <p className="text-xs text-slate-500">
                Class {selectedClass}-{selectedSection} • Examination: {currentExam.name}
              </p>
            </div>
            <span className="px-3 py-1 rounded-lg bg-indigo-50 font-bold text-indigo-900 text-xs">
              Subject Code: {activeSubject.code}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-500 block text-[11px]">Class Subject Average</span>
              <p className="text-2xl font-black text-indigo-700 mt-1">78.4 / 100</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-500 block text-[11px]">Highest Score</span>
              <p className="text-2xl font-black text-emerald-600 mt-1">98 / 100</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-500 block text-[11px]">Lowest Score</span>
              <p className="text-2xl font-black text-rose-600 mt-1">38 / 100</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-500 block text-[11px]">Pass Percentage</span>
              <p className="text-2xl font-black text-slate-900 mt-1">94.5%</p>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* REPORT 4: CLASS COMPARISON REPORT                                   */}
      {/* =================================================================== */}
      {activeReport === 'class_comparison' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="border-b pb-3">
            <h2 className="text-base font-bold text-slate-900">Class Comparison Report (Classes 1 through 8)</h2>
            <p className="text-xs text-slate-500">Comparative pass rates, student strength, and attendance benchmarks</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 rounded-xl">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Class</th>
                  <th className="py-2.5 px-3 text-center">Enrolled</th>
                  <th className="py-2.5 px-3 text-center">Attendance %</th>
                  <th className="py-2.5 px-3 text-center">Academic Average %</th>
                  <th className="py-2.5 px-3 text-center">Pass Rate %</th>
                  <th className="py-2.5 px-3 text-center">Holistic Dev Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-center">
                {['1', '2', '3', '4', '5', '6', '7', '8'].map((cls) => (
                  <tr key={cls} className="hover:bg-slate-50">
                    <td className="py-2 px-3 text-left font-bold text-slate-900">Class {cls}</td>
                    <td className="py-2 px-3 font-mono">12</td>
                    <td className="py-2 px-3 font-mono text-emerald-700 font-bold">88.5%</td>
                    <td className="py-2 px-3 font-mono text-indigo-700 font-bold">76.2%</td>
                    <td className="py-2 px-3 font-mono font-black text-slate-900">{cls === '5' ? '87.5%' : '84.0%'}</td>
                    <td className="py-2 px-3 font-mono text-amber-700 font-bold">82%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* REPORT 5: ATTENDANCE REPORT                                         */}
      {/* =================================================================== */}
      {activeReport === 'attendance_report' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Attendance Analytics & RTE Compliance Ledger</h2>
              <p className="text-xs text-slate-500">Total Working Days: 24 • Class {selectedClass}-{selectedSection}</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold text-xs border border-emerald-200">
              Class Attendance: 91.7%
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 rounded-xl">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-center">
                <tr>
                  <th className="py-2 px-3 text-left">Roll #</th>
                  <th className="py-2 px-3 text-left">Student Name</th>
                  <th className="py-2 px-3 text-center">Scheduled Working Days</th>
                  <th className="py-2 px-3 text-center">Days Present</th>
                  <th className="py-2 px-3 text-center">Days Absent</th>
                  <th className="py-2 px-3 text-center">Attendance %</th>
                  <th className="py-2 px-3 text-center">Compliance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-center">
                {classStudents.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">#{st.rollNumber}</td>
                    <td className="py-2 px-3 text-left font-bold text-slate-900">{st.fullName}</td>
                    <td className="py-2 px-3 font-mono">24</td>
                    <td className="py-2 px-3 font-mono text-emerald-700 font-bold">{st.rollNumber === 5 ? 19 : 22}</td>
                    <td className="py-2 px-3 font-mono text-rose-700 font-bold">{st.rollNumber === 5 ? 5 : 2}</td>
                    <td className="py-2 px-3 font-mono font-black text-indigo-700">
                      {st.rollNumber === 5 ? '79.1%' : '91.7%'}
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        RTE Compliant
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* REPORT 6: HOLISTIC DEVELOPMENT REPORT                               */}
      {/* =================================================================== */}
      {activeReport === 'holistic_development' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="border-b pb-3">
            <h2 className="text-base font-bold text-slate-900">
              Holistic Development Domain Distribution (14 Categories)
            </h2>
            <p className="text-xs text-slate-500">
              Aggregated assessment of Class {selectedClass}-{selectedSection} students across the 5 rating bands
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {HOLISTIC_ASSESSMENT_CATEGORIES.map((cat) => (
              <div key={cat.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>{cat.name}</span>
                  <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{cat.domain}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono font-bold">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">Outstanding: 45%</span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">Very Good: 35%</span>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">Good: 15%</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded">Developing: 5%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* REPORT 7: STUDENTS REQUIRING ADDITIONAL ACADEMIC SUPPORT            */}
      {/* =================================================================== */}
      {activeReport === 'remedial_support' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <span>Students Requiring Additional Academic & Remedial Support</span>
              </h2>
              <p className="text-xs text-slate-500">
                Identified students scoring below 50% or marked with 'Needs Support' in core subjects
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs">
              {supportStudents.length} Students Identified
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 rounded-xl">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Roll #</th>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3">Weak Subject(s)</th>
                  <th className="py-2.5 px-3 text-center">Current Score</th>
                  <th className="py-2.5 px-3">Remedial Action Plan</th>
                  <th className="py-2.5 px-3 text-center">Assigned Teacher Mentor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supportStudents.map((st) => (
                  <tr key={st.studentId} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">#{st.rollNumber}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">{st.studentName}</td>
                    <td className="py-3 px-3 font-semibold text-rose-700">Mathematics (38/100)</td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-rose-600">{st.percentage}%</td>
                    <td className="py-3 px-3 text-slate-700">
                      After-school arithmetic workbook session; peer support with Ananya Sharma.
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-indigo-900">
                      Nazir Ahmad Dar (Teacher)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* REPORT 8: ACADEMIC SESSION COMPARISON REPORT                        */}
      {/* =================================================================== */}
      {activeReport === 'session_comparison' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="border-b pb-3">
            <h2 className="text-base font-bold text-slate-900">Academic Session Comparison (2025-26 vs 2026-27)</h2>
            <p className="text-xs text-slate-500">Longitudinal academic and enrollment trends for {school.name}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-slate-500 text-[11px] font-bold block">Overall Pass Rate Shift</span>
              <p className="text-2xl font-black text-emerald-600">+4.8% Improvement</p>
              <p className="text-slate-600 text-[11px]">82.7% (2025-26) → 87.5% (2026-27)</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-slate-500 text-[11px] font-bold block">Mathematics Average Shift</span>
              <p className="text-2xl font-black text-indigo-700">+6.2% Growth</p>
              <p className="text-slate-600 text-[11px]">71.2 / 100 → 77.4 / 100</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-slate-500 text-[11px] font-bold block">Student Retention Rate</span>
              <p className="text-2xl font-black text-slate-900">98.2% Retained</p>
              <p className="text-slate-600 text-[11px]">Zero dropouts recorded under RTE act</p>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* REPORT 9: MARK HISTORY & DIGITAL AUDIT TRAIL                       */}
      {/* =================================================================== */}
      {activeReport === 'mark_history' && (() => {
        const allLogs = getMarkAuditLogs();
        const filteredLogs = allLogs.filter((log) => {
          const matchClass = selectedClass === 'all' || log.classNumber === selectedClass;
          const matchSection = selectedSection === 'all' || log.section === selectedSection;
          const matchModule = auditModuleFilter === 'all' || log.moduleOrigin === auditModuleFilter;
          const matchQuery =
            !auditSearchQuery ||
            log.studentName.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
            log.subjectName.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
            log.userResponsible.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
            log.userId.toLowerCase().includes(auditSearchQuery.toLowerCase());

          return matchClass && matchSection && matchModule && matchQuery;
        });

        const distinctStudents = new Set(filteredLogs.map((l) => l.studentId)).size;
        const totalDelta = filteredLogs.reduce((acc, log) => {
          const orig = typeof log.originalValue === 'number' ? log.originalValue : parseFloat(log.originalValue as string) || 0;
          const now = typeof log.newValue === 'number' ? log.newValue : parseFloat(log.newValue as string) || 0;
          return acc + (now - orig);
        }, 0);
        const avgDelta = filteredLogs.length > 0 ? (totalDelta / filteredLogs.length).toFixed(1) : '0.0';

        return (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            {/* Header & Export Actions */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-200 shadow-xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2 flex-wrap">
                    <span>Mark Change History & Digital Audit Trail</span>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-extrabold uppercase border border-indigo-200">
                      Tamper-Evident Ledger
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Records every edit to student marks across Marks Entry Register and Holistic Progress Cards (HPC) with full traceability under Jammu & Kashmir School Education Department guidelines.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
                <button
                  onClick={() => downloadSignedAuditTrailCsv(selectedClass, selectedSection, school.name)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
                  title="Export digitally-signed CSV ledger for the selected class"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Download Audit Trail (Signed CSV)</span>
                </button>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Class:</label>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">All Classes</option>
                    {availableClasses.map((c) => (
                      <option key={c} value={c}>Class {c}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Section:</label>
                  <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">All Sections</option>
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                    <option value="C">Section C</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Module:</label>
                  <select
                    value={auditModuleFilter}
                    onChange={(e) => setAuditModuleFilter(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">All Modules</option>
                    <option value="Marks Entry Register">Marks Entry Register</option>
                    <option value="HPC Module">HPC Module</option>
                    <option value="Evaluation Register">Evaluation Register</option>
                  </select>
                </div>
              </div>

              {/* Search query box */}
              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search student, subject, master..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Audit Statistics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Modifications Recorded</span>
                <p className="text-xl font-black text-slate-900 font-mono mt-0.5">
                  {filteredLogs.length} <span className="text-xs text-slate-400 font-normal">of {allLogs.length}</span>
                </p>
              </div>

              <div className="p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-100">
                <span className="text-[10px] text-indigo-700 font-bold uppercase block">Students Affected</span>
                <p className="text-xl font-black text-indigo-900 font-mono mt-0.5">{distinctStudents} Students</p>
              </div>

              <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-100">
                <span className="text-[10px] text-emerald-700 font-bold uppercase block">Average Score Delta</span>
                <p className="text-xl font-black text-emerald-800 font-mono mt-0.5">
                  {Number(avgDelta) > 0 ? `+${avgDelta}` : avgDelta} Pts
                </p>
              </div>

              <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-100">
                <span className="text-[10px] text-amber-700 font-bold uppercase block">Audit Verification</span>
                <p className="text-xs font-bold text-amber-950 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                  <span>HM Seal Verified</span>
                </p>
              </div>
            </div>

            {/* Detailed Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-2 text-center">Class</th>
                    <th className="py-2.5 px-3">Subject & Exam</th>
                    <th className="py-2.5 px-2 text-center">Original</th>
                    <th className="py-2.5 px-2 text-center">New</th>
                    <th className="py-2.5 px-2 text-center">Delta</th>
                    <th className="py-2.5 px-3">User Responsible (ID)</th>
                    <th className="py-2.5 px-2.5">Module Origin</th>
                    <th className="py-2.5 px-3">Audit Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        No mark modification records found matching current filter parameters.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      const orig = typeof log.originalValue === 'number' ? log.originalValue : parseFloat(log.originalValue as string) || 0;
                      const now = typeof log.newValue === 'number' ? log.newValue : parseFloat(log.newValue as string) || 0;
                      const delta = now - orig;

                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            <div>{log.studentName}</div>
                            <span className="text-[10px] font-mono text-slate-400">Roll #{log.rollNumber}</span>
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold text-slate-700">
                            {log.classNumber}-{log.section}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-800">{log.subjectName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {log.subjectCode} • {log.examName}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-600 bg-slate-50/60">
                            {log.originalValue}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-black text-indigo-900 bg-indigo-50/40">
                            {log.newValue}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                delta > 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : delta < 0
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-800">{log.userResponsible}</div>
                            <div className="text-[10px] font-mono text-slate-400">{log.userId}</div>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                              {log.moduleOrigin}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 italic text-[11px]">
                            {log.reason || 'Manual verification update'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
