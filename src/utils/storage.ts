import { AttendanceRecord, AttendanceStatus, Member, LeaveRequest } from '../types';

export const DEPARTMENTS = [
  'Engineering',
  'Design & Creative',
  'Marketing & Growth',
  'Product & Strategy',
  'Operations & Admin',
  'Sales & Accounts',
  'Human Resources'
] as const;

export const AVATAR_COLORS = [
  'from-blue-600 to-indigo-600',
  'from-emerald-600 to-teal-600',
  'from-violet-600 to-purple-600',
  'from-amber-600 to-orange-600',
  'from-rose-600 to-pink-600',
  'from-cyan-600 to-blue-600',
  'from-fuchsia-600 to-pink-600',
  'from-teal-600 to-green-600',
];

export const INITIAL_MEMBERS: Member[] = [
  {
    id: 'mem-1',
    name: 'Alexander Hayes',
    employeeId: 'EMP-1001',
    department: 'Engineering',
    role: 'Lead Full-Stack Engineer',
    email: 'a.hayes@company.io',
    phone: '+1 (555) 234-5678',
    joinDate: '2024-03-15',
    shift: 'regular',
    avatarColor: 'from-blue-600 to-indigo-600',
    active: true
  },
  {
    id: 'mem-2',
    name: 'Sophia Patel',
    employeeId: 'EMP-1002',
    department: 'Design & Creative',
    role: 'Senior Product Designer',
    email: 'sophia.p@company.io',
    phone: '+1 (555) 345-6789',
    joinDate: '2024-05-10',
    shift: 'regular',
    avatarColor: 'from-fuchsia-600 to-pink-600',
    active: true
  },
  {
    id: 'mem-3',
    name: 'Marcus Vance',
    employeeId: 'EMP-1003',
    department: 'Engineering',
    role: 'Cloud Architect',
    email: 'm.vance@company.io',
    phone: '+1 (555) 456-7890',
    joinDate: '2023-11-01',
    shift: 'regular',
    avatarColor: 'from-violet-600 to-purple-600',
    active: true
  },
  {
    id: 'mem-4',
    name: 'Elena Rostova',
    employeeId: 'EMP-1004',
    department: 'Product & Strategy',
    role: 'Principal Product Manager',
    email: 'elena.r@company.io',
    phone: '+1 (555) 567-8901',
    joinDate: '2024-01-20',
    shift: 'regular',
    avatarColor: 'from-amber-600 to-orange-600',
    active: true
  },
  {
    id: 'mem-5',
    name: 'Devon Miller',
    employeeId: 'EMP-1005',
    department: 'Marketing & Growth',
    role: 'Head of Growth Marketing',
    email: 'd.miller@company.io',
    phone: '+1 (555) 678-9012',
    joinDate: '2024-06-01',
    shift: 'regular',
    avatarColor: 'from-emerald-600 to-teal-600',
    active: true
  },
  {
    id: 'mem-6',
    name: 'Aisha Rahman',
    employeeId: 'EMP-1006',
    department: 'Human Resources',
    role: 'HR Operations Manager',
    email: 'aisha.r@company.io',
    phone: '+1 (555) 789-0123',
    joinDate: '2023-08-15',
    shift: 'regular',
    avatarColor: 'from-rose-600 to-pink-600',
    active: true
  },
  {
    id: 'mem-7',
    name: 'Lucas Sterling',
    employeeId: 'EMP-1007',
    department: 'Sales & Accounts',
    role: 'Enterprise Account Executive',
    email: 'lucas.s@company.io',
    phone: '+1 (555) 890-1234',
    joinDate: '2024-02-14',
    shift: 'morning',
    avatarColor: 'from-cyan-600 to-blue-600',
    active: true
  },
  {
    id: 'mem-8',
    name: 'Chloe Tanaka',
    employeeId: 'EMP-1008',
    department: 'Engineering',
    role: 'Frontend Developer',
    email: 'chloe.t@company.io',
    phone: '+1 (555) 901-2345',
    joinDate: '2024-08-01',
    shift: 'regular',
    avatarColor: 'from-teal-600 to-green-600',
    active: true
  },
  {
    id: 'mem-9',
    name: 'Julian Bennett',
    employeeId: 'EMP-1009',
    department: 'Operations & Admin',
    role: 'Facilities & Logistics Lead',
    email: 'j.bennett@company.io',
    phone: '+1 (555) 012-3456',
    joinDate: '2023-04-10',
    shift: 'morning',
    avatarColor: 'from-amber-600 to-orange-600',
    active: true
  },
  {
    id: 'mem-10',
    name: 'Zoe Morales',
    employeeId: 'EMP-1010',
    department: 'Design & Creative',
    role: 'UX Researcher',
    email: 'zoe.m@company.io',
    phone: '+1 (555) 123-7890',
    joinDate: '2024-07-15',
    shift: 'evening',
    avatarColor: 'from-violet-600 to-purple-600',
    active: true
  }
];

