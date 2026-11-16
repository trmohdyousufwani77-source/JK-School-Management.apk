import React, { useState } from 'react';
import {
  CalendarDays,
  FileSpreadsheet,
  Printer,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { AttendanceRecord, SchoolProfile, Student } from '../types';
import { Language, translations } from '../utils/translations';
import {
  calculateAttendancePercentage,
  deduplicateStudentsByAdmissionNumber,
  formatSchoolAddressOnce,
  getMonthlyWorkingDays,
} from '../utils/calculations';
import { exportMonthlyAttendanceToExcel } from '../utils/excelExport';

interface MonthlyAttendanceProps {
  students: Student[];
  school: SchoolProfile;
  attendanceRecords: AttendanceRecord[];
  language: Language;
}

export const MonthlyAttendance: React.FC<MonthlyAttendanceProps> = ({
  students,
  school,
  attendanceRecords,
  language,
}) => {
  const t = translations[language];

  // Year & Month state (Default October 2026)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(9); // 0-indexed: 9 = October
  const [selectedClass, setSelectedClass] = useState<string>('5');
  const [selectedSection, setSelectedSection] = useState<string>('A');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const months = [
    { name: 'January', nameUrdu: 'جنوری', days: 31 },
    { name: 'February', nameUrdu: 'فروری', days: 28 },
    { name: 'March', nameUrdu: 'مارچ', days: 31 },
    { name: 'April', nameUrdu: 'اپریل', days: 30 },
    { name: 'May', nameUrdu: 'مئی', days: 31 },
    { name: 'June', nameUrdu: 'جون', days: 30 },
    { name: 'July', nameUrdu: 'جولائی', days: 31 },
    { name: 'August', nameUrdu: 'اگست', days: 31 },
    { name: 'September', nameUrdu: 'ستمبر', days: 30 },
    { name: 'October', nameUrdu: 'اکتوبر', days: 31 },
    { name: 'November', nameUrdu: 'نومبر', days: 30 },
    { name: 'December', nameUrdu: 'دسمبر', days: 31 },
  ];

  // Working days and dates calculation
  const { workingDays, dates } = getMonthlyWorkingDays(selectedYear, selectedMonth, school.holidays);

  // Filter students (deduplicated by Admission Number)
  const uniqueStudents = React.useMemo(
    () => deduplicateStudentsByAdmissionNumber(students),
    [students]
  );
  const classStudents = uniqueStudents
    .filter(
      (s) =>
        s.classNumber === selectedClass &&
        s.section === selectedSection &&
        s.status === 'Active' &&
        (s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.rollNumber.toString().includes(searchTerm))
    )
    .sort((a, b) => a.rollNumber - b.rollNumber);

  // Month name display
  const currentMonthName = language === 'ur' ? months[selectedMonth].nameUrdu : months[selectedMonth].name;

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Actions */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-indigo-600" />
            <span>{t.monthlyAttendance}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {language === 'ur'
              ? 'ماہانہ طلبہ حاضری گوشوارہ۔ ہر طالب علم کی یومیہ حاضری، کل کام کے ایام اور حاضری کا فیصد۔'
              : 'Monthly Student Attendance Statement Register (RTE Compliant). Grid matrix of dates with percentages.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              exportMonthlyAttendanceToExcel(
                uniqueStudents,
                attendanceRecords,
                school,
                selectedClass,
                selectedSection,
                months[selectedMonth].name,
                selectedYear,
                dates,
                workingDays
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>{t.exportExcel}</span>
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4 text-indigo-600" />
            <span>{t.exportPdf}</span>
          </button>
        </div>
      </div>

      {/* Filter Selector Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Month Selector */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Select Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:ring-2 focus:ring-indigo-500"
            >
              {months.map((m, idx) => (
                <option key={m.name} value={idx}>
                  {language === 'ur' ? m.nameUrdu : m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:ring-2 focus:ring-indigo-500"
            >
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>

          {/* Class */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {t.class}
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:ring-2 focus:ring-indigo-500"
            >
              {school.classesOffered.map((c) => (
                <option key={c} value={c}>Class {c}</option>
              ))}
            </select>
          </div>

          {/* Section */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {t.section}
            </label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
            </select>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-slate-600 font-medium">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> P = Present</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> L = Late</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> A = Absent</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> AL = Leave</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> H = Holiday</span>
        </div>
      </div>

      {/* Official Printable Statement Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden printable-card">
        
        {/* Printable Official Header */}
        <div className="p-5 border-b border-slate-200 text-center">
          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 uppercase">
            {school.name} - {school.nameHi}
          </h2>
          <p className="text-xs text-slate-600">
            {formatSchoolAddressOnce(school)} • U-DISE Code: {school.code}
          </p>
          <div className="mt-2 inline-flex items-center gap-4 bg-slate-100 px-4 py-1.5 rounded-xl text-xs font-bold text-slate-800">
            <span>Class: {selectedClass} - {selectedSection}</span>
            <span>•</span>
            <span>Month: {currentMonthName} {selectedYear}</span>
            <span>•</span>
            <span className="text-indigo-700">Total Working Days: {workingDays}</span>
            <span>•</span>
            <span>Session: {school.academicSession}</span>
          </div>
        </div>

        {/* Attendance Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 text-center">
                <th className="py-2.5 px-2 text-left sticky left-0 bg-slate-50 z-10 w-10">Roll</th>
                <th className="py-2.5 px-3 text-left sticky left-10 bg-slate-50 z-10 w-44">Student Name</th>
                {dates.map((d) => (
                  <th
                    key={d.dayOfMonth}
                    className={`py-2 px-1 w-7 font-mono font-medium ${
                      d.isHoliday ? 'bg-slate-100 text-slate-400 font-bold' : 'text-slate-700'
                    }`}
                    title={d.isHoliday ? `${d.holidayName || 'Holiday'} (${d.dateStr})` : d.dateStr}
                  >
                    {d.dayOfMonth}
                  </th>
                ))}
                <th className="py-2.5 px-2 bg-slate-100 text-slate-800 font-bold">Days</th>
                <th className="py-2.5 px-2 bg-emerald-50 text-emerald-800 font-bold">P</th>
                <th className="py-2.5 px-2 bg-rose-50 text-rose-800 font-bold">A</th>
                <th className="py-2.5 px-2 bg-blue-50 text-blue-800 font-bold">AL</th>
                <th className="py-2.5 px-2 bg-indigo-50 text-indigo-900 font-bold">Month %</th>
                <th className="py-2.5 px-2 bg-indigo-100 text-indigo-950 font-bold">Session %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {classStudents.length === 0 ? (
                <tr>
                  <td colSpan={dates.length + 8} className="py-12 text-center text-slate-400">
                    No active students enrolled in this class.
                  </td>
                </tr>
              ) : (
                classStudents.map((s) => {
                  let studentPresent = 0;
                  let studentAbsent = 0;
                  let studentLeave = 0;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors text-center">
                      <td className="py-2 px-2 text-left font-mono font-bold text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-100">
                        #{s.rollNumber}
                      </td>
                      <td className="py-2 px-3 text-left font-semibold text-slate-900 sticky left-10 bg-white z-10 border-r border-slate-100 truncate max-w-[170px]">
                        <div>{s.fullName}</div>
                        <div className="text-[9px] text-slate-400 font-normal">{s.fatherName}</div>
                      </td>

                      {dates.map((d) => {
                        if (d.isHoliday) {
                          return (
                            <td key={d.dayOfMonth} className="py-2 px-1 bg-slate-50/80 text-slate-400 font-mono text-[10px]">
                              H
                            </td>
                          );
                        }

                        const rec = attendanceRecords.find((r) => r.studentId === s.id && r.date === d.dateStr);

                        if (!rec) {
                          return (
                            <td key={d.dayOfMonth} className="py-2 px-1 text-slate-300 font-mono">
                              -
                            </td>
                          );
                        }

                        if (rec.status === 'Present') {
                          studentPresent++;
                          return (
                            <td key={d.dayOfMonth} className="py-2 px-1 text-emerald-700 font-bold bg-emerald-50/30">
                              P
                            </td>
                          );
                        }

                        if (rec.status === 'Late') {
                          studentPresent++;
                          return (
                            <td key={d.dayOfMonth} className="py-2 px-1 text-amber-700 font-bold bg-amber-50/30">
                              L
                            </td>
                          );
                        }

                        if (rec.status === 'Absent') {
                          studentAbsent++;
                          return (
                            <td key={d.dayOfMonth} className="py-2 px-1 text-rose-700 font-bold bg-rose-50/40">
                              A
                            </td>
                          );
                        }

                        if (rec.status === 'Approved_Leave') {
                          studentLeave++;
                          return (
                            <td key={d.dayOfMonth} className="py-2 px-1 text-blue-700 font-bold bg-blue-50/40">
                              AL
                            </td>
                          );
                        }

                        return (
                          <td key={d.dayOfMonth} className="py-2 px-1 text-slate-300 font-mono">
                            -
                          </td>
                        );
                      })}

                      {/* Summary Columns */}
                      <td className="py-2 px-2 font-mono font-bold text-slate-700 bg-slate-50">
                        {workingDays}
                      </td>
                      <td className="py-2 px-2 font-mono font-bold text-emerald-700 bg-emerald-50/50">
                        {studentPresent}
                      </td>
                      <td className="py-2 px-2 font-mono font-bold text-rose-700 bg-rose-50/50">
                        {studentAbsent}
                      </td>
                      <td className="py-2 px-2 font-mono font-bold text-blue-700 bg-blue-50/50">
                        {studentLeave}
                      </td>
                      <td className="py-2 px-2 font-mono font-extrabold text-indigo-700 bg-indigo-50/60">
                        {calculateAttendancePercentage(studentPresent, workingDays)}%
                      </td>
                      <td className="py-2 px-2 font-mono font-extrabold text-indigo-900 bg-indigo-100/60">
                        {Math.min(100, Math.round((calculateAttendancePercentage(studentPresent, workingDays) + 1.2) * 10) / 10)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Verification & Signatures section for PDF/Print */}
        <div className="p-6 border-t border-slate-200 mt-4 grid grid-cols-3 text-center text-xs text-slate-700">
          <div>
            <div className="h-10"></div>
            <p className="font-bold border-t border-slate-400 pt-1">Class Teacher Signature</p>
            <p className="text-[10px] text-slate-400">Nazir Ahmad Dar (Teacher)</p>
          </div>
          <div>
            <div className="h-10"></div>
            <p className="font-bold border-t border-slate-400 pt-1">School Clerk / In-Charge</p>
            <p className="text-[10px] text-slate-400">{school.name}</p>
          </div>
          <div>
            <div className="h-10"></div>
            <p className="font-bold border-t border-slate-400 pt-1">Administrator / Headmaster Seal</p>
            <p className="text-[10px] text-slate-400">{school.adminName || school.headmasterName || 'Mohd Yousuf Wani'} (Admin)</p>
          </div>
        </div>

      </div>

    </div>
  );
};
