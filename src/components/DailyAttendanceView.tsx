import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  Slash,
  FileText,
  UserCheck,
  Download,
  Sparkles,
  Info,
  CalendarCheck,
  Check,
  Building2,
  Eye,
  SlidersHorizontal,
  Plus,
  UserPlus,
  LayoutGrid,
  List
} from 'lucide-react';
import { AttendanceRecord, AttendanceStatus, Member } from '../types';
import { DEPARTMENTS, formatDateKey, isMemberDeleted } from '../utils/storage';
import { exportDailyAttendanceCSV, calculateWorkingHours } from '../utils/excelExport';
import { playPunchInSound, playPunchOutSound } from '../utils/audioAlerts';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'motion/react';

interface DailyAttendanceViewProps {
  members: Member[];
  records: AttendanceRecord[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  onUpdateRecord: (record: AttendanceRecord) => void;
  onBulkUpdate: (records: AttendanceRecord[]) => void;
  onSelectPerson: (member: Member) => void;
  onOpenAddMember: () => void;
}

const COMMON_NOTES = [
  'Work from home',
  'Doctor appointment',
  'Traffic congestion',
  'Client on-site visit',
  'Approved personal leave',
  'Sick leave / Medical',
  'Emergency leave',
  'Training workshop'
];

export const DailyAttendanceView: React.FC<DailyAttendanceViewProps> = ({
  members,
  records,
  selectedDate,
  onDateChange,
  onUpdateRecord,
  onBulkUpdate,
  onSelectPerson,
  onOpenAddMember
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [activeNoteModalMemberId, setActiveNoteModalMemberId] = useState<string | null>(null);
  const [tempNoteText, setTempNoteText] = useState('');

  // Active members strictly from roster (excluding deleted or inactive)
  const activeMembers = useMemo(() => {
    return members.filter(m => m && m.id && m.active !== false && !isMemberDeleted(m.id) && (!m.email || !isMemberDeleted(m.email)));
  }, [members]);

  // Current day records mapped by memberId and resilient aliases
  const currentDayRecordMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    records.filter(r => r.date === selectedDate).forEach(r => {
      if (r.memberId) {
        map.set(r.memberId, r);
        map.set(r.memberId.toLowerCase().trim(), r);
      }
      if (r.id) {
        map.set(r.id, r);
      }
    });

    // Also link by member email or employeeId for any active member
    activeMembers.forEach(m => {
      if (!map.has(m.id)) {
        const mNorm = typeof m.id === 'string' ? m.id.toLowerCase().trim() : '';
        const mStripped = mNorm.replace(/^mem-/, '');
        const emailKey = (m.email && typeof m.email === 'string') ? 'mem-' + m.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_') : '';
        const emailLower = (m.email && typeof m.email === 'string') ? m.email.toLowerCase().trim() : '';
        const empIdUpper = (m.employeeId && typeof m.employeeId === 'string') ? m.employeeId.toUpperCase().trim() : '';

        const found =
          (emailKey ? map.get(emailKey) : undefined) ||
          (emailLower ? map.get(emailLower) : undefined) ||
          (mStripped ? map.get(mStripped) : undefined) ||
          records.find(r =>
            r.date === selectedDate && (
              (empIdUpper && r.memberId && typeof r.memberId === 'string' && r.memberId.toUpperCase().includes(empIdUpper)) ||
              (emailLower && r.memberId && typeof r.memberId === 'string' && r.memberId.toLowerCase().includes(emailLower.replace(/[^a-z0-9]/g, '_'))) ||
              (r.notes && m.name && typeof r.notes === 'string' && typeof m.name === 'string' && r.notes.toLowerCase().includes(m.name.toLowerCase()))
            )
          );
        if (found) {
          map.set(m.id, found);
        }
      }
    });

    return map;
  }, [records, selectedDate, activeMembers]);

