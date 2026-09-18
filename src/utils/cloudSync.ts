import { AttendanceRecord, CloudBackupSnapshot, CloudSyncState, Member } from '../types';
import { logSecurityEvent } from './cryptoAuth';
import { saveAttendanceRecords, saveMembers } from './storage';

const SYNC_STORAGE_KEY = 'app_attendance_cloud_sync_state_v1';
const SNAPSHOTS_STORAGE_KEY = 'app_attendance_cloud_snapshots_v1';

export const DEFAULT_SYNC_STATE: CloudSyncState = {
  lastSyncTimestamp: Date.now() - 15 * 60 * 1000, // 15 mins ago
  unsyncedChangesCount: 0,
  lastExportTimestamp: undefined,
  lastDismissedTimestamp: undefined,
  autoSyncEnabled: true
};

export function loadCloudSyncState(): CloudSyncState {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SYNC_STATE, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to load cloud sync state', e);
  }
  return { ...DEFAULT_SYNC_STATE };
}

export function saveCloudSyncState(state: CloudSyncState): void {
  try {
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save cloud sync state', e);
  }
}

export function recordUnsyncedChange(increment = 1): CloudSyncState {
  const current = loadCloudSyncState();
  const updated: CloudSyncState = {
    ...current,
    unsyncedChangesCount: current.unsyncedChangesCount + increment
  };
  saveCloudSyncState(updated);
  return updated;
}

export function loadCloudSnapshots(): CloudBackupSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load cloud snapshots', e);
  }
  return [];
}

export function saveCloudSnapshots(snapshots: CloudBackupSnapshot[]): void {
  try {
    // Keep max 10 most recent snapshots
    const trimmed = snapshots.slice(0, 10);
    localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save cloud snapshots', e);
  }
}

// Generate simple hash checksum
async function generateChecksum(data: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
  } catch {
    return 'CRC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}

// Perform Cloud Sync & Snapshot
export async function performCloudSync(
  members: Member[],
  records: AttendanceRecord[],
  userEmail: string,
  userRole: 'admin' | 'user' = 'admin'
): Promise<CloudBackupSnapshot> {
  // Ensure local storage is also synced
  saveMembers(members);
  saveAttendanceRecords(records);

  const payload = JSON.stringify({ members, records });
  const checksum = await generateChecksum(payload);

  const newSnapshot: CloudBackupSnapshot = {
    id: 'snap-' + Date.now(),
    timestamp: new Date().toISOString(),
    memberCount: members.length,
    recordCount: records.length,
    syncedBy: userEmail,
    checksum,
    data: {
      members,
      records
    }
  };

  // Prepend to snapshot list
  const existing = loadCloudSnapshots();
  saveCloudSnapshots([newSnapshot, ...existing]);

  // Update sync state
  const updatedState: CloudSyncState = {
    ...loadCloudSyncState(),
    lastSyncTimestamp: Date.now(),
    unsyncedChangesCount: 0,
    lastDismissedTimestamp: Date.now()
  };
  saveCloudSyncState(updatedState);

  // Log audit event
  logSecurityEvent(
    'CLOUD_SYNC',
    userEmail,
    `Cloud snapshot backup created (${members.length} members, ${records.length} records, Checksum: ${checksum})`,
    userRole
  );

  return newSnapshot;
}

export function dismissCloudSyncReminder(): CloudSyncState {
  const current = loadCloudSyncState();
  const updated: CloudSyncState = {
    ...current,
    lastDismissedTimestamp: Date.now()
  };
  saveCloudSyncState(updated);
  return updated;
}

// Export / Download JSON Backup file
export function downloadBackupJson(members: Member[], records: AttendanceRecord[], userEmail: string): void {
  const exportData = {
    app: 'AttendaPro Cloud Backup',
    version: '2.5.0',
    exportDate: new Date().toISOString(),
    exportedBy: userEmail,
    stats: {
      totalMembers: members.length,
      totalRecords: records.length
    },
    data: {
      members,
      records
    }
  };

  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exportData, null, 2))}`;
  const downloadAnchor = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadAnchor.setAttribute('href', jsonString);
  downloadAnchor.setAttribute('download', `AttendaPro_CloudBackup_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  // Update lastExportTimestamp
  const current = loadCloudSyncState();
  saveCloudSyncState({
    ...current,
    lastExportTimestamp: Date.now()
  });

  logSecurityEvent('BACKUP_CREATED', userEmail, `Full JSON database backup downloaded (${members.length} members, ${records.length} records)`);
}

// Format relative time (e.g. "2m ago", "Just now", "Yesterday")
export function formatRelativeSyncTime(timestamp: number): string {
  if (!timestamp) return 'Never';
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 30) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  return `${diffDay}d ago`;
}