// Helper to format Date to YYYY-MM-DD (Always uses the local calendar date)
export function formatDateKey(date?: Date | string | number | null): string {
  let d: Date;
  if (!date) {
    d = new Date();
  } else if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  } else {
    d = new Date(date);
    if (isNaN(d.getTime())) {
      d = new Date();
    }
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Generate realistic seeded records for the past 60 days
export function generateSeedAttendance(members: Member[]): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const baseDate = new Date(2026, 8, 1); // 2026-09-01

  // Past 60 days
  for (let i = 0; i <= 60; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() - i);
    const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Skip weekends for default working company, or add occasional records
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend) continue;

    const dateStr = formatDateKey(d);

    members.forEach((member, index) => {
      // Deterministic pseudo-random seed based on member and date
      const hash = (index * 37 + d.getDate() * 19 + (d.getMonth() + 1) * 73 + i * 11) % 100;
      
      let status: AttendanceStatus = 'present';
      let checkInTime: string | undefined = '08:58';
      let checkOutTime: string | undefined = '17:32';
      let notes: string | undefined = undefined;

      if (i === 0) {
        // For today (2026-09-01), give diverse realistic statuses for demoing
        if (index === 0) { status = 'present'; checkInTime = '08:52'; checkOutTime = undefined; }
        else if (index === 1) { status = 'present'; checkInTime = '08:45'; checkOutTime = undefined; }
        else if (index === 2) { status = 'late'; checkInTime = '09:42'; checkOutTime = undefined; notes = 'Subway signal delay'; }
        else if (index === 3) { status = 'present'; checkInTime = '08:59'; checkOutTime = undefined; }
        else if (index === 4) { status = 'half_day'; checkInTime = '09:00'; checkOutTime = '13:00'; notes = 'Dentist appointment afternoon'; }
        else if (index === 5) { status = 'present'; checkInTime = '08:30'; checkOutTime = undefined; }
        else if (index === 6) { status = 'excused'; checkInTime = undefined; checkOutTime = undefined; notes = 'Approved annual leave'; }
        else if (index === 7) { status = 'present'; checkInTime = '08:55'; checkOutTime = undefined; }
        else if (index === 8) { status = 'present'; checkInTime = '07:45'; checkOutTime = undefined; }
        else { status = 'absent'; checkInTime = undefined; checkOutTime = undefined; notes = 'Unreported absence'; }
      } else {
        // Historical days
        if (hash < 75) {
          status = 'present';
          const inMin = 50 + (hash % 15);
          checkInTime = inMin < 60 ? `08:${String(inMin).padStart(2, '0')}` : `09:${String(inMin - 60).padStart(2, '0')}`;
          checkOutTime = `17:${String(20 + (hash % 40)).padStart(2, '0')}`;
        } else if (hash < 85) {
          status = 'late';
          const lateMin = 15 + (hash % 40);
          checkInTime = `09:${String(lateMin).padStart(2, '0')}`;
          checkOutTime = `18:${String(10 + (hash % 30)).padStart(2, '0')}`;
          notes = hash % 2 === 0 ? 'Traffic congestion' : 'Morning personal errand';
        } else if (hash < 92) {
          status = 'half_day';
          checkInTime = '09:00';
          checkOutTime = '13:15';
          notes = 'Half day client visit / doctor';
        } else if (hash < 97) {
          status = 'excused';
          checkInTime = undefined;
          checkOutTime = undefined;
          notes = 'Planned personal leave';
        } else {
          status = 'absent';
          checkInTime = undefined;
          checkOutTime = undefined;
          notes = 'Medical sick leave';
        }
      }

      records.push({
        id: `att-${member.id}-${dateStr}`,
        memberId: member.id,
        date: dateStr,
        status,
        checkInTime,
        checkOutTime,
        notes,
        updatedAt: new Date(d.getTime() + 9 * 3600 * 1000).toISOString()
      });
    });
  }

  return records;
}

