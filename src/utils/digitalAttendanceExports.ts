import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { SchoolProfile } from '../types';
import type {
  AttendanceCategoryConfig,
  DigitalAttendanceRecord,
  DigitalEmployeeProfile,
} from '../types/digitalAttendance';

export interface MonthlyEmployeeAttendanceSummary {
  employee: DigitalEmployeeProfile;
  dailyCodes: Record<number, string>; // day (1..31) -> code
  totalCalendarDays: number;
  totalWorkingDays: number;
  totalPresentDays: number; // includes 0.5 for FH/SH, excludes OD (tracked separately) or includes per rule
  totalPresentWithOd: number;
  totalAbsentDays: number;
  totalLeaveDays: number; // CL + EL + ML + 0.5*FH + 0.5*SH + custom leave
  medicalLeaveDays: number;
  onDutyDays: number;
  firstHalfLeaveDays: number;
  secondHalfLeaveDays: number;
  holidayDays: number;
  weeklyOffDays: number;
  attendancePercentage: number;
}

export function getDaysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function getMonthName(monthIndex0: number): string {
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return names[monthIndex0] || 'Month';
}

export function enumerateDatesInclusive(fromDate: string, toDate: string): string[] {
  if (!fromDate || !toDate) return [];
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }
  const result: string[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 180) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    result.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return result;
}

export function computeMonthlyEmployeeSummary(params: {
  employee: DigitalEmployeeProfile;
  monthKey: string; // YYYY-MM
  records: DigitalAttendanceRecord[];
  categories: AttendanceCategoryConfig[];
  weeklyOffDay?: number; // default 0 (Sunday)
}): MonthlyEmployeeAttendanceSummary {
  const [yearStr, monthStr] = params.monthKey.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const monthIdx = Math.max(0, Math.min(11, (Number(monthStr) || 1) - 1));
  const totalCalendarDays = getDaysInMonth(year, monthIdx);
  const weeklyOffDay = params.weeklyOffDay ?? 0;

  const categoryMap = new Map<string, AttendanceCategoryConfig>();
  for (const cat of params.categories) {
    categoryMap.set(cat.code.toUpperCase(), cat);
  }

  const recordByDate = new Map<string, DigitalAttendanceRecord>();
  for (const rec of params.records) {
    if (rec.employeeId === params.employee.employeeId && rec.date.startsWith(params.monthKey)) {
      recordByDate.set(rec.date, rec);
    }
  }

  const dailyCodes: Record<number, string> = {};
  let totalWorkingDays = 0;
  let totalPresentDays = 0;
  let totalAbsentDays = 0;
  let totalLeaveDays = 0;
  let medicalLeaveDays = 0;
  let onDutyDays = 0;
  let firstHalfLeaveDays = 0;
  let secondHalfLeaveDays = 0;
  let holidayDays = 0;
  let weeklyOffDays = 0;

  for (let day = 1; day <= totalCalendarDays; day++) {
    const isoDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dow = new Date(`${isoDate}T00:00:00`).getDay();
    const rec = recordByDate.get(isoDate);

    let code = rec?.statusCode?.toUpperCase() || '';
    if (!code && dow === weeklyOffDay) {
      code = 'W';
    }
    dailyCodes[day] = code;

    if (code === 'W') {
      weeklyOffDays += 1;
      continue;
    }
    if (code === 'H') {
      holidayDays += 1;
      continue;
    }

    totalWorkingDays += 1;

    if (!code) continue;

    if (code === 'P') {
      totalPresentDays += 1;
    } else if (code === 'A') {
      totalAbsentDays += 1;
    } else if (code === 'FH') {
      firstHalfLeaveDays += 1;
      totalPresentDays += 0.5;
      totalLeaveDays += 0.5;
    } else if (code === 'SH') {
      secondHalfLeaveDays += 1;
      totalPresentDays += 0.5;
      totalLeaveDays += 0.5;
    } else if (code === 'ML') {
      medicalLeaveDays += 1;
      totalLeaveDays += 1;
    } else if (code === 'OD') {
      onDutyDays += 1;
    } else if (code === 'CL' || code === 'EL') {
      totalLeaveDays += 1;
    } else {
      const cat = categoryMap.get(code);
      if (cat) {
        if (cat.isWorkingDayExcluded) {
          totalWorkingDays = Math.max(0, totalWorkingDays - 1);
          holidayDays += 1;
        } else {
          totalPresentDays += cat.presentWeight;
          totalLeaveDays += cat.leaveWeight;
        }
      }
    }
  }

  const totalPresentWithOd = Number((totalPresentDays + onDutyDays).toFixed(1));
  const attendancePercentage =
    totalWorkingDays > 0
      ? Number(Math.min(100, (totalPresentWithOd / totalWorkingDays) * 100).toFixed(1))
      : 0;

  return {
    employee: params.employee,
    dailyCodes,
    totalCalendarDays,
    totalWorkingDays,
    totalPresentDays: Number(totalPresentDays.toFixed(1)),
    totalPresentWithOd,
    totalAbsentDays,
    totalLeaveDays: Number(totalLeaveDays.toFixed(1)),
    medicalLeaveDays,
    onDutyDays,
    firstHalfLeaveDays,
    secondHalfLeaveDays,
    holidayDays,
    weeklyOffDays,
    attendancePercentage,
  };
}

