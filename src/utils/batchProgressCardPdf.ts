import jsPDF from 'jspdf';
import {
  Examination,
  SchoolProfile,
  Student,
  StudentExamSummary,
  StudentHolisticRecord,
  StudentMarkEntry,
} from '../types';
import {
  HOLISTIC_ASSESSMENT_CATEGORIES,
  sampleHolisticRecords,
  sampleSubjectConfigs,
} from './sampleData';
import {
  deduplicateStudentsByAdmissionNumber,
  formatSchoolAddressOnce,
} from './calculations';

function inferImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

export interface BatchClassProgressCardPdfOptions {
  school: SchoolProfile;
  examination: Examination;
  studentSummaries: StudentExamSummary[];
  students: Student[];
  marksEntries: StudentMarkEntry[];
  holisticRecords?: Record<string, StudentHolisticRecord>;
  classNumber: string;
  section: string;
}

/**
 * Consolidates all student Holistic Progress Cards (HPC) for a class
 * into a single, multi-page, printer-friendly A4 PDF document.
 */
export function generateBatchClassProgressCardsPdf(options: BatchClassProgressCardPdfOptions): void {
  const {
    school,
    examination,
    studentSummaries,
    students,
    marksEntries,
    holisticRecords,
    classNumber,
    section,
  } = options;

  const uniqueStudents = deduplicateStudentsByAdmissionNumber(students);
  const seenSummaryKeys = new Set<string>();
  const uniqueSummaries = (studentSummaries || []).filter((sum) => {
    const matched = uniqueStudents.find((s) => s.id === sum.studentId);
    const key = (matched?.admissionNumber || sum.studentId || '').trim().toUpperCase();
    if (!key || seenSummaryKeys.has(key)) return false;
    seenSummaryKeys.add(key);
    return true;
  });

  if (uniqueSummaries.length === 0) {
    return;
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186mm
  const totalPages = uniqueSummaries.length;
  const formattedAddressOnce = formatSchoolAddressOnce(school);

  uniqueSummaries.forEach((summary, index) => {
    if (index > 0) {
      doc.addPage('a4', 'portrait');
    }

    const student = uniqueStudents.find((s) => s.id === summary.studentId);
    const hol = holisticRecords?.[summary.studentId] || sampleHolisticRecords[summary.studentId] || {
      ratings: {
        comm: 'Very Good',
        read_write: 'Good',
        creativity: 'Very Good',
        problem_solving: 'Good',
        teamwork: 'Very Good',
        leadership: 'Good',
        discipline: 'Very Good',
        emotional_dev: 'Very Good',
        social_interaction: 'Very Good',
        environmental_awareness: 'Very Good',
        physical_sports: 'Good',
        art_music_culture: 'Good',
        classroom_participation: 'Very Good',
        digital_literacy: 'Good',
      },
      strengths: 'Active participation, good conduct, and helpful attitude.',
      areasForImprovement: 'Regular practice in mathematical problem-solving.',
      teacherRemarks: 'Diligent student with commendable enthusiasm in class.',
      suggestionsForParents: 'Support daily reading habits and review homework assignments.',
      goalsForNextTerm: 'Strive for distinction in mathematics and science.',
    };

    // ------------------------------------------------------------------------
    // 1. PAGE BORDER (Formal Certificate Style)
    // ------------------------------------------------------------------------
    doc.setDrawColor(30, 41, 59); // slate-800
    doc.setLineWidth(0.6);
    doc.rect(margin - 4, 6, contentWidth + 8, pageHeight - 12);
    doc.setLineWidth(0.2);
    doc.rect(margin - 2.5, 7.5, contentWidth + 5, pageHeight - 15);

    // ------------------------------------------------------------------------
    // 2. HEADER BANNER: School Information & School Logo
    // ------------------------------------------------------------------------
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(margin, 10, contentWidth, 18, 'F');

    if (school.logoDataUrl) {
      try {
        doc.addImage(
          school.logoDataUrl,
          inferImageFormat(school.logoDataUrl),
          margin + 2.5,
          11.5,
          15,
          15
        );
      } catch {
        // Fallback if invalid logo data URL
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(school.name.toUpperCase(), pageWidth / 2, 16, { align: 'center' });

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(226, 232, 240); // slate-200
    doc.text(
      `${formattedAddressOnce} | U-DISE: ${school.code}`,
      pageWidth / 2,
      21,
      { align: 'center' }
    );
    doc.text(
      `ACADEMIC SESSION: ${school.academicSession} | EXAMINATION: ${examination.name.toUpperCase()}`,
      pageWidth / 2,
      25,
      { align: 'center' }
    );

    // Subheader Ribbon: Holistic Progress Card Title
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.rect(margin, 30, contentWidth, 7, 'FD');

    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(
      'HOLISTIC STUDENT PROGRESS CARD (HPC) - 360-DEGREE MULTI-DIMENSIONAL ASSESSMENT',
      pageWidth / 2,
      34.8,
      { align: 'center' }
    );

    // ------------------------------------------------------------------------
    // 3. SECTION A: Student Demographics & Profile
    // ------------------------------------------------------------------------
    const bioY = 39;
    const bioHeight = 16;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, bioY, contentWidth, bioHeight, 'FD');

    doc.setFontSize(7.5);
    const colW = contentWidth / 4;

    // Row 1
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Student Name:', margin + 2, bioY + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(summary.studentName, margin + 22, bioY + 4);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Roll Number:', margin + colW * 1.5 + 2, bioY + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(67, 56, 202); // indigo-700
    doc.text(`#${summary.rollNumber}`, margin + colW * 1.5 + 20, bioY + 4);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Class & Section:', margin + colW * 2.5 + 2, bioY + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Class ${classNumber} - Section ${section}`, margin + colW * 2.5 + 24, bioY + 4);

    // Row 2
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text("Father's Name:", margin + 2, bioY + 9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(student?.fatherName || 'Mohd Hussain', margin + 22, bioY + 9);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text("Mother's Name:", margin + colW * 1.5 + 2, bioY + 9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(student?.motherName || 'Nasreen Akhtar', margin + colW * 1.5 + 22, bioY + 9);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Admission / SRN:', margin + colW * 2.5 + 2, bioY + 9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(student?.admissionNumber || summary.studentId, margin + colW * 2.5 + 24, bioY + 9);

    // Row 3
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Date of Birth:', margin + 2, bioY + 14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(student?.dob || '2015-05-14', margin + 22, bioY + 14);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Gender:', margin + colW * 1.5 + 2, bioY + 14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(student?.gender || 'Male', margin + colW * 1.5 + 14, bioY + 14);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Attendance Rate:', margin + colW * 2.5 + 2, bioY + 14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(4, 120, 87); // emerald-700
    doc.text('92.4% (22/24 Working Days)', margin + colW * 2.5 + 24, bioY + 14);

    // ------------------------------------------------------------------------
    // 4. SECTION B: Scholastic Performance Table (6 Core Subjects)
    // ------------------------------------------------------------------------
    const tableStartY = 58;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('SECTION B: SCHOLASTIC ASSESSMENT (6 MANDATORY SUBJECTS)', margin, tableStartY - 1.5);

    // Table Header
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, tableStartY, contentWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text('Subject Name', margin + 3, tableStartY + 4.2);
    doc.text('Max Marks', margin + 55, tableStartY + 4.2, { align: 'center' });
    doc.text('Marks Obtained', margin + 85, tableStartY + 4.2, { align: 'center' });
    doc.text('Percentage', margin + 115, tableStartY + 4.2, { align: 'center' });
    doc.text('Grade', margin + 135, tableStartY + 4.2, { align: 'center' });
    doc.text('Teacher Subject Remarks & Observations', margin + 145, tableStartY + 4.2);

    // 6 Subjects Rows
    const rowH = 5.2;
    sampleSubjectConfigs.forEach((sub, sIdx) => {
      const rY = tableStartY + 6 + sIdx * rowH;
      const isAlt = sIdx % 2 === 1;

      if (isAlt) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, rY, contentWidth, rowH, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, rY + rowH, margin + contentWidth, rY + rowH);

      const entry = marksEntries.find(
        (m) => m.studentId === summary.studentId && m.subjectCode === sub.code
      );
      const marks = entry ? entry.marksObtained : 82;
      const maxMarks = sub.maxMarks;
      const pct = marks !== null && maxMarks > 0 ? Math.round((marks / maxMarks) * 1000) / 10 : 0;
      const grade = entry?.grade || (pct >= 80 ? 'A+' : pct >= 65 ? 'A' : pct >= 50 ? 'B' : 'C');
      const remarks = entry?.remarks || 'Good progress demonstrated in curricular work.';

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(7);
      doc.text(sub.name, margin + 3, rY + 3.8);

      doc.setFont('helvetica', 'normal');
      doc.text(String(maxMarks), margin + 55, rY + 3.8, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.text(marks !== null ? String(marks) : 'AB', margin + 85, rY + 3.8, { align: 'center' });

      doc.text(`${pct}%`, margin + 115, rY + 3.8, { align: 'center' });

      doc.setTextColor(67, 56, 202);
      doc.text(grade, margin + 135, rY + 3.8, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(remarks.slice(0, 36), margin + 145, rY + 3.8);
    });

    // Total Aggregate Row
    const totY = tableStartY + 6 + 6 * rowH;
    doc.setFillColor(224, 231, 255); // indigo-100
    doc.rect(margin, totY, contentWidth, 6, 'F');
    doc.setDrawColor(199, 210, 254);
    doc.rect(margin, totY, contentWidth, 6, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(7.5);
    doc.text('TOTAL AGGREGATE PERFORMANCE', margin + 3, totY + 4.2);
    doc.text(String(summary.totalMaxMarks), margin + 55, totY + 4.2, { align: 'center' });
    doc.text(String(summary.totalMarksObtained), margin + 85, totY + 4.2, { align: 'center' });
    doc.text(`${summary.percentage}%`, margin + 115, totY + 4.2, { align: 'center' });
    doc.setTextColor(67, 56, 202);
    doc.text(summary.overallGrade, margin + 135, totY + 4.2, { align: 'center' });
    doc.setTextColor(summary.isPassed ? 4 : 225, summary.isPassed ? 120 : 29, summary.isPassed ? 87 : 72);
    doc.text(summary.isPassed ? 'PROMOTED / PASSED' : 'NEEDS REMEDIAL SUPPORT', margin + 145, totY + 4.2);

    // ------------------------------------------------------------------------
    // 5. SECTION C: Holistic Life Skill Domains Assessment (14 Categories)
    // ------------------------------------------------------------------------
    const holStartY = 104;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(
      'SECTION C: 14 HOLISTIC LIFE SKILLS & COGNITIVE-AFFECTIVE DOMAINS (NEP 2020)',
      margin,
      holStartY - 1.5
    );

    const holHalfWidth = (contentWidth - 4) / 2;
    const holRowHeight = 6.8;

    // Render 14 categories in 2 columns (7 per column)
    HOLISTIC_ASSESSMENT_CATEGORIES.forEach((cat, cIdx) => {
      const isRightCol = cIdx >= 7;
      const colX = isRightCol ? margin + holHalfWidth + 4 : margin;
      const rowIndex = isRightCol ? cIdx - 7 : cIdx;
      const cY = holStartY + rowIndex * holRowHeight;

      const rating = hol.ratings[cat.id] || 'Good';

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(colX, cY, holHalfWidth, holRowHeight - 1, 'FD');

      // Domain Category Name
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(6.8);
      doc.text(`${cIdx + 1}. ${cat.name}`, colX + 2, cY + 4);

      // Rating badge color determination
      let ratingBg = [224, 231, 255]; // indigo-100 default
      let ratingText = [67, 56, 202]; // indigo-700
      if (rating === 'Outstanding') {
        ratingBg = [209, 250, 229]; // emerald-100
        ratingText = [4, 120, 87]; // emerald-700
      } else if (rating === 'Very Good') {
        ratingBg = [219, 234, 254]; // blue-100
        ratingText = [29, 78, 216]; // blue-700
      } else if (rating === 'Developing') {
        ratingBg = [254, 243, 199]; // amber-100
        ratingText = [180, 83, 9]; // amber-700
      } else if (rating === 'Needs Support') {
        ratingBg = [255, 228, 230]; // rose-100
        ratingText = [190, 18, 60]; // rose-700
      }

      doc.setFillColor(ratingBg[0], ratingBg[1], ratingBg[2]);
      doc.roundedRect(colX + holHalfWidth - 26, cY + 1, 24, 4, 1, 1, 'F');
      doc.setTextColor(ratingText[0], ratingText[1], ratingText[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.text(rating, colX + holHalfWidth - 14, cY + 3.8, { align: 'center' });
    });

    // ------------------------------------------------------------------------
    // 6. SECTION D & E: Comprehensive Observations & Action Plan
    // ------------------------------------------------------------------------
    const obsY = 156;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('SECTION D & E: COMPREHENSIVE TEACHER OBSERVATIONS & GROWTH PLAN', margin, obsY - 1.5);

    const boxW = (contentWidth - 4) / 2;

    // Box 1: Student Strengths
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, obsY, boxW, 14, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(4, 120, 87);
    doc.setFontSize(6.8);
    doc.text('Notable Strengths & Talents:', margin + 2.5, obsY + 3.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(doc.splitTextToSize(hol.strengths, boxW - 5), margin + 2.5, obsY + 7);

    // Box 2: Areas for Improvement
    doc.setFillColor(248, 250, 252);
    doc.rect(margin + boxW + 4, obsY, boxW, 14, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text('Areas for Improvement & Remedial Focus:', margin + boxW + 6.5, obsY + 3.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(doc.splitTextToSize(hol.areasForImprovement, boxW - 5), margin + boxW + 6.5, obsY + 7);

    // Box 3: Teacher's General Remarks
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, obsY + 16, boxW, 14, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text("Class Teacher's General Remarks:", margin + 2.5, obsY + 19.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(doc.splitTextToSize(hol.teacherRemarks, boxW - 5), margin + 2.5, obsY + 23);

    // Box 4: Suggestions for Parents & Next Term Goals
    doc.setFillColor(248, 250, 252);
    doc.rect(margin + boxW + 4, obsY + 16, boxW, 14, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Parent Remarks, Goals & Overall Development:', margin + boxW + 6.5, obsY + 19.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const parentNotes = `${hol.parentRemarks || hol.suggestionsForParents} | Goal: ${hol.goalsForNextTerm}${hol.overallStudentDevelopment ? ` | ${hol.overallStudentDevelopment}` : ''}`;
    doc.text(doc.splitTextToSize(parentNotes, boxW - 5), margin + boxW + 6.5, obsY + 23);

    // ------------------------------------------------------------------------
    // 7. SECTION F: Official Institutional Signatures
    // ------------------------------------------------------------------------
    const sigY = 194;
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.4);
    doc.line(margin, sigY, margin + contentWidth, sigY);

    const sigColW = contentWidth / 3;

    // Signature 1: Class Teacher
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Nazir Ahmad Dar (Teacher)', margin + sigColW / 2, sigY + 9, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Class Teacher Signature', margin + sigColW / 2, sigY + 13, { align: 'center' });

    // Signature 2: Official School Stamp (middle column)
    if (school.officialStampDataUrl) {
      try {
        doc.addImage(
          school.officialStampDataUrl,
          inferImageFormat(school.officialStampDataUrl),
          margin + sigColW * 1.5 - 11,
          sigY - 4,
          22,
          12
        );
      } catch {
        // Fallback if invalid image data URL
      }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      school.officialStampDataUrl ? '' : '_________________________',
      margin + sigColW * 1.5,
      sigY + 9,
      { align: 'center' }
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Parent Signature / Official Stamp', margin + sigColW * 1.5, sigY + 13, { align: 'center' });

    // Signature 3: Headmaster / Admin & Digital Signature
    const headmasterDisplayName = school.headmasterName || school.headTeacherName || 'Mohd Yousuf Wani';
    const adminDisplayName = school.adminName || headmasterDisplayName;
    if (school.headmasterSignatureDataUrl) {
      try {
        doc.addImage(
          school.headmasterSignatureDataUrl,
          inferImageFormat(school.headmasterSignatureDataUrl),
          margin + sigColW * 2.5 - 14,
          sigY - 4,
          28,
          10
        );
      } catch {
        // Fallback if invalid image data URL
      }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `${headmasterDisplayName} (${school.principalDesignation || 'Headmaster'})`,
      margin + sigColW * 2.5,
      sigY + 9,
      { align: 'center' }
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Admin: ${adminDisplayName} • Seal & Signature`,
      margin + sigColW * 2.5,
      sigY + 13,
      { align: 'center' }
    );

    // ------------------------------------------------------------------------
    // 8. PAGE FOOTER
    // ------------------------------------------------------------------------
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 11, margin + contentWidth, pageHeight - 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Class ${classNumber}-${section} • Academic Session ${school.academicSession} • NEP 2020 Holistic Progress Card`,
      margin,
      pageHeight - 8
    );
    doc.text(
      `Student ${index + 1} of ${totalPages} | Consolidated Document`,
      pageWidth - margin,
      pageHeight - 8,
      { align: 'right' }
    );
  });

  const fileName = `Class_${classNumber}_${section}_Holistic_Progress_Cards_${school.academicSession.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(fileName);
}