const STORAGE_KEYS = {
  MEMBERS: 'app_attendance_members_v3',
  RECORDS: 'app_attendance_records_v3',
  LEAVES: 'app_attendance_leaves_v3',
  SETTINGS: 'app_attendance_settings_v3',
  PURGED_SAMPLE: 'app_attendance_purged_sample_v3',
  DELETED_MEMBERS: 'app_attendance_deleted_members_v3',
  DELETED_RECORDS: 'app_attendance_deleted_records_v3',
  DELETED_LEAVES: 'app_attendance_deleted_leaves_v3'
};

// --- Tombstone Tracking to prevent resurrection of deleted entities ---
export function loadDeletedMemberIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_MEMBERS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    // fallback
  }
  return new Set();
}

export function markMemberDeleted(memberId?: string | null, memberEmail?: string | null): void {
  try {
    const set = loadDeletedMemberIds();
    if (memberId && typeof memberId === 'string') {
      set.add(memberId);
      set.add(memberId.toLowerCase().trim());
      const stripped = memberId.toLowerCase().trim().replace(/^mem-/, '');
      set.add(stripped);
      set.add('mem-' + stripped);
    }
    if (memberEmail && typeof memberEmail === 'string' && memberEmail.trim()) {
      const emailLower = memberEmail.toLowerCase().trim();
      set.add(emailLower);
      set.add('mem-' + emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
      set.add(emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
    }
    localStorage.setItem(STORAGE_KEYS.DELETED_MEMBERS, JSON.stringify(Array.from(set)));
  } catch {
    // safe fallback
  }
}

/**
 * Merge cloud tombstones into local storage tombstones so deletions made on other devices are permanently applied
 */
export function syncCloudTombstones(cloud: { members?: string[]; records?: string[]; leaves?: string[] }): void {
  if (!cloud) return;
  try {
    if (Array.isArray(cloud.members) && cloud.members.length > 0) {
      const current = loadDeletedMemberIds();
      let changed = false;
      cloud.members.forEach(id => {
        if (id && typeof id === 'string') {
          const lower = id.toLowerCase().trim();
          if (!current.has(id) || !current.has(lower)) {
            current.add(id);
            current.add(lower);
            const stripped = lower.replace(/^mem-/, '');
            current.add(stripped);
            current.add('mem-' + stripped);
            changed = true;
          }
        }
      });
      if (changed) {
        localStorage.setItem(STORAGE_KEYS.DELETED_MEMBERS, JSON.stringify(Array.from(current)));
        // Purge deleted members from local storage
        const members = loadMembers();
        saveMembers(members);
      }
    }

    if (Array.isArray(cloud.records) && cloud.records.length > 0) {
      const current = loadDeletedRecordIds();
      let changed = false;
      cloud.records.forEach(id => {
        if (id && typeof id === 'string' && !current.has(id)) {
          current.add(id);
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem(STORAGE_KEYS.DELETED_RECORDS, JSON.stringify(Array.from(current)));
        const records = loadAttendanceRecords();
        saveAttendanceRecords(records);
      }
    }

    if (Array.isArray(cloud.leaves) && cloud.leaves.length > 0) {
      const current = loadDeletedLeaveIds();
      let changed = false;
      cloud.leaves.forEach(id => {
        if (id && typeof id === 'string' && !current.has(id)) {
          current.add(id);
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem(STORAGE_KEYS.DELETED_LEAVES, JSON.stringify(Array.from(current)));
        const leaves = loadLeaveRequests();
        saveLeaveRequests(leaves);
      }
    }
  } catch (err) {
    console.warn('syncCloudTombstones error:', err);
  }
}

export function unmarkMemberDeleted(memberId?: string | null, memberEmail?: string | null): void {
  try {
    const set = loadDeletedMemberIds();
    if (memberId && typeof memberId === 'string') {
      set.delete(memberId);
      set.delete(memberId.toLowerCase().trim());
      const stripped = memberId.toLowerCase().trim().replace(/^mem-/, '');
      set.delete(stripped);
      set.delete('mem-' + stripped);
    }
    if (memberEmail && typeof memberEmail === 'string' && memberEmail.trim()) {
      const emailLower = memberEmail.toLowerCase().trim();
      set.delete(emailLower);
      set.delete('mem-' + emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
      set.delete(emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
    }
    localStorage.setItem(STORAGE_KEYS.DELETED_MEMBERS, JSON.stringify(Array.from(set)));
  } catch {
    // safe fallback
  }
}

export function isMemberDeleted(memberIdOrEmail?: string | null): boolean {
  if (!memberIdOrEmail || typeof memberIdOrEmail !== 'string') return false;
  const deletedSet = loadDeletedMemberIds();
  if (deletedSet.size === 0) return false;

  const query = memberIdOrEmail.toLowerCase().trim();
  const stripped = query.replace(/^mem-/, '');
  return (
    deletedSet.has(memberIdOrEmail) ||
    deletedSet.has(query) ||
    deletedSet.has(stripped) ||
    deletedSet.has('mem-' + stripped) ||
    deletedSet.has('mem-' + query.replace(/[^a-zA-Z0-9]/g, '_')) ||
    deletedSet.has(query.replace(/[^a-zA-Z0-9]/g, '_'))
  );
}

export function loadDeletedRecordIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_RECORDS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    // fallback
  }
  return new Set();
}

export function markRecordDeleted(recordId?: string | null): void {
  try {
    if (!recordId || typeof recordId !== 'string') return;
    const set = loadDeletedRecordIds();
    set.add(recordId);
    localStorage.setItem(STORAGE_KEYS.DELETED_RECORDS, JSON.stringify(Array.from(set)));
  } catch {
    // safe fallback
  }
}

export function isRecordDeleted(recordId?: string | null): boolean {
  if (!recordId || typeof recordId !== 'string') return false;
  return loadDeletedRecordIds().has(recordId);
}

export function loadDeletedLeaveIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_LEAVES);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    // fallback
  }
  return new Set();
}

export function markLeaveDeleted(leaveId?: string | null): void {
  try {
    if (!leaveId || typeof leaveId !== 'string') return;
    const set = loadDeletedLeaveIds();
    set.add(leaveId);
    localStorage.setItem(STORAGE_KEYS.DELETED_LEAVES, JSON.stringify(Array.from(set)));
  } catch {
    // safe fallback
  }
}

export function isLeaveDeleted(leaveId?: string | null): boolean {
  if (!leaveId || typeof leaveId !== 'string') return false;
  return loadDeletedLeaveIds().has(leaveId);
}

export const INITIAL_LEAVES: LeaveRequest[] = [];

export function loadLeaveRequests(): LeaveRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LEAVES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Exclude any fake or sample leave requests or deleted leaves
        return parsed.filter(l => 
          l && l.id && 
          !l.id.startsWith('leave-sample-') && 
          !l.id.includes('sample') &&
          !isLeaveDeleted(l.id)
        );
      }
    }
  } catch (e) {
    console.error('Failed to load leave requests from localStorage', e);
  }
  return [];
}

