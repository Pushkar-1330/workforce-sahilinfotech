import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  Calendar, 
  CalendarDays, 
  FileSpreadsheet, 
  LogOut, 
  Check, 
  UserCheck, 
  Info,
  CalendarCheck2,
  ShieldCheck,
  Send,
  Camera,
  Lock,
  Sparkles,
  CalendarOff,
  AlertCircle,
  MessageSquare,
  Trash2,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { AttendanceRecord, AttendanceStatus, AuthSession, Member, LeaveRequest, LeaveType } from '../types';
import { formatDateKey, safeLocalStorageSetItem } from '../utils/storage';
import { playPunchInSound, playPunchOutSound, playLeaveSubmittedSound } from '../utils/audioAlerts';
import { getTodayAttendanceRecord, subscribeToMemberTodayAttendance } from '../lib/firebase';
import { sendLiveActionToServer } from '../utils/realtimeSync';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';
import { LiveHeaderClock } from './LiveHeaderClock';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

interface UserPortalViewProps {
  session: AuthSession;
  member: Member | undefined;
  records: AttendanceRecord[];
  selectedDate: string;
  leaves?: LeaveRequest[];
  onSubmitLeaveApplication?: (leave: LeaveRequest) => void;
  onCancelLeave?: (leaveId: string) => void;
  onUpdateRecord: (record: AttendanceRecord, memberName?: string) => void;
  onUpdateMember?: (updated: Member) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
}

