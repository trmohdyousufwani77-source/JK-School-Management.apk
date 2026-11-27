import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TrendingUp } from 'lucide-react';
import type { AttendanceRecord, Student } from '../types';

interface AttendanceTrendD3ChartProps {
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  selectedDate: string;
  selectedClass: string;
  selectedSection: string;
}

interface DayPoint {
  dateIso: string;
  label: string;
  percentage: number;
  present: number;
  absent: number;
  totalMarked: number;
  totalStudents: number;
}

function shiftIsoDate(baseIso: string, deltaDays: number): string {
  const parts = baseIso.split('-').map(Number);
  const dt =
    parts.length === 3 && !parts.some(Number.isNaN)
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date();
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDate(iso: string): string {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return iso;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export const AttendanceTrendD3Chart: React.FC<AttendanceTrendD3ChartProps> = ({
  students,
  attendanceRecords,
  selectedDate,
  selectedClass,
  selectedSection,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scope, setScope] = useState<'class' | 'school'>('class');
  const [hovered, setHovered] = useState<DayPoint | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(640);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const next = Math.max(300, Math.floor(el.clientWidth));
      setChartWidth(next);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scopedStudents = useMemo(() => {
    const active = students.filter((s) => s.status !== 'Transferred' && s.status !== 'Archived');
    if (scope === 'school') return active;
    return active.filter(
      (s) =>
        String(s.classNumber) === String(selectedClass) &&
        String(s.section).toUpperCase() === String(selectedSection).toUpperCase()
    );
  }, [students, scope, selectedClass, selectedSection]);

  const trendData: DayPoint[] = useMemo(() => {
    const scopedIdSet = new Set(scopedStudents.map((s) => s.id));
    const totalStudents = scopedStudents.length;

    return Array.from({ length: 7 }, (_, i) => {
      const dateIso = shiftIsoDate(selectedDate, i - 6);
      const dayRecords = attendanceRecords.filter(
        (r) => r.date === dateIso && (scope === 'school' || scopedIdSet.has(r.studentId))
      );
      const present = dayRecords.filter((r) => r.status === 'Present' || r.status === 'Late').length;
      const absent = dayRecords.filter((r) => r.status === 'Absent').length;
      const totalMarked = dayRecords.length;
      const denominator = totalMarked > 0 ? totalMarked : totalStudents;
      const percentage = denominator > 0 && totalMarked > 0 ? Math.round((present / denominator) * 1000) / 10 : 0;

      return {
        dateIso,
        label: formatShortDate(dateIso),
        percentage,
        present,
        absent,
        totalMarked,
        totalStudents,
      };
    });
  }, [attendanceRecords, scopedStudents, selectedDate, scope]);

  const avg7Day = useMemo(() => {
    const markedDays = trendData.filter((d) => d.totalMarked > 0);
    if (markedDays.length === 0) return 0;
    const sum = markedDays.reduce((acc, d) => acc + d.percentage, 0);
    return Math.round((sum / markedDays.length) * 10) / 10;
  }, [trendData]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = chartWidth;
    const height = 220;
    const margin = { top: 20, right: 24, bottom: 34, left: 44 };
    const innerW = Math.max(120, width - margin.left - margin.right);
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    const defs = svg.append('defs');
    const grad = defs
      .append('linearGradient')
      .attr('id', 'd3-attendance-area-grad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#4f46e5').attr('stop-opacity', 0.28);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#4f46e5').attr('stop-opacity', 0.02);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scalePoint<string>()
      .domain(trendData.map((d) => d.label))
      .range([0, innerW])
      .padding(0.25);

    const y = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

    // Horizontal gridlines
    const yTicks = [0, 25, 50, 75, 100];
    g.selectAll('.grid-line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', '#e2e8f0')
      .attr('stroke-dasharray', (d) => (d === 75 ? '4 4' : '2 3'))
      .attr('stroke-width', (d) => (d === 75 ? 1.25 : 1));

    // 75% benchmark label
    g.append('text')
      .attr('x', innerW - 2)
      .attr('y', y(75) - 5)
      .attr('text-anchor', 'end')
      .attr('fill', '#d97706')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .text('75% Target');

    // Y axis
    const yAxis = d3
      .axisLeft(y)
      .tickValues(yTicks)
      .tickFormat((d) => `${d}%`);
    g.append('g')
      .call(yAxis)
      .call((axis) => axis.select('.domain').remove())
      .call((axis) => axis.selectAll('line').remove())
      .call((axis) =>
        axis
          .selectAll('text')
          .attr('fill', '#64748b')
          .attr('font-size', '10px')
          .attr('font-family', 'JetBrains Mono, monospace')
      );

    // X axis
    const xAxis = d3.axisBottom(x).tickSizeOuter(0);
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
      .call((axis) => axis.select('.domain').attr('stroke', '#cbd5e1'))
      .call((axis) => axis.selectAll('line').remove())
      .call((axis) =>
        axis
          .selectAll('text')
          .attr('fill', '#475569')
          .attr('font-size', '10.5px')
          .attr('font-weight', '600')
          .attr('dy', '1em')
      );

    // Area generator
    const areaGen = d3
      .area<DayPoint>()
      .x((d) => x(d.label) ?? 0)
      .y0(innerH)
      .y1((d) => y(d.percentage))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(trendData)
      .attr('fill', 'url(#d3-attendance-area-grad)')
      .attr('d', areaGen);

    // Line generator
    const lineGen = d3
      .line<DayPoint>()
      .x((d) => x(d.label) ?? 0)
      .y((d) => y(d.percentage))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(trendData)
      .attr('fill', 'none')
      .attr('stroke', '#4f46e5')
      .attr('stroke-width', 2.75)
      .attr('stroke-linecap', 'round')
      .attr('d', lineGen);

    // Interactive Data Points
    const nodes = g
      .selectAll('.trend-node')
      .data(trendData)
      .enter()
      .append('g')
      .attr('class', 'trend-node')
      .style('cursor', 'pointer')
      .on('mouseenter', (_, d) => setHovered(d))
      .on('click', (_, d) => setHovered(d));

    nodes
      .append('circle')
      .attr('cx', (d) => x(d.label) ?? 0)
      .attr('cy', (d) => y(d.percentage))
      .attr('r', 5)
      .attr('fill', (d) => (d.totalMarked === 0 ? '#cbd5e1' : d.percentage >= 75 ? '#10b981' : '#f43f5e'))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2);

    nodes
      .append('text')
      .attr('x', (d) => x(d.label) ?? 0)
      .attr('y', (d) => Math.max(10, y(d.percentage) - 10))
      .attr('text-anchor', 'middle')
      .attr('fill', '#1e293b')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text((d) => (d.totalMarked > 0 ? `${d.percentage}%` : '—'));
  }, [trendData, chartWidth]);

  const activeDetail = hovered || trendData[trendData.length - 1];

  return (
    <div
      data-testid="d3-attendance-trend-chart"
      className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>7-Day Student Attendance Trend (D3.js)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Classroom participation percentages ending {selectedDate} · 7-day average:{' '}
            <strong className="font-mono tabular-nums text-slate-900">{avg7Day}%</strong>
          </p>
        </div>

        <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs self-start">
          <button
            type="button"
            onClick={() => setScope('class')}
            className={`px-3 py-1 rounded-md font-bold transition-colors whitespace-nowrap ${
              scope === 'class' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Class {selectedClass}-{selectedSection}
          </button>
          <button
            type="button"
            onClick={() => setScope('school')}
            className={`px-3 py-1 rounded-md font-bold transition-colors whitespace-nowrap ${
              scope === 'school' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All School
          </button>
        </div>
      </div>

      <div ref={containerRef} className="w-full overflow-hidden">
        <svg ref={svgRef} className="w-full block" role="img" aria-label="7-Day Student Attendance Trend Line Chart" />
      </div>

      {activeDetail && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900">{activeDetail.label}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Attendance: <strong className="text-indigo-700">{activeDetail.percentage}%</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Present: <strong className="text-emerald-700">{activeDetail.present}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Absent: <strong className="text-rose-700">{activeDetail.absent}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Marked: {activeDetail.totalMarked}/{activeDetail.totalStudents}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Hover or tap any day node to inspect counts</span>
        </div>
      )}
    </div>
  );
};