/**
 * Safely writes to localStorage with automatic emergency purge of zombie keys if quota is exceeded.
 */
export function safeLocalStorageSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`[Storage] LocalStorage quota pressure on writing ${key}. Executing emergency purge...`, e);
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('firestore_') || k.startsWith('__firestore_') || k.startsWith('attendapro_realtime_sync_bus_'))) {
          toRemove.push(k);
        }
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      localStorage.setItem(key, value);
    } catch (retryErr) {
      console.error(`[Storage] Failed to save ${key} to localStorage:`, retryErr);
    }
  }
}

export function saveLeaveRequests(leaves: LeaveRequest[]): void {
  try {
    const realLeaves = leaves.filter(l => 
      l && l.id && 
      !l.id.startsWith('leave-sample-') && 
      !l.id.includes('sample') &&
      !isLeaveDeleted(l.id)
    );
    safeLocalStorageSetItem(STORAGE_KEYS.LEAVES, JSON.stringify(realLeaves));
  } catch (e) {
    console.error('Failed to save leave requests to localStorage', e);
  }
}

// Check if a member is part of default demo seed
export function isSampleMember(member: Member): boolean {
  if (!member || !member.id) return false;
  return (
    member.id.startsWith('mem-sample-') ||
    Boolean(
      member.id.startsWith('mem-') &&
      parseInt(member.id.replace('mem-', ''), 10) <= 10 &&
      (member.name === 'Alexander Hayes' || member.name === 'Sophia Patel') &&
      member.email.endsWith('@company.io')
    )
  );
}

