import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { AttendanceRecord, AttendanceStatus, SchoolProfile, Student } from '../types';

interface AttendanceHeatmapProps {
  attendanceRecords: AttendanceRecord[];
  classStudents: Student[];
  selectedDate: string;
  selectedClass: string;
  selectedSection: string;
  draftStatus: Record<string, AttendanceStatus>;
  school: SchoolProfile;
  onSelectDate?: (dateStr: string) => void;
  language?: 'en' | 'ur';
}

interface HeatmapDayCell {
  dateStr: string;
  dayNum: number;
  dayOfWeek: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  total: number;
  percentage: number | null;
  isHoliday: boolean;
  holidayName?: string;
  isSunday: boolean;
  isSelected: boolean;
}

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const AttendanceHeatmap: React.FC<AttendanceHeatmapProps> = ({
  attendanceRecords,
  classStudents,
  selectedDate,
  selectedClass,
  selectedSection,
  draftStatus,
  school,
  onSelectDate,
  language = 'en',
}) => {
  const initialMonth = useMemo(() => {
    const base = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
      ? selectedDate
      : new Date().toISOString().slice(0, 10);
    return base.slice(0, 7);
  }, [selectedDate]);

  const [viewMonth, setViewMonth] = useState<string>(initialMonth);
  const [inspectedDate, setInspectedDate] = useState<string | null>(selectedDate || null);

  // Sync month when selectedDate switches to another month
  React.useEffect(() => {
    if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      const ym = selectedDate.slice(0, 7);
      setViewMonth(ym);
      setInspectedDate(selectedDate);
    }
  }, [selectedDate]);

  const shiftMonth = (delta: number) => {
    const [yStr, mStr] = viewMonth.split('-');
    const dt = new Date(Number(yStr) || 2026, (Number(mStr) || 1) - 1 + delta, 1);
    const nextYm = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    setViewMonth(nextYm);
    setInspectedDate(null);
  };

  const monthData = useMemo(() => {
    const [yStr, mStr] = viewMonth.split('-');
    const year = Number(yStr) || 2026;
    const monthIndex = (Number(mStr) || 1) - 1;
    const firstDay = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const leadingEmpty = firstDay.getDay();

    const holidayMap = new Map<string, string>();
    (school.holidays || []).forEach((h) => {
      if (h.date && h.date.startsWith(viewMonth)) {
        holidayMap.set(h.date, h.name);
      }
    });

    const perDateMap = new Map<
      string,
      { present: number; late: number; absent: number; leave: number; total: number }
    >();

    attendanceRecords.forEach((rec) => {
      if (!rec.date || !rec.date.startsWith(viewMonth)) return;
      if (selectedClass && rec.classNumber !== selectedClass) return;
      if (selectedClass && selectedSection && rec.section !== selectedSection) return;

      const bucket = perDateMap.get(rec.date) || {
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
        total: 0,
      };
      bucket.total += 1;
      if (rec.status === 'Present') bucket.present += 1;
      else if (rec.status === 'Late') bucket.late += 1;
      else if (rec.status === 'Absent') bucket.absent += 1;
      else bucket.leave += 1;
      perDateMap.set(rec.date, bucket);
    });

    // Overlay live draftStatus for selectedDate so heatmap reflects live scans/edits immediately
    if (selectedDate && selectedDate.startsWith(viewMonth) && classStudents.length > 0) {
      const markedEntries = classStudents.filter((st) => Boolean(draftStatus[st.id]));
      if (markedEntries.length > 0) {
        let present = 0;
        let late = 0;
        let absent = 0;
        let leave = 0;
        markedEntries.forEach((st) => {
          const s = draftStatus[st.id];
          if (s === 'Present') present += 1;
          else if (s === 'Late') late += 1;
          else if (s === 'Absent') absent += 1;
          else if (s === 'Approved_Leave') leave += 1;
        });
        perDateMap.set(selectedDate, {
          present,
          late,
          absent,
          leave,
          total: markedEntries.length,
        });
      }
    }

    const days: HeatmapDayCell[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, '0');
      const dateStr = `${viewMonth}-${dd}`;
      const dow = new Date(year, monthIndex, d).getDay();
      const isSunday = dow === 0;
      const holidayName = holidayMap.get(dateStr);
      const isHoliday = Boolean(holidayName);
      const bucket = perDateMap.get(dateStr);
      const attended = bucket ? bucket.present + bucket.late : 0;
      const percentage =
        bucket && bucket.total > 0 ? Math.round((attended / bucket.total) * 1000) / 10 : null;

      days.push({
        dateStr,
        dayNum: d,
        dayOfWeek: dow,
        present: bucket?.present ?? 0,
        late: bucket?.late ?? 0,
        absent: bucket?.absent ?? 0,
        leave: bucket?.leave ?? 0,
        total: bucket?.total ?? 0,
        percentage,
        isHoliday,
        holidayName,
        isSunday,
        isSelected: dateStr === selectedDate,
      });
    }

    const recordedDays = days.filter((d) => d.percentage !== null);
    const avgRate =
      recordedDays.length > 0
        ? Math.round(
            (recordedDays.reduce((acc, d) => acc + (d.percentage ?? 0), 0) / recordedDays.length) *
              10
          ) / 10
        : null;
    const peakDay =
      recordedDays.length > 0
        ? [...recordedDays].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0]
        : null;
    const dropDay =
      recordedDays.length > 0
        ? [...recordedDays].sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0))[0]
        : null;
    const belowThresholdDays = recordedDays.filter((d) => (d.percentage ?? 0) < 75).length;

    const monthLabel = firstDay.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    return {
      monthLabel,
      leadingEmpty,
      days,
      recordedCount: recordedDays.length,
      avgRate,
      peakDay,
      dropDay,
      belowThresholdDays,
    };
  }, [
    attendanceRecords,
    classStudents,
    draftStatus,
    school.holidays,
    selectedClass,
    selectedDate,
    selectedSection,
    viewMonth,
  ]);

  const activeCell = useMemo(() => {
    if (inspectedDate) {
      const exact = monthData.days.find((d) => d.dateStr === inspectedDate);
      if (exact) return exact;
    }
    const sel = monthData.days.find((d) => d.dateStr === selectedDate);
    if (sel) return sel;
    return monthData.days.filter((d) => d.percentage !== null).slice(-1)[0] || monthData.days[0];
  }, [inspectedDate, monthData.days, selectedDate]);

  const getCellStyle = (cell: HeatmapDayCell): string => {
    if (cell.percentage === null) {
      if (cell.isHoliday || cell.isSunday) {
        return 'bg-slate-100/80 text-slate-400 border-slate-200 border-dashed hover:border-slate-300';
      }
      return 'bg-slate-50 text-slate-500 border-slate-200/80 hover:border-slate-300';
    }
    if (cell.percentage >= 90) {
      return 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700';
    }
    if (cell.percentage >= 80) {
      return 'bg-emerald-400 text-slate-950 border-emerald-500 hover:bg-emerald-500';
    }
    if (cell.percentage >= 75) {
      return 'bg-amber-300 text-slate-950 border-amber-400 hover:bg-amber-400';
    }
    return 'bg-rose-500 text-white border-rose-600 hover:bg-rose-600';
  };

  return (
    <section
      aria-label="Monthly Attendance Heatmap"
      data-testid="daily-attendance-heatmap"
      className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {language === 'ur'
                ? 'ماہانہ حاضری ہیٹ میپ'
                : `Attendance Heatmap · ${monthData.monthLabel}`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedClass
                ? `Class ${selectedClass}-${selectedSection} · Daily attendance spikes and drops across the academic month`
                : 'School-wide daily attendance spikes and drops across the academic month'}
            </p>
          </div>
        </div>

        {/* Month Navigation Controls */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 font-mono tabular-nums min-w-[132px] text-center">
            {monthData.monthLabel}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-slate-500 block">Monthly Average</span>
          <span className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5 block">
            {monthData.avgRate !== null ? `${monthData.avgRate}%` : '—'}
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-slate-500 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <span>Peak Spike Day</span>
          </span>
          <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums mt-0.5 block truncate">
            {monthData.peakDay
              ? `${monthData.peakDay.dateStr.slice(8)} (${monthData.peakDay.percentage}%)`
              : '—'}
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-slate-500 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
            <span>Lowest Drop Day</span>
          </span>
          <span className="text-sm font-bold text-rose-700 font-mono tabular-nums mt-0.5 block truncate">
            {monthData.dropDay
              ? `${monthData.dropDay.dateStr.slice(8)} (${monthData.dropDay.percentage}%)`
              : '—'}
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-slate-500 block">Days Below 75%</span>
          <span
            className={`text-base font-bold font-mono tabular-nums mt-0.5 block ${
              monthData.belowThresholdDays > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {monthData.belowThresholdDays}
            <span className="text-xs font-normal text-slate-500 ml-1">
              / {monthData.recordedCount} recorded
            </span>
          </span>
        </div>
      </div>

      {/* Main Split: Calendar Grid + Day Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 space-y-2.5">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-500">
            {WEEKDAY_HEADERS.map((wd) => (
              <div key={wd} className="py-1">
                {wd}
              </div>
            ))}
          </div>

          {/* Calendar Day Cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: monthData.leadingEmpty }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-12 sm:h-14 rounded-lg bg-slate-50/40" />
            ))}

            {monthData.days.map((cell) => {
              const isInspected = activeCell?.dateStr === cell.dateStr;
              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => setInspectedDate(cell.dateStr)}
                  title={
                    cell.percentage !== null
                      ? `${cell.dateStr}: ${cell.percentage}% (${cell.present + cell.late}/${cell.total} Present)`
                      : cell.holidayName
                      ? `${cell.dateStr}: ${cell.holidayName}`
                      : cell.isSunday
                      ? `${cell.dateStr}: Sunday`
                      : `${cell.dateStr}: No attendance recorded`
                  }
                  className={`h-12 sm:h-14 rounded-lg border p-1.5 flex flex-col justify-between text-left transition-all cursor-pointer ${getCellStyle(
                    cell
                  )} ${
                    isInspected
                      ? 'ring-2 ring-indigo-600 ring-offset-1'
                      : cell.isSelected
                      ? 'ring-2 ring-slate-900 ring-offset-1'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between w-full leading-none">
                    <span className="text-[11px] font-bold font-mono tabular-nums">
                      {cell.dayNum}
                    </span>
                    {cell.isSelected && (
                      <span className="text-[9px] font-bold opacity-90">Active</span>
                    )}
                  </div>
                  <div className="text-[10px] sm:text-[11px] font-mono tabular-nums font-bold leading-none truncate">
                    {cell.percentage !== null
                      ? `${Math.round(cell.percentage)}%`
                      : cell.isHoliday
                      ? 'Hol'
                      : cell.isSunday
                      ? 'Sun'
                      : '—'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Intensity Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-rose-500 border border-rose-600 inline-block" />
                <span>&lt; 75% Drop</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-300 border border-amber-400 inline-block" />
                <span>75–79% Caution</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-400 border border-emerald-500 inline-block" />
                <span>80–89% Good</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-600 border border-emerald-700 inline-block" />
                <span>90%+ Peak</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-100 border border-slate-200 border-dashed inline-block" />
                <span>Holiday / Unrecorded</span>
              </span>
            </div>
          </div>
        </div>

        {/* Selected Day Breakdown Panel */}
        <div className="lg:col-span-4 rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <p className="text-[11px] text-slate-500">Inspected Day</p>
              <p className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                {activeCell?.dateStr || selectedDate}
              </p>
            </div>
            {activeCell && activeCell.percentage !== null && (
              <span
                className={`text-lg font-extrabold font-mono tabular-nums ${
                  activeCell.percentage >= 85
                    ? 'text-emerald-700'
                    : activeCell.percentage >= 75
                    ? 'text-amber-700'
                    : 'text-rose-700'
                }`}
              >
                {activeCell.percentage}%
              </span>
            )}
          </div>

          {activeCell && activeCell.percentage !== null ? (
            <>
              <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
                <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                  <span className="text-[11px] text-slate-500 font-sans block">Present / Late</span>
                  <strong className="text-sm text-emerald-700">
                    {activeCell.present + activeCell.late}
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                  <span className="text-[11px] text-slate-500 font-sans block">Absent</span>
                  <strong className="text-sm text-rose-700">{activeCell.absent}</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                  <span className="text-[11px] text-slate-500 font-sans block">Approved Leave</span>
                  <strong className="text-sm text-indigo-700">{activeCell.leave}</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                  <span className="text-[11px] text-slate-500 font-sans block">Total Recorded</span>
                  <strong className="text-sm text-slate-900">{activeCell.total}</strong>
                </div>
              </div>

              {monthData.avgRate !== null && (
                <div className="text-[11px] text-slate-600 pt-1">
                  Variance vs monthly average:{' '}
                  <strong
                    className={`font-mono tabular-nums ${
                      activeCell.percentage >= monthData.avgRate
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {activeCell.percentage >= monthData.avgRate ? '+' : ''}
                    {(activeCell.percentage - monthData.avgRate).toFixed(1)}%
                  </strong>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500 py-2">
              {activeCell?.holidayName
                ? `Scheduled school holiday: ${activeCell.holidayName}.`
                : activeCell?.isSunday
                ? 'Sunday (weekly school holiday).'
                : 'No attendance records logged for this date yet.'}
            </p>
          )}

          {onSelectDate && activeCell && activeCell.dateStr !== selectedDate && (
            <button
              type="button"
              onClick={() => onSelectDate(activeCell.dateStr)}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors whitespace-nowrap"
            >
              Open {activeCell.dateStr} in Register
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
