import React, { useState, useMemo } from 'react';
import {
  Cake,
  Gift,
  Sparkles,
  Calendar,
  Send,
  MessageCircle,
  Phone,
  Eye,
  ChevronDown,
  ChevronUp,
  PartyPopper,
  Check,
  Copy,
  ExternalLink,
  Users,
  Search,
  Filter,
} from 'lucide-react';
import { Student, SchoolProfile, User } from '../types';
import { Language, translations } from '../utils/translations';
import { deduplicateStudentsByAdmissionNumber } from '../utils/calculations';

interface UpcomingBirthdaysCardProps {
  students: Student[];
  school: SchoolProfile;
  currentUser?: User;
  language?: Language;
  onViewStudent?: (student: Student) => void;
  variant?: 'full' | 'compact';
  className?: string;
}

const MONTH_NAMES = [
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

const MONTH_NAMES_UR = [
  'جنوری',
  'فروری',
  'مارچ',
  'اپریل',
  'مئی',
  'جون',
  'جولائی',
  'اگست',
  'ستمبر',
  'اکتوبر',
  'نومبر',
  'دسمبر',
];

export const UpcomingBirthdaysCard: React.FC<UpcomingBirthdaysCardProps> = ({
  students,
  school,
  currentUser,
  language = 'en',
  onViewStudent,
  variant = 'full',
  className = '',
}) => {
  const t = translations[language];

  // Current real-world / app date
  const now = new Date();
  const currentRealMonth = now.getMonth() + 1; // 1-12 (e.g. 10 for October)
  const currentDay = now.getDate();
  const currentYear = now.getFullYear();

  // State
  const [selectedMonth, setSelectedMonth] = useState<number>(currentRealMonth);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [greetingStudent, setGreetingStudent] = useState<Student | null>(null);
  const [customWishText, setCustomWishText] = useState<string>('');
  const [copiedWish, setCopiedWish] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<'all' | 'today' | 'upcoming'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Process students with birthdays in selectedMonth (deduplicated by Admission Number)
  const birthdayStudents = useMemo(() => {
    return deduplicateStudentsByAdmissionNumber(students)
      .filter((s) => s.status === 'Active' && s.dob)
      .map((student) => {
        // dob format expected: YYYY-MM-DD
        const parts = student.dob.split('-');
        if (parts.length < 3) return null;
        const birthYear = parseInt(parts[0], 10);
        const birthMonth = parseInt(parts[1], 10);
        const birthDay = parseInt(parts[2], 10);

        if (isNaN(birthMonth) || isNaN(birthDay)) return null;

        const isCurrentMonth = birthMonth === selectedMonth;
        if (!isCurrentMonth) return null;

        // Calculate turning age
        const turningAge = currentYear - birthYear;

        // Calculate status relative to current day (if viewing current month)
        let status: 'today' | 'upcoming' | 'passed' = 'upcoming';
        let diffDays = 0;

        if (selectedMonth === currentRealMonth) {
          if (birthDay === currentDay) {
            status = 'today';
            diffDays = 0;
          } else if (birthDay > currentDay) {
            status = 'upcoming';
            diffDays = birthDay - currentDay;
          } else {
            status = 'passed';
            diffDays = currentDay - birthDay;
          }
        } else if (selectedMonth > currentRealMonth) {
          status = 'upcoming';
        } else {
          status = 'passed';
        }

        return {
          student,
          birthYear,
          birthMonth,
          birthDay,
          turningAge: turningAge > 0 ? turningAge : 10,
          status,
          diffDays,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.birthDay - b.birthDay);
  }, [students, selectedMonth, currentRealMonth, currentDay, currentYear]);

  // Filtered view by mode & search
  const displayedStudents = useMemo(() => {
    return birthdayStudents.filter((item) => {
      if (filterMode === 'today' && item.status !== 'today') return false;
      if (filterMode === 'upcoming' && item.status !== 'upcoming' && item.status !== 'today') return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesName = item.student.fullName.toLowerCase().includes(q);
        const matchesClass = `class ${item.student.classNumber}`.toLowerCase().includes(q);
        const matchesId = item.student.id.toLowerCase().includes(q);
        return matchesName || matchesClass || matchesId;
      }
      return true;
    });
  }, [birthdayStudents, filterMode, searchTerm]);

  // Statistics
  const todayCount = birthdayStudents.filter((b) => b.status === 'today').length;
  const upcomingCount = birthdayStudents.filter((b) => b.status === 'upcoming').length;
  const totalInMonth = birthdayStudents.length;

  const currentMonthName = language === 'ur' ? MONTH_NAMES_UR[selectedMonth - 1] : MONTH_NAMES[selectedMonth - 1];

  // Open Wish Modal
  const handleOpenWish = (item: (typeof birthdayStudents)[0]) => {
    setGreetingStudent(item.student);
    const adminName = currentUser?.name || school.headTeacherName || 'School Administrator';
    const message = `🎉 Happy Birthday ${item.student.fullName}! 🎂\n\nOn behalf of ${school.name}, we wish you a wonderful ${item.turningAge}th birthday filled with joy, wisdom, and bright success in Class ${item.student.classNumber}-${item.student.section}.\n\nWarm regards,\n${adminName}\n${school.name}`;
    setCustomWishText(message);
    setCopiedWish(false);
  };

  const handleCopyWish = () => {
    navigator.clipboard.writeText(customWishText);
    setCopiedWish(true);
    setTimeout(() => setCopiedWish(false), 3000);
  };

  const handleSendWhatsApp = (parentWhatsApp?: string) => {
    const phone = (parentWhatsApp || greetingStudent?.parentWhatsAppNumber || greetingStudent?.mobileNumber || '').replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(customWishText);
    const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  return (
    <div
      className={`bg-white rounded-3xl border border-amber-200/90 shadow-sm overflow-hidden transition-all duration-200 ${className}`}
    >
      {/* Card Header Banner */}
      <div className="bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 p-4 sm:p-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 shadow-inner shrink-0">
              <Cake className="w-6 h-6 text-amber-200 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                  <span>Upcoming Birthdays</span>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-white/25 text-white border border-white/30 backdrop-blur-sm">
                  {currentMonthName} {currentYear}
                </span>
                {todayCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-400 text-slate-950 animate-pulse flex items-center gap-1 shadow-sm">
                    <PartyPopper className="w-3 h-3" />
                    <span>{todayCount} Today!</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-100/90 mt-0.5 font-medium">
                Identify students celebrating birthdays in {currentMonthName} to send wishes and stay updated.
              </p>
            </div>
          </div>

          {/* Right Header Actions: Month Selector & Collapse Toggle */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            {/* Quick Month Dropdown */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs border border-white/30 focus:outline-none backdrop-blur-md cursor-pointer transition-colors"
            >
              {MONTH_NAMES.map((m, idx) => {
                const monthNum = idx + 1;
                const isCurrent = monthNum === currentRealMonth;
                return (
                  <option key={m} value={monthNum} className="text-slate-900 font-semibold">
                    {m} {isCurrent ? '(Current)' : ''}
                  </option>
                );
              })}
            </select>

            {/* Collapse / Expand Toggle */}
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? 'Expand Birthdays' : 'Collapse Birthdays'}
              className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Quick Summary Metric Pills */}
        {!isCollapsed && (
          <div className="mt-4 pt-3 border-t border-white/20 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-white/90">Month Summary:</span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/20 text-white font-semibold">
              <Cake className="w-3.5 h-3.5 text-amber-300" />
              <span>Total: <strong className="font-extrabold">{totalInMonth}</strong></span>
            </div>
            {todayCount > 0 && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 font-extrabold shadow-sm">
                <PartyPopper className="w-3.5 h-3.5" />
                <span>Today: {todayCount}</span>
              </div>
            )}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/20 text-white font-semibold">
              <Calendar className="w-3.5 h-3.5 text-indigo-200" />
              <span>Upcoming: <strong className="font-extrabold">{upcomingCount}</strong></span>
            </div>
            {selectedMonth !== currentRealMonth && (
              <button
                type="button"
                onClick={() => setSelectedMonth(currentRealMonth)}
                className="ml-auto text-[11px] font-bold text-amber-200 hover:text-white underline decoration-amber-300 underline-offset-2 transition-colors"
              >
                Return to Current Month ({MONTH_NAMES[currentRealMonth - 1]})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area (Hidden if Collapsed) */}
      {!isCollapsed && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Sub-toolbar: Search & Quick Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80 w-fit">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  filterMode === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({totalInMonth})
              </button>
              {todayCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterMode('today')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    filterMode === 'today'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-amber-700 hover:bg-amber-100/50'
                  }`}
                >
                  🎉 Today ({todayCount})
                </button>
              )}
              <button
                type="button"
                onClick={() => setFilterMode('upcoming')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  filterMode === 'upcoming'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Upcoming ({upcomingCount})
              </button>
            </div>

            {/* Quick Search */}
            {totalInMonth > 3 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter birthdays..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
                />
              </div>
            )}
          </div>

          {/* Student Birthday Cards List */}
          {displayedStudents.length === 0 ? (
            <div className="text-center py-8 px-4 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2 border border-amber-200">
                <Gift className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">
                No Birthdays Found in {currentMonthName}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {searchTerm
                  ? 'No students matched your search criteria.'
                  : `There are currently no active students with recorded birthdays in ${currentMonthName}.`}
              </p>
              {selectedMonth === currentRealMonth ? (
                <button
                  type="button"
                  onClick={() => setSelectedMonth((prev) => (prev === 12 ? 1 : prev + 1))}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition-colors"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>View Next Month ({MONTH_NAMES[selectedMonth % 12]})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedMonth(currentRealMonth)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-xs transition-colors"
                >
                  <span>Return to Current Month</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayedStudents.map((item) => {
                const s = item.student;
                const isToday = item.status === 'today';
                const isUpcoming = item.status === 'upcoming';

                return (
                  <div
                    key={s.id}
                    className={`p-3.5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                      isToday
                        ? 'bg-gradient-to-br from-amber-50 via-rose-50/40 to-amber-100/30 border-amber-300 shadow-sm ring-1 ring-amber-300'
                        : isUpcoming
                        ? 'bg-white hover:bg-slate-50/80 border-slate-200/90 shadow-2xs hover:shadow-xs'
                        : 'bg-slate-50/60 border-slate-200 text-slate-600'
                    }`}
                  >
                    {/* Top Row: Student info & Birthday Badge */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {/* Avatar */}
                          <div
                            className={`w-9 h-9 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-xs ${
                              isToday
                                ? 'bg-gradient-to-tr from-amber-500 to-rose-500 text-white ring-2 ring-amber-300/60'
                                : 'bg-gradient-to-tr from-indigo-500 to-indigo-700 text-white'
                            }`}
                          >
                            {s.fullName.slice(0, 1)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-extrabold text-sm text-slate-900 truncate hover:text-indigo-600 transition-colors">
                              {s.fullName}
                            </h4>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="font-bold text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                                Class {s.classNumber}-{s.section}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                #{s.rollNumber} • {s.id}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0 text-right">
                          {isToday ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 shadow-xs animate-bounce">
                              <Sparkles className="w-2.5 h-2.5 text-slate-900" />
                              <span>Today!</span>
                            </span>
                          ) : isUpcoming ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Calendar className="w-2.5 h-2.5" />
                              <span>In {item.diffDays} {item.diffDays === 1 ? 'day' : 'days'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                              {item.diffDays}d ago
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Birthday Details Banner */}
                      <div className="mt-3 p-2 rounded-xl bg-white/70 border border-slate-200/80 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Cake className="w-4 h-4 text-amber-500 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-800">
                              {currentMonthName} {item.birthDay}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-1 font-mono">
                              ({s.dob})
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] font-extrabold text-indigo-600 bg-indigo-50/80 px-2 py-0.5 rounded-lg border border-indigo-100">
                          Turning {item.turningAge} yrs
                        </span>
                      </div>

                      {/* Parent / Contact details snippet */}
                      <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
                        <span className="truncate">Parent: <strong className="text-slate-700 font-semibold">{s.fatherName}</strong></span>
                        <span className="font-mono text-slate-600 shrink-0">{s.mobileNumber}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenWish(item)}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl font-bold text-xs transition-all shadow-2xs active:scale-95 ${
                          isToday
                            ? 'bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white shadow-amber-500/20'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/80'
                        }`}
                      >
                        <Gift className="w-3.5 h-3.5" />
                        <span>Send Wishes</span>
                      </button>

                      {onViewStudent && (
                        <button
                          type="button"
                          onClick={() => onViewStudent(s)}
                          title="View Complete Student Profile"
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs font-bold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Birthday Greeting / WhatsApp Wishes Modal */}
      {greetingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Cake className="w-4 h-4 text-amber-200" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    Send Birthday Wishes
                  </h3>
                  <p className="text-[11px] text-amber-100 font-medium">
                    To {greetingStudent.fullName} • Class {greetingStudent.classNumber}-{greetingStudent.section}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGreetingStudent(null)}
                className="p-1 rounded-lg hover:bg-white/20 text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Contact info pill */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Recipient Parent:</span>
                  <span className="font-bold text-slate-800">{greetingStudent.fatherName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Registered WhatsApp:</span>
                  <span className="font-mono font-bold text-emerald-600">
                    {greetingStudent.parentWhatsAppNumber || greetingStudent.mobileNumber}
                  </span>
                </div>
              </div>

              {/* Editable wish message */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Custom Greeting Message:</span>
                  <span className="text-[11px] text-slate-400 font-normal">Editable before sending</span>
                </label>
                <textarea
                  rows={6}
                  value={customWishText}
                  onChange={(e) => setCustomWishText(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleCopyWish}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
                >
                  {copiedWish ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedWish ? 'Copied to Clipboard!' : 'Copy Message'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendWhatsApp(greetingStudent.parentWhatsAppNumber)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-sm shadow-emerald-600/30 transition-all active:scale-95"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Send via WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