// Reconcile user accounts to members directory so all registered staff appear in admin roster
export function reconcileAccountsToMembers(currentMembers: Member[]): Member[] {
  const result = [...currentMembers];
  try {
    const rawAcc = localStorage.getItem('app_attendance_accounts_v1') || 
                   localStorage.getItem('app_attendance_accounts_v2') || 
                   localStorage.getItem('app_attendance_accounts_v3');
    if (rawAcc) {
      const accounts = JSON.parse(rawAcc);
      if (Array.isArray(accounts)) {
        const memMap = new Map<string, Member>();
        result.forEach(m => {
          if (m && m.id && !isSampleMember(m)) {
            memMap.set(m.id, m);
            if (typeof m.email === 'string') memMap.set(m.email.toLowerCase().trim(), m);
          }
        });

        let changed = false;
        accounts.forEach((acc: any) => {
          if (acc && acc.role === 'user' && typeof acc.email === 'string' && acc.email.trim()) {
            const emailLower = acc.email.toLowerCase().trim();
            const memId = acc.memberId || ('mem-' + emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
            // STRICT SAFETY: Never resurrect any member that has been deleted by admin
            if (isMemberDeleted(memId) || isMemberDeleted(emailLower) || (acc.memberId && isMemberDeleted(acc.memberId))) {
              return;
            }
            const existing = memMap.get(acc.memberId || '') || memMap.get(emailLower);
            if (!existing) {
              const newMem: Member = {
                id: memId,
                name: acc.name || emailLower.split('@')[0],
                employeeId: acc.employeeId || emailLower.split('@')[0].toUpperCase(),
                department: acc.department || 'Operations & Admin',
                role: acc.roleTitle || 'Staff Member',
                email: acc.email,
                phone: acc.phone || '',
                joinDate: acc.createdAt ? acc.createdAt.substring(0, 10) : '2026-09-01',
                shift: 'regular',
                avatarColor: 'from-blue-600 to-indigo-600',
                active: true
              };
              result.push(newMem);
              memMap.set(memId, newMem);
              memMap.set(emailLower, newMem);
              changed = true;
            }
          }
        });

        if (changed) {
          saveMembers(result);
        }
      }
    }
  } catch (err) {
    console.warn('reconcileAccountsToMembers error:', err);
  }
  return result;
}

export function loadMembers(): Member[] {
  let realMembers: Member[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MEMBERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Retain all real members, filtering out legacy sample members and deleted members
        realMembers = parsed.filter(m => m && m.id && !isSampleMember(m) && !isMemberDeleted(m.id));
      }
    }
  } catch (e) {
    console.error('Failed to load members from localStorage', e);
  }
  // Guarantee all registered staff accounts are present
  return reconcileAccountsToMembers(realMembers);
}

export function saveMembers(members: Member[]): void {
  try {
    if (!Array.isArray(members)) return;
    const cleanMembers = members.filter(m => m && m.id && !isMemberDeleted(m.id));
    safeLocalStorageSetItem(STORAGE_KEYS.MEMBERS, JSON.stringify(cleanMembers));
  } catch (e) {
    console.error('Failed to save members to localStorage', e);
  }
}

// Check if an attendance record belongs to the legacy sample seed (Always keep all attendance records)
export function isSampleRecord(_record: AttendanceRecord): boolean {
  return false;
}

