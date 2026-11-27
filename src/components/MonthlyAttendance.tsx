import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  CalendarDays,
  FileSpreadsheet,
  Printer,
  Download,
  UserCheck,
  Layers,
  FileText,
  X,
  CheckCircle2,
  BarChart3,
  Table as TableIcon,
  ChevronDown,
} from 'lucide-react';
import { AttendanceRecord, AttendanceStatus, SchoolProfile, Student } from '../types';
import { Language, translations } from '../utils/translations';
import {
  calculateAttendancePercentage,
  deduplicateStudentsByAdmissionNumber,
  formatSchoolAddressOnce,
  getMonthlyWorkingDays,
} from '../utils/calculations';
import {
  exportAttendanceStatisticsCsv,
  exportBatchMonthlyClassCsv,
  exportBatchMonthlyClassPdf,
  exportMonthlyAttendanceToExcel,
} from '../utils/excelExport';
import { guardSensitiveExport } from '../utils/biometricProtection';

interface MonthlyAttendanceProps {
  students: Student[];
  school: SchoolProfile;
  attendanceRecords: AttendanceRecord[];
  language: Language;
}

type HeatmapCellData = {
  dateStr: string;
  dayOfMonth: number;
  weekdayIndexMon0: number; // 0=Mon .. 6=Sun
  weekdayLabel: string;
  weekRow: number;
  status: AttendanceStatus | 'Holiday' | 'Unrecorded';
  holidayName?: string;
};

