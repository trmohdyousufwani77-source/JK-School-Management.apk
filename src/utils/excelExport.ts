import * as XLSX from 'xlsx';
import {
  AttendanceRecord,
  Examination,
  SchoolProfile,
  Student,
  StudentExamSummary,
  StudentMarkEntry,
  TeacherLeaveApplication,
  TeacherPerformanceReport,
  TeacherProfile,
  TextbookDistributionRecord,
} from '../types';

function triggerDownload(wb: XLSX.WorkBook, fileName: string) {
  XLSX.writeFile(wb, fileName);
}

/**
 * Export Complete Student Register
 */
export function exportStudentRegisterToExcel(students: Student[], school: SchoolProfile, classFilter?: string) {
  const filtered = classFilter && classFilter !== 'all' 
    ? students.filter(s => s.classNumber === classFilter)
    : students;

  const titleRow = [`${school.name} - ${school.nameHi}`];
  const subTitle = [`STUDENT ADMISSION REGISTER (U-DISE: ${school.code}) - Academic Session: ${school.academicSession}`];
  const blankRow: string[] = [];

  const headers = [
    'Student ID',
    'Admission No (SRN)',
    'Roll No',
    'Class',
    'Section',
    'Full Name',
    'Gender',
    'Date of Birth',
    "Father's Name",
    "Mother's Name",
    'Mobile Number',
    'Village / Town',
    'Block / Tehsil',
    'District',
    'State',
    'PIN Code',
    'Admission Date',
    'Status',
    'Aadhaar Status',
    'Aadhaar Ref / Masked',
  ];

  const dataRows = filtered.map(s => [
    s.id,
    s.admissionNumber,
    s.rollNumber,
    s.classNumber,
    s.section,
    s.fullName,
    s.gender,
    s.dob,
    s.fatherName,
    s.motherName,
    s.mobileNumber,
    s.villageTown,
    s.blockTehsil,
    s.district,
    s.state,
    s.pinCode,
    s.admissionDate,
    s.status,
    s.aadhaarStatus,
    s.maskedAadhaar || s.alternativeIdType || 'N/A',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([titleRow, subTitle, blankRow, headers, ...dataRows]);

  // Adjust column widths
  ws['!cols'] = [
    { wch: 14 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 20 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 22 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Student_Register');
  triggerDownload(wb, `Student_Register_${school.code}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Monthly Attendance Register Matrix
 */
export function exportMonthlyAttendanceToExcel(
  students: Student[],
  records: AttendanceRecord[],
  school: SchoolProfile,
  classNumber: string,
  section: string,
  monthName: string,
  year: number,
  daysList: { dateStr: string; dayOfMonth: number; isHoliday: boolean; holidayName?: string }[],
  workingDaysTotal: number
) {
  const classStudents = students.filter(s => s.classNumber === classNumber && s.section === section);

  const titleRow = [`${school.name} - MONTHLY ATTENDANCE REGISTER`];
  const subRow = [`Class: ${classNumber}-${section} | Month: ${monthName} ${year} | Total Working Days: ${workingDaysTotal}`];
  const blankRow: string[] = [];

  const headers = [
    'Roll No',
    'Student ID',
    'Student Name',
    "Father's Name",
    ...daysList.map(d => `${d.dayOfMonth}`),
    'Working Days',
    'Present',
    'Absent',
    'Leave',
    'Attendance %',
  ];

  const dataRows = classStudents.map(student => {
    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;

    const dayCols = daysList.map(d => {
      if (d.isHoliday) {
        return 'H'; // Holiday
      }
      const rec = records.find(r => r.studentId === student.id && r.date === d.dateStr);
      if (!rec) return '-';
      if (rec.status === 'Present') {
        presentCount++;
        return 'P';
      }
      if (rec.status === 'Late') {
        presentCount++;
        return 'L';
      }
      if (rec.status === 'Absent') {
        absentCount++;
        return 'A';
      }
      if (rec.status === 'Approved_Leave') {
        leaveCount++;
        return 'AL';
      }
      return '-';
    });

    const percentage = workingDaysTotal > 0 ? ((presentCount / workingDaysTotal) * 100).toFixed(2) + '%' : '0.00%';

    return [
      student.rollNumber,
      student.id,
      student.fullName,
      student.fatherName,
      ...dayCols,
      workingDaysTotal,
      presentCount,
      absentCount,
      leaveCount,
      percentage,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([titleRow, subRow, blankRow, headers, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Attendance_Class_${classNumber}_${section}`);
  triggerDownload(wb, `Monthly_Attendance_Class_${classNumber}_${section}_${monthName}_${year}.xlsx`);
}

/**
 * Export Teacher Leave Statement
 */
export function exportTeacherLeaveStatementToExcel(
  leaves: TeacherLeaveApplication[],
  teachers: TeacherProfile[],
  school: SchoolProfile
) {
  const titleRow = [`${school.name} - TEACHER LEAVE STATEMENT`];
  const subRow = [`Academic Session: ${school.academicSession} | Generated: ${new Date().toLocaleDateString()}`];
  const blankRow: string[] = [];

  const headers = [
    'Application ID',
    'Employee ID',
    'Teacher Name',
    'Designation',
    'Leave Type',
    'Application Date',
    'Start Date',
    'End Date',
    'Total Days',
    'Reason',
    'Status',
    'Approved / Rejected By',
    'Approval Date',
    'Remarks',
  ];

  const dataRows = leaves.map(l => {
    const t = teachers.find(teacher => teacher.employeeId === l.employeeId);
    return [
      l.id,
      l.employeeId,
      l.teacherName,
      t ? t.designation : 'Teacher',
      l.leaveType.replace('_', ' '),
      l.applicationDate,
      l.startDate,
      l.endDate,
      l.totalDays,
      l.reason,
      l.status,
      l.approvedBy || '-',
      l.approvalDate || '-',
      l.remarks || '-',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([titleRow, subRow, blankRow, headers, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Teacher_Leave_Statement');
  triggerDownload(wb, `Teacher_Leave_Statement_${school.code}.xlsx`);
}

/**
 * Export Examination Marks Register
 */
export function exportExaminationMarksToExcel(
  summaries: StudentExamSummary[],
  exam: Examination,
  school: SchoolProfile,
  classNumber: string,
  section: string
) {
  const titleRow = [`${school.name} - EXAMINATION RESULT REGISTER`];
  const subRow = [`Exam: ${exam.name} | Class: ${classNumber}-${section} | Session: ${school.academicSession}`];
  const blankRow: string[] = [];

  const subjects = exam.subjects[classNumber] || [];
  const subjectHeaders: string[] = [];
  subjects.forEach(s => {
    subjectHeaders.push(`${s.name} (Max ${s.maxMarks})`);
  });

  const headers = [
    'Roll No',
    'Student ID',
    'Student Name',
    ...subjectHeaders,
    'Total Max Marks',
    'Marks Obtained',
    'Percentage (%)',
    'Grade',
    'Result Status',
  ];

  const dataRows = summaries.map(s => {
    const subScores = subjects.map(sub => {
      const found = s.subjectMarks.find(sm => sm.subjectCode === sub.code);
      if (!found) return '-';
      if (found.isAbsent) return 'AB';
      return found.marksObtained ?? '-';
    });

    return [
      s.rollNumber,
      s.studentId,
      s.studentName,
      ...subScores,
      s.totalMaxMarks,
      s.totalMarksObtained,
      `${s.percentage.toFixed(2)}%`,
      s.overallGrade,
      s.isPassed ? 'PASSED' : 'NEEDS IMPROVEMENT',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([titleRow, subRow, blankRow, headers, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Marks_Register');
  triggerDownload(wb, `Exam_Marks_${exam.name.replace(/\s+/g, '_')}_Class_${classNumber}_${section}.xlsx`);
}

/**
 * Export Subject-Wise Teacher Performance
 */
export function exportTeacherPerformanceToExcel(
  reports: TeacherPerformanceReport[],
  school: SchoolProfile,
  examName: string
) {
  const titleRow = [`${school.name} - ACADEMIC SUBJECT-WISE TEACHER PERFORMANCE`];
  const subRow = [`Exam: ${examName} | Academic Session: ${school.academicSession}`];
  const blankRow: string[] = [];

  const headers = [
    'Teacher Name',
    'Employee ID',
    'Subject',
    'Class',
    'Section',
    'Enrolled',
    'Assessed',
    'Passed',
    'Failed',
    'Pass %',
    'Subject Avg Marks',
    'Subject Avg %',
    'Highest Mark',
    'Lowest Mark',
    'A1 Count',
    'A2 Count',
    'B1 Count',
    'B2 Count',
    'C1/C2 Count',
    'D/E Count',
  ];

  const dataRows = reports.map(r => [
    r.teacherName,
    r.employeeId,
    r.subjectName,
    r.classNumber,
    r.section,
    r.enrolledStudents,
    r.assessedStudents,
    r.passedStudents,
    r.failedStudents,
    `${r.passPercentage}%`,
    r.averageMarks,
    `${r.averagePercentage}%`,
    r.highestMarks,
    r.lowestMarks,
    r.gradeDistribution['A1'] || 0,
    r.gradeDistribution['A2'] || 0,
    r.gradeDistribution['B1'] || 0,
    r.gradeDistribution['B2'] || 0,
    (r.gradeDistribution['C1'] || 0) + (r.gradeDistribution['C2'] || 0),
    (r.gradeDistribution['D'] || 0) + (r.gradeDistribution['E'] || 0),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([titleRow, subRow, blankRow, headers, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Teacher_Performance');
  triggerDownload(wb, `Teacher_Performance_${examName.replace(/\s+/g, '_')}.xlsx`);
}

/**
 * Download sample Excel Template for importing students
 */
export function downloadStudentImportTemplate() {
  const headers = [
    'Admission_Number',
    'Full_Name',
    'Gender',
    'Date_of_Birth_YYYY_MM_DD',
    'Class',
    'Section',
    'Roll_Number',
    'Father_Name',
    'Mother_Name',
    'Parent_Mobile',
    'Village_Town',
    'District',
    'State',
    'PIN_Code',
  ];

  const sampleRows = [
    ['SRN-2026-601', 'Rahul Verma', 'Male', '2014-06-15', '6', 'A', 3, 'Gopal Verma', 'Sushila Verma', '+91 9876543210', 'Rampur', 'Bareilly', 'Uttar Pradesh', '243001'],
    ['SRN-2026-602', 'Simran Kaur', 'Female', '2014-08-20', '6', 'A', 4, 'Gurvinder Singh', 'Jaspreet Kaur', '+91 9812345678', 'Rampur', 'Bareilly', 'Uttar Pradesh', '243001'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import_Template');
  triggerDownload(wb, 'SchoolMaster_Student_Import_Template.xlsx');
}

/**
 * Export Textbook Distribution Register
 */
export function exportTextbookDistributionToExcel(
  records: TextbookDistributionRecord[],
  school: SchoolProfile,
  classFilter?: string
) {
  const filtered = classFilter && classFilter !== 'all'
    ? records.filter(r => r.classNumber === classFilter)
    : records;

  const titleRow = [`${school.name} - TEXTBOOK DISTRIBUTION REGISTER (RTE FREE SCHEME)`];
  const subRow = [`Academic Session: ${school.academicSession} | U-DISE Code: ${school.code} | Generated: ${new Date().toLocaleDateString()}`];
  const blankRow: string[] = [];

  const headers = [
    'Record ID',
    'Student ID',
    'Student Name',
    'Class',
    'Section',
    'Subject',
    'Textbook Name',
    'Edition / Year',
    'Required Qty',
    'Received Qty',
    'Status',
    'Issue Date',
    'Responsible Teacher',
    'Remarks',
  ];

  const dataRows = filtered.map(r => [
    r.id,
    r.studentId,
    r.studentName,
    r.classNumber,
    r.section,
    r.subject,
    r.textbookName,
    r.prescribedEdition,
    r.quantityRequired,
    r.quantityReceived,
    r.status.replace(/_/g, ' '),
    r.distributionDate,
    r.responsibleTeacherName,
    r.remarks || '-',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([titleRow, subRow, blankRow, headers, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Textbook_Register');
  triggerDownload(wb, `Textbook_Distribution_${school.code}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