// Scans localStorage for any today punch cache (written by UserPortalView)
function getTodayPunchCaches(): AttendanceRecord[] {
  const cachedRecords: AttendanceRecord[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('app_user_today_punch_')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.date && parsed.memberId && (parsed.checkInTime || parsed.checkOutTime || parsed.status === 'present' || parsed.status === 'late')) {
              cachedRecords.push(parsed);
            }
          } catch {}
        }
      }
    }
  } catch {}
  return cachedRecords;
}

export function loadAttendanceRecords(_members?: Member[]): AttendanceRecord[] {
  let records: AttendanceRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECORDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Retain all real attendance records, filtering out legacy demo seed and deleted records
        records = parsed.filter(r => 
          r && r.id && 
          !isSampleRecord(r) && 
          !isRecordDeleted(r.id) &&
          !isMemberDeleted(r.memberId)
        );
      }
    }
  } catch (e) {
    console.error('Failed to load attendance records from localStorage', e);
  }

  // Merge in any active punch caches so refresh never loses today's punches!
  const todayCaches = getTodayPunchCaches().filter(r => !isMemberDeleted(r.memberId));
  if (todayCaches.length > 0) {
    records = mergeAttendanceLists(records, todayCaches);
  }

  return records;
}

export function saveAttendanceRecords(records: AttendanceRecord[]): void {
  try {
    if (!Array.isArray(records)) return;
    const cleanRecords = records.filter(r => 
      r && r.id && 
      !isRecordDeleted(r.id) && 
      !isMemberDeleted(r.memberId)
    );
    safeLocalStorageSetItem(STORAGE_KEYS.RECORDS, JSON.stringify(cleanRecords));
  } catch (e) {
    console.error('Failed to save attendance records to localStorage', e);
  }
}

export function purgeAllSampleData(): void {
  try {
    localStorage.removeItem('app_attendance_members_v2');
    localStorage.removeItem('app_attendance_records_v2');
    localStorage.setItem(STORAGE_KEYS.PURGED_SAMPLE, 'true');
  } catch (e) {
    console.error('Failed to purge sample data', e);
  }
}

export function mergeMembersLists(base: Member[], incoming: Member[]): Member[] {
  const map = new Map<string, Member>();
  (base || []).forEach(m => {
    if (m && m.id && !isSampleMember(m) && !isMemberDeleted(m.id) && (!m.email || !isMemberDeleted(m.email))) {
      map.set(m.id, m);
      if (typeof m.email === 'string') map.set(m.email.toLowerCase().trim(), m);
    }
  });
  (incoming || []).forEach(m => {
    if (m && m.id && !isSampleMember(m) && !isMemberDeleted(m.id) && (!m.email || !isMemberDeleted(m.email))) {
      const emailLower = typeof m.email === 'string' ? m.email.toLowerCase().trim() : '';
      const existing = map.get(m.id) || (emailLower ? map.get(emailLower) : undefined);
      if (existing) {
        const merged = { ...existing, ...m };
        map.set(existing.id, merged);
        map.set(m.id, merged);
        if (typeof merged.email === 'string') map.set(merged.email.toLowerCase().trim(), merged);
      } else {
        map.set(m.id, m);
        if (emailLower) map.set(emailLower, m);
      }
    }
  });

  const unique = Array.from(new Set(map.values()));
  return reconcileAccountsToMembers(unique);
}