  // Filtering members
  const filteredMembers = useMemo(() => {
    return activeMembers.filter(member => {
      const searchNorm = searchTerm.toLowerCase().trim();
      const matchSearch = !searchNorm || (
        (typeof member.name === 'string' && member.name.toLowerCase().includes(searchNorm)) ||
        (typeof member.employeeId === 'string' && member.employeeId.toLowerCase().includes(searchNorm)) ||
        (typeof member.role === 'string' && member.role.toLowerCase().includes(searchNorm))
      );

      const matchDept = selectedDept === 'All' || member.department === selectedDept;

      const record = currentDayRecordMap.get(member.id);
      const status = record?.status;

      let matchStatus = true;
      if (selectedStatusFilter === 'unmarked') {
        matchStatus = !record;
      } else if (selectedStatusFilter !== 'all') {
        matchStatus = status === selectedStatusFilter;
      }

      return matchSearch && matchDept && matchStatus;
    });
  }, [activeMembers, searchTerm, selectedDept, selectedStatusFilter, currentDayRecordMap]);

  // Statistics for today
  const stats = useMemo(() => {
    let present = 0;
    let late = 0;
    let halfDay = 0;
    let absent = 0;
    let excused = 0;

    activeMembers.forEach(m => {
      const rec = currentDayRecordMap.get(m.id);
      if (rec) {
        if (rec.status === 'present') present++;
        else if (rec.status === 'late') late++;
        else if (rec.status === 'half_day') halfDay++;
        else if (rec.status === 'absent') absent++;
        else if (rec.status === 'excused') excused++;
      }
    });

    const total = activeMembers.length;
    const marked = present + late + halfDay + absent + excused;
    const unmarked = total - marked;
    const rate = total > 0 ? Math.round(((present + late + halfDay * 0.5) / total) * 100) : 0;

    return { total, marked, unmarked, present, late, halfDay, absent, excused, rate };
  }, [activeMembers, currentDayRecordMap]);

  // Handlers for date navigation
  const handlePrevDay = () => {
    const cur = new Date(`${selectedDate}T00:00:00`);
    cur.setDate(cur.getDate() - 1);
    onDateChange(formatDateKey(cur));
  };

  const handleNextDay = () => {
    const cur = new Date(`${selectedDate}T00:00:00`);
    cur.setDate(cur.getDate() + 1);
    onDateChange(formatDateKey(cur));
  };

  const handleToday = () => {
    onDateChange(formatDateKey(new Date()));
  };

  // Status toggle handler
  const handleSetStatus = (member: Member, newStatus: AttendanceStatus) => {
    const existing = currentDayRecordMap.get(member.id);

    // Auto default sensible times based on status and shift
    let inTime = existing?.checkInTime;
    let outTime = existing?.checkOutTime;

    if (newStatus === 'present') {
      inTime = inTime || (member.shift === 'morning' ? '08:00' : member.shift === 'evening' ? '14:00' : '10:00');
      outTime = outTime || (member.shift === 'morning' ? '16:30' : member.shift === 'evening' ? '22:30' : '19:00');
    } else if (newStatus === 'late') {
      inTime = inTime || (member.shift === 'morning' ? '08:35' : member.shift === 'evening' ? '14:40' : '10:35');
      outTime = outTime || (member.shift === 'morning' ? '16:30' : member.shift === 'evening' ? '22:30' : '19:00');
    } else if (newStatus === 'half_day') {
      inTime = inTime || '10:00';
      outTime = '14:30';
    } else if (newStatus === 'absent' || newStatus === 'excused') {
      inTime = undefined;
      outTime = undefined;
    }

    const updated: AttendanceRecord = {
      id: existing ? existing.id : `att-${member.id}-${selectedDate}`,
      memberId: member.id,
      date: selectedDate,
      status: newStatus,
      checkInTime: inTime,
      checkOutTime: outTime,
      notes: existing?.notes,
      updatedAt: new Date().toISOString()
    };

    if (newStatus === 'present' || newStatus === 'late') {
      playPunchInSound();
    }
    onUpdateRecord(updated);
  };