type ClassAttendanceChartRow = {
  classNumber: string;
  classLabel: string;
  studentCount: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  expectedDays: number;
  attendancePct: number;
};

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
  const [activeView, setActiveView] = useState<'register' | 'charts'>('register');
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [isExportingMonthlyPdf, setIsExportingMonthlyPdf] = useState<boolean>(false);
  const [selectedHeatmapStudentId, setSelectedHeatmapStudentId] = useState<string>('');
  const [hoveredHeatmapCell, setHoveredHeatmapCell] = useState<HeatmapCellData | null>(null);
  const [showBatchExportModal, setShowBatchExportModal] = useState<boolean>(false);
  const [batchClassNumber, setBatchClassNumber] = useState<string>('5');
  const [batchSectionScope, setBatchSectionScope] = useState<'all' | string>('all');
  const [batchMonthIndex, setBatchMonthIndex] = useState<number>(9);
  const [batchYear, setBatchYear] = useState<number>(2026);
  const [batchExportStatus, setBatchExportStatus] = useState<string | null>(null);
  const [isExportingBatchPdf, setIsExportingBatchPdf] = useState<boolean>(false);
  const [trendScope, setTrendScope] = useState<'class' | 'school'>('class');
  const [hoveredTrendPoint, setHoveredTrendPoint] = useState<{
    dateStr: string;
    shortLabel: string;
    weekday: string;
    attendancePct: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    leaveCount: number;
    totalStudents: number;
    hasRecords: boolean;
  } | null>(null);

  const d3HeatmapSvgRef = useRef<SVGSVGElement | null>(null);
  const d3TrendSvgRef = useRef<SVGSVGElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showExportMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showExportMenu]);

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
  const uniqueStudents = useMemo(
    () => deduplicateStudentsByAdmissionNumber(students),
    [students]
  );

  // Class-wise attendance percentage dataset for the Recharts BarChart ('Charts' view)
  const classAttendanceChartData = useMemo<ClassAttendanceChartRow[]>(() => {
    const workingDateSet = new Set(dates.filter((d) => !d.isHoliday).map((d) => d.dateStr));
    const orderedClasses = Array.from(
      new Set([
        ...school.classesOffered,
        ...uniqueStudents.filter((s) => s.status === 'Active').map((s) => s.classNumber),
      ])
    ).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    // Index attendance records for working dates of the selected month
    const monthRecordsByStudent = new Map<string, AttendanceRecord[]>();
    for (const rec of attendanceRecords) {
      if (!workingDateSet.has(rec.date)) continue;
      const list = monthRecordsByStudent.get(rec.studentId);
      if (list) list.push(rec);
      else monthRecordsByStudent.set(rec.studentId, [rec]);
    }

    return orderedClasses.map((classNum) => {
      const activeInClass = uniqueStudents.filter(
        (s) => s.status === 'Active' && s.classNumber === classNum
      );
      let presentDays = 0;
      let absentDays = 0;
      let leaveDays = 0;

      for (const st of activeInClass) {
        const recs = monthRecordsByStudent.get(st.id) || [];
        for (const r of recs) {
          if (r.status === 'Present' || r.status === 'Late') presentDays += 1;
          else if (r.status === 'Absent') absentDays += 1;
          else if (r.status === 'Approved_Leave') leaveDays += 1;
        }
      }

      const expectedDays = activeInClass.length * workingDays;
      const attendancePct =
        expectedDays > 0 ? calculateAttendancePercentage(presentDays, expectedDays) : 0;

      return {
        classNumber: classNum,
        classLabel: `Class ${classNum}`,
        studentCount: activeInClass.length,
        presentDays,
        absentDays,
        leaveDays,
        expectedDays,
        attendancePct,
      };
    });
  }, [school.classesOffered, uniqueStudents, attendanceRecords, dates, workingDays]);

  const schoolWideChartSummary = useMemo(() => {
    const populatedClasses = classAttendanceChartData.filter((c) => c.studentCount > 0);
    const totalStudents = populatedClasses.reduce((sum, c) => sum + c.studentCount, 0);
    const totalPresent = populatedClasses.reduce((sum, c) => sum + c.presentDays, 0);
    const totalExpected = populatedClasses.reduce((sum, c) => sum + c.expectedDays, 0);
    const overallPct =
      totalExpected > 0 ? calculateAttendancePercentage(totalPresent, totalExpected) : 0;
    const aboveThresholdCount = populatedClasses.filter((c) => c.attendancePct >= 75).length;
    const highestClass = populatedClasses.reduce<ClassAttendanceChartRow | null>(
      (best, cur) => (!best || cur.attendancePct > best.attendancePct ? cur : best),
      null
    );
    return {
      totalStudents,
      overallPct,
      aboveThresholdCount,
      populatedCount: populatedClasses.length,
      highestClass,
    };
  }, [classAttendanceChartData]);

  const classStudents = useMemo(
    () =>
      uniqueStudents
        .filter(
          (s) =>
            s.classNumber === selectedClass &&
            s.section === selectedSection &&
            s.status === 'Active'
        )
        .sort((a, b) => a.rollNumber - b.rollNumber),
    [uniqueStudents, selectedClass, selectedSection]
  );

  // Sync selected student for the D3 heatmap when class/section changes
  useEffect(() => {
    if (classStudents.length === 0) {
      setSelectedHeatmapStudentId('');
      return;
    }
    const stillExists = classStudents.some((s) => s.id === selectedHeatmapStudentId);
    if (!stillExists) {
      setSelectedHeatmapStudentId(classStudents[0].id);
    }
  }, [classStudents, selectedHeatmapStudentId]);

  const heatmapStudent = useMemo(
    () => classStudents.find((s) => s.id === selectedHeatmapStudentId) || classStudents[0] || null,
    [classStudents, selectedHeatmapStudentId]
  );

  // Build individual student calendar cells & monthly metrics for D3 heatmap
  const studentHeatmapData = useMemo(() => {
    if (!heatmapStudent) {
      return {
        cells: [] as HeatmapCellData[],
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
        monthPct: 0,
        longestPresentStreak: 0,
        weeksCount: 5,
      };
    }

    const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1).getDay(); // 0=Sun..6=Sat
    const firstMon0 = (firstDayOfMonth + 6) % 7;

    let present = 0;
    let late = 0;
    let absent = 0;
    let leave = 0;
    let streak = 0;
    let longestPresentStreak = 0;

    const cells: HeatmapCellData[] = dates.map((d) => {
      const dt = new Date(`${d.dateStr}T00:00:00`);
      const mon0 = (dt.getDay() + 6) % 7;
      const weekRow = Math.floor((firstMon0 + d.dayOfMonth - 1) / 7);
      const weekdayLabel = dt.toLocaleDateString('en-IN', { weekday: 'short' });

      if (d.isHoliday) {
        return {
          dateStr: d.dateStr,
          dayOfMonth: d.dayOfMonth,
          weekdayIndexMon0: mon0,
          weekdayLabel,
          weekRow,
          status: 'Holiday',
          holidayName: d.holidayName,
        };
      }

      const rec = attendanceRecords.find(
        (r) => r.studentId === heatmapStudent.id && r.date === d.dateStr
      );
      const status: AttendanceStatus | 'Unrecorded' = rec ? rec.status : 'Unrecorded';

      if (status === 'Present') {
        present += 1;
        streak += 1;
        if (streak > longestPresentStreak) longestPresentStreak = streak;
      } else if (status === 'Late') {
        late += 1;
        streak += 1;
        if (streak > longestPresentStreak) longestPresentStreak = streak;
      } else if (status === 'Absent') {
        absent += 1;
        streak = 0;
      } else if (status === 'Approved_Leave') {
        leave += 1;
        streak = 0;
      }

      return {
        dateStr: d.dateStr,
        dayOfMonth: d.dayOfMonth,
        weekdayIndexMon0: mon0,
        weekdayLabel,
        weekRow,
        status,
      };
    });

    const weeksCount =
      cells.length > 0 ? Math.max(...cells.map((c) => c.weekRow)) + 1 : 5;
    const monthPct = calculateAttendancePercentage(present + late, workingDays);

    return {
      cells,
      present,
      late,
      absent,
      leave,
      monthPct,
      longestPresentStreak,
      weeksCount,
    };
  }, [heatmapStudent, selectedYear, selectedMonth, dates, attendanceRecords, workingDays]);

  // Render Individual Student Monthly Attendance Heatmap via D3
  useEffect(() => {
    if (activeView !== 'register') return;
    const svgEl = d3HeatmapSvgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const { cells, weeksCount } = studentHeatmapData;
    if (cells.length === 0) return;

    const cellW = 74;
    const cellH = 44;
    const cellGap = 6;
    const margin = { top: 28, right: 16, bottom: 12, left: 66 };
    const width = margin.left + 7 * (cellW + cellGap) - cellGap + margin.right;
    const height = margin.top + weeksCount * (cellH + cellGap) - cellGap + margin.bottom;

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', 'Individual student monthly attendance D3 heatmap');

    const root = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

    const weekdayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    root
      .selectAll('text.weekday-header')
      .data(weekdayHeaders)
      .enter()
      .append('text')
      .attr('class', 'weekday-header')
      .attr('x', (_d, idx) => idx * (cellW + cellGap) + cellW / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#475569')
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .text((d) => d);

    const weekIndices = d3.range(weeksCount);
    root
      .selectAll('text.week-label')
      .data(weekIndices)
      .enter()
      .append('text')
      .attr('class', 'week-label')
      .attr('x', -12)
      .attr('y', (w) => w * (cellH + cellGap) + cellH / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('fill', '#64748B')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .text((w) => `Week ${w + 1}`);

    const statusColorScale = d3
      .scaleOrdinal<string, string>()
      .domain(['Present', 'Late', 'Absent', 'Approved_Leave', 'Holiday', 'Unrecorded'])
      .range(['#10B981', '#F59E0B', '#F43F5E', '#3B82F6', '#E2E8F0', '#F8FAFC']);

    const statusTextColor = (status: HeatmapCellData['status']): string => {
      if (status === 'Present' || status === 'Absent' || status === 'Approved_Leave') return '#FFFFFF';
      if (status === 'Late') return '#0F172A';
      if (status === 'Holiday') return '#64748B';
      return '#94A3B8';
    };

    const statusShortCode = (status: HeatmapCellData['status']): string => {
      if (status === 'Present') return 'P';
      if (status === 'Late') return 'L';
      if (status === 'Absent') return 'A';
      if (status === 'Approved_Leave') return 'AL';
      if (status === 'Holiday') return 'H';
      return '—';
    };

    const cellGroups = root
      .selectAll<SVGGElement, HeatmapCellData>('g.heatmap-day')
      .data(cells, (d) => d.dateStr)
      .enter()
      .append('g')
      .attr('class', 'heatmap-day')
      .attr(
        'transform',
        (d) =>
          `translate(${d.weekdayIndexMon0 * (cellW + cellGap)}, ${d.weekRow * (cellH + cellGap)})`
      )
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => setHoveredHeatmapCell(d))
      .on('click', (_event, d) => setHoveredHeatmapCell(d));

    cellGroups
      .append('rect')
      .attr('width', cellW)
      .attr('height', cellH)
      .attr('rx', 8)
      .attr('fill', (d) => statusColorScale(d.status))
      .attr('stroke', (d) => (d.status === 'Unrecorded' ? '#CBD5E1' : 'rgba(15, 23, 42, 0.08)'))
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', (d) => (d.status === 'Unrecorded' ? '3 2' : null));

    cellGroups
      .append('text')
      .attr('x', 8)
      .attr('y', 16)
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('fill', (d) => statusTextColor(d.status))
      .attr('opacity', 0.9)
      .text((d) => String(d.dayOfMonth).padStart(2, '0'));

    cellGroups
      .append('text')
      .attr('x', cellW - 8)
      .attr('y', cellH - 10)
      .attr('text-anchor', 'end')
      .attr('font-size', '12px')
      .attr('font-weight', '800')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('fill', (d) => statusTextColor(d.status))
      .text((d) => statusShortCode(d.status));
  }, [studentHeatmapData, activeView]);

  // 7-Day Attendance Trend Data (D3.js Line Chart)
  const sevenDayTrendData = useMemo(() => {
    const scopeStudents =
      trendScope === 'school'
        ? uniqueStudents.filter((s) => s.status === 'Active')
        : classStudents;
    const scopeIds = new Set(scopeStudents.map((s) => s.id));
    const totalStudents = scopeStudents.length;

    const workingDates = dates.filter((d) => !d.isHoliday);
    if (workingDates.length === 0) return [];

    // Find latest working day in selected month that has at least one recorded attendance entry
    let lastRecordedIdx = -1;
    for (let i = workingDates.length - 1; i >= 0; i--) {
      const ds = workingDates[i].dateStr;
      if (attendanceRecords.some((r) => r.date === ds && scopeIds.has(r.studentId))) {
        lastRecordedIdx = i;
        break;
      }
    }

    const endIdx = lastRecordedIdx >= 0 ? lastRecordedIdx : workingDates.length - 1;
    const startIdx = Math.max(0, endIdx - 6);
    const windowDays = workingDates.slice(startIdx, endIdx + 1);
    const shortMonth = months[selectedMonth].name.slice(0, 3);
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return windowDays.map((day) => {
      const dayRecs = attendanceRecords.filter(
        (r) => r.date === day.dateStr && scopeIds.has(r.studentId)
      );
      let presentCount = 0;
      let lateCount = 0;
      let absentCount = 0;
      let leaveCount = 0;
      dayRecs.forEach((r) => {
        if (r.status === 'Present') presentCount++;
        else if (r.status === 'Late') lateCount++;
        else if (r.status === 'Absent') absentCount++;
        else if (r.status === 'Approved_Leave') leaveCount++;
      });

      const hasRecords = dayRecs.length > 0;
      const denom = totalStudents > 0 ? totalStudents : dayRecs.length;
      const attendancePct =
        denom > 0 && hasRecords
          ? Math.round(((presentCount + lateCount) / denom) * 1000) / 10
          : 0;
      const dt = new Date(selectedYear, selectedMonth, day.dayOfMonth);
      return {
        dateStr: day.dateStr,
        shortLabel: `${shortMonth} ${String(day.dayOfMonth).padStart(2, '0')}`,
        weekday: weekdayNames[dt.getDay()],
        attendancePct,
        presentCount,
        lateCount,
        absentCount,
        leaveCount,
        totalStudents,
        hasRecords,
      };
    });
  }, [trendScope, uniqueStudents, classStudents, dates, attendanceRecords, selectedMonth, selectedYear]);

  const sevenDayTrendSummary = useMemo(() => {
    const recorded = sevenDayTrendData.filter((d) => d.hasRecords);
    const avgPct =
      recorded.length > 0
        ? Math.round((recorded.reduce((sum, d) => sum + d.attendancePct, 0) / recorded.length) * 10) / 10
        : 0;
    const deltaPct =
      recorded.length >= 2
        ? Math.round((recorded[recorded.length - 1].attendancePct - recorded[0].attendancePct) * 10) / 10
        : 0;
    return { avgPct, deltaPct, recordedDays: recorded.length };
  }, [sevenDayTrendData]);

  // Render D3.js 7-Day Attendance Trend Line Chart
  useEffect(() => {
    const svgEl = d3TrendSvgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (sevenDayTrendData.length === 0) return;

    const width = 760;
    const height = 240;
    const margin = { top: 20, right: 28, bottom: 38, left: 48 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', '7-day student attendance percentage trend D3 line chart');

    const defs = svg.append('defs');
    const areaGradient = defs
      .append('linearGradient')
      .attr('id', 'sm-7day-trend-area-grad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    areaGradient.append('stop').attr('offset', '0%').attr('stop-color', '#4F46E5').attr('stop-opacity', 0.28);
    areaGradient.append('stop').attr('offset', '100%').attr('stop-color', '#4F46E5').attr('stop-opacity', 0.02);

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

    const xScale = d3
      .scalePoint<string>()
      .domain(sevenDayTrendData.map((d) => d.shortLabel))
      .range([0, innerW])
      .padding(0.25);

    const yScale = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

    // Horizontal grid lines
    const yTicks = [0, 25, 50, 75, 100];
    g.selectAll('line.y-grid')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('class', 'y-grid')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (tVal) => yScale(tVal))
      .attr('y2', (tVal) => yScale(tVal))
      .attr('stroke', '#E2E8F0')
      .attr('stroke-dasharray', (tVal) => (tVal === 0 ? null : '3 3'))
      .attr('stroke-width', 1);

    // 75% RTE Benchmark Reference Line
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', yScale(75))
      .attr('y2', yScale(75))
      .attr('stroke', '#F59E0B')
      .attr('stroke-width', 1.75)
      .attr('stroke-dasharray', '6 4');

    g.append('text')
      .attr('x', innerW - 4)
      .attr('y', yScale(75) - 6)
      .attr('text-anchor', 'end')
      .attr('fill', '#B45309')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .text('75% RTE Target');

    // Y-Axis labels
    g.selectAll('text.y-tick')
      .data(yTicks)
      .enter()
      .append('text')
      .attr('class', 'y-tick')
      .attr('x', -10)
      .attr('y', (tVal) => yScale(tVal) + 4)
      .attr('text-anchor', 'end')
      .attr('fill', '#64748B')
      .attr('font-size', '10.5px')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .text((tVal) => `${tVal}%`);

    // X-Axis labels (Date + Weekday)
    const xGroups = g
      .selectAll('g.x-tick')
      .data(sevenDayTrendData)
      .enter()
      .append('g')
      .attr('class', 'x-tick')
      .attr('transform', (d) => `translate(${xScale(d.shortLabel) ?? 0}, ${innerH + 16})`);

    xGroups
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('fill', '#334155')
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .text((d) => d.shortLabel);

    xGroups
      .append('text')
      .attr('y', 14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94A3B8')
      .attr('font-size', '10px')
      .text((d) => d.weekday);

    // Area under the 7-day trend curve
    const areaGen = d3
      .area<(typeof sevenDayTrendData)[number]>()
      .x((d) => xScale(d.shortLabel) ?? 0)
      .y0(innerH)
      .y1((d) => yScale(d.attendancePct))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(sevenDayTrendData)
      .attr('fill', 'url(#sm-7day-trend-area-grad)')
      .attr('d', areaGen);

    // Smooth D3 Line path
    const lineGen = d3
      .line<(typeof sevenDayTrendData)[number]>()
      .x((d) => xScale(d.shortLabel) ?? 0)
      .y((d) => yScale(d.attendancePct))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(sevenDayTrendData)
      .attr('fill', 'none')
      .attr('stroke', '#4F46E5')
      .attr('stroke-width', 2.8)
      .attr('stroke-linecap', 'round')
      .attr('d', lineGen);

    // Interactive Data Nodes + Value Labels
    const pointGroups = g
      .selectAll('g.trend-point')
      .data(sevenDayTrendData)
      .enter()
      .append('g')
      .attr('class', 'trend-point')
      .attr('transform', (d) => `translate(${xScale(d.shortLabel) ?? 0}, ${yScale(d.attendancePct)})`)
      .style('cursor', 'pointer')
      .on('mouseenter', (_ev, d) => setHoveredTrendPoint(d))
      .on('click', (_ev, d) => setHoveredTrendPoint(d));

    pointGroups
      .append('circle')
      .attr('r', 6)
      .attr('fill', (d) =>
        !d.hasRecords
          ? '#CBD5E1'
          : d.attendancePct >= 85
          ? '#10B981'
          : d.attendancePct >= 75
          ? '#4F46E5'
          : '#F43F5E'
      )
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 2.2);

    pointGroups
      .append('text')
      .attr('y', -11)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10.5px')
      .attr('font-weight', '800')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('fill', (d) =>
        !d.hasRecords
          ? '#94A3B8'
          : d.attendancePct >= 85
          ? '#047857'
          : d.attendancePct >= 75
          ? '#3730A3'
          : '#BE123C'
      )
      .text((d) => (d.hasRecords ? `${d.attendancePct}%` : '—'));
  }, [sevenDayTrendData, activeView]);

  // Month name display
  const currentMonthName = language === 'ur' ? months[selectedMonth].nameUrdu : months[selectedMonth].name;

  const handleExportMonthlySummary = async (format: 'pdf' | 'csv', scope: 'section' | 'class') => {
    const allowed = await guardSensitiveExport(
      `Export Monthly Attendance (${format.toUpperCase()} — ${months[selectedMonth].name} ${selectedYear})`
    );
    if (!allowed) return;
    setShowExportMenu(false);

    if (format === 'pdf') {
      setIsExportingMonthlyPdf(true);
      try {
        const res = await exportBatchMonthlyClassPdf({
          students: uniqueStudents,
          records: attendanceRecords,
          school,
          classNumber: selectedClass,
          sectionScope: scope === 'class' ? 'all' : selectedSection,
          monthName: months[selectedMonth].name,
          year: selectedYear,
          daysList: dates,
          workingDaysTotal: workingDays,
        });
        setBatchExportStatus(
          `Monthly Attendance PDF exported (${res.filename}) for ${res.studentCount} student(s) in ${months[selectedMonth].name} ${selectedYear}.`
        );
      } finally {
        setIsExportingMonthlyPdf(false);
      }
      return;
    }

    const res = exportBatchMonthlyClassCsv({
      students: uniqueStudents,
      records: attendanceRecords,
      school,
      classNumber: selectedClass,
      sectionScope: scope === 'class' ? 'all' : selectedSection,
      monthName: months[selectedMonth].name,
      year: selectedYear,
      daysList: dates,
      workingDaysTotal: workingDays,
    });
    setBatchExportStatus(
      `Monthly Attendance CSV exported (${res.filename}) for ${res.studentCount} student(s) in ${months[selectedMonth].name} ${selectedYear}.`
    );
  };

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
              : 'Monthly Student Attendance Statement Register (RTE Compliant). Grid matrix of dates, class charts, and formatted exports.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export Monthly Attendance (PDF / CSV Summary) */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              data-testid="export-monthly-attendance-btn"
              disabled={isExportingMonthlyPdf}
              onClick={() => setShowExportMenu((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{isExportingMonthlyPdf ? 'Exporting PDF...' : 'Export Monthly Attendance'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
            </button>

            {showExportMenu && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-72 rounded-2xl bg-white border border-slate-200 shadow-xl z-40 p-2 space-y-1 text-xs"
              >
                <div className="px-2.5 py-1.5 border-b border-slate-100">
                  <p className="font-extrabold text-slate-900">
                    {months[selectedMonth].name} {selectedYear} Summary
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Choose PDF or CSV for Class {selectedClass}
                  </p>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="export-monthly-pdf-btn"
                  onClick={() => handleExportMonthlySummary('pdf', 'section')}
                  className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-indigo-50 text-slate-800 flex items-center gap-2.5 transition-colors"
                >
                  <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <div className="font-bold">Formatted PDF (Class {selectedClass}-{selectedSection})</div>
                    <div className="text-[10px] text-slate-500">Printable monthly student summary PDF</div>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="export-monthly-pdf-all-btn"
                  onClick={() => handleExportMonthlySummary('pdf', 'class')}
                  className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-indigo-50 text-slate-800 flex items-center gap-2.5 transition-colors"
                >
                  <FileText className="w-4 h-4 text-indigo-700 shrink-0" />
                  <div>
                    <div className="font-bold">Formatted PDF (All Sections — Class {selectedClass})</div>
                    <div className="text-[10px] text-slate-500">Combined multi-section class report</div>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="export-monthly-csv-btn"
                  onClick={() => handleExportMonthlySummary('csv', 'section')}
                  className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-emerald-50 text-slate-800 flex items-center gap-2.5 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-bold">Formatted CSV (Class {selectedClass}-{selectedSection})</div>
                    <div className="text-[10px] text-slate-500">Spreadsheet-ready student attendance table</div>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="export-monthly-csv-all-btn"
                  onClick={() => handleExportMonthlySummary('csv', 'class')}
                  className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-emerald-50 text-slate-800 flex items-center gap-2.5 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div>
                    <div className="font-bold">Formatted CSV (All Sections — Class {selectedClass})</div>
                    <div className="text-[10px] text-slate-500">All sections consolidated CSV summary</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setBatchClassNumber(selectedClass);
              setBatchSectionScope('all');
              setBatchMonthIndex(selectedMonth);
              setBatchYear(selectedYear);
              setBatchExportStatus(null);
              setShowBatchExportModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap shrink-0"
          >
            <Layers className="w-4 h-4" />
            <span>Batch Export</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              const allowed = await guardSensitiveExport('Export Attendance Statistics CSV');
              if (!allowed) return;
              exportAttendanceStatisticsCsv({
                students: uniqueStudents,
                records: attendanceRecords,
                school,
                classNumber: selectedClass,
                section: selectedSection,
                monthName: months[selectedMonth].name,
                year: selectedYear,
                daysList: dates,
                workingDaysTotal: workingDays,
              });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Export Attendance Statistics</span>
          </button>

          <button
            onClick={async () => {
              const allowed = await guardSensitiveExport('Export Monthly Attendance Excel');
              if (!allowed) return;
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
              );
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition-colors shadow-sm whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>{t.exportExcel}</span>
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors shadow-sm whitespace-nowrap shrink-0"
          >
            <Printer className="w-4 h-4 text-indigo-600" />
            <span>{t.exportPdf}</span>
          </button>
        </div>
      </div>

      {batchExportStatus && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-3 no-print"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{batchExportStatus}</span>
          </span>
          <button
            type="button"
            onClick={() => setBatchExportStatus(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Selector Bar + Register / Charts View Toggle */}
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

        {/* View Mode Switcher + Legend */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Monthly attendance view mode"
            className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'register'}
              data-testid="monthly-view-register-btn"
              onClick={() => setActiveView('register')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                activeView === 'register'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Register</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'charts'}
              data-testid="monthly-view-charts-btn"
              onClick={() => setActiveView('charts')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                activeView === 'charts'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Charts</span>
            </button>
          </div>

          {activeView === 'register' && (
            <div className="flex items-center gap-3 text-[11px] text-slate-600 font-medium">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> P = Present</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> L = Late</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> A = Absent</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> AL = Leave</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> H = Holiday</span>
            </div>
          )}
        </div>
      </div>

      {/* D3.js 7-Day Student Attendance Percentage Trend Line Chart */}
      <section
        aria-label="7-Day Student Attendance Trend D3 Line Chart"
        data-testid="d3-7day-attendance-trend-chart"
        className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3 no-print"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <span>7-Day Attendance Percentage Trend (D3.js)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {trendScope === 'class'
                ? `Class ${selectedClass}-${selectedSection} daily classroom participation across the last 7 working days (${currentMonthName} ${selectedYear})`
                : `School-wide daily participation across the last 7 working days (${currentMonthName} ${selectedYear})`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => {
                  setTrendScope('class');
                  setHoveredTrendPoint(null);
                }}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  trendScope === 'class' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Class {selectedClass}-{selectedSection}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrendScope('school');
                  setHoveredTrendPoint(null);
                }}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  trendScope === 'school' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                All School
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <span className="text-slate-500">7d Avg:</span>
              <strong className={sevenDayTrendSummary.avgPct >= 75 ? 'text-emerald-700' : 'text-rose-600'}>
                {sevenDayTrendSummary.avgPct}%
              </strong>
              <span aria-hidden="true" className="text-slate-300">|</span>
              <span className="text-slate-500">Trend:</span>
              <strong
                className={
                  sevenDayTrendSummary.deltaPct > 0
                    ? 'text-emerald-700'
                    : sevenDayTrendSummary.deltaPct < 0
                    ? 'text-rose-600'
                    : 'text-slate-700'
                }
              >
                {sevenDayTrendSummary.deltaPct > 0 ? `+${sevenDayTrendSummary.deltaPct}%` : `${sevenDayTrendSummary.deltaPct}%`}
              </strong>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <svg ref={d3TrendSvgRef} className="w-full min-w-[540px] h-auto block" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="text-slate-600">
            {hoveredTrendPoint ? (
              <span>
                <strong>
                  {hoveredTrendPoint.shortLabel} ({hoveredTrendPoint.weekday})
                </strong>
                <span className="mx-1.5">·</span>
                <span className="font-mono font-bold text-indigo-700">
                  {hoveredTrendPoint.hasRecords ? `${hoveredTrendPoint.attendancePct}%` : 'No records logged'}
                </span>
                {hoveredTrendPoint.hasRecords && (
                  <>
                    <span className="mx-1.5">·</span>
                    <span className="font-mono text-[11px]">
                      Present: {hoveredTrendPoint.presentCount} · Late: {hoveredTrendPoint.lateCount} · Absent:{' '}
                      {hoveredTrendPoint.absentCount} · Leave: {hoveredTrendPoint.leaveCount} (of {hoveredTrendPoint.totalStudents})
                    </span>
                  </>
                )}
              </span>
            ) : (
              <span className="text-slate-400">
                Hover or tap any day node on the D3.js trend line above to inspect daily attendance counts.
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> ≥ 85%</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" /> 75–84%</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> &lt; 75%</span>
          </div>
        </div>
      </section>

      {/* Charts View: Recharts Class-Wise Attendance Percentage Bar Chart */}
      {activeView === 'charts' && (
        <section
          aria-label="Class-wise Monthly Attendance Percentage Charts"
          data-testid="monthly-attendance-charts-view"
          className="space-y-5"
        >
          {/* Compact KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                School-Wide Monthly Avg
              </div>
              <div
                className={`text-2xl font-extrabold font-mono tabular-nums ${
                  schoolWideChartSummary.overallPct >= 75 ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {schoolWideChartSummary.overallPct}%
              </div>
              <div className="text-[11px] text-slate-500">
                {currentMonthName} {selectedYear} · {workingDays} working days
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Active Students Tracked
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900">
                {schoolWideChartSummary.totalStudents}
              </div>
              <div className="text-[11px] text-slate-500">
                Across {schoolWideChartSummary.populatedCount} active class(es)
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Classes Meeting 75% RTE
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-indigo-700">
                {schoolWideChartSummary.aboveThresholdCount}/{schoolWideChartSummary.populatedCount}
              </div>
              <div className="text-[11px] text-slate-500">Target benchmark: ≥ 75%</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Top Performing Class
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-emerald-700">
                {schoolWideChartSummary.highestClass
                  ? `${schoolWideChartSummary.highestClass.classLabel}`
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-500">
                {schoolWideChartSummary.highestClass
                  ? `${schoolWideChartSummary.highestClass.attendancePct}% monthly attendance`
                  : 'No active enrollments'}
              </div>
            </div>
          </div>

          {/* Recharts Bar Chart Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  <span>Attendance Percentage by Class — {currentMonthName} {selectedYear}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Interactive Recharts comparison across all school classes with 75% RTE compliance reference line
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> ≥ 85% Excellent
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> 75–84% On Track
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> &lt; 75% Attention
                </span>
              </div>
            </div>

            {classAttendanceChartData.length === 0 ? (
              <p className="text-xs text-slate-400 py-12 text-center">
                No classes configured for chart analysis.
              </p>
            ) : (
              <div className="w-full h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={classAttendanceChartData}
                    margin={{ top: 16, right: 24, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="classLabel"
                      tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                      axisLine={{ stroke: '#CBD5E1' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'ui-monospace, monospace' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const row = payload[0].payload as ClassAttendanceChartRow;
                        return (
                          <div className="bg-slate-900 text-white rounded-xl px-3.5 py-2.5 shadow-xl text-xs space-y-1 border border-slate-700">
                            <div className="font-extrabold text-white">{row.classLabel}</div>
                            <div className="font-mono text-emerald-300 font-bold">
                              Attendance: {row.attendancePct}%
                            </div>
                            <div className="text-[11px] text-slate-300 font-mono">
                              Students: {row.studentCount} · Present-Days: {row.presentDays}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              Absent: {row.absentDays} · Leave: {row.leaveDays}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      y={75}
                      stroke="#F59E0B"
                      strokeDasharray="5 4"
                      strokeWidth={2}
                      label={{
                        value: '75% RTE Min',
                        position: 'insideTopRight',
                        fill: '#B45309',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    />
                    <Bar dataKey="attendancePct" name="Attendance %" radius={[8, 8, 0, 0]} maxBarSize={52}>
                      {classAttendanceChartData.map((entry) => (
                        <Cell
                          key={entry.classNumber}
                          fill={
                            entry.studentCount === 0
                              ? '#CBD5E1'
                              : entry.attendancePct >= 85
                              ? '#10B981'
                              : entry.attendancePct >= 75
                              ? '#4F46E5'
                              : '#F43F5E'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Class-Wise Breakdown Table */}
            <div className="overflow-x-auto pt-2 border-t border-slate-100">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
                    <th className="py-2.5 px-3 font-bold">Class</th>
                    <th className="py-2.5 px-3 font-bold text-right">Active Students</th>
                    <th className="py-2.5 px-3 font-bold text-right">Present / Late Days</th>
                    <th className="py-2.5 px-3 font-bold text-right">Absent Days</th>
                    <th className="py-2.5 px-3 font-bold text-right">Leave Days</th>
                    <th className="py-2.5 px-3 font-bold text-right">Monthly %</th>
                    <th className="py-2.5 px-3 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classAttendanceChartData.map((row) => (
                    <tr key={row.classNumber} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.classLabel}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">{row.studentCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">{row.presentDays}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-600 font-semibold">{row.absentDays}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-700 font-semibold">{row.leaveDays}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-extrabold">
                        <span
                          className={
                            row.studentCount === 0
                              ? 'text-slate-400'
                              : row.attendancePct >= 85
                              ? 'text-emerald-700'
                              : row.attendancePct >= 75
                              ? 'text-indigo-700'
                              : 'text-rose-600'
                          }
                        >
                          {row.attendancePct}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClass(row.classNumber);
                            setActiveView('register');
                          }}
                          className="text-indigo-600 hover:text-indigo-800 font-bold text-[11px]"
                        >
                          View Register →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}


      {activeView === 'register' && (
        <>
      {/* Individual Student Monthly Attendance Heatmap Visualizer (D3 Chart) */}
      <section
        aria-label="Individual Student Monthly Attendance Heatmap"
        className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 no-print"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-indigo-600" />
              <span>Individual Student Attendance Heatmap</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              D3 calendar pattern view for {currentMonthName} {selectedYear} · Select a student below or click any row in the monthly ledger
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-2">
              <span>Student:</span>
              <select
                value={heatmapStudent?.id || ''}
                onChange={(e) => {
                  setSelectedHeatmapStudentId(e.target.value);
                  setHoveredHeatmapCell(null);
                }}
                aria-label="Select student for attendance heatmap"
                className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 focus:ring-2 focus:ring-indigo-500"
              >
                {classStudents.length === 0 ? (
                  <option value="">No active students</option>
                ) : (
                  classStudents.map((st) => (
                    <option key={st.id} value={st.id}>
                      #{st.rollNumber} — {st.fullName}
                    </option>
                  ))
                )}
              </select>
            </label>

            {heatmapStudent && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
                <span>Present: <strong className="text-emerald-700">{studentHeatmapData.present + studentHeatmapData.late}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Absent: <strong className="text-rose-700">{studentHeatmapData.absent}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Leave: <strong className="text-blue-700">{studentHeatmapData.leave}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Rate: <strong className="text-indigo-700">{studentHeatmapData.monthPct}%</strong></span>
                <span aria-hidden="true">·</span>
                <span>Best Streak: <strong className="text-slate-900">{studentHeatmapData.longestPresentStreak}d</strong></span>
              </div>
            )}
          </div>
        </div>

        {!heatmapStudent ? (
          <p className="text-xs text-slate-400 py-6 text-center">
            Select a class with enrolled active students to inspect individual D3 monthly attendance patterns.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <svg ref={d3HeatmapSvgRef} className="w-full max-w-[660px] h-auto block" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
              <div className="text-slate-600">
                {hoveredHeatmapCell ? (
                  <span>
                    <strong>{hoveredHeatmapCell.dateStr} ({hoveredHeatmapCell.weekdayLabel})</strong>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>
                      Status:{' '}
                      <strong className="text-slate-900">
                        {hoveredHeatmapCell.status === 'Approved_Leave'
                          ? 'Approved Leave'
                          : hoveredHeatmapCell.status === 'Holiday'
                          ? `Holiday (${hoveredHeatmapCell.holidayName || 'Scheduled Off'})`
                          : hoveredHeatmapCell.status}
                      </strong>
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Hover or click any calendar day above to inspect daily attendance status.
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Present</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> Late</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" /> Absent</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" /> Leave</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-200 inline-block" /> Holiday</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-50 border border-dashed border-slate-300 inline-block" /> Unrecorded</span>
              </div>
            </div>
          </div>
        )}
      </section>

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
                  const isHeatmapTarget = heatmapStudent?.id === s.id;

                  return (
                    <tr
                      key={s.id}
                      onClick={() => {
                        setSelectedHeatmapStudentId(s.id);
                        setHoveredHeatmapCell(null);
                      }}
                      className={`cursor-pointer transition-colors text-center ${
                        isHeatmapTarget ? 'bg-indigo-50/50' : 'hover:bg-slate-50/60'
                      }`}
                    >
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
        </>
      )}

      {/* Batch Export Modal for Entire Class Monthly Attendance (Single PDF or CSV) */}
      {showBatchExportModal && (() => {
        const batchTiming = getMonthlyWorkingDays(batchYear, batchMonthIndex, school.holidays);
        const batchMonthName = months[batchMonthIndex]?.name || 'October';
        const matchingStudentsCount = uniqueStudents.filter(
          (s) =>
            s.status === 'Active' &&
            s.classNumber === batchClassNumber &&
            (batchSectionScope === 'all' || s.section === batchSectionScope)
        ).length;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm no-print">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Layers className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="text-sm font-bold">Batch Export Monthly Attendance</h3>
                    <p className="text-[11px] text-slate-400">
                      Generate a single PDF or CSV report for an entire class at once
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBatchExportModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                  aria-label="Close batch export modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Target Class
                    </label>
                    <select
                      value={batchClassNumber}
                      onChange={(e) => setBatchClassNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-slate-800"
                    >
                      {school.classesOffered.map((c) => (
                        <option key={c} value={c}>Class {c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Section Scope
                    </label>
                    <select
                      value={batchSectionScope}
                      onChange={(e) => setBatchSectionScope(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-slate-800"
                    >
                      <option value="all">Entire Class (All Sections)</option>
                      <option value="A">Section A Only</option>
                      <option value="B">Section B Only</option>
                      <option value="C">Section C Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Month
                    </label>
                    <select
                      value={batchMonthIndex}
                      onChange={(e) => setBatchMonthIndex(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-slate-800"
                    >
                      {months.map((m, idx) => (
                        <option key={m.name} value={idx}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Year
                    </label>
                    <select
                      value={batchYear}
                      onChange={(e) => setBatchYear(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-slate-800"
                    >
                      <option value={2026}>2026</option>
                      <option value={2027}>2027</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-mono tabular-nums">
                  <span>Matched Students: <strong className="text-slate-900">{matchingStudentsCount}</strong></span>
                  <span>Working Days: <strong className="text-indigo-700">{batchTiming.workingDays}</strong></span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isExportingBatchPdf || matchingStudentsCount === 0}
                    onClick={async () => {
                      const allowed = await guardSensitiveExport(
                        `Batch Export Monthly Attendance PDF (Class ${batchClassNumber} — ${batchMonthName} ${batchYear})`
                      );
                      if (!allowed) return;
                      setIsExportingBatchPdf(true);
                      try {
                        const res = await exportBatchMonthlyClassPdf({
                          students: uniqueStudents,
                          records: attendanceRecords,
                          school,
                          classNumber: batchClassNumber,
                          sectionScope: batchSectionScope,
                          monthName: batchMonthName,
                          year: batchYear,
                          daysList: batchTiming.dates,
                          workingDaysTotal: batchTiming.workingDays,
                        });
                        setBatchExportStatus(
                          `Exported single PDF (${res.filename}) with ${res.studentCount} student(s).`
                        );
                        setShowBatchExportModal(false);
                      } finally {
                        setIsExportingBatchPdf(false);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{isExportingBatchPdf ? 'Generating PDF...' : 'Download Single PDF'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={matchingStudentsCount === 0}
                    onClick={async () => {
                      const allowed = await guardSensitiveExport(
                        `Batch Export Monthly Attendance CSV (Class ${batchClassNumber} — ${batchMonthName} ${batchYear})`
                      );
                      if (!allowed) return;
                      const res = exportBatchMonthlyClassCsv({
                        students: uniqueStudents,
                        records: attendanceRecords,
                        school,
                        classNumber: batchClassNumber,
                        sectionScope: batchSectionScope,
                        monthName: batchMonthName,
                        year: batchYear,
                        daysList: batchTiming.dates,
                        workingDaysTotal: batchTiming.workingDays,
                      });
                      setBatchExportStatus(
                        `Exported single CSV (${res.filename}) with ${res.studentCount} student(s).`
                      );
                      setShowBatchExportModal(false);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Download Single CSV</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