export function mergeAttendanceLists(base: AttendanceRecord[], incoming: AttendanceRecord[]): AttendanceRecord[] {
  const map = new Map<string, AttendanceRecord>();
  const idToKey = new Map<string, string>();

  (base || []).forEach(r => {
    if (r && r.id && !isSampleRecord(r) && !isRecordDeleted(r.id) && !isMemberDeleted(r.memberId)) {
      const key = `${r.memberId}_${r.date}`;
      map.set(key, r);
      if (r.id) {
        idToKey.set(r.id, key);
        if (r.id.startsWith('rec-')) idToKey.set(r.id.replace(/^rec-/, 'att-'), key);
        if (r.id.startsWith('att-')) idToKey.set(r.id.replace(/^att-/, 'rec-'), key);
      }
    }
  });

  (incoming || []).forEach(r => {
    if (r && r.id && !isSampleRecord(r) && !isRecordDeleted(r.id) && !isMemberDeleted(r.memberId)) {
      const directKey = `${r.memberId}_${r.date}`;
      const mappedKey = r.id ? idToKey.get(r.id) : undefined;
      const key = mappedKey || directKey;
      const canonicalId = `att-${r.memberId}-${r.date}`;
      const existing = map.get(key);
      if (existing) {
        const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const incomingTime = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;

        const hasExistingPunch = Boolean(existing.checkInTime || existing.checkOutTime || (existing.status && existing.status !== 'absent'));
        const hasIncomingPunch = Boolean(r.checkInTime || r.checkOutTime || (r.status && r.status !== 'absent'));

        if (incomingTime > existingTime) {
          map.set(key, {
            ...existing,
            ...r,
            id: canonicalId,
            checkInTime: r.status === 'absent' && !r.checkInTime ? undefined : (r.checkInTime || existing.checkInTime),
            checkOutTime: r.status === 'absent' && !r.checkOutTime ? undefined : (r.checkOutTime || existing.checkOutTime),
            status: r.status || existing.status,
            notes: r.notes !== undefined ? r.notes : existing.notes,
            updatedAt: r.updatedAt || existing.updatedAt || new Date().toISOString()
          });
        } else if (existingTime > incomingTime) {
          map.set(key, {
            ...r,
            ...existing,
            id: canonicalId,
            checkInTime: existing.status === 'absent' && !existing.checkInTime ? undefined : (existing.checkInTime || r.checkInTime),
            checkOutTime: existing.status === 'absent' && !existing.checkOutTime ? undefined : (existing.checkOutTime || r.checkOutTime),
            status: existing.status || r.status,
            notes: existing.notes !== undefined ? existing.notes : r.notes,
            updatedAt: existing.updatedAt || r.updatedAt || new Date().toISOString()
          });
        } else {
          // Equal timestamps (or both missing): prioritize whichever has active punch/presence!
          if (hasExistingPunch && !hasIncomingPunch) {
            map.set(key, { ...r, ...existing, id: canonicalId });
          } else {
            map.set(key, {
              ...existing,
              ...r,
              id: canonicalId,
              checkInTime: r.checkInTime || existing.checkInTime,
              checkOutTime: r.checkOutTime || existing.checkOutTime,
              status: (r.status && r.status !== 'absent') ? r.status : (existing.status || r.status),
              notes: r.notes || existing.notes,
              updatedAt: r.updatedAt || existing.updatedAt || new Date().toISOString()
            });
          }
        }
      } else {
        map.set(key, { ...r, id: canonicalId });
        if (r.id) {
          idToKey.set(r.id, key);
          if (r.id.startsWith('rec-')) idToKey.set(r.id.replace(/^rec-/, 'att-'), key);
          if (r.id.startsWith('att-')) idToKey.set(r.id.replace(/^att-/, 'rec-'), key);
        }
      }
    }
  });
  return Array.from(map.values());
}

export function mergeLeavesLists(base: LeaveRequest[], incoming: LeaveRequest[]): LeaveRequest[] {
  const map = new Map<string, LeaveRequest>();
  (base || []).forEach(l => {
    if (l && l.id && !l.id.startsWith('leave-sample-') && !l.id.includes('sample') && !isLeaveDeleted(l.id)) {
      map.set(l.id, l);
    }
  });
  (incoming || []).forEach(l => {
    if (l && l.id && !l.id.startsWith('leave-sample-') && !l.id.includes('sample') && !isLeaveDeleted(l.id)) {
      const existing = map.get(l.id);
      map.set(l.id, { ...(existing || {}), ...l });
    }
  });
  return Array.from(map.values());
}

export function resetToSeedData(): { members: Member[]; records: AttendanceRecord[] } {
  const currentMembers = loadMembers();
  const currentRecords = loadAttendanceRecords();
  // If real staff members already exist, strictly protect them from sample data overwrite
  if (currentMembers.length > 0 && !currentMembers.every(isSampleMember)) {
    return { members: currentMembers, records: currentRecords };
  }
  const members = INITIAL_MEMBERS;
  const records = generateSeedAttendance(members);
  saveMembers(members);
  saveAttendanceRecords(records);
  return { members, records };
}