export function exportMonthlyAttendancePdf(params: {
  school: SchoolProfile;
  academicSession: string;
  monthKey: string;
  summaries: MonthlyEmployeeAttendanceSummary[];
  orientation: 'landscape' | 'portrait';
  selectedEmployeeOnly?: boolean;
}) {
  const [yearStr, monthStr] = params.monthKey.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const monthIdx = Math.max(0, Math.min(11, (Number(monthStr) || 1) - 1));
  const daysInMonth = getDaysInMonth(year, monthIdx);
  const monthLabel = `${getMonthName(monthIdx)} ${year}`;

  const doc = new jsPDF({
    orientation: params.orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 9;
  const usableW = pageW - margin * 2;

  const drawHeader = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, 8, usableW, 24, 'F');

    let textOffsetX = margin + 4;
    if (params.school.logoDataUrl && params.school.logoDataUrl.startsWith('data:image/')) {
      try {
        const format = params.school.logoDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(params.school.logoDataUrl, format, margin + 3, 10.5, 18, 18);
        textOffsetX = margin + 24;
      } catch {
        // Ignore logo decode issue
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(params.orientation === 'landscape' ? 13 : 11);
    doc.text((params.school.name || 'SMART DIGITAL SCHOOL').slice(0, 74), textOffsetX, 15.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    const addr = [
      params.school.address,
      params.school.district ? `Dist: ${params.school.district}` : '',
      params.school.code ? `UDISE / School Code: ${params.school.code}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    doc.text(addr.slice(0, 115), textOffsetX, 21);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(253, 230, 138);
    const titleStr = params.selectedEmployeeOnly
      ? `INDIVIDUAL MONTHLY ATTENDANCE REGISTER · ${monthLabel} · Session ${params.academicSession}`
      : `MONTHLY ATTENDANCE REGISTER · ${monthLabel} · Academic Session ${params.academicSession}`;
    doc.text(titleStr, textOffsetX, 27.5);
  };

  drawHeader();

  let y = 36;

  if (params.orientation === 'landscape') {
    // Full consolidated 1..31 grid + totals
    const colSNo = 7;
    const colName = 34;
    const colDesig = 22;
    const colEmpId = 17;
    const summaryColsW = 54; // P, A, L, ML, OD, % (6 * 9mm)
    const datesAreaW = usableW - colSNo - colName - colDesig - colEmpId - summaryColsW;
    const dayColW = datesAreaW / daysInMonth;

    const drawLandscapeTableHeader = () => {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(148, 163, 184);
      doc.rect(margin, y, usableW, 8, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);

      let x = margin;
      doc.text('S#', x + 1, y + 5.2);
      x += colSNo;
      doc.text('Employee Name', x + 1, y + 5.2);
      x += colName;
      doc.text('Designation', x + 1, y + 5.2);
      x += colDesig;
      doc.text('Emp ID', x + 1, y + 5.2);
      x += colEmpId;

      for (let d = 1; d <= daysInMonth; d++) {
        doc.line(x, y, x, y + 8);
        doc.text(String(d), x + dayColW / 2, y + 5.2, { align: 'center' });
        x += dayColW;
      }

      const totalsHeaders = ['Pres', 'Abs', 'Lv', 'ML', 'OD', '%'];
      const sumW = summaryColsW / totalsHeaders.length;
      for (const h of totalsHeaders) {
        doc.line(x, y, x, y + 8);
        doc.text(h, x + sumW / 2, y + 5.2, { align: 'center' });
        x += sumW;
      }
      y += 8;
    };

    drawLandscapeTableHeader();

    params.summaries.forEach((item, idx) => {
      const rowH = 7;
      if (y + rowH > pageH - 42) {
        doc.addPage();
        drawHeader();
        y = 36;
        drawLandscapeTableHeader();
      }

      doc.setDrawColor(203, 213, 225);
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, usableW, rowH, 'FD');
      } else {
        doc.rect(margin, y, usableW, rowH);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(15, 23, 42);

      let x = margin;
      doc.text(String(idx + 1), x + 1.5, y + 4.7);
      x += colSNo;
      doc.text(item.employee.name.slice(0, 22), x + 1, y + 4.7);
      x += colName;
      doc.text(item.employee.designation.slice(0, 14), x + 1, y + 4.7);
      x += colDesig;
      doc.text(item.employee.employeeId.slice(0, 10), x + 1, y + 4.7);
      x += colEmpId;

      for (let d = 1; d <= daysInMonth; d++) {
        doc.line(x, y, x, y + rowH);
        const code = item.dailyCodes[d] || '-';
        if (code === 'A') doc.setTextColor(190, 18, 60);
        else if (code === 'P') doc.setTextColor(4, 120, 87);
        else if (code === 'OD') doc.setTextColor(67, 56, 202);
        else if (code === 'ML') doc.setTextColor(3, 105, 161);
        else doc.setTextColor(71, 85, 105);
        doc.text(code.slice(0, 2), x + dayColW / 2, y + 4.7, { align: 'center' });
        x += dayColW;
      }

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      const vals = [
        String(item.totalPresentDays),
        String(item.totalAbsentDays),
        String(item.totalLeaveDays),
        String(item.medicalLeaveDays),
        String(item.onDutyDays),
        `${item.attendancePercentage}%`,
      ];
      const sumW = summaryColsW / vals.length;
      for (const v of vals) {
        doc.line(x, y, x, y + rowH);
        doc.text(v, x + sumW / 2, y + 4.7, { align: 'center' });
        x += sumW;
      }

      y += rowH;
    });
  } else {
    // Portrait A4: Clean summary table + compact date-wise strip per employee
    const cols = [
      { label: 'S#', w: 8 },
      { label: 'Employee Name & ID', w: 46 },
      { label: 'Designation', w: 30 },
      { label: 'Work', w: 13 },
      { label: 'Pres', w: 14 },
      { label: 'Abs', w: 13 },
      { label: 'Leave', w: 14 },
      { label: 'ML', w: 12 },
      { label: 'OD', w: 12 },
      { label: 'Att %', w: 18 },
    ];

    const drawPortraitTableHeader = () => {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(148, 163, 184);
      doc.rect(margin, y, usableW, 8, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      let x = margin;
      for (const c of cols) {
        doc.text(c.label, x + 1.5, y + 5.3);
        x += c.w;
      }
      y += 8;
    };

    drawPortraitTableHeader();

    params.summaries.forEach((item, idx) => {
      const rowH = 14;
      if (y + rowH > pageH - 46) {
        doc.addPage();
        drawHeader();
        y = 36;
        drawPortraitTableHeader();
      }
      doc.setDrawColor(203, 213, 225);
      doc.rect(margin, y, usableW, rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);

      const vals = [
        String(idx + 1),
        `${item.employee.name.slice(0, 24)} (${item.employee.employeeId})`,
        item.employee.designation.slice(0, 18),
        String(item.totalWorkingDays),
        String(item.totalPresentDays),
        String(item.totalAbsentDays),
        String(item.totalLeaveDays),
        String(item.medicalLeaveDays),
        String(item.onDutyDays),
        `${item.attendancePercentage}%`,
      ];

      let x = margin;
      vals.forEach((v, ci) => {
        if (ci === 9) doc.setFont('helvetica', 'bold');
        doc.text(v, x + 1.5, y + 5.3);
        doc.setFont('helvetica', 'normal');
        x += cols[ci].w;
      });

      // Date-wise compact sequence on row 2
      const dateStrip = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}:${item.dailyCodes[i + 1] || '-'}`).join(' ');
      doc.setFontSize(5.5);
      doc.setTextColor(71, 85, 105);
      doc.text(dateStrip.slice(0, 138), margin + 2, y + 11.2);
      y += rowH;
    });
  }

  // Official Authentication / Signature Block
  if (y + 34 > pageH - 8) {
    doc.addPage();
    drawHeader();
    y = 42;
  } else {
    y += 8;
  }

  doc.setDrawColor(148, 163, 184);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, usableW, 28, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('AUTHENTICATION & OFFICIAL VERIFICATION', margin + 4, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  const colMid = margin + usableW / 2 + 2;
  doc.text('Signature of Concerned Teacher/Employee: ______________________', margin + 4, y + 12.5);
  doc.text('Signature of Attendance In-charge: ______________________', colMid, y + 12.5);
  doc.text('Verified and Attested by Headmaster/Principal: ______________________', margin + 4, y + 19.5);
  doc.text('Official School Stamp: ______________________', colMid, y + 19.5);
  doc.text(`Date: ${new Date().toLocaleDateString()}   __________________`, margin + 4, y + 25.5);

  const legend = 'Legend: P=Present, A=Absent, FH=First Half Leave, SH=Second Half Leave, ML=Medical Leave, OD=On Duty, CL=Casual Leave, EL=Earned Leave, H=Holiday, W=Weekly Off';
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(legend, margin, pageH - 5);

  const slug = `${params.monthKey}_${params.orientation}`;
  doc.save(`Monthly_Attendance_Register_${slug}.pdf`);
}

export function exportMonthlyAttendanceExcel(params: {
  school: SchoolProfile;
  academicSession: string;
  monthKeys: string[];
  employees: DigitalEmployeeProfile[];
  records: DigitalAttendanceRecord[];
  categories: AttendanceCategoryConfig[];
  weeklyOffDay: number;
  adminRemarksByEmployeeMonth: Record<string, string>;
}) {
  const wb = XLSX.utils.book_new();

  for (const monthKey of params.monthKeys) {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr) || new Date().getFullYear();
    const monthIdx = Math.max(0, Math.min(11, (Number(monthStr) || 1) - 1));
    const daysInMonth = getDaysInMonth(year, monthIdx);
    const monthLabel = `${getMonthName(monthIdx)} ${year}`;

    const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));

    const headerRows: Array<Array<string | number>> = [
      [params.school.name || 'SMART DIGITAL SCHOOL ATTENDANCE REGISTER'],
      [
        `Address: ${params.school.address || '-'} | District: ${params.school.district || '-'} | UDISE / School Code: ${
          params.school.code || '-'
        }`,
      ],
      [`Monthly Attendance Register — ${monthLabel} | Academic Session: ${params.academicSession}`],
      [],
      [
        'S.No',
        'Employee ID',
        'Employee Name',
        'Designation',
        'Department',
        ...dayHeaders,
        'Working Days',
        'Present',
        'Absent',
        'Total Leave',
        'Medical Leave (ML)',
        'On Duty (OD)',
        'Attendance %',
        'Administrative Remarks',
      ],
    ];

    const summaries = params.employees.map((emp) =>
      computeMonthlyEmployeeSummary({
        employee: emp,
        monthKey,
        records: params.records,
        categories: params.categories,
        weeklyOffDay: params.weeklyOffDay,
      })
    );

    const dataStartRow1Based = 6; // Row 6 in Excel (1-indexed)
    const firstDayColIdx = 5; // Column F (0-based index 5)
    const lastDayColIdx = firstDayColIdx + daysInMonth - 1;
    const firstDayColLetter = XLSX.utils.encode_col(firstDayColIdx);
    const lastDayColLetter = XLSX.utils.encode_col(lastDayColIdx);

    const dataRows: Array<Array<string | number>> = summaries.map((sum, idx) => {
      const remarkKey = `${sum.employee.employeeId}_${monthKey}`;
      const dayCells = Array.from({ length: daysInMonth }, (_, i) => sum.dailyCodes[i + 1] || '');
      return [
        idx + 1,
        sum.employee.employeeId,
        sum.employee.name,
        sum.employee.designation,
        sum.employee.department,
        ...dayCells,
        sum.totalWorkingDays,
        sum.totalPresentDays,
        sum.totalAbsentDays,
        sum.totalLeaveDays,
        sum.medicalLeaveDays,
        sum.onDutyDays,
        sum.attendancePercentage,
        params.adminRemarksByEmployeeMonth[remarkKey] || '',
      ];
    });

    const footerRows: Array<Array<string | number>> = [
      [],
      ['Legend: P=Present, A=Absent, FH=First Half Leave, SH=Second Half Leave, ML=Medical Leave, OD=On Duty, CL=Casual Leave, EL=Earned Leave, H=Holiday, W=Weekly Off'],
      [],
      ['Signature of Concerned Teacher/Employee: __________________', '', '', '', '', 'Signature of Attendance In-charge: __________________'],
      ['Verified and Attested by Headmaster/Principal: __________________', '', '', '', '', 'Official School Stamp: __________________'],
      [`Date: ${new Date().toLocaleDateString()} __________________`],
    ];

    const aoa = [...headerRows, ...dataRows, ...footerRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Inject real live Excel formulas for Present, Absent, Total Leave, ML, OD, and Attendance %
    const workingColIdx = lastDayColIdx + 1;
    const presentColIdx = lastDayColIdx + 2;
    const absentColIdx = lastDayColIdx + 3;
    const leaveColIdx = lastDayColIdx + 4;
    const mlColIdx = lastDayColIdx + 5;
    const odColIdx = lastDayColIdx + 6;
    const pctColIdx = lastDayColIdx + 7;

    const workingColLetter = XLSX.utils.encode_col(workingColIdx);
    const presentColLetter = XLSX.utils.encode_col(presentColIdx);
    const odColLetter = XLSX.utils.encode_col(odColIdx);

    summaries.forEach((sum, idx) => {
      const r = dataStartRow1Based + idx;
      const range = `${firstDayColLetter}${r}:${lastDayColLetter}${r}`;

      ws[XLSX.utils.encode_cell({ r: r - 1, c: presentColIdx })] = {
        t: 'n',
        v: sum.totalPresentDays,
        f: `COUNTIF(${range},"P")+0.5*COUNTIF(${range},"FH")+0.5*COUNTIF(${range},"SH")`,
      };
      ws[XLSX.utils.encode_cell({ r: r - 1, c: absentColIdx })] = {
        t: 'n',
        v: sum.totalAbsentDays,
        f: `COUNTIF(${range},"A")`,
      };
      ws[XLSX.utils.encode_cell({ r: r - 1, c: leaveColIdx })] = {
        t: 'n',
        v: sum.totalLeaveDays,
        f: `COUNTIF(${range},"CL")+COUNTIF(${range},"EL")+COUNTIF(${range},"ML")+0.5*COUNTIF(${range},"FH")+0.5*COUNTIF(${range},"SH")`,
      };
      ws[XLSX.utils.encode_cell({ r: r - 1, c: mlColIdx })] = {
        t: 'n',
        v: sum.medicalLeaveDays,
        f: `COUNTIF(${range},"ML")`,
      };
      ws[XLSX.utils.encode_cell({ r: r - 1, c: odColIdx })] = {
        t: 'n',
        v: sum.onDutyDays,
        f: `COUNTIF(${range},"OD")`,
      };
      ws[XLSX.utils.encode_cell({ r: r - 1, c: pctColIdx })] = {
        t: 'n',
        v: sum.attendancePercentage,
        f: `IF(${workingColLetter}${r}>0,ROUND(MIN(100,(${presentColLetter}${r}+${odColLetter}${r})/${workingColLetter}${r}*100),1),0)`,
      };
    });

    // Clean column widths for print-ready layout
    ws['!cols'] = [
      { wch: 6 },
      { wch: 13 },
      { wch: 24 },
      { wch: 18 },
      { wch: 15 },
      ...Array.from({ length: daysInMonth }, () => ({ wch: 4 })),
      { wch: 12 },
      { wch: 9 },
      { wch: 9 },
      { wch: 11 },
      { wch: 14 },
      { wch: 12 },
      { wch: 13 },
      { wch: 26 },
    ];

    const safeSheetName = monthLabel.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  }

  const label = params.monthKeys.length === 1 ? params.monthKeys[0] : `${params.academicSession}_All_Months`;
  XLSX.writeFile(wb, `School_Attendance_Register_${label}.xlsx`);
}