  const handleTimeChange = (memberId: string, field: 'checkInTime' | 'checkOutTime', value: string) => {
    const existing = currentDayRecordMap.get(memberId);
    if (!existing) return;

    const updated: AttendanceRecord = {
      ...existing,
      [field]: value || undefined,
      updatedAt: new Date().toISOString()
    };
    if (field === 'checkOutTime' && value) {
      playPunchOutSound();
    } else if (field === 'checkInTime' && value) {
      playPunchInSound();
    }
    onUpdateRecord(updated);
  };

  // Bulk Actions
  const handleMarkAllPresent = () => {
    playPunchInSound();
    const newRecords: AttendanceRecord[] = activeMembers.map(m => {
      const existing = currentDayRecordMap.get(m.id);
      return {
        id: existing?.id || `att-${m.id}-${selectedDate}`,
        memberId: m.id,
        date: selectedDate,
        status: 'present',
        checkInTime: existing?.checkInTime || (m.shift === 'morning' ? '08:00' : '10:00'),
        checkOutTime: existing?.checkOutTime || (m.shift === 'morning' ? '16:30' : '19:00'),
        notes: existing?.notes,
        updatedAt: new Date().toISOString()
      };
    });

    onBulkUpdate(newRecords);

    // Trigger celebratory confetti
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 }
      });
    } catch {
      // safe fallback
    }
  };

  const handleMarkUnmarkedAbsent = () => {
    const toUpdate: AttendanceRecord[] = [];
    activeMembers.forEach(m => {
      if (!currentDayRecordMap.has(m.id)) {
        toUpdate.push({
          id: `att-${m.id}-${selectedDate}`,
          memberId: m.id,
          date: selectedDate,
          status: 'absent',
          checkInTime: undefined,
          checkOutTime: undefined,
          notes: 'Auto-marked absent (unreported)',
          updatedAt: new Date().toISOString()
        });
      }
    });

    if (toUpdate.length > 0) {
      onBulkUpdate(toUpdate);
    }
  };

  const handleSaveNote = () => {
    if (!activeNoteModalMemberId) return;
    const existing = currentDayRecordMap.get(activeNoteModalMemberId);
    if (existing) {
      onUpdateRecord({
        ...existing,
        notes: tempNoteText.trim() || undefined,
        updatedAt: new Date().toISOString()
      });
    } else {
      // create record with note and default absent or excused
      onUpdateRecord({
        id: `att-${activeNoteModalMemberId}-${selectedDate}`,
        memberId: activeNoteModalMemberId,
        date: selectedDate,
        status: 'excused',
        notes: tempNoteText.trim() || undefined,
        updatedAt: new Date().toISOString()
      });
    }
    setActiveNoteModalMemberId(null);
    setTempNoteText('');
  };

  const openNoteEditor = (memberId: string) => {
    const rec = currentDayRecordMap.get(memberId);
    setTempNoteText(rec?.notes || '');
    setActiveNoteModalMemberId(memberId);
  };

  const selectedDateObj = new Date(`${selectedDate}T00:00:00`);
  const isWeekend = selectedDateObj.getDay() === 0 || selectedDateObj.getDay() === 6;

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">

      {/* Top Date Navigation & Quick Actions Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

          {/* Date Picker Header */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
              <button
                id="att-prev-day-btn"
                onClick={handlePrevDay}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 px-3">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <input
                  type="date"
                  id="att-date-input"
                  value={selectedDate}
                  onChange={(e) => e.target.value && onDateChange(e.target.value)}
                  className="font-bold text-slate-900 bg-transparent border-none outline-hidden cursor-pointer text-sm"
                />
              </div>

              <button
                id="att-next-day-btn"
                onClick={handleNextDay}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              id="att-today-shortcut-btn"
              onClick={handleToday}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 transition-colors border border-slate-200"
            >
              Today
            </button>

            {isWeekend && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                Weekend Day
              </span>
            )}
          </div>

          {/* Bulk Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="mark-all-present-btn"
              onClick={handleMarkAllPresent}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs hover:scale-[1.02] active:scale-[0.98]"
            >
              <UserCheck className="w-4 h-4" />
              <span>Mark All Present</span>
            </button>

            <button
              id="mark-unmarked-absent-btn"
              onClick={handleMarkUnmarkedAbsent}
              disabled={stats.unmarked === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" />
              <span>Mark Remaining ({stats.unmarked}) Absent</span>
            </button>

            <button
              id="export-daily-csv-btn"
              onClick={() => exportDailyAttendanceCSV(selectedDate, activeMembers, records)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-indigo-600 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs"
              title="Download Day CSV"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Day CSV</span>
            </button>
          </div>

        </div>

        {/* Live Daily Progress Bar & Auto Sync Status */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between text-xs gap-3 mb-2">
            <div className="flex items-center gap-4 font-medium text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                Present: <strong className="text-slate-900">{stats.present}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                Late: <strong className="text-slate-900">{stats.late}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                Half Day: <strong className="text-slate-900">{stats.halfDay}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                Leave: <strong className="text-slate-900">{stats.excused}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                Absent: <strong className="text-slate-900">{stats.absent}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                Unmarked: <strong className="text-slate-900">{stats.unmarked}</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Auto-Sync: Live Punch Connected</span>
              </div>
              <div className="font-bold text-slate-900 text-xs">
                Attendance: <span className="text-indigo-600">{stats.rate}%</span> ({stats.marked}/{stats.total} Marked)
              </div>
            </div>
          </div>

          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${(stats.present / (stats.total || 1)) * 100}%` }} />
            <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${(stats.late / (stats.total || 1)) * 100}%` }} />
            <div className="h-full bg-purple-400 transition-all duration-300" style={{ width: `${(stats.halfDay / (stats.total || 1)) * 100}%` }} />
            <div className="h-full bg-blue-400 transition-all duration-300" style={{ width: `${(stats.excused / (stats.total || 1)) * 100}%` }} />
            <div className="h-full bg-rose-400 transition-all duration-300" style={{ width: `${(stats.absent / (stats.total || 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="att-search-input"
              placeholder="Search member by name, ID or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
            />
          </div>

          {/* Department Filter */}
          <div className="w-48 shrink-0">
            <select
              id="att-dept-filter-select"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs font-medium cursor-pointer"
            >
              <option value="All">All Departments</option>
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Filter Tabs & View Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
            {[
              { id: 'all', label: 'All' },
              { id: 'present', label: 'Present' },
              { id: 'late', label: 'Late' },
              { id: 'absent', label: 'Absent' },
              { id: 'unmarked', label: 'Unmarked' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${selectedStatusFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              id="att-view-cards-btn"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${viewMode === 'cards'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              id="att-view-table-btn"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${viewMode === 'table'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Attendance List: Cards View vs Table View */}
      {viewMode === 'cards' ? (
        <div className="space-y-4">
          {filteredMembers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredMembers.map((member, index) => {
                  const record = currentDayRecordMap.get(member.id);
                  const currentStatus = record?.status;
                  const hours = calculateWorkingHours(record?.checkInTime, record?.checkOutTime);

                  return (
                    <motion.div
                      key={member.id}
                      layout
                      initial={{ opacity: 0, y: 16, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                      transition={{
                        duration: 0.28,
                        delay: Math.min(index * 0.035, 0.35),
                        ease: [0.25, 1, 0.5, 1]
                      }}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                      className={`bg-white rounded-2xl p-5 border transition-all flex flex-col justify-between group shadow-xs hover:shadow-md ${currentStatus === 'present'
                          ? 'border-emerald-200/90'
                          : currentStatus === 'late'
                            ? 'border-amber-200/90'
                            : currentStatus === 'half_day'
                              ? 'border-purple-200/90'
                              : currentStatus === 'absent'
                                ? 'border-rose-200/90'
                                : currentStatus === 'excused'
                                  ? 'border-blue-200/90'
                                  : 'border-slate-200/80 bg-amber-50/10'
                        }`}
                    >
                      <div className="space-y-4">
                        {/* Card Header: Member Info & Actions */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {member.avatarUrl ? (
                              <img
                                src={member.avatarUrl}
                                alt={member.name}
                                onClick={() => onSelectPerson(member)}
                                className="w-11 h-11 rounded-xl object-cover shadow-xs border border-slate-200 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            ) : (
                              <div
                                onClick={() => onSelectPerson(member)}
                                className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${member.avatarColor} text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0 cursor-pointer hover:opacity-90 transition-opacity`}
                              >
                                {member.name.split(' ').map(n => n[0]).join('')}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h4
                                  onClick={() => onSelectPerson(member)}
                                  className="font-bold text-slate-900 text-sm hover:text-indigo-600 transition-colors cursor-pointer truncate"
                                >
                                  {member.name}
                                </h4>
                                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                                  {member.employeeId}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate">{member.role}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                                  <Building2 className="w-3 h-3 text-slate-400" />
                                  <span>{member.department}</span>
                                </span>
                                <span className="text-slate-300">•</span>
                                <span className="text-[11px] text-slate-500 capitalize">
                                  {member.shift} Shift
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Dossier Link */}
                          <button
                            id={`view-report-card-btn-${member.id}`}
                            onClick={() => onSelectPerson(member)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
                            title="View Member Attendance Dossier"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Status Action Buttons */}
                        <div className="pt-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                            Status
                          </span>
                          <div className="grid grid-cols-5 gap-1">
                            {/* Present */}
                            <button
                              id={`card-status-present-${member.id}`}
                              onClick={() => handleSetStatus(member, 'present')}
                              className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${currentStatus === 'present'
                                  ? 'bg-emerald-600 text-white shadow-xs scale-102 ring-2 ring-emerald-600/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                                }`}
                              title="Mark Present"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="text-[10px]">Present</span>
                            </button>

                            {/* Late */}
                            <button
                              id={`card-status-late-${member.id}`}
                              onClick={() => handleSetStatus(member, 'late')}
                              className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${currentStatus === 'late'
                                  ? 'bg-amber-500 text-white shadow-xs scale-102 ring-2 ring-amber-500/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                                }`}
                              title="Mark Late"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span className="text-[10px]">Late</span>
                            </button>

                            {/* Half Day */}
                            <button
                              id={`card-status-halfday-${member.id}`}
                              onClick={() => handleSetStatus(member, 'half_day')}
                              className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${currentStatus === 'half_day'
                                  ? 'bg-purple-600 text-white shadow-xs scale-102 ring-2 ring-purple-600/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-purple-50 hover:text-purple-700'
                                }`}
                              title="Mark Half Day (0.5)"
                            >
                              <Slash className="w-3.5 h-3.5" />
                              <span className="text-[10px]">Half</span>
                            </button>

                            {/* Absent */}
                            <button
                              id={`card-status-absent-${member.id}`}
                              onClick={() => handleSetStatus(member, 'absent')}
                              className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${currentStatus === 'absent'
                                  ? 'bg-rose-600 text-white shadow-xs scale-102 ring-2 ring-rose-600/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                                }`}
                              title="Mark Absent"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span className="text-[10px]">Absent</span>
                            </button>

                            {/* Excused / Leave */}
                            <button
                              id={`card-status-leave-${member.id}`}
                              onClick={() => handleSetStatus(member, 'excused')}
                              className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${currentStatus === 'excused'
                                  ? 'bg-blue-600 text-white shadow-xs scale-102 ring-2 ring-blue-600/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                                }`}
                              title="Mark Leave / Excused"
                            >
                              <CalendarCheck className="w-3.5 h-3.5" />
                              <span className="text-[10px]">Leave</span>
                            </button>
                          </div>
                        </div>

                        {/* Timestamps & Hours Section */}
                        <div className="pt-2 border-t border-slate-100">
                          {(currentStatus === 'present' || currentStatus === 'late' || currentStatus === 'half_day') ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-400 font-semibold uppercase">In:</span>
                                  <input
                                    type="time"
                                    value={record?.checkInTime || ''}
                                    onChange={(e) => handleTimeChange(member.id, 'checkInTime', e.target.value)}
                                    className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 font-mono text-xs text-slate-800 focus:outline-hidden focus:bg-white"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Out:</span>
                                  <input
                                    type="time"
                                    value={record?.checkOutTime || ''}
                                    onChange={(e) => handleTimeChange(member.id, 'checkOutTime', e.target.value)}
                                    className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 font-mono text-xs text-slate-800 focus:outline-hidden focus:bg-white"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-[11px] pt-1">
                                {hours !== '-' ? (
                                  <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                    Duration: {hours}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">Pending punch out</span>
                                )}
                                {record?.notes?.toLowerCase().includes('self') && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200/60">
                                    👤 User Stamped
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="py-2 text-center">
                              <span className="text-xs text-slate-400 italic">
                                {currentStatus === 'absent'
                                  ? 'Marked as Absent for today'
                                  : currentStatus === 'excused'
                                    ? 'Excused Leave for today'
                                    : 'Attendance not marked yet'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Notes / Remarks */}
                        <div className="pt-2 border-t border-slate-100">
                          <div
                            onClick={() => openNoteEditor(member.id)}
                            className="group/note cursor-pointer flex items-center justify-between p-2 rounded-xl border border-dashed border-slate-200 hover:border-indigo-300 hover:bg-slate-50/80 transition-colors"
                          >
                            <span className={`text-xs truncate ${record?.notes ? 'text-slate-800 font-medium' : 'text-slate-400 italic'
                              }`}>
                              {record?.notes || '+ Add note/remarks'}
                            </span>
                            <FileText className="w-3.5 h-3.5 text-slate-400 group-hover/note:text-indigo-600 shrink-0 ml-2" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 shadow-xs"
            >
              <p className="text-sm font-semibold text-slate-700">
                {activeMembers.length === 0
                  ? 'No staff members registered in your real database'
                  : 'No members found matching the filters'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {activeMembers.length === 0
                  ? 'Your roster is clean and ready. Add real staff members to start logging daily attendance.'
                  : 'Try adjusting your search keyword or selected department filter.'}
              </p>
              {activeMembers.length === 0 ? (
                <button
                  onClick={onOpenAddMember}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Add Real Employee</span>
                </button>
              ) : (
                <button
                  onClick={() => { setSearchTerm(''); setSelectedDept('All'); setSelectedStatusFilter('all'); }}
                  className="mt-3 text-xs text-indigo-600 hover:underline font-semibold"
                >
                  Clear search filters
                </button>
              )}
            </motion.div>
          )}

          {/* Footer Summary */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <span>
              Showing <strong>{filteredMembers.length}</strong> of {activeMembers.length} active staff members
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-700 font-medium">
                <Check className="w-3.5 h-3.5" /> Auto-saved locally
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Attendance Roster Table */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-64">Member & Role</th>
                  <th className="py-3.5 px-4 w-44">Department</th>
                  <th className="py-3.5 px-4 text-center">Status Action</th>
                  <th className="py-3.5 px-4 w-52">Time Stamp</th>
                  <th className="py-3.5 px-4 w-60">Notes / Remarks</th>
                  <th className="py-3.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.length > 0 ? (
                  filteredMembers.map((member, index) => {
                    const record = currentDayRecordMap.get(member.id);
                    const currentStatus = record?.status;
                    const hours = calculateWorkingHours(record?.checkInTime, record?.checkOutTime);

                    return (
                      <motion.tr
                        key={member.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.25) }}
                        className={`hover:bg-slate-50/80 transition-colors ${!record ? 'bg-amber-50/20' : ''
                          }`}
                      >
                        {/* Member Info */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {member.avatarUrl ? (
                              <img
                                src={member.avatarUrl}
                                alt={member.name}
                                onClick={() => onSelectPerson(member)}
                                className="w-10 h-10 rounded-xl object-cover shadow-xs border border-slate-200 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            ) : (
                              <div
                                onClick={() => onSelectPerson(member)}
                                className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${member.avatarColor} text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0 cursor-pointer hover:opacity-90 transition-opacity`}
                              >
                                {member.name.split(' ').map(n => n[0]).join('')}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-sm hover:text-indigo-600 cursor-pointer" onClick={() => onSelectPerson(member)}>
                                  {member.name}
                                </span>
                                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {member.employeeId}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate">{member.role}</p>
                            </div>
                          </div>
                        </td>

                        {/* Department & Shift */}
                        <td className="py-3.5 px-4">
                          <span className="text-xs font-semibold text-slate-800 block truncate">
                            {member.department}
                          </span>
                          <span className="text-[11px] text-slate-400 capitalize">
                            {member.shift} Shift
                          </span>
                        </td>

                        {/* Status Action Buttons */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1">

                            {/* Present Button */}
                            <button
                              id={`status-present-${member.id}`}
                              onClick={() => handleSetStatus(member, 'present')}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${currentStatus === 'present'
                                  ? 'bg-emerald-600 text-white shadow-xs scale-105 ring-2 ring-emerald-600/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                                }`}
                              title="Mark Present"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Present</span>
                            </button>

                            {/* Late Button */}
                            <button
                              id={`status-late-${member.id}`}
                              onClick={() => handleSetStatus(member, 'late')}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${currentStatus === 'late'
                                  ? 'bg-amber-500 text-white shadow-xs scale-105 ring-2 ring-amber-500/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                                }`}
                              title="Mark Late"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Late</span>
                            </button>

                            {/* Half Day Button */}
                            <button
                              id={`status-halfday-${member.id}`}
                              onClick={() => handleSetStatus(member, 'half_day')}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${currentStatus === 'half_day'
                                  ? 'bg-purple-600 text-white shadow-xs scale-105 ring-2 ring-purple-600/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-purple-50 hover:text-purple-700'
                                }`}
                              title="Mark Half Day (0.5)"
                            >
                              <Slash className="w-3.5 h-3.5" />
                              <span>Half</span>
                            </button>

                            {/* Absent Button */}
                            <button
                              id={`status-absent-${member.id}`}
                              onClick={() => handleSetStatus(member, 'absent')}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${currentStatus === 'absent'
                                  ? 'bg-rose-600 text-white shadow-xs scale-105 ring-2 ring-rose-600/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                                }`}
                              title="Mark Absent"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Absent</span>
                            </button>

                            {/* Excused / Leave Button */}
                            <button
                              id={`status-leave-${member.id}`}
                              onClick={() => handleSetStatus(member, 'excused')}
                              className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${currentStatus === 'excused'
                                  ? 'bg-blue-600 text-white shadow-xs scale-105 ring-2 ring-blue-600/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                                }`}
                              title="Mark Leave / Excused"
                            >
                              <span>Leave</span>
                            </button>

                          </div>
                        </td>

                        {/* Timestamps (In & Out) */}
                        <td className="py-3.5 px-4">
                          {(currentStatus === 'present' || currentStatus === 'late' || currentStatus === 'half_day') ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-[10px] text-slate-400 font-semibold uppercase w-6">In:</span>
                                <input
                                  type="time"
                                  value={record?.checkInTime || ''}
                                  onChange={(e) => handleTimeChange(member.id, 'checkInTime', e.target.value)}
                                  className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 font-mono text-xs text-slate-800 focus:outline-hidden focus:bg-white"
                                />
                                <span className="text-[10px] text-slate-400 font-semibold uppercase w-6 ml-1">Out:</span>
                                <input
                                  type="time"
                                  value={record?.checkOutTime || ''}
                                  onChange={(e) => handleTimeChange(member.id, 'checkOutTime', e.target.value)}
                                  className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 font-mono text-xs text-slate-800 focus:outline-hidden focus:bg-white"
                                />
                              </div>
                              {hours !== '-' && (
                                <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-medium pl-8">
                                  <span>Duration: {hours}</span>
                                  {record?.notes?.toLowerCase().includes('self') && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold border border-indigo-200/60">
                                      👤 User Stamped
                                    </span>
                                  )}
                                </div>
                              )}
                              {hours === '-' && record?.notes?.toLowerCase().includes('self') && (
                                <div className="text-[10px] pl-8">
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold border border-indigo-200/60">
                                    👤 User Stamped
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">
                              {currentStatus ? 'No punch required' : 'Not marked yet'}
                            </span>
                          )}
                        </td>

                        {/* Notes / Reason */}
                        <td className="py-3.5 px-4">
                          <div
                            onClick={() => openNoteEditor(member.id)}
                            className="group/note cursor-pointer flex items-center justify-between p-1.5 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors"
                          >
                            <span className={`text-xs truncate max-w-[180px] ${record?.notes ? 'text-slate-800 font-medium' : 'text-slate-400 italic'
                              }`}>
                              {record?.notes || '+ Add note/reason'}
                            </span>
                            <FileText className="w-3.5 h-3.5 text-slate-300 group-hover/note:text-indigo-600 shrink-0 ml-1" />
                          </div>
                        </td>

                        {/* View Report Link */}
                        <td className="py-3.5 px-3 text-right">
                          <button
                            id={`view-report-btn-${member.id}`}
                            onClick={() => onSelectPerson(member)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="View Member Attendance Dossier"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>

                      </motion.tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <p className="text-sm font-semibold text-slate-700">
                        {activeMembers.length === 0
                          ? 'No staff members registered in your real database'
                          : 'No members found matching the filters'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        {activeMembers.length === 0
                          ? 'Your roster is clean and ready. Add real staff members to start logging daily attendance.'
                          : 'Try adjusting your search keyword or selected department filter.'}
                      </p>
                      {activeMembers.length === 0 ? (
                        <button
                          onClick={onOpenAddMember}
                          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>+ Add Real Employee</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => { setSearchTerm(''); setSelectedDept('All'); setSelectedStatusFilter('all'); }}
                          className="mt-2 text-xs text-indigo-600 hover:underline font-semibold"
                        >
                          Clear search filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Summary */}
          <div className="p-4 bg-slate-50/80 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <span>
              Showing <strong>{filteredMembers.length}</strong> of {activeMembers.length} active staff members
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-700 font-medium">
                <Check className="w-3.5 h-3.5" /> Auto-saved locally
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Note Editor Modal */}
      <AnimatePresence>
        {activeNoteModalMemberId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  Attendance Note & Reason
                </h3>
                <button
                  onClick={() => setActiveNoteModalMemberId(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
                >
                  ✕
                </button>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-2">
                  Add remarks for {members.find(m => m.id === activeNoteModalMemberId)?.name} on {selectedDate}:
                </p>
                <textarea
                  id="note-modal-textarea"
                  value={tempNoteText}
                  onChange={(e) => setTempNoteText(e.target.value)}
                  placeholder="e.g., Doctor appointment, Subway signal delay, Work from home..."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800"
                />
              </div>

              {/* Quick suggestions */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Quick Suggestions</span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_NOTES.map(note => (
                    <button
                      key={note}
                      onClick={() => setTempNoteText(note)}
                      className="px-2.5 py-1 rounded-lg text-xs bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition-colors border border-slate-200/60"
                    >
                      {note}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setActiveNoteModalMemberId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="note-modal-save-btn"
                  onClick={handleSaveNote}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors"
                >
                  Save Remarks
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
