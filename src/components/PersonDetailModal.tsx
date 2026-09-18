import React, { useState, useMemo } from 'react';
import { 
  X, 
  Download, 
  Calendar, 
  Clock, 
  TrendingUp, 
  Award, 
  AlertCircle, 
  UserCheck, 
  FileSpreadsheet,
  Mail,
  Phone,
  Briefcase,
  Layers,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Camera,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { AttendanceRecord, Member } from '../types';
import { exportPersonAttendanceExcel, getStatusLabel, calculateWorkingHours } from '../utils/excelExport';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface PersonDetailModalProps {
  member: Member | null;
  records: AttendanceRecord[];
  onUpdateMember?: (updated: Member) => void;
  onClose: () => void;
}

export const PersonDetailModal: React.FC<PersonDetailModalProps> = ({
  member,
  records,
  onUpdateMember,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(() => new Date().getMonth() + 1); // 1-12
  const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);

  if (!member) return null;

  // Filter all records for this member
  const memberRecords = useMemo(() => {
    return records
      .filter(r => r.memberId === member.id)
      .sort((a, b) => b.date.localeCompare(a.date)); // newest first
  }, [records, member.id]);

  // Overall calculations
  const stats = useMemo(() => {
    let present = 0;
    let late = 0;
    let halfDay = 0;
    let absent = 0;
    let excused = 0;

    memberRecords.forEach(r => {
      if (r.status === 'present') present++;
      else if (r.status === 'late') late++;
      else if (r.status === 'half_day') halfDay++;
      else if (r.status === 'absent') absent++;
      else if (r.status === 'excused') excused++;
    });

    const totalDays = memberRecords.length;
    const effectivePresent = present + late + (halfDay * 0.5);
    const attendanceRate = totalDays > 0 ? Math.round((effectivePresent / totalDays) * 100) : 0;
    const punctualityScore = (present + late) > 0 ? Math.round((present / (present + late)) * 100) : 0;

    return {
      totalDays,
      present,
      late,
      halfDay,
      absent,
      excused,
      attendanceRate,
      punctualityScore
    };
  }, [memberRecords]);

  // Monthly breakdown for chart
  const monthlyStatsData = useMemo(() => {
    const monthMap = new Map<string, { present: number; total: number; label: string }>();

    memberRecords.forEach(r => {
      const [y, m] = r.date.split('-');
      const key = `${y}-${m}`;
      if (!monthMap.has(key)) {
        const monthName = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleString('default', { month: 'short' });
        monthMap.set(key, { present: 0, total: 0, label: `${monthName} '${y.slice(2)}` });
      }
      const item = monthMap.get(key)!;
      item.total++;
      if (r.status === 'present' || r.status === 'late') item.present++;
      else if (r.status === 'half_day') item.present += 0.5;
    });

    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, val]) => ({
        monthKey: key,
        monthName: val.label,
        attendanceRate: val.total > 0 ? Math.round((val.present / val.total) * 100) : 0,
        total: val.total
      }));
  }, [memberRecords]);

  // Calendar matrix for selected calendar month
  const calendarDays = useMemo(() => {
    const totalDays = new Date(calendarYear, calendarMonth, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth - 1, 1).getDay(); // 0 is Sun
    const prefix = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}`;

    const recordByDate = new Map<string, AttendanceRecord>();
    memberRecords.filter(r => r.date.startsWith(prefix)).forEach(r => {
      recordByDate.set(r.date, r);
    });

    const days = [];
    // Padding before day 1
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ dayNum: null, dateStr: '', record: null, isWeekend: false });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${prefix}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(calendarYear, calendarMonth - 1, d);
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
      const record = recordByDate.get(dateStr) || null;

      days.push({
        dayNum: d,
        dateStr,
        record,
        isWeekend
      });
    }

    return days;
  }, [calendarYear, calendarMonth, memberRecords]);

  // Filtered detailed logs
  const filteredLogs = useMemo(() => {
    return memberRecords.filter(r => {
      const matchSearch = r.date.includes(searchTerm) || (r.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [memberRecords, searchTerm, statusFilter]);

  const handlePrevMonth = () => {
    if (calendarMonth === 1) {
      setCalendarMonth(12);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 12) {
      setCalendarMonth(1);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const currentMonthName = new Date(calendarYear, calendarMonth - 1, 1).toLocaleString('default', { month: 'long' });

  const handleSavePhoto = (newAvatarUrl: string | undefined) => {
    if (onUpdateMember) {
      onUpdateMember({
        ...member,
        avatarUrl: newAvatarUrl
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            {/* Interactive Avatar with Camera Upload Overlay */}
            <div className="relative group shrink-0">
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={member.name}
                  className="w-16 h-16 rounded-2xl object-cover shadow-lg ring-4 ring-white/20 border-2 border-indigo-400"
                />
              ) : (
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${member.avatarColor} text-white flex items-center justify-center font-extrabold text-xl shadow-lg ring-4 ring-white/10`}>
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
              )}
              
              {/* Camera Action Overlay Button */}
              <button
                id="edit-member-photo-overlay-btn"
                type="button"
                onClick={() => setIsPhotoEditorOpen(true)}
                title="Change or take profile photo"
                className="absolute inset-0 rounded-2xl bg-slate-950/70 text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 flex flex-col items-center justify-center transition-all cursor-pointer backdrop-blur-xs"
              >
                <Camera className="w-5 h-5 text-indigo-300 mb-0.5" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPhotoEditorOpen(true)}
                title="Update photo"
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white border-2 border-slate-900 flex items-center justify-center shadow-md transition-transform hover:scale-110 cursor-pointer sm:hidden"
              >
                <Camera className="w-3 h-3" />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {member.name}
                </h2>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-indigo-200 border border-white/10">
                  {member.employeeId}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  Active
                </span>
              </div>
              <p className="text-slate-300 text-xs sm:text-sm mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{member.role}</span>
                <span>•</span>
                <span className="text-indigo-300">{member.department}</span>
                <span>•</span>
                <span className="capitalize">{member.shift} Shift</span>
              </p>
              
              <div className="mt-2">
                <button
                  id="header-change-photo-btn"
                  type="button"
                  onClick={() => setIsPhotoEditorOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-indigo-200 hover:text-white text-xs font-semibold transition-all border border-white/15 cursor-pointer shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{member.avatarUrl ? 'Update Profile Photo' : 'Upload / Take Photo'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              id="export-person-excel-btn"
              onClick={() => exportPersonAttendanceExcel(member, records)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Dossier Excel</span>
            </button>
            <button
              id="close-person-modal-btn"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Key Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Overall Attendance</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-indigo-600">{stats.attendanceRate}%</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{stats.totalDays} Total Tracked Days</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Punctuality Score</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-emerald-600">{stats.punctualityScore}%</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{stats.present} On-time punches</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Late & Half Days</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-amber-600">{stats.late + stats.halfDay}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{stats.late} Late, {stats.halfDay} Half Day</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Absences & Leaves</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-rose-600">{stats.absent + stats.excused}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{stats.absent} Absent, {stats.excused} Leaves</p>
            </div>

          </div>

          {/* Interactive Calendar Punch Grid */}
          <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>Monthly Attendance Heatmap</span>
                </h3>
                <p className="text-xs text-slate-500">Daily punch status cards for the selected month</p>
              </div>

              {/* Month Selector */}
              <div className="flex items-center gap-2 bg-white rounded-xl p-1 border border-slate-200 shadow-2xs">
                <button
                  onClick={handlePrevMonth}
                  className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-slate-800 px-2">
                  {currentMonthName} {calendarYear}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Calendar Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase mb-1">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            {/* Calendar Grid Cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((cell, idx) => {
                if (cell.dayNum === null) {
                  return <div key={`empty-${idx}`} className="h-14 rounded-xl bg-transparent"></div>;
                }

                const rec = cell.record;
                let bgClass = 'bg-white text-slate-700 border-slate-200/80';
                let badgeClass = 'bg-slate-100 text-slate-500';
                let statusLetter = '-';

                if (rec) {
                  if (rec.status === 'present') {
                    bgClass = 'bg-emerald-50/80 text-emerald-950 border-emerald-200 ring-1 ring-emerald-400/20';
                    badgeClass = 'bg-emerald-500 text-white';
                    statusLetter = 'P';
                  } else if (rec.status === 'late') {
                    bgClass = 'bg-amber-50/80 text-amber-950 border-amber-200 ring-1 ring-amber-400/20';
                    badgeClass = 'bg-amber-500 text-white';
                    statusLetter = 'L';
                  } else if (rec.status === 'half_day') {
                    bgClass = 'bg-purple-50/80 text-purple-950 border-purple-200 ring-1 ring-purple-400/20';
                    badgeClass = 'bg-purple-500 text-white';
                    statusLetter = 'HD';
                  } else if (rec.status === 'excused') {
                    bgClass = 'bg-blue-50/80 text-blue-950 border-blue-200 ring-1 ring-blue-400/20';
                    badgeClass = 'bg-blue-500 text-white';
                    statusLetter = 'E';
                  } else if (rec.status === 'absent') {
                    bgClass = 'bg-rose-50/80 text-rose-950 border-rose-200 ring-1 ring-rose-400/20';
                    badgeClass = 'bg-rose-500 text-white';
                    statusLetter = 'A';
                  }
                } else if (cell.isWeekend) {
                  bgClass = 'bg-slate-100/60 text-slate-400 border-dashed border-slate-200';
                  statusLetter = 'OFF';
                }

                return (
                  <div
                    key={cell.dateStr}
                    title={`${cell.dateStr}: ${rec ? `${getStatusLabel(rec.status)} (${rec.checkInTime || '-'})` : (cell.isWeekend ? 'Weekend' : 'Unmarked')}`}
                    className={`h-14 p-1.5 rounded-xl border flex flex-col justify-between transition-all hover:scale-105 cursor-pointer shadow-2xs ${bgClass}`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span>{cell.dayNum}</span>
                      <span className={`text-[9px] font-bold px-1 py-0.2 rounded ${badgeClass}`}>
                        {statusLetter}
                      </span>
                    </div>
                    {rec?.checkInTime ? (
                      <span className="text-[9px] font-mono font-medium truncate">
                        {rec.checkInTime}
                      </span>
                    ) : (
                      <span className="text-[9px] opacity-60 truncate">
                        {rec?.notes ? 'Note' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 pt-3 mt-3 border-t border-slate-200 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Present (P)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Late (L)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Half Day (HD)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Leave (E)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Absent (A)
              </span>
            </div>
          </div>

          {/* Historical Logs List */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                Detailed Punch Logs History ({filteredLogs.length})
              </h3>
              
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search date or remark..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="half_day">Half Day</option>
                  <option value="absent">Absent</option>
                  <option value="excused">Leave</option>
                </select>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Day</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Check-In</th>
                    <th className="py-2.5 px-3">Check-Out</th>
                    <th className="py-2.5 px-3">Hours</th>
                    <th className="py-2.5 px-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length > 0 ? (
                    filteredLogs.map(r => {
                      const d = new Date(`${r.date}T00:00:00`);
                      const dayName = d.toLocaleDateString('default', { weekday: 'short' });
                      const hours = calculateWorkingHours(r.checkInTime, r.checkOutTime);

                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{r.date}</td>
                          <td className="py-2.5 px-3 text-slate-500">{dayName}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              r.status === 'present' ? 'bg-emerald-100 text-emerald-800' :
                              r.status === 'late' ? 'bg-amber-100 text-amber-800' :
                              r.status === 'half_day' ? 'bg-purple-100 text-purple-800' :
                              r.status === 'excused' ? 'bg-blue-100 text-blue-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {getStatusLabel(r.status)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">{r.checkInTime || '-'}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">{r.checkOutTime || '-'}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">{hours}</td>
                          <td className="py-2.5 px-3 text-slate-600 truncate max-w-[150px]">{r.notes || '-'}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No logs recorded matching filter criteria
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Joined: {member.joinDate} • Email: {member.email}</span>
          <div className="flex items-center gap-2">
            <button
              id="footer-update-photo-btn"
              type="button"
              onClick={() => setIsPhotoEditorOpen(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Camera className="w-3.5 h-3.5 text-indigo-600" />
              <span>{member.avatarUrl ? 'Change Photo' : 'Upload Photo'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors cursor-pointer"
            >
              Close Dossier
            </button>
          </div>
        </div>

      </motion.div>

      {/* Profile Photo Editor Modal (Browser Camera or Device Picker) */}
      <AnimatePresence>
        {isPhotoEditorOpen && (
          <ProfilePhotoEditor
            currentAvatarUrl={member.avatarUrl}
            memberName={member.name}
            avatarColor={member.avatarColor}
            onSavePhoto={handleSavePhoto}
            onClose={() => setIsPhotoEditorOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
