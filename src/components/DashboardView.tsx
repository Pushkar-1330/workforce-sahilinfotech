import React, { useState, useMemo, useCallback } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  CalendarClock,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  Award,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Calendar,
  Layers,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Radio,
  Zap
} from 'lucide-react';
import { AttendanceRecord, Member, LivePunchNotification } from '../types';
import { formatDateKey, isMemberDeleted } from '../utils/storage';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardViewProps {
  members: Member[];
  records: AttendanceRecord[];
  selectedDate: string;
  onDateChange?: (date: string) => void;
  onNavigateToAttendance: (date?: string) => void;
  onNavigateToReports: () => void;
  onSelectPerson: (member: Member) => void;
  onOpenAddMember?: () => void;
  onOpenDatabaseStudio?: () => void;
  recentLivePunches?: LivePunchNotification[];
  isLiveConnected?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  members,
  records,
  selectedDate,
  onDateChange,
  onNavigateToAttendance,
  onNavigateToReports,
  onSelectPerson,
  onOpenAddMember,
  onOpenDatabaseStudio,
  recentLivePunches = [],
  isLiveConnected = true
}) => {
  const realTodayKey = formatDateKey(new Date());
  const isViewingToday = selectedDate === realTodayKey;

  // Active members strictly from roster (excluding deleted or inactive)
  const activeMembers = useMemo(() => {
    return members.filter(m => m && m.id && m.active !== false && !isMemberDeleted(m.id) && (!m.email || !isMemberDeleted(m.email)));
  }, [members]);
  const activeMemberCount = activeMembers.length;

  // Resilient member identifier index (matches id, employeeId, email, and sanitized aliases)
  const activeMemberIdSet = useMemo(() => {
    const set = new Set<string>();
    activeMembers.forEach(m => {
      if (!m) return;
      if (typeof m.id === 'string') {
        set.add(m.id);
        set.add(m.id.toLowerCase().trim());
        set.add(m.id.toLowerCase().trim().replace(/^mem-/, ''));
        set.add('mem-' + m.id.toLowerCase().trim().replace(/^mem-/, ''));
      }
      if (typeof m.employeeId === 'string' && m.employeeId.trim()) {
        set.add(m.employeeId);
        set.add(m.employeeId.toLowerCase().trim());
      }
      if (typeof m.email === 'string' && m.email.trim()) {
        const em = m.email.toLowerCase().trim();
        set.add(em);
        set.add('mem-' + em.replace(/[^a-zA-Z0-9]/g, '_'));
        set.add(em.replace(/[^a-zA-Z0-9]/g, '_'));
      }
    });
    return set;
  }, [activeMembers]);

  const findMemberForRecord = useCallback((memberId: string) => {
    if (!memberId || typeof memberId !== 'string') return undefined;
    const norm = memberId.toLowerCase().trim();
    const stripped = norm.replace(/^mem-/, '');
    return activeMembers.find(m => {
      if (!m) return false;
      const mId = typeof m.id === 'string' ? m.id.toLowerCase().trim() : '';
      const mStripped = mId.replace(/^mem-/, '');
      const mEmail = typeof m.email === 'string' ? m.email.toLowerCase().trim() : '';
      const mEmpId = typeof m.employeeId === 'string' ? m.employeeId.toLowerCase().trim() : '';
      return (
        mId === norm ||
        mStripped === stripped ||
        (mEmail && (mEmail === norm || mEmail === stripped || norm.includes(mEmail.replace(/[^a-z0-9]/g, '_')))) ||
        (mEmpId && (mEmpId === norm || mEmpId === stripped))
      );
    });
  }, [activeMembers]);

  // Today / Selected Date Records (strictly belonging to existing active members)
  const todayRecords = useMemo(() => {
    return records.filter(r => {
      if (r.date !== selectedDate) return false;
      if (isMemberDeleted(r.memberId)) return false;
      return (
        activeMemberIdSet.has(r.memberId) ||
        activeMemberIdSet.has((r.memberId || '').toLowerCase().trim()) ||
        Boolean(findMemberForRecord(r.memberId))
      );
    });
  }, [records, selectedDate, activeMemberIdSet, findMemberForRecord]);

  // Unique dates with records across history
  const datesWithRecords = useMemo(() => {
    return Array.from(new Set(records.map(r => r.date))).filter(Boolean).sort();
  }, [records]);

  // Count of records on real today
  const realTodayRecordsCount = useMemo(() => {
    if (isViewingToday) return todayRecords.length;
    return records.filter(r => r.date === realTodayKey && (activeMemberIdSet.has(r.memberId) || findMemberForRecord(r.memberId))).length;
  }, [isViewingToday, todayRecords.length, records, realTodayKey, activeMemberIdSet, findMemberForRecord]);

  // Latest date with attendance records
  const latestDateWithRecords = useMemo(() => {
    return datesWithRecords.length > 0 ? datesWithRecords[datesWithRecords.length - 1] : undefined;
  }, [datesWithRecords]);

  const todayStats = useMemo(() => {
    let present = 0;
    let late = 0;
    let halfDay = 0;
    let absent = 0;
    let excused = 0;

    todayRecords.forEach(r => {
      const st = (r.status || '').toLowerCase().trim();
      if (st === 'present') present++;
      else if (st === 'late') late++;
      else if (st === 'half_day' || st === 'halfday') halfDay++;
      else if (st === 'absent') absent++;
      else if (st === 'excused' || st === 'leave' || st === 'on_leave') excused++;
      else if (r.checkInTime) {
        // Punched in without explicit absent flag
        present++;
      }
    });

    const totalAttending = present + late + halfDay;
    const totalMarked = todayRecords.length;
    const unmarked = Math.max(0, activeMemberCount - totalMarked);
    const effectiveAttending = present + late + (halfDay * 0.5);
    const attendanceRate = activeMemberCount > 0 ? Math.round((effectiveAttending / activeMemberCount) * 100) : 0;
    const punctualityRate = (present + late) > 0 ? Math.round((present / (present + late)) * 100) : 100;

    return {
      present,
      late,
      halfDay,
      absent,
      excused,
      totalAttending,
      unmarked,
      totalMarked,
      attendanceRate,
      punctualityRate
    };
  }, [todayRecords, activeMemberCount]);

  // Day shift helper
  const handleShiftDate = (days: number) => {
    if (!onDateChange) return;
    const [y, m, d] = selectedDate.split('-').map(Number);
    const current = new Date(y, m - 1, d);
    current.setDate(current.getDate() + days);
    onDateChange(formatDateKey(current));
  };

  // Selected Month Analysis
  const [yearStr, monthStr] = selectedDate.split('-');
  const currentYear = parseInt(yearStr, 10);
  const currentMonth = parseInt(monthStr, 10);
  const monthPrefix = `${yearStr}-${monthStr}`;

  const monthRecords = useMemo(() => {
    return records.filter(r => {
      if (!r.date.startsWith(monthPrefix)) return false;
      if (activeMemberIdSet.has(r.memberId)) return true;
      if (activeMemberIdSet.has((r.memberId || '').toLowerCase().trim())) return true;
      return Boolean(findMemberForRecord(r.memberId));
    });
  }, [records, monthPrefix, activeMemberIdSet, findMemberForRecord]);

  const monthlyTrendData = useMemo(() => {
    // Group records by date for the current month
    const dateMap = new Map<string, { present: number; late: number; absent: number; halfDay: number; total: number }>();

    // Get unique dates in this month sorted
    const datesInMonth: string[] = Array.from(new Set<string>(monthRecords.map(r => r.date))).sort();

    datesInMonth.forEach((d: string) => {
      dateMap.set(d, { present: 0, late: 0, absent: 0, halfDay: 0, total: 0 });
    });

    monthRecords.forEach(r => {
      const entry = dateMap.get(r.date);
      if (entry) {
        entry.total++;
        const st = (r.status || '').toLowerCase().trim();
        if (st === 'present') entry.present++;
        else if (st === 'late') entry.late++;
        else if (st === 'absent') entry.absent++;
        else if (st === 'half_day' || st === 'halfday') entry.halfDay++;
      }
    });

    return datesInMonth.map((d: string) => {
      const entry = dateMap.get(d)!;
      const dayNum = parseInt(d.split('-')[2], 10);
      const effective = entry.present + entry.late + (entry.halfDay * 0.5);
      const rate = entry.total > 0 ? Math.round((effective / activeMemberCount) * 100) : 0;
      return {
        date: d,
        displayDate: `Day ${dayNum}`,
        present: entry.present,
        late: entry.late,
        absent: entry.absent,
        halfDay: entry.halfDay,
        attendanceRate: rate
      };
    });
  }, [monthRecords, activeMemberCount]);

  // Department Breakdown
  const departmentStats = useMemo(() => {
    const deptMap = new Map<string, { total: number; present: number; late: number; absent: number }>();

    activeMembers.forEach(m => {
      if (!deptMap.has(m.department)) {
        deptMap.set(m.department, { total: 0, present: 0, late: 0, absent: 0 });
      }
    });

    todayRecords.forEach(r => {
      const mem = findMemberForRecord(r.memberId);
      if (mem && deptMap.has(mem.department)) {
        const stats = deptMap.get(mem.department)!;
        stats.total++;
        const st = (r.status || '').toLowerCase().trim();
        if (st === 'present') stats.present++;
        else if (st === 'late') stats.late++;
        else if (st === 'absent') stats.absent++;
        else if (st === 'half_day' || st === 'halfday') stats.present++;
      }
    });

    return Array.from(deptMap.entries()).map(([department, data]) => {
      const deptMembers = activeMembers.filter(m => m.department === department).length;
      const rate = deptMembers > 0 ? Math.round(((data.present + data.late) / deptMembers) * 100) : 0;
      return {
        department,
        deptMembers,
        present: data.present,
        late: data.late,
        absent: data.absent,
        attendanceRate: rate
      };
    }).sort((a, b) => b.attendanceRate - a.attendanceRate);
  }, [activeMembers, todayRecords, findMemberForRecord]);

  // Individual Leaderboards for this month (Punctuality Champions vs Needs Attention)
  const memberRankings = useMemo(() => {
    const map = new Map<string, { present: number; late: number; absent: number; halfDay: number; totalLogs: number }>();

    activeMembers.forEach(m => {
      map.set(m.id, { present: 0, late: 0, absent: 0, halfDay: 0, totalLogs: 0 });
    });

    monthRecords.forEach(r => {
      const mem = findMemberForRecord(r.memberId);
      const stat = mem ? map.get(mem.id) : map.get(r.memberId);
      if (stat) {
        stat.totalLogs++;
        const st = (r.status || '').toLowerCase().trim();
        if (st === 'present') stat.present++;
        else if (st === 'late') stat.late++;
        else if (st === 'absent') stat.absent++;
        else if (st === 'half_day' || st === 'halfday') stat.halfDay++;
      }
    });

    const evaluated = activeMembers.map(m => {
      const s = map.get(m.id)!;
      const effective = s.present + s.late + (s.halfDay * 0.5);
      const rate = s.totalLogs > 0 ? Math.round((effective / s.totalLogs) * 100) : 0;
      const punctuality = (s.present + s.late) > 0 ? Math.round((s.present / (s.present + s.late)) * 100) : 0;
      return {
        member: m,
        ...s,
        attendanceRate: rate,
        punctuality
      };
    });

    const champions = [...evaluated].sort((a, b) => b.attendanceRate - a.attendanceRate || b.punctuality - a.punctuality).slice(0, 4);
    const needsAttention = [...evaluated].filter(e => e.absent > 0 || e.late > 2).sort((a, b) => b.absent - a.absent || b.late - a.late).slice(0, 4);

    return { champions, needsAttention };
  }, [activeMembers, monthRecords, findMemberForRecord]);

  // Donut chart distribution data for today
  const donutData = useMemo(() => {
    const raw = [
      { name: 'Present', value: todayStats.present, color: '#10b981' },
      { name: 'Late', value: todayStats.late, color: '#f59e0b' },
      { name: 'Half Day', value: todayStats.halfDay, color: '#8b5cf6' },
      { name: 'Excused', value: todayStats.excused, color: '#3b82f6' },
      { name: 'Absent', value: todayStats.absent, color: '#ef4444' },
      { name: 'Unmarked', value: todayStats.unmarked, color: '#cbd5e1' }
    ].filter(d => d.value > 0);

    if (raw.length === 0) {
      return [{ name: 'No Records', value: 1, color: '#e2e8f0' }];
    }
    return raw;
  }, [todayStats]);

  const formattedMonthName = new Date(currentYear, currentMonth - 1, 1).toLocaleString('default', { month: 'long' });

  // Real-time live punches for selectedDate & today
  const livePunchesToday = useMemo(() => {
    const list: Array<{
      id: string;
      member: Member | undefined;
      record: AttendanceRecord;
      timeStr: string;
      isRecent: boolean;
      status: string;
    }> = [];

    const memberMap = new Map<string, Member>();
    activeMembers.forEach(m => {
      memberMap.set(m.id, m);
      if (m.employeeId) memberMap.set(m.employeeId, m);
    });

    todayRecords.forEach(r => {
      const m = memberMap.get(r.memberId) || findMemberForRecord(r.memberId);
      if (!m) return;
      const isRecent = recentLivePunches.some(lp => lp.memberId === r.memberId);
      list.push({
        id: r.id || `${r.memberId}_${r.date}`,
        member: m,
        record: r,
        timeStr: r.checkInTime || (r.status === 'present' ? '10:00' : '--'),
        isRecent,
        status: r.status
      });
    });

    // Sort by recent first
    return list.sort((a, b) => {
      if (a.isRecent && !b.isRecent) return -1;
      if (!a.isRecent && b.isRecent) return 1;
      const timeA = a.record.updatedAt || a.record.checkInTime || '';
      const timeB = b.record.updatedAt || b.record.checkInTime || '';
      return timeB.localeCompare(timeA);
    });
  }, [todayRecords, activeMembers, findMemberForRecord, recentLivePunches]);

  // Mini Dashboard State
  const [trendsViewMode, setTrendsViewMode] = useState<'weekly' | 'dayOfWeek' | 'volume'>('weekly');

  // Weekly Attendance Trends Data for Current Month
  const weeklyTrendsData = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const weeksDef = [
      { label: 'Week 1', dateRange: `Day 1 - 7`, startDay: 1, endDay: 7 },
      { label: 'Week 2', dateRange: `Day 8 - 14`, startDay: 8, endDay: 14 },
      { label: 'Week 3', dateRange: `Day 15 - 21`, startDay: 15, endDay: 21 },
      { label: 'Week 4', dateRange: `Day 22 - 28`, startDay: 22, endDay: 28 },
    ];
    if (daysInMonth > 28) {
      weeksDef.push({
        label: 'Week 5',
        dateRange: `Day 29 - ${daysInMonth}`,
        startDay: 29,
        endDay: daysInMonth
      });
    }

    return weeksDef.map(w => {
      const weekRecords = monthRecords.filter(r => {
        const day = parseInt(r.date.split('-')[2], 10);
        return day >= w.startDay && day <= w.endDay;
      });

      const distinctDays = Array.from(new Set(weekRecords.map(r => r.date))).sort();
      let present = 0;
      let late = 0;
      let absent = 0;
      let halfDay = 0;
      let excused = 0;

      weekRecords.forEach(r => {
        if (r.status === 'present') present++;
        else if (r.status === 'late') late++;
        else if (r.status === 'absent') absent++;
        else if (r.status === 'half_day') halfDay++;
        else if (r.status === 'excused') excused++;
      });

      const totalMarked = weekRecords.length;
      const effectivePresent = present + late + (halfDay * 0.5);

      const presentRate = totalMarked > 0 ? Math.round((effectivePresent / totalMarked) * 100) : 0;
      const absentRate = totalMarked > 0 ? Math.round((absent / totalMarked) * 100) : 0;
      const lateRate = totalMarked > 0 ? Math.round((late / totalMarked) * 100) : 0;
      const excusedRate = totalMarked > 0 ? Math.round((excused / totalMarked) * 100) : 0;
      const onTimeRate = (present + late) > 0 ? Math.round((present / (present + late)) * 100) : 0;

      return {
        week: w.label,
        dateRange: w.dateRange,
        present,
        late,
        absent,
        halfDay,
        excused,
        totalMarked,
        daysCount: distinctDays.length,
        presentRate,
        absentRate,
        lateRate,
        excusedRate,
        onTimeRate
      };
    });
  }, [monthRecords, currentYear, currentMonth]);

  // Day-of-Week Attendance Trends Data for Current Month
  const dayOfWeekTrendsData = useMemo(() => {
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const buckets: Record<string, { present: number; late: number; absent: number; halfDay: number; excused: number; count: number; distinctDates: Set<string> }> = {
      'Monday': { present: 0, late: 0, absent: 0, halfDay: 0, excused: 0, count: 0, distinctDates: new Set() },
      'Tuesday': { present: 0, late: 0, absent: 0, halfDay: 0, excused: 0, count: 0, distinctDates: new Set() },
      'Wednesday': { present: 0, late: 0, absent: 0, halfDay: 0, excused: 0, count: 0, distinctDates: new Set() },
      'Thursday': { present: 0, late: 0, absent: 0, halfDay: 0, excused: 0, count: 0, distinctDates: new Set() },
      'Friday': { present: 0, late: 0, absent: 0, halfDay: 0, excused: 0, count: 0, distinctDates: new Set() },
      'Saturday': { present: 0, late: 0, absent: 0, halfDay: 0, excused: 0, count: 0, distinctDates: new Set() },
      'Sunday': { present: 0, late: 0, absent: 0, halfDay: 0, excused: 0, count: 0, distinctDates: new Set() },
    };

    monthRecords.forEach(r => {
      const [y, m, d] = r.date.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dayIndex = (dateObj.getDay() + 6) % 7; // 0 for Mon, 6 for Sun
      const dayName = dayNames[dayIndex];
      if (buckets[dayName]) {
        buckets[dayName].count++;
        buckets[dayName].distinctDates.add(r.date);
        if (r.status === 'present') buckets[dayName].present++;
        else if (r.status === 'late') buckets[dayName].late++;
        else if (r.status === 'absent') buckets[dayName].absent++;
        else if (r.status === 'half_day') buckets[dayName].halfDay++;
        else if (r.status === 'excused') buckets[dayName].excused++;
      }
    });

    return dayNames.map(name => {
      const b = buckets[name];
      const total = b.count;
      const effective = b.present + b.late + (b.halfDay * 0.5);
      const presentRate = total > 0 ? Math.round((effective / total) * 100) : 0;
      const absentRate = total > 0 ? Math.round((b.absent / total) * 100) : 0;
      const lateRate = total > 0 ? Math.round((b.late / total) * 100) : 0;
      return {
        day: name.slice(0, 3),
        fullDay: name,
        present: b.present,
        late: b.late,
        absent: b.absent,
        halfDay: b.halfDay,
        excused: b.excused,
        totalMarked: total,
        daysLogged: b.distinctDates.size,
        presentRate,
        absentRate,
        lateRate
      };
    });
  }, [monthRecords]);

  // Aggregate Insights & Trend Metrics for Current Month
  const trendInsights = useMemo(() => {
    const totalMonthMarked = monthRecords.length;
    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalHalf = 0;

    monthRecords.forEach(r => {
      if (r.status === 'present') totalPresent++;
      else if (r.status === 'late') totalLate++;
      else if (r.status === 'absent') totalAbsent++;
      else if (r.status === 'half_day') totalHalf++;
    });

    const effectivePresent = totalPresent + totalLate + (totalHalf * 0.5);
    const avgMonthlyAttendanceRate = totalMonthMarked > 0 ? Math.round((effectivePresent / totalMonthMarked) * 100) : 0;
    const avgMonthlyAbsentRate = totalMonthMarked > 0 ? Math.round((totalAbsent / totalMonthMarked) * 100) : 0;
    const avgMonthlyLateRate = totalMonthMarked > 0 ? Math.round((totalLate / totalMonthMarked) * 100) : 0;

    // Best & Worst Weeks
    const activeWeeks = weeklyTrendsData.filter(w => w.totalMarked > 0);
    const bestWeek = activeWeeks.length > 0
      ? [...activeWeeks].sort((a, b) => b.presentRate - a.presentRate)[0]
      : null;
    const highestAbsentWeek = activeWeeks.length > 0
      ? [...activeWeeks].sort((a, b) => b.absentRate - a.absentRate)[0]
      : null;

    // Most absent day of week
    const activeDays = dayOfWeekTrendsData.filter(d => d.totalMarked > 0);
    const highestAbsentDay = activeDays.length > 0
      ? [...activeDays].sort((a, b) => b.absentRate - a.absentRate)[0]
      : null;

    // Week-over-Week trajectory (compare latest week with previous week)
    let wowChange: number | null = null;
    if (activeWeeks.length >= 2) {
      const latest = activeWeeks[activeWeeks.length - 1];
      const previous = activeWeeks[activeWeeks.length - 2];
      wowChange = latest.presentRate - previous.presentRate;
    }

    return {
      avgMonthlyAttendanceRate,
      avgMonthlyAbsentRate,
      avgMonthlyLateRate,
      bestWeek,
      highestAbsentWeek,
      highestAbsentDay,
      wowChange,
      activeWeeksCount: activeWeeks.length
    };
  }, [monthRecords, weeklyTrendsData, dayOfWeekTrendsData]);

  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const formattedSelectedDateFull = selectedDateObj.toLocaleDateString('default', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const formattedSelectedDateShort = selectedDateObj.toLocaleDateString('default', {
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">

      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Live Automated Analytics
              </span>
              {isViewingToday ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Viewing Today
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Log Date
                </span>
              )}
              <span className="text-xs text-slate-300 font-medium">
                {formattedSelectedDateFull}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Daily Attendance & Roster Overview
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Real-time tracking for {activeMemberCount} active staff members across {departmentStats.length} departments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              id="dash-take-attendance-btn"
              onClick={() => onNavigateToAttendance(selectedDate)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <CalendarClock className="w-4 h-4" />
              <span>{isViewingToday ? "Mark Today's Attendance" : `Mark Attendance (${formattedSelectedDateShort})`}</span>
            </button>

            <button
              id="dash-export-excel-btn"
              onClick={onNavigateToReports}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold backdrop-blur-md transition-all border border-white/10 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export Monthly Excel</span>
            </button>
          </div>
        </div>

        {/* Date Selector & Day Navigation Toolbar */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-800/90 rounded-xl p-1 border border-slate-700/80">
            <button
              id="dash-prev-day-btn"
              onClick={() => handleShiftDate(-1)}
              title="Previous Day"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              id="dash-today-btn"
              onClick={() => onDateChange && onDateChange(realTodayKey)}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${isViewingToday
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
            >
              Today
            </button>

            <button
              id="dash-next-day-btn"
              onClick={() => handleShiftDate(1)}
              title="Next Day"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-700 mx-1"></div>

            <div className="flex items-center gap-1.5 px-2 py-0.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <input
                type="date"
                id="dash-interactive-date-picker"
                value={selectedDate}
                onChange={(e) => e.target.value && onDateChange && onDateChange(e.target.value)}
                className="bg-transparent text-white font-medium border-none outline-hidden cursor-pointer focus:ring-0 p-0 text-xs text-slate-200"
              />
            </div>
          </div>

          {/* Quick status notice for date navigation */}
          <div className="flex flex-wrap items-center gap-2">
            {todayRecords.length > 0 ? (
              <span className="flex items-center gap-1.5 text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{todayRecords.length} records logged for this date</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-300 bg-amber-950/60 border border-amber-800/60 px-2.5 py-1 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>0 logs for {selectedDate}</span>
              </span>
            )}
            {!isViewingToday && realTodayRecordsCount > 0 && (
              <button
                onClick={() => onDateChange && onDateChange(realTodayKey)}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/30 hover:bg-indigo-500/50 text-indigo-200 border border-indigo-500/40 font-semibold transition-all cursor-pointer"
              >
                Jump to Today ({realTodayRecordsCount} logs) →
              </button>
            )}
            {todayRecords.length === 0 && latestDateWithRecords && latestDateWithRecords !== selectedDate && (
              <button
                onClick={() => onDateChange && onDateChange(latestDateWithRecords)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition-all cursor-pointer"
              >
                View Latest Data ({latestDateWithRecords}) →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Zero Members Clean Slate Guide */}
      {activeMemberCount === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border-2 border-dashed border-indigo-300 rounded-2xl p-8 text-center shadow-xs"
        >
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-4 shadow-xs">
            <Users className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Real Cloud Database Ready • Clean Slate (0 Sample Data)
          </h2>
          <p className="text-sm text-slate-600 max-w-xl mx-auto mb-6 leading-relaxed">
            All fake sample records have been purged. Your database is completely ready for real company data. As Admin, manually add your real employees, paste a roster spreadsheet, or mark daily attendance.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {onOpenAddMember && (
              <button
                id="empty-add-first-employee-btn"
                onClick={onOpenAddMember}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                <span>+ Add First Real Employee</span>
              </button>
            )}
            {onOpenDatabaseStudio && (
              <button
                id="empty-open-studio-btn"
                onClick={onOpenDatabaseStudio}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow-md transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Open Real Database Studio</span>
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Present Today */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isViewingToday ? 'Present Today' : `Present (${formattedSelectedDateShort})`}
            </span>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {todayStats.totalAttending}
            </span>
            <span className="text-xs font-medium text-slate-500">/ {activeMemberCount} members</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50/80 px-2 py-1 rounded-md w-fit">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{todayStats.attendanceRate}% Attendance Rate</span>
            {todayStats.late > 0 && (
              <span className="text-amber-700 font-normal">({todayStats.present} on-time, {todayStats.late} late)</span>
            )}
          </div>
        </motion.div>

        {/* Late Arrivals */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Late Arrivals</span>
            <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{todayStats.late}</span>
            <span className="text-xs font-medium text-slate-500">punctuality alert</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 font-medium bg-amber-50/80 px-2 py-1 rounded-md w-fit">
            <span>{todayStats.punctualityRate}% On-Time Ratio</span>
          </div>
        </motion.div>

        {/* Absent */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Absent / Leave</span>
            <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UserX className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{todayStats.absent + todayStats.excused}</span>
            <span className="text-xs font-medium text-slate-500">({todayStats.absent} Abs / {todayStats.excused} Leave)</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-rose-700 font-medium bg-rose-50/80 px-2 py-1 rounded-md w-fit">
            <span>{todayStats.halfDay} Half Day Shifts</span>
          </div>
        </motion.div>

        {/* Unmarked / Action Needed */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Roster Status</span>
            <div className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{todayStats.totalMarked}</span>
            <span className="text-xs font-medium text-slate-500">/ {activeMemberCount} marked</span>
          </div>
          <div className={`mt-3 flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md w-fit ${todayStats.unmarked === 0 ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'bg-slate-100 text-slate-700'
            }`}>
            <span>{todayStats.unmarked === 0 ? '✓ All Marked' : `${todayStats.unmarked} Pending Mark`}</span>
          </div>
        </motion.div>

      </div>

      {/* Real-Time Live Attendance Pulse & Live Activity Stream */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3.5 w-3.5 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                  Live Attendance Stream & Real-Time Sync
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Live Active
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Bidirectional real-time sync: employee self-service punches & admin updates reflect here immediately
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="dash-view-today-attendance-btn"
              onClick={() => onNavigateToAttendance(selectedDate)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              <span>View Today's Roster ({todayRecords.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Punched Members Grid / Stream */}
        {livePunchesToday.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {livePunchesToday.slice(0, 8).map((punch) => {
              const mem = punch.member;
              const isPresent = punch.status === 'present';
              const isLate = punch.status === 'late';
              const isExcused = punch.status === 'excused';

              return (
                <div
                  key={punch.id}
                  onClick={() => mem && onSelectPerson(mem)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer group hover:shadow-xs relative overflow-hidden ${punch.isRecent
                      ? 'bg-emerald-50/50 border-emerald-300 ring-2 ring-emerald-500/20'
                      : 'bg-slate-50/80 border-slate-200/80 hover:border-indigo-300 hover:bg-white'
                    }`}
                >
                  {punch.isRecent && (
                    <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider animate-pulse">
                      Just Punched
                    </div>
                  )}

                  <div className="flex items-start gap-2.5">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${mem?.avatarColor || 'from-indigo-600 to-violet-600'} text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}>
                      {mem?.name ? mem.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'EMP'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                          {mem?.name || punch.record.memberId}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                        <span className="truncate">{mem?.department || 'Staff'}</span>
                        <span>•</span>
                        <span className="font-mono text-[10px]">{mem?.employeeId || ''}</span>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${isPresent
                            ? 'bg-emerald-100 text-emerald-800'
                            : isLate
                              ? 'bg-amber-100 text-amber-800'
                              : isExcused
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-rose-100 text-rose-800'
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isPresent ? 'bg-emerald-600' : isLate ? 'bg-amber-600' : 'bg-blue-600'}`} />
                          {punch.status}
                        </span>

                        <div className="flex items-center gap-1 text-slate-700 text-xs font-mono font-bold">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{punch.timeStr}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Awaiting Live Punches For {selectedDate}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              When employees log in and punch their attendance from their User Portal, or when you mark shifts, real-time records stream in here automatically.
            </p>
            <div className="pt-1 flex items-center justify-center gap-2">
              <button
                onClick={() => onNavigateToAttendance(selectedDate)}
                className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors cursor-pointer"
              >
                Open Daily Attendance Board →
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Attendance Trends Mini Dashboard (Weekly / Day-of-Week / Rate Visualizer) */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.25 }}
        className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6"
      >
        {/* Header & View Mode Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
                <BarChart3 className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                Attendance Trends Mini Dashboard
              </span>
              <span className="text-xs text-slate-400 font-medium">
                • {formattedMonthName} {currentYear}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Monthly Attendance & Absenteeism Pattern Analysis
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Weekly present vs absent ratios, weekday compliance trends, and shift volume dynamics.
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 self-start lg:self-auto shrink-0">
            <button
              id="btn-trend-weekly"
              onClick={() => setTrendsViewMode('weekly')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${trendsViewMode === 'weekly'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Weekly Rates</span>
            </button>
            <button
              id="btn-trend-dayofweek"
              onClick={() => setTrendsViewMode('dayOfWeek')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${trendsViewMode === 'dayOfWeek'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Day-of-Week Pattern</span>
            </button>
            <button
              id="btn-trend-volume"
              onClick={() => setTrendsViewMode('volume')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${trendsViewMode === 'volume'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Volume & Flow</span>
            </button>
          </div>
        </div>

        {/* High-Level Trend KPI Pill Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Monthly Avg Present Rate */}
          <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-emerald-800 uppercase tracking-wider">Avg Present Rate</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-emerald-950">{trendInsights.avgMonthlyAttendanceRate}%</span>
                <span className="text-[10px] text-emerald-700 font-semibold">this month</span>
              </div>
            </div>
          </div>

          {/* Monthly Avg Absent Rate */}
          <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <XCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-rose-800 uppercase tracking-wider">Avg Absent Rate</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-rose-950">{trendInsights.avgMonthlyAbsentRate}%</span>
                <span className="text-[10px] text-rose-700 font-semibold">({trendInsights.avgMonthlyLateRate}% late)</span>
              </div>
            </div>
          </div>

          {/* Peak Attended Week */}
          <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-indigo-800 uppercase tracking-wider">Top Performing Week</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-indigo-950 truncate">
                  {trendInsights.bestWeek ? `${trendInsights.bestWeek.week} (${trendInsights.bestWeek.presentRate}%)` : 'Pending Data'}
                </span>
              </div>
            </div>
          </div>

          {/* Absenteeism Peak Day */}
          <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-amber-800 uppercase tracking-wider">Peak Absence Day</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-amber-950 truncate">
                  {trendInsights.highestAbsentDay ? `${trendInsights.highestAbsentDay.fullDay} (${trendInsights.highestAbsentDay.absentRate}%)` : 'None Flagged'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Recharts Chart Section */}
        <div className="h-72 w-full pt-2">
          {monthRecords.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <BarChart3 className="w-8 h-8 text-slate-300 mb-1" />
              <span>No attendance entries recorded for {formattedMonthName} {currentYear}</span>
            </div>
          ) : trendsViewMode === 'weekly' ? (
            /* Weekly Present vs Absent Rates Chart */
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weeklyTrendsData}
                margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                barGap={6}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[190px] border border-slate-700">
                          <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
                            <span className="font-bold text-white text-sm">{item.week}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{item.dateRange}</span>
                          </div>
                          <div className="flex items-center justify-between text-emerald-300">
                            <span>Present Rate:</span>
                            <span className="font-bold text-white">{item.presentRate}% ({item.present} shifts)</span>
                          </div>
                          <div className="flex items-center justify-between text-rose-300">
                            <span>Absent Rate:</span>
                            <span className="font-bold text-white">{item.absentRate}% ({item.absent} shifts)</span>
                          </div>
                          <div className="flex items-center justify-between text-amber-300">
                            <span>Late Rate:</span>
                            <span className="font-bold text-white">{item.lateRate}% ({item.late} shifts)</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-800 text-[11px]">
                            <span>Punctuality:</span>
                            <span className="font-semibold text-indigo-300">{item.onTimeRate}% on-time</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 500 }}
                  iconType="circle"
                />
                <Bar
                  dataKey="presentRate"
                  name="Present Rate (%)"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={38}
                />
                <Bar
                  dataKey="absentRate"
                  name="Absent Rate (%)"
                  fill="#ef4444"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={38}
                />
                <Bar
                  dataKey="lateRate"
                  name="Late Rate (%)"
                  fill="#f59e0b"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={38}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : trendsViewMode === 'dayOfWeek' ? (
            /* Day of Week Attendance Behavior */
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dayOfWeekTrendsData}
                margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                barGap={4}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 min-w-[170px]">
                          <p className="font-bold text-white border-b border-slate-700 pb-1">{item.fullDay} Trends</p>
                          <p className="text-emerald-300">Present Rate: <span className="font-bold text-white">{item.presentRate}%</span> ({item.present})</p>
                          <p className="text-rose-300">Absent Rate: <span className="font-bold text-white">{item.absentRate}%</span> ({item.absent})</p>
                          <p className="text-amber-300">Late Rate: <span className="font-bold text-white">{item.lateRate}%</span> ({item.late})</p>
                          <p className="text-slate-400 text-[10px] pt-1">Logged across {item.daysLogged} {item.fullDay}s</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 500 }}
                  iconType="circle"
                />
                <Bar dataKey="presentRate" name="Present Rate (%)" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={28} />
                <Bar dataKey="absentRate" name="Absent Rate (%)" fill="#ef4444" radius={[5, 5, 0, 0]} maxBarSize={28} />
                <Bar dataKey="lateRate" name="Late Rate (%)" fill="#f59e0b" radius={[5, 5, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            /* Volume & Flow Composed Chart */
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={weeklyTrendsData}
                margin={{ top: 10, right: 20, left: -15, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#6366f1' }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
                          <p className="font-bold text-white border-b border-slate-700 pb-1">{item.week} Summary</p>
                          <p className="text-emerald-300">Present Count: <span className="font-bold text-white">{item.present}</span></p>
                          <p className="text-amber-300">Late Count: <span className="font-bold text-white">{item.late}</span></p>
                          <p className="text-rose-300">Absent Count: <span className="font-bold text-white">{item.absent}</span></p>
                          <p className="text-indigo-300 font-bold">Attendance Rate: {item.presentRate}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 500 }}
                />
                <Bar yAxisId="left" dataKey="present" name="Present Count" fill="#10b981" stackId="shifts" maxBarSize={38} radius={[0, 0, 0, 0]} />
                <Bar yAxisId="left" dataKey="late" name="Late Count" fill="#f59e0b" stackId="shifts" maxBarSize={38} radius={[0, 0, 0, 0]} />
                <Bar yAxisId="left" dataKey="absent" name="Absent Count" fill="#ef4444" stackId="shifts" maxBarSize={38} radius={[4, 4, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="presentRate"
                  name="Attendance %"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#4f46e5', strokeWidth: 2, stroke: '#ffffff' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Weekly Breakdown Micro Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {weeklyTrendsData.map((w, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-indigo-200 transition-all space-y-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">{w.week}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{w.dateRange}</span>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-extrabold ${w.presentRate >= 90 ? 'text-emerald-600' : w.presentRate >= 75 ? 'text-indigo-600' : 'text-rose-600'}`}>
                    {w.presentRate}% Present
                  </span>
                  <span className="text-[10px] text-slate-400 block">{w.totalMarked} total shifts</span>
                </div>
              </div>

              {/* Progress split bar */}
              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${w.presentRate}%` }}
                  title={`Present: ${w.presentRate}%`}
                />
                <div
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${w.lateRate}%` }}
                  title={`Late: ${w.lateRate}%`}
                />
                <div
                  className="h-full bg-rose-500 transition-all duration-300"
                  style={{ width: `${w.absentRate}%` }}
                  title={`Absent: ${w.absentRate}%`}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-600 pt-0.5">
                <span className="flex items-center gap-1 text-emerald-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {w.present} Pres
                </span>
                <span className="flex items-center gap-1 text-amber-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  {w.late} Late
                </span>
                <span className="flex items-center gap-1 text-rose-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  {w.absent} Abs
                </span>
              </div>
            </div>
          ))}
        </div>

      </motion.div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Trend Area Chart (Spans 2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Monthly Attendance Trend ({formattedMonthName} {currentYear})
              </h2>
              <p className="text-xs text-slate-500">
                Daily attendance percentage & active participant trajectory
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                <span>Attendance %</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>Present Count</span>
              </div>
            </div>
          </div>

          <div className="h-72 w-full">
            {monthlyTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="displayDate" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
                            <p className="font-bold text-slate-200 border-b border-slate-700 pb-1">{data.date}</p>
                            <p className="text-indigo-300">Attendance Rate: <span className="font-bold text-white">{data.attendanceRate}%</span></p>
                            <p className="text-emerald-300">Present: <span className="font-bold text-white">{data.present}</span></p>
                            <p className="text-amber-300">Late: <span className="font-bold text-white">{data.late}</span></p>
                            <p className="text-rose-300">Absent: <span className="font-bold text-white">{data.absent}</span></p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="attendanceRate"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#attendanceGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                No logs recorded yet for this month
              </div>
            )}
          </div>
        </div>

        {/* Status Distribution Donut */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Today's Status Distribution
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Realtime breakdown for {selectedDate}
            </p>
            <div className="h-48 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0];
                        return (
                          <div className="bg-slate-900 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold">
                            {d.name}: {d.value}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-extrabold text-slate-900">{todayStats.attendanceRate}%</span>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Present Rate</span>
              </div>
            </div>
          </div>

          {/* Legend Grid */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
            {donutData.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-50">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }}></span>
                  <span className="text-slate-600 truncate">{d.name}</span>
                </div>
                <span className="font-bold text-slate-900 ml-1">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Department Breakdown & Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Department Attendance Matrix */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Department Performance
              </h2>
              <p className="text-xs text-slate-500">
                Today's attendance compliance by team
              </p>
            </div>
          </div>

          <div className="space-y-3.5">
            {departmentStats.map((dept, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 truncate max-w-[170px]">{dept.department}</span>
                  <span className="font-bold text-slate-900">{dept.attendanceRate}% ({dept.present + dept.late}/{dept.deptMembers})</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(dept.present / (dept.deptMembers || 1)) * 100}%` }}
                    title={`Present: ${dept.present}`}
                  />
                  <div
                    className="h-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${(dept.late / (dept.deptMembers || 1)) * 100}%` }}
                    title={`Late: ${dept.late}`}
                  />
                  <div
                    className="h-full bg-rose-400 transition-all duration-500"
                    style={{ width: `${(dept.absent / (dept.deptMembers || 1)) * 100}%` }}
                    title={`Absent: ${dept.absent}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Punctuality & Attendance Champions */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">
                Monthly Champions
              </h2>
            </div>
            <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
              Top Performers
            </span>
          </div>

          <div className="space-y-2.5">
            {memberRankings.champions.map((item, idx) => (
              <div
                key={item.member.id}
                onClick={() => onSelectPerson(item.member)}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50/60 border border-slate-100 hover:border-indigo-100 cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    {item.member.avatarUrl ? (
                      <img
                        src={item.member.avatarUrl}
                        alt={item.member.name}
                        className="w-9 h-9 rounded-xl object-cover shadow-xs border border-slate-200"
                      />
                    ) : (
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${item.member.avatarColor} text-white flex items-center justify-center font-bold text-xs shadow-xs`}>
                        {item.member.name.split(' ').map(n => n[0]).join('')}
                      </div>
                    )}
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-[10px] font-bold text-slate-900 flex items-center justify-center shadow-xs">
                      {idx + 1}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 truncate transition-colors">
                      {item.member.name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {item.member.department}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-emerald-600 block">
                    {item.attendanceRate}%
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {item.present} on-time
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Needs Attention / Absentee Watch */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
              <h2 className="text-base font-bold text-slate-900">
                Attendance Alerts
              </h2>
            </div>
            <span className="text-[11px] font-semibold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">
              Follow Up
            </span>
          </div>

          <div className="space-y-2.5">
            {memberRankings.needsAttention.length > 0 ? (
              memberRankings.needsAttention.map((item) => (
                <div
                  key={item.member.id}
                  onClick={() => onSelectPerson(item.member)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-rose-50/50 border border-slate-100 hover:border-rose-100 cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.member.avatarUrl ? (
                      <img
                        src={item.member.avatarUrl}
                        alt={item.member.name}
                        className="w-9 h-9 rounded-xl object-cover shadow-xs border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${item.member.avatarColor} text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0`}>
                        {item.member.name.split(' ').map(n => n[0]).join('')}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 group-hover:text-rose-600 truncate transition-colors">
                        {item.member.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {item.member.role}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-rose-600 block">
                      {item.absent} Absences
                    </span>
                    <span className="text-[10px] text-amber-600 font-medium">
                      {item.late} Late
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs">
                🎉 No frequent absentees this month. Attendance is healthy!
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
