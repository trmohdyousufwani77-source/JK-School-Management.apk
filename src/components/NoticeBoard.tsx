import React, { useMemo, useState } from 'react';
import {
  Megaphone,
  Plus,
  Edit3,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  Calendar,
  Pin,
  Search,
  Users,
  X,
  Download,
  AlertTriangle,
  ChevronRight,
  Check,
} from 'lucide-react';
import {
  NoticeBoardItem,
  NoticePriority,
  SchoolProfile,
  TeacherProfile,
  User,
} from '../types';

export interface NoticeBoardProps {
  mode: 'dashboard' | 'full';
  school: SchoolProfile;
  currentUser: User;
  isAdmin: boolean;
  teachers: TeacherProfile[];
  notices: NoticeBoardItem[];
  onCreateNotice: (input: {
    title: string;
    body: string;
    expirationDate: string;
    priority: NoticePriority;
    pinned: boolean;
  }) => void;
  onUpdateNotice: (
    noticeId: string,
    updates: {
      title: string;
      body: string;
      expirationDate: string;
      priority: NoticePriority;
      pinned: boolean;
    }
  ) => void;
  onDeleteNotice: (noticeId: string) => void;
  onMarkNoticeRead: (noticeId: string) => void;
  onOpenFullNoticeBoard?: () => void;
}

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDefaultExpiryIso(daysAhead = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isNoticeExpired(expirationDate: string): boolean {
  if (!expirationDate) return false;
  return expirationDate < getTodayIso();
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const NoticeBoard: React.FC<NoticeBoardProps> = ({
  mode,
  school,
  currentUser,
  isAdmin,
  teachers,
  notices,
  onCreateNotice,
  onUpdateNotice,
  onDeleteNotice,
  onMarkNoticeRead,
  onOpenFullNoticeBoard,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'expired' | 'all'>('active');
  const [priorityFilter, setPriorityFilter] = useState<'all' | NoticePriority>('all');
  const [expandedNoticeId, setExpandedNoticeId] = useState<string | null>(null);

  // Create / Edit Modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formExpirationDate, setFormExpirationDate] = useState(getDefaultExpiryIso(14));
  const [formPriority, setFormPriority] = useState<NoticePriority>('Important');
  const [formPinned, setFormPinned] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Inline Delete Confirmation state (never window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Read Status Log Drawer/Modal state (Admin)
  const [readLogNoticeId, setReadLogNoticeId] = useState<string | null>(null);
  const [readLogSearch, setReadLogSearch] = useState('');

  // Build unified staff roster for Read Status comparison
  const staffDirectory = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; role: string; employeeId?: string }
    >();
    teachers.forEach((t) => {
      map.set(t.id, {
        id: t.id,
        name: t.name,
        role: t.designation || 'Teacher',
        employeeId: t.employeeId,
      });
    });
    // Ensure currentUser is represented if not already matched by name
    const hasCurrent = Array.from(map.values()).some(
      (s) => s.id === currentUser.id || s.name.toLowerCase() === currentUser.name.toLowerCase()
    );
    if (!hasCurrent) {
      map.set(currentUser.id, {
        id: currentUser.id,
        name: currentUser.name,
        role:
          currentUser.role === 'admin'
            ? 'School Administrator'
            : currentUser.role === 'head_teacher'
            ? 'Headmaster / Principal'
            : 'Teacher',
      });
    }
    return Array.from(map.values());
  }, [teachers, currentUser]);

  const sortedNotices = useMemo(() => {
    const priorityRank: Record<NoticePriority, number> = {
      Urgent: 3,
      Important: 2,
      Normal: 1,
    };
    return [...notices].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (priorityRank[a.priority] !== priorityRank[b.priority]) {
        return priorityRank[b.priority] - priorityRank[a.priority];
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [notices]);

  const activeNotices = useMemo(
    () => sortedNotices.filter((n) => !isNoticeExpired(n.expirationDate)),
    [sortedNotices]
  );

  const expiredNoticesCount = useMemo(
    () => sortedNotices.filter((n) => isNoticeExpired(n.expirationDate)).length,
    [sortedNotices]
  );

  const unreadActiveCount = useMemo(() => {
    return activeNotices.filter(
      (n) =>
        !n.readReceipts.some(
          (r) =>
            r.userId === currentUser.id ||
            r.staffName.toLowerCase() === currentUser.name.toLowerCase()
        )
    ).length;
  }, [activeNotices, currentUser]);

  const visibleNotices = useMemo(() => {
    const base =
      mode === 'dashboard'
        ? activeNotices
        : sortedNotices.filter((n) => {
            const expired = isNoticeExpired(n.expirationDate);
            if (!isAdmin && expired) return false;
            if (statusFilter === 'active' && expired) return false;
            if (statusFilter === 'expired' && !expired) return false;
            return true;
          });

    return base.filter((n) => {
      if (priorityFilter !== 'all' && n.priority !== priorityFilter) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.authorName.toLowerCase().includes(q)
      );
    });
  }, [mode, activeNotices, sortedNotices, isAdmin, statusFilter, priorityFilter, searchQuery]);

  const openCreateModal = () => {
    setEditingNoticeId(null);
    setFormTitle('');
    setFormBody('');
    setFormExpirationDate(getDefaultExpiryIso(14));
    setFormPriority('Important');
    setFormPinned(false);
    setFormError(null);
    setIsEditorOpen(true);
  };

  const openEditModal = (notice: NoticeBoardItem) => {
    setEditingNoticeId(notice.id);
    setFormTitle(notice.title);
    setFormBody(notice.body);
    setFormExpirationDate(notice.expirationDate);
    setFormPriority(notice.priority);
    setFormPinned(Boolean(notice.pinned));
    setFormError(null);
    setIsEditorOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = formTitle.trim();
    const cleanBody = formBody.trim();
    if (!cleanTitle) {
      setFormError('Please enter a notice title.');
      return;
    }
    if (!cleanBody) {
      setFormError('Please enter the notice body / announcement message.');
      return;
    }
    if (!formExpirationDate) {
      setFormError('Please select an expiration date.');
      return;
    }

    if (editingNoticeId) {
      onUpdateNotice(editingNoticeId, {
        title: cleanTitle,
        body: cleanBody,
        expirationDate: formExpirationDate,
        priority: formPriority,
        pinned: formPinned,
      });
    } else {
      onCreateNotice({
        title: cleanTitle,
        body: cleanBody,
        expirationDate: formExpirationDate,
        priority: formPriority,
        pinned: formPinned,
      });
    }
    setIsEditorOpen(false);
    setEditingNoticeId(null);
  };

  const hasCurrentUserRead = (notice: NoticeBoardItem) =>
    notice.readReceipts.some(
      (r) =>
        r.userId === currentUser.id ||
        r.staffName.toLowerCase() === currentUser.name.toLowerCase()
    );

  const handleToggleExpandNotice = (notice: NoticeBoardItem) => {
    const nextId = expandedNoticeId === notice.id ? null : notice.id;
    setExpandedNoticeId(nextId);
    if (nextId === notice.id && !hasCurrentUserRead(notice)) {
      onMarkNoticeRead(notice.id);
    }
  };

  const activeReadLogNotice = useMemo(
    () => notices.find((n) => n.id === readLogNoticeId) || null,
    [notices, readLogNoticeId]
  );

  const readLogBreakdown = useMemo(() => {
    if (!activeReadLogNotice) return null;
    const receipts = activeReadLogNotice.readReceipts;
    const receiptByUserId = new Set(receipts.map((r) => r.userId));
    const receiptByName = new Set(receipts.map((r) => r.staffName.toLowerCase()));

    const q = readLogSearch.trim().toLowerCase();
    const viewed = receipts.filter(
      (r) =>
        !q ||
        r.staffName.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        (r.employeeId || '').toLowerCase().includes(q)
    );
    const unreadStaff = staffDirectory.filter(
      (st) =>
        !receiptByUserId.has(st.id) &&
        !receiptByName.has(st.name.toLowerCase()) &&
        (!q ||
          st.name.toLowerCase().includes(q) ||
          st.role.toLowerCase().includes(q) ||
          (st.employeeId || '').toLowerCase().includes(q))
    );

    const totalStaff = Math.max(staffDirectory.length, receipts.length, 1);
    const viewedCount = receipts.length;
    const pct = Math.min(100, Math.round((viewedCount / totalStaff) * 100));

    return { viewed, unreadStaff, totalStaff, viewedCount, pct };
  }, [activeReadLogNotice, staffDirectory, readLogSearch]);

  const handleExportReadLogCsv = (notice: NoticeBoardItem) => {
    const receiptMap = new Map(
      notice.readReceipts.map((r) => [r.staffName.toLowerCase(), r])
    );
    const rows: string[][] = [
      ['Notice Title', 'Staff Name', 'Role', 'Employee ID', 'Status', 'Viewed At'],
    ];

    notice.readReceipts.forEach((r) => {
      rows.push([
        notice.title,
        r.staffName,
        r.role,
        r.employeeId || '—',
        'Viewed',
        formatDateTime(r.readAt),
      ]);
    });

    staffDirectory.forEach((st) => {
      if (
        !notice.readReceipts.some((r) => r.userId === st.id) &&
        !receiptMap.has(st.name.toLowerCase())
      ) {
        rows.push([
          notice.title,
          st.name,
          st.role,
          st.employeeId || '—',
          'Not Yet Viewed',
          '—',
        ]);
      }
    });

    const csv = rows
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Notice_Read_Status_Log_${notice.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const priorityStyle = (priority: NoticePriority) => {
    if (priority === 'Urgent') {
      return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    if (priority === 'Important') {
      return 'bg-amber-100 text-amber-900 border-amber-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const noticesToRender =
    mode === 'dashboard' ? visibleNotices.slice(0, 4) : visibleNotices;

  return (
    <section
      aria-label="School Notice Board"
      className={
        mode === 'dashboard'
          ? 'bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden'
          : 'space-y-5'
      }
    >
      {/* Header */}
      <div
        className={
          mode === 'dashboard'
            ? 'px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3'
            : 'bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4'
        }
      >
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={
                  mode === 'dashboard'
                    ? 'text-base font-extrabold text-slate-900'
                    : 'text-xl font-black text-slate-900'
                }
              >
                School Notice Board
              </h2>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                {activeNotices.length} Active
              </span>
              {unreadActiveCount > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                  {unreadActiveCount} Unread
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === 'dashboard'
                ? `Official circulars & announcements for all staff at ${school.name}`
                : 'Publish, edit, and manage official school announcements and monitor staff Read Status logs.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Post New Notice</span>
            </button>
          )}
          {mode === 'dashboard' && onOpenFullNoticeBoard && (
            <button
              type="button"
              onClick={onOpenFullNoticeBoard}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors"
            >
              <span>{isAdmin ? 'Manage & Read Logs' : 'View All Notices'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filters (Full Mode) */}
      {mode === 'full' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notices by title, content, or author..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                  statusFilter === 'active'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active ({activeNotices.length})
              </button>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('expired')}
                    className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                      statusFilter === 'expired'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Expired ({expiredNoticesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                      statusFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({notices.length})
                  </button>
                </>
              )}
            </div>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'all' | NoticePriority)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-slate-700"
            >
              <option value="all">All Priorities</option>
              <option value="Urgent">Urgent Only</option>
              <option value="Important">Important Only</option>
              <option value="Normal">Normal Only</option>
            </select>
          </div>
        </div>
      )}

      {/* Notices List */}
      <div className={mode === 'dashboard' ? 'p-4 sm:p-5 space-y-3' : 'space-y-3'}>
        {noticesToRender.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
            <Megaphone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No notices to display</p>
            <p className="text-xs text-slate-500 mt-1">
              {isAdmin
                ? 'Click "Post New Notice" to publish an announcement with an expiration date.'
                : 'There are currently no active announcements posted by the school administration.'}
            </p>
          </div>
        ) : (
          noticesToRender.map((notice) => {
            const expired = isNoticeExpired(notice.expirationDate);
            const isRead = hasCurrentUserRead(notice);
            const isExpanded = expandedNoticeId === notice.id || mode === 'full';
            const totalStaff = Math.max(staffDirectory.length, notice.readReceipts.length, 1);
            const readPct = Math.min(
              100,
              Math.round((notice.readReceipts.length / totalStaff) * 100)
            );

            return (
              <article
                key={notice.id}
                className={`rounded-2xl border p-4 transition-all ${
                  expired
                    ? 'bg-slate-50 border-slate-200 opacity-80'
                    : isRead
                    ? 'bg-white border-slate-200 hover:border-indigo-200'
                    : 'bg-indigo-50/35 border-indigo-200 shadow-2xs'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {notice.pinned && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                          <Pin className="w-3 h-3" />
                          Pinned
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${priorityStyle(
                          notice.priority
                        )}`}
                      >
                        {notice.priority}
                      </span>
                      {expired ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                          Expired ({notice.expirationDate})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500">
                          <Calendar className="w-3 h-3" />
                          Valid until {notice.expirationDate}
                        </span>
                      )}
                      {!isRead && !expired && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-600 text-white">
                          NEW
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleExpandNotice(notice)}
                      className="text-left block w-full group"
                    >
                      <h3 className="text-sm sm:text-base font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors">
                        {notice.title}
                      </h3>
                    </button>

                    <p
                      className={`text-xs text-slate-700 leading-relaxed whitespace-pre-line ${
                        isExpanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {notice.body}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-500">
                      <span>
                        Posted by <strong className="text-slate-700">{notice.authorName}</strong> ({notice.authorRole})
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(notice.createdAt)}
                      </span>
                      {isAdmin && (
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-700">
                          <Users className="w-3.5 h-3.5" />
                          Read by {notice.readReceipts.length}/{totalStaff} staff ({readPct}%)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex flex-wrap sm:flex-col items-center sm:items-end gap-2 shrink-0">
                    {isRead ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Viewed</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onMarkNoticeRead(notice.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors shadow-2xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Mark as Read</span>
                      </button>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      {mode === 'dashboard' && (
                        <button
                          type="button"
                          onClick={() => handleToggleExpandNotice(notice)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        >
                          {isExpanded ? 'Collapse' : 'Read Full'}
                        </button>
                      )}

                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setReadLogSearch('');
                              setReadLogNoticeId(notice.id);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Read Status ({notice.readReceipts.length})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(notice)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="Edit Notice"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          {confirmDeleteId === notice.id ? (
                            <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                              <span className="text-[10px] font-bold text-rose-800">Delete?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteNotice(notice.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-0.5 rounded bg-white text-slate-600 text-[10px] font-semibold border border-slate-200"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(notice.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                              title="Delete Notice"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}

        {mode === 'dashboard' && visibleNotices.length > 4 && onOpenFullNoticeBoard && (
          <button
            type="button"
            onClick={onOpenFullNoticeBoard}
            className="w-full py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-indigo-700 transition-colors"
          >
            View all {visibleNotices.length} active notices →
          </button>
        )}
      </div>

      {/* Create / Edit Notice Modal */}
      {isEditorOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900">
                  {editingNoticeId ? 'Edit School Notice' : 'Create New School Notice'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200"
                aria-label="Close notice editor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-4">
              {formError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notice Title <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g., Term-2 Examination Schedule & Staff Briefing"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  maxLength={140}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Announcement Body <span className="text-rose-600">*</span>
                </label>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  rows={5}
                  placeholder="Write the full circular or announcement details for all school staff..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expiration Date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={formExpirationDate}
                    onChange={(e) => setFormExpirationDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as NoticePriority)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Important">Important</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formPinned}
                  onChange={(e) => setFormPinned(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Pin this notice to the top of the main dashboard</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs"
                >
                  {editingNoticeId ? 'Save Changes' : 'Publish Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Read Status Log Modal */}
      {activeReadLogNotice && readLogBreakdown && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-600" />
                  <span>Staff Read Status Log</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">
                  {activeReadLogNotice.title}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleExportReadLogCsv(activeReadLogNotice)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReadLogNoticeId(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200"
                  aria-label="Close Read Status Log"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Progress Bar Summary */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-700">
                    Acknowledged by {readLogBreakdown.viewedCount} of {readLogBreakdown.totalStaff} staff members
                  </span>
                  <span className="font-mono text-indigo-700">{readLogBreakdown.pct}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${readLogBreakdown.pct}%` }}
                  />
                </div>
              </div>

              {/* Filter staff */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={readLogSearch}
                  onChange={(e) => setReadLogSearch(e.target.value)}
                  placeholder="Filter staff by name or designation..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Viewed Staff Table */}
              <div>
                <h4 className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider mb-2">
                  Viewed ({readLogBreakdown.viewed.length})
                </h4>
                {readLogBreakdown.viewed.length === 0 ? (
                  <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    No staff members have acknowledged this notice yet.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Staff Member</th>
                          <th className="py-2 px-3">Role</th>
                          <th className="py-2 px-3 text-right">Viewed At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {readLogBreakdown.viewed.map((receipt) => (
                          <tr key={`${receipt.userId}-${receipt.readAt}`} className="bg-white">
                            <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{receipt.staffName}</span>
                            </td>
                            <td className="py-2 px-3 text-slate-600">{receipt.role}</td>
                            <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-600">
                              {formatDateTime(receipt.readAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pending / Not Yet Viewed Roster */}
              <div>
                <h4 className="text-xs font-extrabold text-amber-800 uppercase tracking-wider mb-2">
                  Pending / Not Yet Viewed ({readLogBreakdown.unreadStaff.length})
                </h4>
                {readLogBreakdown.unreadStaff.length === 0 ? (
                  <p className="text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    All active staff members have viewed this announcement.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {readLogBreakdown.unreadStaff.map((staff) => (
                      <div
                        key={staff.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50/70 border border-amber-200 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{staff.name}</p>
                          <p className="text-[10px] text-slate-600 truncate">
                            {staff.role}
                            {staff.employeeId ? ` · ${staff.employeeId}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 shrink-0">
                          Pending
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
