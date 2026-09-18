export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'excused';

export type ShiftType = 'regular' | 'morning' | 'evening' | 'night';

export type UserRole = 'admin' | 'user';

export interface Member {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  role: string;
  email: string;
  phone?: string;
  joinDate: string; // YYYY-MM-DD
  shift: ShiftType;
  avatarColor: string;
  avatarUrl?: string; // Base64 data URL or uploaded photo URL
  active: boolean;
}

export interface AttendanceRecord {
  id: string;
  memberId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkInTime?: string; // HH:MM
  checkOutTime?: string; // HH:MM
  notes?: string;
  updatedAt: string; // ISO string
}

export type ViewTab = 'dashboard' | 'attendance' | 'leaves' | 'members' | 'reports';

export type LeaveType = 'sick' | 'casual' | 'vacation' | 'emergency' | 'maternity' | 'paternity' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  memberId: string;
  memberName: string;
  employeeId?: string;
  department?: string;
  avatarColor?: string;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  appliedAt: string; // ISO string
  reviewedAt?: string; // ISO string
  reviewedBy?: string; // Reviewer name
  adminRemark?: string; // Admin feedback/notes
}

export interface MonthlyStats {
  totalWorkingDays: number;
  totalMembers: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  halfDayCount: number;
  excusedCount: number;
  overallAttendanceRate: number;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  memberId?: string; // Links to a Member record for employee portal
  employeeId?: string;
  department?: string;
  roleTitle?: string;
  phone?: string;
  passwordHash: string;
  salt: string;
  plainPassword?: string; // Stored for instant recovery and staff sync
  createdAt: string;
  lastLoginAt?: string;
  failedLoginAttempts: number;
  lockedUntil?: number; // timestamp ms
}

export interface AuthSession {
  token: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  memberId?: string;
  expiresAt: number; // timestamp ms
  createdAt: string;
}

export type SecurityEventType = 
  | 'LOGIN_SUCCESS' 
  | 'LOGIN_FAILED' 
  | 'LOGOUT' 
  | 'PASSWORD_CHANGED' 
  | 'USER_REGISTERED' 
  | 'ACCOUNT_LOCKED' 
  | 'ATTENDANCE_EXPORT'
  | 'PROFILE_UPDATED'
  | 'CLOUD_SYNC'
  | 'BACKUP_CREATED'
  | 'BACKUP_RESTORED';

export interface SecurityAuditLog {
  id: string;
  timestamp: string;
  eventType: SecurityEventType;
  email: string;
  role?: UserRole;
  details: string;
  ipSimulated?: string;
}

export interface CloudBackupSnapshot {
  id: string;
  timestamp: string;
  memberCount: number;
  recordCount: number;
  syncedBy: string;
  checksum: string;
  data: {
    members: Member[];
    records: AttendanceRecord[];
  };
}

export interface LivePunchNotification {
  id: string;
  memberId: string;
  memberName: string;
  status: AttendanceStatus | string;
  time: string;
  timestamp: number;
}

export interface CloudSyncState {
  lastSyncTimestamp: number;
  unsyncedChangesCount: number;
  lastExportTimestamp?: number;
  lastDismissedTimestamp?: number;
  autoSyncEnabled: boolean;
}