export const UserPortalView: React.FC<UserPortalViewProps> = ({
  session,
  member,
  records,
  selectedDate,
  leaves = [],
  onSubmitLeaveApplication,
  onCancelLeave,
  onUpdateRecord,
  onUpdateMember,
  onLogout,
  onOpenSettings
}) => {
  // Real today key - self-service punch-in/out MUST ALWAYS bind strictly to the actual local date
  const realTodayKey = useMemo(() => formatDateKey(new Date()), []);
  const realTodayFormatted = useMemo(() => {
    return new Date().toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const [activeMonth, setActiveMonth] = useState<string>(() => realTodayKey.substring(0, 7)); // YYYY-MM
  const [customNote, setCustomNote] = useState<string>('');
  const [leaveStartDate, setLeaveStartDate] = useState<string>(realTodayKey);
  const [leaveEndDate, setLeaveEndDate] = useState<string>(realTodayKey);
  const [leaveType, setLeaveType] = useState<LeaveType>('sick');
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [leaveSuccess, setLeaveSuccess] = useState(false);
  const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);
  const [confirmWithdrawId, setConfirmWithdrawId] = useState<string | null>(null);
  const [cloudTodayRecord, setCloudTodayRecord] = useState<AttendanceRecord | null>(null);
  const [isVerifyingPunch, setIsVerifyingPunch] = useState<boolean>(true);
  const [recordMonthFilter, setRecordMonthFilter] = useState<string>('all');
  const [recordStatusFilter, setRecordStatusFilter] = useState<string>('all');
  const [recordSearchQuery, setRecordSearchQuery] = useState<string>('');

  // All possible aliases for this employee (directory ID, session memberId, email, sanitized forms, account ID)
  const allMyAliases = useMemo(() => {
    const list = new Set<string>();
    if (member?.id) list.add(member.id);
    if (session.memberId) list.add(session.memberId);
    if (session.userId) list.add(session.userId);
    if (session.email) {
      const em = session.email.toLowerCase().trim();
      list.add(em);
      list.add('mem-' + em.replace(/[^a-zA-Z0-9]/g, '_'));
      list.add(em.replace(/[^a-zA-Z0-9]/g, '_'));
    }
    if (member?.email) {
      const memEm = member.email.toLowerCase().trim();
      list.add(memEm);
      list.add('mem-' + memEm.replace(/[^a-zA-Z0-9]/g, '_'));
      list.add(memEm.replace(/[^a-zA-Z0-9]/g, '_'));
    }
    if (member?.employeeId) {
      list.add(member.employeeId);
      list.add(member.employeeId.toLowerCase().trim());
      list.add(member.employeeId.toUpperCase().trim());
    }
    try {
      const raw = localStorage.getItem('app_attendance_accounts_v1') || localStorage.getItem('app_attendance_accounts_v3');
      if (raw) {
        const accs = JSON.parse(raw);
        if (Array.isArray(accs)) {
          const acc = accs.find((a: any) => 
            (a.email && session.email && a.email.toLowerCase().trim() === session.email.toLowerCase().trim()) ||
            (a.memberId && session.memberId && a.memberId === session.memberId) ||
            (a.id && session.userId && a.id === session.userId)
          );
          if (acc) {
            if (acc.memberId) list.add(acc.memberId);
            if (acc.id) list.add(acc.id);
            if (acc.employeeId) list.add(acc.employeeId);
          }
        }
      }
    } catch {}
    return Array.from(list);
  }, [member, session]);

  // Canonical member ID for attendance writes
  const memberId = member?.id || session.memberId || allMyAliases[0] || ('mem-' + (session.email || 'user').replace(/[^a-zA-Z0-9]/g, '_'));

  // Dedicated punch cache key for this user and today's date to guarantee instant zero-latency punch restoration on page reload
  const userSafeKey = useMemo(() => {
    return (session.email || memberId).toLowerCase().replace(/[^a-z0-9]/g, '_');
  }, [session.email, memberId]);

  const punchCacheKey = useMemo(() => {
    return `app_user_today_punch_${userSafeKey}_${realTodayKey}`;
  }, [userSafeKey, realTodayKey]);

  // Robust check if any record in the database belongs to this logged in employee
  const isMyRecord = useCallback((r: AttendanceRecord): boolean => {
    if (!r) return false;
    const rMemberId = (r.memberId || '').toLowerCase().trim();
    const rId = (r.id || '').toLowerCase().trim();

    for (const alias of allMyAliases) {
      const aLower = alias.toLowerCase().trim();
      if (!aLower) continue;
      if (rMemberId === aLower) return true;
      if (rId.includes(aLower)) return true;
      const sanitized = aLower.replace(/[^a-z0-9]/g, '_');
      if (sanitized && (rMemberId.includes(sanitized) || rId.includes(sanitized))) return true;
    }

    if (session.name && r.notes && r.notes.toLowerCase().includes(session.name.toLowerCase().trim())) {
      return true;
    }
    if (member?.name && r.notes && r.notes.toLowerCase().includes(member.name.toLowerCase().trim())) {
      return true;
    }

    return false;
  }, [allMyAliases, session.name, member?.name]);

  const memberRecords = useMemo(() => {
    const matched = records.filter(isMyRecord);
    // Deduplicate by date so there is only one record per date with latest updates prioritized
    const dateMap = new Map<string, AttendanceRecord>();
    matched.forEach(r => {
      const existing = dateMap.get(r.date);
      if (!existing) {
        dateMap.set(r.date, r);
      } else {
        const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const curTime = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
        if (curTime >= existingTime) {
          dateMap.set(r.date, r);
        }
      }
    });
    return Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [records, isMyRecord]);

  // Available unique months from member records
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(realTodayKey.substring(0, 7));
    memberRecords.forEach(r => {
      if (r.date && r.date.length >= 7) {
        months.add(r.date.substring(0, 7));
      }
    });
    return Array.from(months).sort().reverse();
  }, [memberRecords, realTodayKey]);

  // Filtered personal records for table view
  const displayRecords = useMemo(() => {
    return memberRecords.filter(r => {
      if (recordMonthFilter !== 'all' && !r.date.startsWith(recordMonthFilter)) {
        return false;
      }
      if (recordStatusFilter !== 'all' && r.status !== recordStatusFilter) {
        return false;
      }
      if (recordSearchQuery.trim()) {
        const q = recordSearchQuery.toLowerCase().trim();
        const matchDate = r.date.includes(q);
        const matchStatus = r.status.toLowerCase().includes(q);
        const matchNotes = (r.notes || '').toLowerCase().includes(q);
        return matchDate || matchStatus || matchNotes;
      }
      return true;
    });
  }, [memberRecords, recordMonthFilter, recordStatusFilter, recordSearchQuery]);

  // Cross-device punch synchronization across Mobile, Laptop, and all Browsers
  useEffect(() => {
    let isMounted = true;
    setIsVerifyingPunch(true);

    // 1. Instant check from current records prop (populated via SSE from Node server)
    const existingInProps = records.find(r => r.date === realTodayKey && isMyRecord(r));
    if (existingInProps && (existingInProps.checkInTime || existingInProps.status === 'present' || existingInProps.status === 'late' || existingInProps.status === 'half_day')) {
      setCloudTodayRecord(existingInProps);
      try {
        localStorage.setItem(punchCacheKey, JSON.stringify(existingInProps));
      } catch {}
      setIsVerifyingPunch(false);
    }

    // 2. Direct fetch from Node live server state /api/live/state (guarantees cross-device punch sync between mobile & laptop)
    fetch('/api/live/state')
      .then(res => {
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) return res.json();
        return null;
      })
      .then(data => {
        if (!isMounted || !data || !Array.isArray(data.records)) return;
        const serverRec = data.records.find((r: AttendanceRecord) => r.date === realTodayKey && isMyRecord(r));
        if (serverRec && (serverRec.checkInTime || serverRec.status === 'present' || serverRec.status === 'late' || serverRec.status === 'half_day')) {
          setCloudTodayRecord(serverRec);
          safeLocalStorageSetItem(punchCacheKey, JSON.stringify(serverRec));
          onUpdateRecord(serverRec, member?.name || session.name);
        }
        setIsVerifyingPunch(false);
      })
      .catch(() => {});

    // 3. Instant direct Firestore fetch on mount (if available)
    getTodayAttendanceRecord(allMyAliases, realTodayKey)
      .then((rec) => {
        if (!isMounted) return;
        if (rec && (rec.checkInTime || rec.status === 'present' || rec.status === 'late' || rec.status === 'half_day' || rec.status === 'excused')) {
          setCloudTodayRecord(rec);
          safeLocalStorageSetItem(punchCacheKey, JSON.stringify(rec));
          onUpdateRecord(rec, member?.name || session.name);
        }
        setIsVerifyingPunch(false);
      })
      .catch(() => {
        if (isMounted) setIsVerifyingPunch(false);
      });

    // 4. Real-time subscription so if user punches on mobile while laptop is open, laptop updates live!
    const unsub = subscribeToMemberTodayAttendance(allMyAliases, realTodayKey, (rec) => {
      if (!isMounted) return;
      if (rec && (rec.checkInTime || rec.status === 'present' || rec.status === 'late' || rec.status === 'half_day' || rec.status === 'excused')) {
        setCloudTodayRecord(rec);
        safeLocalStorageSetItem(punchCacheKey, JSON.stringify(rec));
        onUpdateRecord(rec, member?.name || session.name);
      }
      setIsVerifyingPunch(false);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [allMyAliases, realTodayKey, punchCacheKey, member?.name, session.name, onUpdateRecord, isMyRecord, records]);

  // Filter leaves belonging to this member (strictly only real leaves - resilient to all email and ID aliases)
  const myLeaves = useMemo(() => {
    const myAliasesSet = new Set(allMyAliases.map(a => a.toLowerCase().trim()));
    if (memberId) myAliasesSet.add(memberId.toLowerCase().trim());
    if (session.memberId) myAliasesSet.add(session.memberId.toLowerCase().trim());
    if (session.email) myAliasesSet.add(session.email.toLowerCase().trim());
    if (member?.email) myAliasesSet.add(member.email.toLowerCase().trim());
    if (member?.id) myAliasesSet.add(member.id.toLowerCase().trim());

    return (leaves || [])
      .filter(l => {
        if (!l || !l.id || l.id.startsWith('leave-sample-') || l.id.includes('sample')) return false;
        const lMemberId = (l.memberId || '').toLowerCase().trim();
        if (myAliasesSet.has(lMemberId)) return true;
        if (session.name && l.memberName && l.memberName.toLowerCase().trim() === session.name.toLowerCase().trim()) return true;
        if (member?.name && l.memberName && l.memberName.toLowerCase().trim() === member.name.toLowerCase().trim()) return true;
        return false;
      })
      .sort((a, b) => new Date(b.appliedAt || b.startDate || '').getTime() - new Date(a.appliedAt || a.startDate || '').getTime());
  }, [leaves, allMyAliases, memberId, session.memberId, session.email, session.name, member?.email, member?.id, member?.name]);

  // Today's record for punch in/out MUST always be realTodayKey (today's actual date)
  const todayRecord = useMemo(() => {
    // 1. Check in memberRecords state (contains latest updates from Admin or live stream)
    const foundInState = memberRecords.find(r => r.date === realTodayKey);

    // 2. Check local punch cache
    let cached: AttendanceRecord | null = null;
    try {
      const cachedRaw = localStorage.getItem(punchCacheKey);
      if (cachedRaw) {
        const parsed: AttendanceRecord = JSON.parse(cachedRaw);
        if (parsed && parsed.date === realTodayKey) {
          cached = parsed;
        }
      }
    } catch {}

    // 3. Check cloudTodayRecord
    const cloudRec = (cloudTodayRecord && cloudTodayRecord.date === realTodayKey) ? cloudTodayRecord : null;

    // Collect all candidates
    const candidates = [foundInState, cloudRec, cached].filter(Boolean) as AttendanceRecord[];
    if (candidates.length === 0) return undefined;

    // Prioritize latest update
    candidates.sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    const best = candidates[0];
    if (best.status === 'absent') {
      try { localStorage.removeItem(punchCacheKey); } catch {}
    }
    return best;
  }, [cloudTodayRecord, memberRecords, realTodayKey, punchCacheKey]);

  // Sync punch cache with todayRecord whenever state updates with a valid check-in
  useEffect(() => {
    if (todayRecord && todayRecord.date === realTodayKey && todayRecord.status !== 'absent' && (todayRecord.checkInTime || todayRecord.checkOutTime || todayRecord.status === 'present' || todayRecord.status === 'late')) {
      safeLocalStorageSetItem(punchCacheKey, JSON.stringify(todayRecord));
    }
  }, [todayRecord, punchCacheKey, realTodayKey]);

  // Today punch flags
  const hasPunchedIn = Boolean(
    todayRecord &&
    todayRecord.status !== 'absent' &&
    (todayRecord.checkInTime || todayRecord.status === 'present' || todayRecord.status === 'late')
  );
  const hasPunchedOut = Boolean(todayRecord?.checkOutTime && todayRecord?.status !== 'absent');
  const isDayCompleted = hasPunchedIn && hasPunchedOut;

  // Calculate duration worked today
  const todayDurationFormatted = useMemo(() => {
    if (!todayRecord?.checkInTime || !todayRecord?.checkOutTime) return null;
    const [inH, inM] = todayRecord.checkInTime.split(':').map(Number);
    const [outH, outM] = todayRecord.checkOutTime.split(':').map(Number);
    const diffMin = (outH * 60 + outM) - (inH * 60 + inM);
    if (diffMin <= 0) return '0 hrs';
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs} hrs`;
  }, [todayRecord]);

  // Current Month Records
  const monthRecords = useMemo(() => {
    return memberRecords.filter(r => r.date.startsWith(activeMonth));
  }, [memberRecords, activeMonth]);

  // Monthly KPI calculations (standard shift: 10:00 AM - 07:00 PM = 9 hours)
  const stats = useMemo(() => {
    const totalDays = monthRecords.length;
    if (totalDays === 0) {
      return { totalDays: 0, present: 0, late: 0, halfDay: 0, absent: 0, excused: 0, rate: 100, onTimeRatio: 100, totalHours: 0 };
    }

    const present = monthRecords.filter(r => r.status === 'present').length;
    const late = monthRecords.filter(r => r.status === 'late').length;
    const halfDay = monthRecords.filter(r => r.status === 'half_day').length;
    const absent = monthRecords.filter(r => r.status === 'absent').length;
    const excused = monthRecords.filter(r => r.status === 'excused').length;

    const effective = present + late + (halfDay * 0.5);
    const denominator = totalDays - excused;
    const rate = denominator > 0 ? Math.min(100, Math.round((effective / denominator) * 100)) : 100;
    const onTimeRatio = (present + late) > 0 ? Math.round((present / (present + late)) * 100) : 100;

    // Calculate total hours based on 10AM - 7PM (9 hours shift)
    let hours = 0;
    monthRecords.forEach(r => {
      if (r.checkInTime && r.checkOutTime) {
        const [inH, inM] = r.checkInTime.split(':').map(Number);
        const [outH, outM] = r.checkOutTime.split(':').map(Number);
        const diff = (outH * 60 + outM) - (inH * 60 + inM);
        if (diff > 0) hours += diff / 60;
      } else if (r.status === 'present' || r.status === 'late') {
        hours += 9.0;
      } else if (r.status === 'half_day') {
        hours += 4.5;
      }
    });

    return { totalDays, present, late, halfDay, absent, excused, rate, onTimeRatio, totalHours: Math.round(hours) };
  }, [monthRecords]);

  // Handle Quick Self Punch Check-In (Allowed ONCE per day)
  const handleCheckIn = () => {
    if (hasPunchedIn) return; // Prevent double punch in on the same day

    const now = new Date();
    const todayDateKey = formatDateKey(now);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Shift is 10:00 AM to 07:00 PM (After 10:15 is marked late)
    const isLate = (now.getHours() > 10 || (now.getHours() === 10 && now.getMinutes() > 15));
    const status: AttendanceStatus = isLate ? 'late' : 'present';

    const targetMemberId = member?.id || session.memberId || memberId;
    const docId = todayRecord?.id || `att-${targetMemberId}-${todayDateKey}`;

    const updated: AttendanceRecord = {
      id: docId,
      memberId: targetMemberId,
      date: todayDateKey,
      status,
      checkInTime: timeStr,
      checkOutTime: todayRecord?.checkOutTime,
      notes: customNote || (isLate ? 'Late arrival self check-in (after 10:15 AM)' : 'On-time self check-in (10:00 AM shift)'),
      updatedAt: new Date().toISOString()
    };

    setCloudTodayRecord(updated);

    // Instant local cache save for reload resilience
    safeLocalStorageSetItem(punchCacheKey, JSON.stringify(updated));

    const resolvedName = member?.name || session.name;
    playPunchInSound();
    onUpdateRecord(updated, resolvedName);
    sendLiveActionToServer('PUNCH_ATTENDANCE', {
      record: updated,
      memberName: resolvedName
    }).catch(console.warn);
    sendLiveActionToServer('UPDATE_RECORD', {
      record: updated,
      memberName: resolvedName
    }).catch(console.warn);
    setCustomNote('');
  };

  // Handle Quick Self Punch Check-Out (Allowed ONCE per day after Punch In)
  const handleCheckOut = () => {
    if (!hasPunchedIn || hasPunchedOut) return; // Must punch in first and cannot punch out twice

    const now = new Date();
    const todayDateKey = formatDateKey(now);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const targetMemberId = member?.id || session.memberId || memberId;
    const docId = todayRecord?.id || `att-${targetMemberId}-${todayDateKey}`;

    const updated: AttendanceRecord = {
      id: docId,
      memberId: targetMemberId,
      date: todayDateKey,
      status: todayRecord?.status || 'present',
      checkInTime: todayRecord?.checkInTime || '10:00',
      checkOutTime: timeStr,
      notes: customNote ? (todayRecord?.notes ? `${todayRecord.notes} | ${customNote}` : customNote) : (todayRecord?.notes || 'Completed shift check-out'),
      updatedAt: new Date().toISOString()
    };

    setCloudTodayRecord(updated);

    // Instant local cache save for reload resilience
    safeLocalStorageSetItem(punchCacheKey, JSON.stringify(updated));

    const resolvedName = member?.name || session.name;
    playPunchOutSound();
    onUpdateRecord(updated, resolvedName);
    sendLiveActionToServer('PUNCH_ATTENDANCE', {
      record: updated,
      memberName: resolvedName
    }).catch(console.warn);
    sendLiveActionToServer('UPDATE_RECORD', {
      record: updated,
      memberName: resolvedName
    }).catch(console.warn);
    setCustomNote('');
  };

  // Submit Leave / Time-Off Application
  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveReason.trim() || !leaveStartDate) return;

    setIsSubmittingLeave(true);
    playLeaveSubmittedSound();
    const resolvedName = member?.name || session.name || (session.email ? session.email.split('@')[0] : 'Staff Member');
    const sDate = new Date(leaveStartDate + 'T00:00:00');
    const eDate = new Date((leaveEndDate || leaveStartDate) + 'T00:00:00');
    const totalDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / (1000 * 3600 * 24)) + 1);

    const newLeave: LeaveRequest = {
      id: 'leave-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      memberId,
      memberName: resolvedName,
      employeeId: member?.employeeId || (session.email ? session.email.split('@')[0].toUpperCase() : 'EMP-001'),
      department: member?.department || 'Operations & Admin',
      avatarColor: member?.avatarColor || 'from-indigo-600 to-purple-600',
      leaveType,
      startDate: leaveStartDate,
      endDate: leaveEndDate || leaveStartDate,
      totalDays,
      reason: leaveReason.trim(),
      status: 'pending',
      appliedAt: new Date().toISOString()
    };

    if (onSubmitLeaveApplication) {
      onSubmitLeaveApplication(newLeave);
    } else {
      // Fallback to local attendance record
      const existing = memberRecords.find(r => r.date === leaveStartDate);
      const newRecord: AttendanceRecord = {
        id: existing?.id || `att-${memberId}-${leaveStartDate}`,
        memberId,
        date: leaveStartDate,
        status: 'excused',
        notes: `Pending Leave (${leaveType}): ${leaveReason}`,
        updatedAt: new Date().toISOString()
      };
      onUpdateRecord(newRecord, resolvedName);
    }

    setIsSubmittingLeave(false);
    setLeaveSuccess(true);
    setLeaveReason('');
    setTimeout(() => setLeaveSuccess(false), 4000);
  };

  // Export Personal Excel
  const exportPersonalExcel = () => {
    const memberName = member?.name || session.name;
    const sorted = [...memberRecords].sort((a, b) => b.date.localeCompare(a.date));

    const rows = sorted.map((r, i) => ({
      '#': i + 1,
      'Date': r.date,
      'Status': r.status.toUpperCase().replace('_', ' '),
      'Check In': r.checkInTime || '--',
      'Check Out': r.checkOutTime || '--',
      'Notes & Remarks': r.notes || '',
      'Last Updated': new Date(r.updatedAt).toLocaleString()
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 22 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'My Attendance');
    XLSX.writeFile(wb, `${memberName.replace(/\s+/g, '_')}_Attendance_Record.xlsx`);
  };

  // Status visual badge helper
  const getStatusBadge = (status: AttendanceStatus) => {
    switch (status) {
      case 'present':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Present</span>;
      case 'late':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">Late</span>;
      case 'half_day':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">Half Day</span>;
      case 'excused':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">Excused</span>;
      case 'absent':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">Absent</span>;
    }
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      
      {/* Employee Top Profile & Punch Card Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          
          {/* User Profile Info */}
          <div className="flex items-center gap-4">
            <div 
              onClick={() => setIsPhotoEditorOpen(true)}
              className="relative w-16 h-16 rounded-2xl overflow-hidden cursor-pointer group shrink-0 shadow-md border-2 border-indigo-100"
              title="Click to update profile photo"
            >
              {member?.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={session?.name || 'Profile'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className={`w-full h-full bg-gradient-to-tr ${member?.avatarColor || 'from-indigo-600 to-violet-600'} flex items-center justify-center text-white text-xl font-bold`}>
                  {(session?.name || session?.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 bg-slate-950/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-5 h-5 mb-0.5" />
                <span className="text-[9px] font-bold">Edit Photo</span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {session.name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Staff Portal
                </span>
                <button
                  onClick={() => setIsPhotoEditorOpen(true)}
                  className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100/70 px-2 py-0.5 rounded-md transition-colors"
                >
                  <Camera className="w-3 h-3" />
                  <span>Update Photo</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {member?.role || 'Team Member'} • {member?.department || 'Operations'} ({member?.employeeId || 'EMP-STAFF'})
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Authenticated Session
                </span>
                <span>•</span>
                <span>Shift: <strong className="text-slate-800 font-semibold">10:00 AM - 07:00 PM</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Punch / Check-in Box with Live Clock */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            {/* Live Clocking Watch */}
            <LiveHeaderClock variant="prominent" showSeconds={true} showDate={true} />

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 flex flex-col gap-3 min-w-[280px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Today ({realTodayFormatted})
                </span>
                {todayRecord && getStatusBadge(todayRecord.status)}
              </div>

              {/* Status details */}
              <div className="text-xs font-medium text-slate-700 flex items-center justify-between">
                <span>In: <strong className="font-mono text-slate-900">{todayRecord?.checkInTime || '--'}</strong></span>
                <span className="text-slate-300">|</span>
                <span>Out: <strong className="font-mono text-slate-900">{todayRecord?.checkOutTime || '--'}</strong></span>
                {todayDurationFormatted && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="text-indigo-600 font-semibold">{todayDurationFormatted}</span>
                  </>
                )}
              </div>

              {/* Punch In / Punch Out Controls: Restrict to once per day */}
              <div className="flex items-center gap-2">
                {/* Punch In Button */}
                <button
                  id="user-punch-in-btn"
                  onClick={handleCheckIn}
                  disabled={hasPunchedIn || (isVerifyingPunch && !todayRecord)}
                  className={`flex-1 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all ${
                    hasPunchedIn 
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300/80 opacity-90' 
                      : (isVerifyingPunch && !todayRecord)
                        ? 'bg-indigo-400 text-white/80 cursor-wait'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer hover:shadow-md active:scale-95'
                  }`}
                  title={hasPunchedIn ? `Punched In at ${todayRecord?.checkInTime}` : (isVerifyingPunch && !todayRecord) ? 'Syncing attendance status...' : 'Punch in for today (Shift starts 10:00 AM)'}
                >
                  {hasPunchedIn ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      <span>In: {todayRecord?.checkInTime}</span>
                    </>
                  ) : (isVerifyingPunch && !todayRecord) ? (
                    <span>Syncing...</span>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5" />
                      <span>Punch In</span>
                    </>
                  )}
                </button>

                {/* Punch Out Button */}
                <button
                  id="user-punch-out-btn"
                  onClick={handleCheckOut}
                  disabled={!hasPunchedIn || hasPunchedOut}
                  className={`flex-1 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all ${
                    hasPunchedOut
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300/80 opacity-90'
                      : hasPunchedIn
                        ? 'bg-slate-800 hover:bg-slate-900 text-white cursor-pointer hover:shadow-md active:scale-95'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  }`}
                  title={
                    hasPunchedOut
                      ? `Punched Out at ${todayRecord?.checkOutTime}`
                      : hasPunchedIn
                        ? 'Punch out at end of shift (07:00 PM)'
                        : 'Please punch in first before punching out'
                  }
                >
                  {hasPunchedOut ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      <span>Out: {todayRecord?.checkOutTime}</span>
                    </>
                  ) : (
                    <>
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Punch Out</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status Note or Completion Banner */}
              {isDayCompleted ? (
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Today's punches completed. Ready for tomorrow's shift!</span>
                </div>
              ) : hasPunchedIn ? (
                <div className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-[10.5px] text-indigo-700 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span>Shift in progress. Remember to Punch Out at 07:00 PM.</span>
                </div>
              ) : (
                <div className="text-[10.5px] text-slate-500 text-center">
                  Shift: 10:00 AM to 07:00 PM • Click Punch In to start
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Completion Banner for Today */}
      {isDayCompleted && (
        <motion.div 
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-emerald-950 flex items-center gap-1.5">
                <span>Today's Shift Attendance Completed</span>
                <span className="text-xs font-normal text-emerald-700">({realTodayFormatted})</span>
              </h2>
              <p className="text-xs text-emerald-800 mt-0.5">
                Logged In at <strong>{todayRecord.checkInTime}</strong> • Logged Out at <strong>{todayRecord.checkOutTime}</strong> {todayDurationFormatted ? `(${todayDurationFormatted} worked)` : ''}.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100/80 border border-emerald-300 text-xs font-semibold text-emerald-800 shrink-0">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Punched for today (Unlocks tomorrow)</span>
          </div>
        </motion.div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-xs font-medium text-slate-500">Attendance Rate</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900">{stats.rate}%</span>
            <span className="text-[11px] font-semibold text-emerald-600">Target 95%</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">This month compliance</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-xs font-medium text-slate-500">Punctuality Score</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl sm:text-3xl font-bold text-indigo-600">{stats.onTimeRatio}%</span>
            <span className="text-[11px] font-semibold text-slate-500">On-time</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{stats.late} late arrival{stats.late === 1 ? '' : 's'}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-xs font-medium text-slate-500">Days Logged</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl sm:text-3xl font-bold text-emerald-600">{stats.present}</span>
            <span className="text-[11px] font-semibold text-slate-400">/ {stats.totalDays} days</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{stats.halfDay} half-day, {stats.excused} excused</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-xs font-medium text-slate-500">Logged Hours</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900">{stats.totalHours} hrs</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Shift standard: 10AM - 7PM</p>
        </div>
      </div>

      {/* Main Content Grid: Matrix + Leave Note */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Monthly Punch Matrix & Logs */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Punch Matrix Table */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Personal Punch Records</h2>
                <p className="text-xs text-slate-500">Official attendance log ({displayRecords.length} records shown)</p>
              </div>
              <button
                id="user-export-excel-btn"
                onClick={exportPersonalExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer self-start sm:self-auto"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export My .xlsx</span>
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="space-y-2.5 mb-4 pb-3 border-b border-slate-100">
              {/* Row 1: Month Chips and Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Month Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                  <button
                    type="button"
                    onClick={() => setRecordMonthFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                      recordMonthFilter === 'all'
                        ? 'bg-slate-900 text-white font-semibold shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    All Dates ({memberRecords.length})
                  </button>
                  {availableMonths.map(month => (
                    <button
                      key={month}
                      type="button"
                      onClick={() => setRecordMonthFilter(month)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                        recordMonthFilter === month
                          ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                      }`}
                    >
                      {month === realTodayKey.substring(0, 7) ? `This Month (${month})` : month}
                    </button>
                  ))}
                </div>

                {/* Search Bar */}
                <div className="relative min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search date, status, notes..."
                    value={recordSearchQuery}
                    onChange={(e) => setRecordSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Row 2: Status Category Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
                <span className="text-[11px] font-semibold text-slate-400 mr-1 shrink-0">Filter Status:</span>
                <button
                  type="button"
                  onClick={() => setRecordStatusFilter('all')}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    recordStatusFilter === 'all'
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({memberRecords.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecordStatusFilter('present')}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    recordStatusFilter === 'present'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/60'
                  }`}
                >
                  Present ({memberRecords.filter(r => r.status === 'present').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecordStatusFilter('late')}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    recordStatusFilter === 'late'
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'
                  }`}
                >
                  Late ({memberRecords.filter(r => r.status === 'late').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecordStatusFilter('half_day')}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    recordStatusFilter === 'half_day'
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200/60'
                  }`}
                >
                  Half Day ({memberRecords.filter(r => r.status === 'half_day').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecordStatusFilter('absent')}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    recordStatusFilter === 'absent'
                      ? 'bg-rose-600 text-white font-semibold'
                      : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                  }`}
                >
                  Absent ({memberRecords.filter(r => r.status === 'absent').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecordStatusFilter('excused')}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    recordStatusFilter === 'excused'
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200/60'
                  }`}
                >
                  Excused ({memberRecords.filter(r => r.status === 'excused').length})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-[420px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-xs">
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Check In</th>
                    <th className="py-2.5 px-3 font-semibold">Check Out</th>
                    <th className="py-2.5 px-3 font-semibold">Notes / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {displayRecords.length > 0 ? (
                    displayRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {rec.date}
                        </td>
                        <td className="py-2.5 px-3">
                          {getStatusBadge(rec.status)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          {rec.checkInTime || '--'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          {rec.checkOutTime || '--'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                          {rec.notes || <span className="text-slate-300 italic">No notes</span>}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                        No punch records found matching current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right Col: Submit Leave Request + Security Status */}
        <div className="space-y-6">
          
          {/* Submit Leave / Time-Off Request */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <CalendarOff className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 font-sans">Apply for Leave</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Submit planned time-off or medical leaves directly to administration for approval.
            </p>

            <form onSubmit={handleSubmitLeave} className="space-y-3">
              {/* Leave Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Leave Category
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="sick">Sick Leave (Medical & health)</option>
                  <option value="casual">Casual Leave (Personal & urgent work)</option>
                  <option value="vacation">Vacation / Annual Leave</option>
                  <option value="emergency">Emergency Absence</option>
                  <option value="maternity">Maternity Leave</option>
                  <option value="paternity">Paternity Leave</option>
                  <option value="other">Other Reason</option>
                </select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={leaveStartDate}
                    onChange={(e) => {
                      setLeaveStartDate(e.target.value);
                      if (e.target.value > leaveEndDate) {
                        setLeaveEndDate(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    min={leaveStartDate}
                    value={leaveEndDate}
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason & Notes
                </label>
                <textarea
                  required
                  rows={2}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="e.g. Doctor appointment, family emergency, planned trip..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {leaveSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Leave application sent to admin successfully!</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingLeave}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                {isSubmittingLeave ? (
                  <span>Transmitting...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Leave Application</span>
                  </>
                )}
              </button>
            </form>

            {/* My Leave Applications History */}
            <div className="mt-6 pt-5 border-t border-slate-200/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  My Applications ({myLeaves.length})
                </span>
                <span className="text-[11px] text-slate-500">Live Status</span>
              </div>

              {myLeaves.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2 text-center bg-slate-50 rounded-xl border border-slate-100">
                  No previous leave applications submitted.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {myLeaves.map((l) => {
                    const isPending = l.status === 'pending';
                    const isApproved = l.status === 'approved';
                    return (
                      <div
                        key={l.id}
                        className={`p-3 rounded-xl border text-xs transition-all ${
                          isPending
                            ? 'bg-amber-50/50 border-amber-200'
                            : isApproved
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : 'bg-rose-50/40 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-semibold text-slate-900 capitalize">
                            {l.leaveType} Leave
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isPending
                              ? 'bg-amber-100 text-amber-800'
                              : isApproved
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                          }`}>
                            {isPending ? '⏳ Pending' : isApproved ? '✅ Approved' : '❌ Declined'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                          <span>{l.startDate} {l.startDate !== l.endDate ? `→ ${l.endDate}` : ''}</span>
                          <span className="font-semibold text-slate-700">{l.totalDays} day(s)</span>
                        </div>

                        <p className="text-[11px] text-slate-500 italic truncate mb-1">
                          "{l.reason}"
                        </p>

                        {l.adminRemark && (
                          <div className="pt-1 mt-1 border-t border-slate-200/60 text-[11px] text-slate-700">
                            <strong>Note:</strong> {l.adminRemark}
                          </div>
                        )}

                        {isPending && onCancelLeave && (
                          <div className="pt-2 mt-2 border-t border-amber-200/60 flex items-center justify-end">
                            {confirmWithdrawId === l.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-600">Withdraw this request?</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmWithdrawId(null);
                                    onCancelLeave(l.id);
                                  }}
                                  className="text-[11px] px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                                >
                                  Yes, Withdraw
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmWithdrawId(null)}
                                  className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmWithdrawId(l.id)}
                                className="text-[11px] text-rose-600 hover:text-rose-700 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Withdraw request</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Account Security Quick Status */}
          <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-md border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Security Profile
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Protected
              </span>
            </div>
            
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Account Role</span>
                <span className="font-semibold text-white uppercase">{session.role}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Email</span>
                <span className="font-mono text-slate-200 text-[11px]">{session.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Shift Window</span>
                <span className="font-mono text-indigo-400 text-[11px]">10:00 AM - 07:00 PM</span>
              </div>
            </div>

            <div className="mt-4 pt-3 flex gap-2">
              <button
                onClick={onOpenSettings}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs text-center border border-slate-700 transition-colors cursor-pointer"
              >
                Account Settings
              </button>
              <button
                onClick={onLogout}
                className="py-2 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 font-semibold text-xs border border-rose-500/30 transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* Profile Photo Editor Modal */}
      <AnimatePresence>
        {isPhotoEditorOpen && member && (
          <ProfilePhotoEditor
            currentAvatarUrl={member.avatarUrl}
            memberName={member.name}
            avatarColor={member.avatarColor}
            onSavePhoto={(newUrl) => {
              if (onUpdateMember && member) {
                onUpdateMember({
                  ...member,
                  avatarUrl: newUrl
                });
              }
            }}
            onClose={() => setIsPhotoEditorOpen(false)}
          />
        )}
      </AnimatePresence>

    </div>
  );
};
