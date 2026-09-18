import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { DailyAttendanceView } from './components/DailyAttendanceView';
import { MembersAdminView } from './components/MembersAdminView';
import { ReportsExportView } from './components/ReportsExportView';
import { PersonDetailModal } from './components/PersonDetailModal';
import { LoginScreen } from './components/LoginScreen';
import { UserPortalView } from './components/UserPortalView';
import { SecurityAuditModal } from './components/SecurityAuditModal';
import { AccountSettingsModal } from './components/AccountSettingsModal';
import { CloudSyncReminder } from './components/CloudSyncReminder';
import { CloudSyncModal } from './components/CloudSyncModal';
import { AdminManualEntryModal } from './components/AdminManualEntryModal';
import { LeaveManagementView } from './components/LeaveManagementView';
import { AdminSidebar } from './components/AdminSidebar';
import { SoundSettingsModal } from './components/SoundSettingsModal';
import { 
  playPunchInSound, 
  playPunchOutSound, 
  playLeaveSubmittedSound, 
  playLeaveApprovedSound, 
  playLeaveRejectedSound, 
  playNotificationChime 
} from './utils/audioAlerts';
import { 
  Member, 
  AttendanceRecord, 
  ViewTab, 
  AuthSession, 
  CloudSyncState, 
  CloudBackupSnapshot,
  LivePunchNotification,
  LeaveRequest 
} from './types';
import { 
  loadMembers, 
  saveMembers, 
  loadAttendanceRecords, 
  saveAttendanceRecords, 
  loadLeaveRequests,
  saveLeaveRequests,
  resetToSeedData,
  formatDateKey,
  isSampleMember,
  purgeAllSampleData,
  loadDeletedMemberIds,
  loadDeletedRecordIds,
  loadDeletedLeaveIds,
  markMemberDeleted,
  unmarkMemberDeleted,
  markLeaveDeleted,
  markRecordDeleted,
  isMemberDeleted,
  isLeaveDeleted,
  isRecordDeleted,
  isSampleRecord,
  mergeMembersLists,
  mergeAttendanceLists,
  mergeLeavesLists,
  reconcileAccountsToMembers,
  syncCloudTombstones
} from './utils/storage';
import { 
  clearSession, 
  initializeDefaultAccounts, 
  loadCurrentSession, 
  logSecurityEvent,
  loadAccounts,
  saveAccounts,
  deleteAccountByMemberId
} from './utils/cryptoAuth';
import { 
  loadCloudSyncState, 
  saveCloudSyncState, 
  recordUnsyncedChange, 
  performCloudSync,
  dismissCloudSyncReminder
} from './utils/cloudSync';
import { 
  subscribeToRealtimeSync, 
  broadcastSyncEvent,
  sendLiveActionToServer,
  notifyFirestoreActive,
  fetchLiveStateFromServer
} from './utils/realtimeSync';
import { 
  subscribeToMembers, 
  subscribeToAttendance, 
  subscribeToAccounts,
  subscribeToLeaves,
  subscribeToTombstones,
  saveMemberToFirestore, 
  deleteMemberFromFirestore, 
  saveAttendanceRecordToFirestore, 
  deleteAttendanceRecordFromFirestore,
  saveLeaveToFirestore,
  deleteLeaveFromFirestore,
  batchSaveAttendanceToFirestore, 
  batchSaveMembersToFirestore, 
  clearAllFirestoreData,
  checkIsQuotaExhausted,
  onQuotaExhaustedChange,
  cleanZombieFirestoreKeys,
  getMembersFromFirestore,
  getAttendanceFromFirestore,
  getLeavesFromFirestore
} from './lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  // Current active focus date - persists selected date across refresh, defaults to today
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('app_selected_attendance_date');
      if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) {
        return saved;
      }
    } catch {}
    return formatDateKey(new Date());
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('app_selected_attendance_date', selectedDate);
    } catch {}
  }, [selectedDate]);

  const [currentTab, setCurrentTab] = useState<ViewTab>(() => {
    try {
      const saved = sessionStorage.getItem('app_current_tab');
      if (saved && ['dashboard', 'attendance', 'leaves', 'members', 'reports'].includes(saved)) {
        return saved as ViewTab;
      }
    } catch {}
    return 'dashboard';
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('app_current_tab', currentTab);
    } catch {}
  }, [currentTab]);
  
  // Data State
  const [members, setMembers] = useState<Member[]>(() => loadMembers());
  const [records, setRecords] = useState<AttendanceRecord[]>(() => loadAttendanceRecords());
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => loadLeaveRequests());

  // Quota Circuit Breaker state
  const [isQuotaExhausted, setIsQuotaExhausted] = useState<boolean>(() => checkIsQuotaExhausted());
  const [isQuotaBannerDismissed, setIsQuotaBannerDismissed] = useState<boolean>(false);

  useEffect(() => {
    return onQuotaExhaustedChange((exhausted) => {
      setIsQuotaExhausted(exhausted);
    });
  }, []);

  // Count of pending leave applications for admin notification badge (only real leaves)
  const pendingLeavesCount = useMemo(() => {
    return leaves.filter(l => l && l.status === 'pending' && !l.id.startsWith('leave-sample-') && !l.id.includes('sample')).length;
  }, [leaves]);

  // Auth Session State
  const [session, setSession] = useState<AuthSession | null>(() => loadCurrentSession());

  // Cloud Sync & Persistence State
  const [syncState, setSyncState] = useState<CloudSyncState>(() => loadCloudSyncState());
  const [isCloudSyncModalOpen, setIsCloudSyncModalOpen] = useState<boolean>(false);
  const [isAdminDatabaseModalOpen, setIsAdminDatabaseModalOpen] = useState<boolean>(false);
  const [isReminderDismissed, setIsReminderDismissed] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const isInitialSyncRef = useRef<boolean>(true);

  // Modal States
  const [selectedPersonForModal, setSelectedPersonForModal] = useState<Member | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isSecurityAuditOpen, setIsSecurityAuditOpen] = useState<boolean>(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState<boolean>(false);
  const [isSoundSettingsOpen, setIsSoundSettingsOpen] = useState<boolean>(false);

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // Guarantee zero fake or sample leaves exist in state, storage, or Firestore
  useEffect(() => {
    setLeaves(prev => {
      const realOnly = prev.filter(l => l && l.id && !l.id.startsWith('leave-sample-') && !l.id.includes('sample'));
      if (realOnly.length !== prev.length) {
        saveLeaveRequests(realOnly);
        prev.filter(l => l && l.id && (l.id.startsWith('leave-sample-') || l.id.includes('sample'))).forEach(l => {
          deleteLeaveFromFirestore(l.id).catch(() => {});
        });
      }
      return realOnly;
    });
  }, []);

  // Helper to mark unsynced change
  const trackChange = useCallback((count = 1) => {
    const updated = recordUnsyncedChange(count);
    setSyncState(updated);
    setIsReminderDismissed(false);
  }, []);

  // Live real-time connection status & activity log
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(true);
  const [recentLivePunches, setRecentLivePunches] = useState<LivePunchNotification[]>([]);

  // Synthesized Web Audio chime for real-time punch alerts
  const playPunchChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }, []);

  // Real-time Firestore Subscriptions & Cross-Tab Bus
  useEffect(() => {
    let unsubMembers: () => void = () => {};
    let unsubAttendance: () => void = () => {};
    let unsubAccounts: () => void = () => {};
    let unsubLeaves: () => void = () => {};
    let unsubTombstones: () => void = () => {};
    let unsubRealtimeBus: () => void = () => {};

    // Dual-write & Real-time Cloud Firestore Subscriptions
    try {
      // 1. Subscribe to Cloud Tombstones first so deletions sync across all devices
      unsubTombstones = subscribeToTombstones((cloudTombstones) => {
        syncCloudTombstones(cloudTombstones);
        // Cleanse local state immediately
        setMembers(prev => {
          const next = prev.filter(m => !isMemberDeleted(m.id) && (!m.email || !isMemberDeleted(m.email)));
          if (next.length !== prev.length) saveMembers(next);
          return next;
        });
        setRecords(prev => {
          const next = prev.filter(r => !isRecordDeleted(r.id) && !isMemberDeleted(r.memberId));
          if (next.length !== prev.length) saveAttendanceRecords(next);
          return next;
        });
        setLeaves(prev => {
          const next = prev.filter(l => !isLeaveDeleted(l.id) && !isMemberDeleted(l.memberId));
          if (next.length !== prev.length) saveLeaveRequests(next);
          return next;
        });
      });

      unsubMembers = subscribeToMembers((cloudMembers) => {
        notifyFirestoreActive(true);
        setIsLiveConnected(true);
        if (Array.isArray(cloudMembers) && cloudMembers.length > 0) {
          setMembers(prev => {
            const next = mergeMembersLists(prev.length > 0 ? prev : loadMembers(), cloudMembers)
              .filter(m => !isMemberDeleted(m.id) && (!m.email || !isMemberDeleted(m.email)));
            saveMembers(next);
            return next;
          });
        }
      });

      unsubAttendance = subscribeToAttendance((cloudRecords) => {
        notifyFirestoreActive(true);
        setIsLiveConnected(true);
        if (Array.isArray(cloudRecords) && cloudRecords.length > 0) {
          setRecords(prev => {
            const next = mergeAttendanceLists(prev.length > 0 ? prev : loadAttendanceRecords(), cloudRecords)
              .filter(r => !isRecordDeleted(r.id) && !isMemberDeleted(r.memberId));
            saveAttendanceRecords(next);
            return next;
          });
        }
      });

      unsubAccounts = subscribeToAccounts((cloudAccounts) => {
        notifyFirestoreActive(true);
        setIsLiveConnected(true);
        if (cloudAccounts && cloudAccounts.length > 0) {
          const current = loadAccounts();
          // Filter out accounts belonging to members that were deleted
          const validCloud = cloudAccounts.filter(ca => {
            if (!ca) return false;
            if (ca.memberId && isMemberDeleted(ca.memberId)) return false;
            if (ca.email && (isMemberDeleted(ca.email) || isMemberDeleted('mem-' + ca.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')))) return false;
            return true;
          });
          const merged = current.filter(a => !isMemberDeleted(a.memberId) && (!a.email || !isMemberDeleted(a.email)));
          validCloud.forEach(ca => {
            const idx = merged.findIndex(m => m.id === ca.id || (ca.email && m.email && m.email.toLowerCase() === ca.email.toLowerCase()));
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...ca };
            } else {
              merged.push(ca);
            }
          });
          saveAccounts(merged);
          setMembers(prev => {
            const next = reconcileAccountsToMembers(prev);
            saveMembers(next);
            return next;
          });
        }
      });

      unsubLeaves = subscribeToLeaves((cloudLeaves) => {
        notifyFirestoreActive(true);
        setIsLiveConnected(true);
        if (Array.isArray(cloudLeaves) && cloudLeaves.length > 0) {
          setLeaves(prev => {
            const next = mergeLeavesLists(prev.length > 0 ? prev : loadLeaveRequests(), cloudLeaves)
              .filter(l => !isLeaveDeleted(l.id) && !isMemberDeleted(l.memberId));
            saveLeaveRequests(next);
            return next;
          });
        }
      });
    } catch (err) {
      console.warn('Firestore subscription skipped:', err);
    }

    try {
      // Subscribe to instant cross-tab / cross-window sync & server SSE live stream
      unsubRealtimeBus = subscribeToRealtimeSync((msg) => {
        if (msg.type === 'PUNCH_UPDATE') {
          setRecords(prev => {
            const map = new Map<string, AttendanceRecord>();
            prev.forEach(r => map.set(`${r.memberId}_${r.date}`, r));
            map.set(`${msg.record.memberId}_${msg.record.date}`, msg.record);
            const next = Array.from(map.values());
            saveAttendanceRecords(next);
            return next;
          });

          // Update member in members list if member object is passed
          setMembers(prev => {
            if (msg.member && !isMemberDeleted(msg.member.id)) {
              const idx = prev.findIndex(m => m.id === msg.member!.id);
              let next: Member[];
              if (idx >= 0) {
                next = [...prev];
                next[idx] = { ...next[idx], ...msg.member };
              } else {
                next = [msg.member, ...prev];
              }
              saveMembers(next);
              return next;
            }
            return prev;
          });

          const resolvedName = msg.memberName || 'Staff Member';
          const statusLabel = (msg.record.status || 'present').toUpperCase();
          const timeInfo = msg.record.checkInTime ? `In: ${msg.record.checkInTime}` : msg.record.checkOutTime ? `Out: ${msg.record.checkOutTime}` : '';
          showToast(`🟢 Live Punch: ${resolvedName} (${statusLabel} ${timeInfo})`);
          if (msg.record.checkOutTime) {
            playPunchOutSound();
          } else {
            playPunchInSound();
          }

          setRecentLivePunches(prev => [
            {
              id: 'lp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
              memberId: msg.record.memberId,
              memberName: resolvedName,
              status: msg.record.status,
              time: msg.record.checkInTime || msg.record.checkOutTime || 'Now',
              timestamp: Date.now()
            },
            ...prev.filter(p => !(p.memberId === msg.record.memberId && Math.abs(p.timestamp - Date.now()) < 2000))
          ].slice(0, 12));
        } else if (msg.type === 'RECORD_UPDATED') {
          setRecords(prev => {
            const map = new Map<string, AttendanceRecord>();
            prev.forEach(r => map.set(`${r.memberId}_${r.date}`, r));
            map.set(`${msg.record.memberId}_${msg.record.date}`, msg.record);
            const next = Array.from(map.values());
            saveAttendanceRecords(next);
            return next;
          });
        } else if (msg.type === 'PUNCH_BULK_UPDATE' || msg.type === 'BULK_RECORDS_UPDATED') {
          setRecords(prev => {
            const map = new Map<string, AttendanceRecord>();
            prev.forEach(r => map.set(`${r.memberId}_${r.date}`, r));
            msg.records.forEach(r => map.set(`${r.memberId}_${r.date}`, r));
            const next = Array.from(map.values());
            saveAttendanceRecords(next);
            return next;
          });
        } else if (msg.type === 'MEMBER_ADDED') {
          setMembers(prev => {
            if (prev.some(m => m.id === msg.member.id)) return prev;
            const next = [msg.member, ...prev];
            saveMembers(next);
            return next;
          });
          showToast(`🟢 Live: Member added - ${msg.member.name}`);
        } else if (msg.type === 'MEMBER_UPDATED') {
          setMembers(prev => {
            const next = prev.map(m => m.id === msg.member.id ? msg.member : m);
            saveMembers(next);
            return next;
          });
          showToast(`🟢 Live: Member updated - ${msg.member.name}`);
        } else if (msg.type === 'MEMBER_DELETED') {
          setMembers(prev => {
            const next = prev.filter(m => m.id !== msg.memberId);
            saveMembers(next);
            return next;
          });
          showToast(`Live: Member removed from roster`);
        } else if (msg.type === 'MEMBERS_UPDATE') {
          setMembers(msg.members);
          saveMembers(msg.members);
        } else if (msg.type === 'LEAVE_SUBMITTED') {
          setLeaves(prev => {
            const next = [msg.leave, ...prev.filter(l => l.id !== msg.leave.id)];
            saveLeaveRequests(next);
            return next;
          });
          showToast(`📝 Live Leave: ${msg.leave.memberName} applied for ${msg.leave.leaveType} leave`);
          playLeaveSubmittedSound();
        } else if (msg.type === 'LEAVE_REVIEWED') {
          setLeaves(prev => {
            const next = prev.map(l => l.id === msg.leave.id ? msg.leave : l);
            saveLeaveRequests(next);
            return next;
          });
          showToast(`📋 Live Update: Leave for ${msg.leave.memberName} ${msg.leave.status}`);
          if (msg.leave.status === 'approved') {
            playLeaveApprovedSound();
          } else if (msg.leave.status === 'rejected') {
            playLeaveRejectedSound();
          } else {
            playNotificationChime();
          }
        } else if (msg.type === 'LEAVE_DELETED') {
          setLeaves(prev => {
            const next = prev.filter(l => l.id !== msg.leaveId);
            saveLeaveRequests(next);
            return next;
          });
        } else if (msg.type === 'LEAVES_UPDATE') {
          setLeaves(msg.leaves);
          saveLeaveRequests(msg.leaves);
        } else if (msg.type === 'DATA_CLEARED') {
          setMembers([]);
          setRecords([]);
          setLeaves([]);
          saveMembers([]);
          saveAttendanceRecords([]);
          saveLeaveRequests([]);
        } else if (msg.type === 'DATA_RESET') {
          if (msg.members) {
            setMembers(msg.members);
            saveMembers(msg.members);
          }
          if (msg.records && Array.isArray(msg.records)) {
            setRecords(prev => {
              const map = new Map<string, AttendanceRecord>();
              prev.forEach(r => map.set(`${r.memberId}_${r.date}`, r));
              msg.records.forEach((r: AttendanceRecord) => {
                const key = `${r.memberId}_${r.date}`;
                const existing = map.get(key);
                if (existing) {
                  map.set(key, {
                    ...existing,
                    ...r,
                    checkInTime: r.checkInTime || existing.checkInTime,
                    checkOutTime: r.checkOutTime || existing.checkOutTime,
                    status: (r.checkInTime || existing.checkInTime) ? (r.status || existing.status) : (r.status || 'absent'),
                    notes: r.notes || existing.notes
                  });
                } else {
                  map.set(key, r);
                }
              });
              const merged = Array.from(map.values());
              saveAttendanceRecords(merged);
              return merged;
            });
          }
          if (msg.leaves) {
            setLeaves(msg.leaves);
            saveLeaveRequests(msg.leaves);
          }
        } else if (msg.type === 'INIT_STATE' || msg.type === 'STATE_SYNCED') {
          const incomingMembers = (msg.type === 'STATE_SYNCED' ? msg.members : msg.data?.members) || msg.members;
          const incomingRecords = (msg.type === 'STATE_SYNCED' ? msg.records : msg.data?.records) || msg.records;
          const incomingLeaves = (msg.type === 'STATE_SYNCED' ? msg.leaves : msg.data?.leaves) || msg.leaves;

          if (incomingMembers && Array.isArray(incomingMembers) && incomingMembers.length > 0) {
            setMembers(prev => {
              const next = mergeMembersLists(prev.length > 0 ? prev : loadMembers(), incomingMembers);
              saveMembers(next);
              return next;
            });
          }
          if (incomingRecords && Array.isArray(incomingRecords) && incomingRecords.length > 0) {
            setRecords(prev => {
              const next = mergeAttendanceLists(prev.length > 0 ? prev : loadAttendanceRecords(), incomingRecords);
              saveAttendanceRecords(next);
              return next;
            });
          }
          if (incomingLeaves && Array.isArray(incomingLeaves) && incomingLeaves.length > 0) {
            setLeaves(prev => {
              const next = mergeLeavesLists(prev.length > 0 ? prev : loadLeaveRequests(), incomingLeaves);
              saveLeaveRequests(next);
              return next;
            });
          }
        }
      }, (connected) => {
        setIsLiveConnected(connected);
      });

      // Direct Firebase Firestore listeners provide real-time cloud data across all connected clients
    } catch (err) {
      console.warn('Realtime subscription initialized in fallback mode:', err);
    }

    // Provision admin account immediately on load
    initializeDefaultAccounts();

    // Clean any zombie mutation keys from localStorage immediately
    cleanZombieFirestoreKeys();

    // Authoritative direct Firestore load on startup (guarantees data is NEVER lost on page reload)
    getMembersFromFirestore().then(cloudMembers => {
      if (Array.isArray(cloudMembers) && cloudMembers.length > 0) {
        setMembers(prev => {
          const next = mergeMembersLists(prev.length > 0 ? prev : loadMembers(), cloudMembers)
            .filter(m => !isMemberDeleted(m.id) && (!m.email || !isMemberDeleted(m.email)));
          saveMembers(next);
          return next;
        });
      }
    }).catch(console.warn);

    getAttendanceFromFirestore().then(cloudRecords => {
      if (Array.isArray(cloudRecords) && cloudRecords.length > 0) {
        setRecords(prev => {
          const next = mergeAttendanceLists(prev.length > 0 ? prev : loadAttendanceRecords(), cloudRecords)
            .filter(r => !isRecordDeleted(r.id) && !isMemberDeleted(r.memberId));
          saveAttendanceRecords(next);
          return next;
        });
      }
    }).catch(console.warn);

    getLeavesFromFirestore().then(cloudLeaves => {
      if (Array.isArray(cloudLeaves) && cloudLeaves.length > 0) {
        setLeaves(prev => {
          const next = mergeLeavesLists(prev.length > 0 ? prev : loadLeaveRequests(), cloudLeaves)
            .filter(l => !isLeaveDeleted(l.id) && !isMemberDeleted(l.memberId));
          saveLeaveRequests(next);
          return next;
        });
      }
    }).catch(console.warn);

    // Fetch authoritative live snapshot from server on startup (instant refresh persistence)
    fetchLiveStateFromServer(0, true).then(serverSnapshot => {
      if (serverSnapshot) {
        if (Array.isArray(serverSnapshot.members) && serverSnapshot.members.length > 0) {
          setMembers(prev => {
            const next = mergeMembersLists(prev, serverSnapshot.members);
            saveMembers(next);
            return next;
          });
        }
        if (Array.isArray(serverSnapshot.records) && serverSnapshot.records.length > 0) {
          setRecords(prev => {
            const next = mergeAttendanceLists(prev, serverSnapshot.records);
            saveAttendanceRecords(next);
            return next;
          });
        }
        if (Array.isArray(serverSnapshot.leaves) && serverSnapshot.leaves.length > 0) {
          setLeaves(prev => {
            const next = mergeLeavesLists(prev, serverSnapshot.leaves);
            saveLeaveRequests(next);
            return next;
          });
        }
      }
    }).catch(console.warn);

    // Reconcile existing local records/leaves to server state so past date edits are never lost
    const localRecords = loadAttendanceRecords();
    const localLeaves = loadLeaveRequests();
    const localMembers = loadMembers();
    if (localRecords.length > 0 || localLeaves.length > 0) {
      sendLiveActionToServer('SYNC_STATE', {
        records: localRecords,
        leaves: localLeaves,
        members: localMembers
      }).catch(() => {});
    }

    return () => {
      unsubTombstones();
      unsubMembers();
      unsubAttendance();
      unsubAccounts();
      unsubLeaves();
      unsubRealtimeBus();
    };
  }, [showToast, playPunchChime]);

  // Save to localStorage when state changes
  useEffect(() => {
    saveMembers(members);
  }, [members]);

  useEffect(() => {
    saveAttendanceRecords(records);
  }, [records]);

  useEffect(() => {
    saveLeaveRequests(leaves);
  }, [leaves]);

  // Periodic Auto-Sync Timer (every 45 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const currentState = loadCloudSyncState();
      if (currentState.autoSyncEnabled && currentState.unsyncedChangesCount > 0 && session) {
        performCloudSync(members, records, session.email, session.role)
          .then(() => {
            setSyncState(loadCloudSyncState());
          })
          .catch(() => {});
      }
    }, 45000);
    return () => clearInterval(interval);
  }, [members, records, session]);

  // Handle Cloud Sync Action
  const handleCloudSync = useCallback(async () => {
    if (!session) return;
    try {
      // 1. Create local snapshot backup and clear unsynced count immediately
      const snap = await performCloudSync(members, records, session.email, session.role);
      const latestSync = loadCloudSyncState();
      setSyncState(latestSync);
      setIsReminderDismissed(true);

      // 2. If Firestore quota is available, sync to Firestore in background without blocking UI
      if (!checkIsQuotaExhausted()) {
        try {
          await batchSaveMembersToFirestore(members);
          const currentMonthPrefix = formatDateKey(new Date()).substring(0, 7);
          const recentRecords = records.filter(r => r && r.date && r.date.startsWith(currentMonthPrefix));
          if (recentRecords.length > 0 && recentRecords.length <= 50) {
            await batchSaveAttendanceToFirestore(recentRecords);
          }
        } catch (e) {
          console.warn('[handleCloudSync] Background sync notice:', e);
        }
      }

      showToast(`Cloud snapshot created (Checksum: ${snap.checksum})`);
    } catch (err) {
      console.error(err);
      showToast('Cloud snapshot saved to local backup.');
    }
  }, [members, records, session, showToast]);

  const handleDismissReminder = useCallback(() => {
    setIsReminderDismissed(true);
    dismissCloudSyncReminder();
    setSyncState(loadCloudSyncState());
  }, []);

  // Handle Snapshot Restore
  const handleRestoreSnapshot = useCallback((restoredMembers: Member[], restoredRecords: AttendanceRecord[]) => {
    setMembers(restoredMembers);
    setRecords(restoredRecords);
    saveMembers(restoredMembers);
    saveAttendanceRecords(restoredRecords);
    const updated = loadCloudSyncState();
    setSyncState(updated);
    broadcastSyncEvent({
      type: 'PUNCH_BULK_UPDATE',
      records: restoredRecords,
      timestamp: Date.now()
    });
    broadcastSyncEvent({
      type: 'MEMBERS_UPDATE',
      members: restoredMembers,
      timestamp: Date.now()
    });
    showToast(`Restored system state (${restoredMembers.length} staff, ${restoredRecords.length} records)`);
  }, [showToast]);

  // Handle Login Success
  const handleLoginSuccess = useCallback((newSession: AuthSession) => {
    setSession(newSession);
    showToast(`Welcome back, ${newSession.name} (${newSession.role.toUpperCase()})`);
  }, [showToast]);

  // Handle Logout
  const handleLogout = useCallback(() => {
    if (session) {
      logSecurityEvent('LOGOUT', session.email, 'User logged out and session token invalidated', session.role);
    }
    clearSession();
    setSession(null);
    setIsSecurityAuditOpen(false);
    setIsAccountSettingsOpen(false);
    setIsCloudSyncModalOpen(false);
    showToast('Signed out securely');
  }, [session, showToast]);

  // Handler for single record update with auto-sync and real-time broadcast
  const handleUpdateRecord = useCallback(async (updatedRecord: AttendanceRecord, memberName?: string) => {
    if (isMemberDeleted(updatedRecord.memberId)) {
      return;
    }
    const mem = members.find(m => 
      m.id === updatedRecord.memberId || 
      (m.email && updatedRecord.memberId.includes(m.email.replace(/[^a-zA-Z0-9]/g, '_')))
    );
    const resolvedName = memberName || mem?.name || 'Staff Member';

    const isAbsent = updatedRecord.status === 'absent';
    const cleanRecord: AttendanceRecord = {
      ...updatedRecord,
      checkInTime: isAbsent ? undefined : (updatedRecord.checkInTime || undefined),
      checkOutTime: isAbsent ? undefined : (updatedRecord.checkOutTime || undefined),
      updatedAt: new Date().toISOString()
    };

    const aliases = new Set<string>();
    aliases.add(cleanRecord.memberId.toLowerCase());
    if (mem?.id) aliases.add(mem.id.toLowerCase());
    if (mem?.email) {
      const em = mem.email.toLowerCase().trim();
      aliases.add(em);
      aliases.add('mem-' + em.replace(/[^a-zA-Z0-9]/g, '_'));
    }

    setRecords(prev => {
      const index = prev.findIndex(r => 
        (r.id && cleanRecord.id && r.id === cleanRecord.id) || 
        (r.date === cleanRecord.date && (aliases.has(r.memberId.toLowerCase()) || (r.id && Array.from(aliases).some(a => r.id.includes(a)))))
      );
      let next: AttendanceRecord[];
      if (index >= 0) {
        next = [...prev];
        next[index] = cleanRecord;
      } else {
        next = [...prev, cleanRecord];
      }
      saveAttendanceRecords(next);
      return next;
    });
    trackChange(1);

    // Broadcast in real-time to other browser tabs/windows
    broadcastSyncEvent({
      type: 'PUNCH_UPDATE',
      record: cleanRecord,
      memberName: resolvedName,
      timestamp: Date.now()
    });

    // Dual-persist immediately to Node live server (db.json & SSE broadcast to mobile/laptop)
    sendLiveActionToServer('UPDATE_RECORD', {
      record: cleanRecord,
      memberName: resolvedName
    }).catch(console.warn);

    if (cleanRecord.checkInTime || cleanRecord.checkOutTime || cleanRecord.status === 'present' || cleanRecord.status === 'late') {
      sendLiveActionToServer('PUNCH_ATTENDANCE', {
        record: cleanRecord,
        memberName: resolvedName
      }).catch(console.warn);
    }

    try {
      await saveAttendanceRecordToFirestore(cleanRecord);
    } catch (err) {
      console.warn('Firestore record write deferred to offline queue:', err);
    }
  }, [members, trackChange]);

  // Handler for bulk records update
  const handleBulkUpdate = useCallback(async (newRecords: AttendanceRecord[]) => {
    setRecords(prev => {
      const next = [...prev];
      newRecords.forEach(newRec => {
        const mem = members.find(m => 
          m.id === newRec.memberId || 
          (m.email && newRec.memberId.includes(m.email.replace(/[^a-zA-Z0-9]/g, '_')))
        );
        const aliases = new Set<string>();
        aliases.add(newRec.memberId.toLowerCase());
        if (mem?.id) aliases.add(mem.id.toLowerCase());
        if (mem?.email) {
          const em = mem.email.toLowerCase().trim();
          aliases.add(em);
          aliases.add('mem-' + em.replace(/[^a-zA-Z0-9]/g, '_'));
        }

        const existingIdx = next.findIndex(r => 
          (r.id && newRec.id && r.id === newRec.id) ||
          (r.date === newRec.date && (aliases.has(r.memberId.toLowerCase()) || (r.id && Array.from(aliases).some(a => r.id.includes(a)))))
        );

        if (existingIdx >= 0) {
          next[existingIdx] = newRec;
        } else {
          next.push(newRec);
        }
      });
      saveAttendanceRecords(next);
      return next;
    });
    trackChange(newRecords.length);
    broadcastSyncEvent({
      type: 'PUNCH_BULK_UPDATE',
      records: newRecords,
      timestamp: Date.now()
    });
    sendLiveActionToServer('BULK_RECORDS', {
      records: newRecords
    }).catch(console.warn);
    showToast(`Updated attendance for ${newRecords.length} staff members`);
    try {
      await batchSaveAttendanceToFirestore(newRecords);
    } catch (err) {
      console.warn('Firestore bulk write deferred:', err);
    }
  }, [members, trackChange, showToast]);

  // Handler for adding member
  const handleAddMember = useCallback(async (newMember: Member) => {
    unmarkMemberDeleted(newMember.id);
    if (newMember.email) {
      unmarkMemberDeleted('mem-' + newMember.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_'));
    }
    setMembers(prev => {
      const next = [
        newMember, 
        ...prev.filter(m => 
          m.id !== newMember.id && 
          (!m.email || !newMember.email || m.email.toLowerCase().trim() !== newMember.email.toLowerCase().trim())
        )
      ];
      saveMembers(next);
      broadcastSyncEvent({
        type: 'MEMBER_ADDED',
        member: newMember,
        timestamp: Date.now()
      });
      broadcastSyncEvent({
        type: 'MEMBERS_UPDATE',
        members: next,
        timestamp: Date.now()
      });
      return next;
    });
    sendLiveActionToServer('ADD_MEMBER', {
      member: newMember
    });
    trackChange(1);
    showToast(`Added ${newMember.name} to roster`);
    try {
      await saveMemberToFirestore(newMember);
    } catch (err) {
      console.warn('Firestore member write deferred:', err);
    }
  }, [trackChange, showToast]);

  // Handler for adding batch members
  const handleAddBatchMembers = useCallback(async (newMembers: Member[]) => {
    let nextMembers: Member[] = [];
    setMembers(prev => {
      const next = [...newMembers, ...prev];
      nextMembers = next;
      saveMembers(next);
      broadcastSyncEvent({
        type: 'MEMBERS_UPDATE',
        members: next,
        timestamp: Date.now()
      });
      return next;
    });
    sendLiveActionToServer('SYNC_STATE', {
      members: nextMembers
    });
    trackChange(newMembers.length);
    try {
      await batchSaveMembersToFirestore(newMembers);
    } catch (err) {
      console.warn('Firestore batch members write deferred:', err);
    }
  }, [trackChange]);

  // Handler for updating member
  const handleUpdateMember = useCallback(async (updatedMember: Member) => {
    setMembers(prev => {
      const next = prev.map(m => m.id === updatedMember.id ? updatedMember : m);
      saveMembers(next);
      broadcastSyncEvent({
        type: 'MEMBERS_UPDATE',
        members: next,
        timestamp: Date.now()
      });
      return next;
    });
    sendLiveActionToServer('UPDATE_MEMBER', {
      member: updatedMember
    });
    trackChange(1);
    showToast(`Updated profile for ${updatedMember.name}`);
    try {
      await saveMemberToFirestore(updatedMember);
    } catch (err) {
      console.warn('Firestore member update deferred:', err);
    }
  }, [trackChange, showToast]);

  // Handler for deleting member
  const handleDeleteMember = useCallback(async (memberId: string) => {
    const mem = members.find(m => m.id === memberId);
    const memEmail = mem?.email;
    const memEmpId = mem?.employeeId;
    const memName = mem?.name;

    // Collect all possible aliases for this member
    const allAliases = new Set<string>();
    allAliases.add(memberId);
    allAliases.add(memberId.toLowerCase().trim());
    allAliases.add(memberId.replace(/^mem-/, ''));
    allAliases.add('mem-' + memberId.replace(/^mem-/, ''));
    if (memEmail && memEmail.trim()) {
      const em = memEmail.toLowerCase().trim();
      allAliases.add(em);
      allAliases.add('mem-' + em.replace(/[^a-zA-Z0-9]/g, '_'));
      allAliases.add(em.replace(/[^a-zA-Z0-9]/g, '_'));
    }
    if (memEmpId && memEmpId.trim()) {
      allAliases.add(memEmpId);
      allAliases.add(memEmpId.toLowerCase().trim());
    }

    markMemberDeleted(memberId, memEmail);

    setMembers(prev => {
      const next = prev.filter(m => !allAliases.has(m.id) && (!m.email || !allAliases.has(m.email.toLowerCase().trim())));
      saveMembers(next);
      broadcastSyncEvent({
        type: 'MEMBER_DELETED',
        memberId,
        timestamp: Date.now()
      });
      return next;
    });

    setRecords(prev => {
      const next = prev.filter(r => {
        if (!r) return false;
        if (allAliases.has(r.memberId) || allAliases.has((r.memberId || '').toLowerCase().trim())) return false;
        if (r.id && Array.from(allAliases).some(a => a && r.id.includes(a))) return false;
        return true;
      });
      saveAttendanceRecords(next);
      return next;
    });

    setLeaves(prev => {
      const next = prev.filter(l => {
        if (!l) return false;
        if (allAliases.has(l.memberId) || allAliases.has((l.memberId || '').toLowerCase().trim())) return false;
        if (memName && l.memberName && l.memberName.toLowerCase().trim() === memName.toLowerCase().trim()) return false;
        return true;
      });
      saveLeaveRequests(next);
      return next;
    });

    deleteAccountByMemberId(memberId, memEmail);
    trackChange(1);
    showToast(`Removed ${mem?.name || 'member'} and purged all attendance data`);

    try {
      await deleteMemberFromFirestore(memberId, memEmail, memEmpId, memName);
    } catch (err) {
      console.warn('Firestore member delete deferred:', err);
    }
  }, [members, trackChange, showToast]);

  // Handler to Start Blank / Clear Firestore for Real Data Entry
  const handleStartBlankDatabase = useCallback(async () => {
    try {
      await clearAllFirestoreData();
    } catch (err) {
      console.warn('Error wiping Firestore:', err);
    }
    setMembers([]);
    setRecords([]);
    saveMembers([]);
    saveAttendanceRecords([]);
    sendLiveActionToServer('CLEAR_ALL', {});
    trackChange(1);
  }, [trackChange]);

  // Reset / Seed Template Data
  const handleResetSeedData = useCallback(async () => {
    const fresh = resetToSeedData();
    setMembers(fresh.members);
    setRecords(fresh.records);
    saveMembers(fresh.members);
    saveAttendanceRecords(fresh.records);
    setSelectedDate('2026-09-01');
    sendLiveActionToServer('RESET_SEED', {
      members: fresh.members,
      records: fresh.records
    });
    trackChange(1);
    try {
      await clearAllFirestoreData();
      await batchSaveMembersToFirestore(fresh.members);
      await batchSaveAttendanceToFirestore(fresh.records);
    } catch (err) {
      console.warn('Error writing seed to Firestore:', err);
    }
  }, [trackChange]);

  // Reset to seed data
  const handleResetData = useCallback(() => {
    handleResetSeedData();
    showToast('Database reset to fresh sample dataset');
  }, [handleResetSeedData, showToast]);

  // Leave Management Handlers
  const handleApproveLeave = useCallback(async (leave: LeaveRequest, adminRemark?: string) => {
    const updatedLeave: LeaveRequest = {
      ...leave,
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: session?.name || 'Administrator',
      adminRemark: adminRemark || 'Approved by Admin'
    };

    // 1. Update local leave state
    setLeaves(prev => {
      const next = prev.map(l => l.id === leave.id ? updatedLeave : l);
      saveLeaveRequests(next);
      return next;
    });

    // 2. Automatically record/excuse attendance records for each day of the leave
    const sDate = new Date(leave.startDate + 'T00:00:00');
    const eDate = new Date(leave.endDate + 'T00:00:00');
    const cur = new Date(sDate);
    const excusedRecords: AttendanceRecord[] = [];

    while (cur <= eDate) {
      const dStr = formatDateKey(cur);
      const existing = records.find(r => r.memberId === leave.memberId && r.date === dStr);
      const excuseRec: AttendanceRecord = {
        id: existing?.id || `att-${leave.memberId}-${dStr}`,
        memberId: leave.memberId,
        date: dStr,
        status: 'excused',
        notes: `Approved Leave (${leave.leaveType.toUpperCase()}): ${leave.reason}`,
        updatedAt: new Date().toISOString()
      };
      excusedRecords.push(excuseRec);
      cur.setDate(cur.getDate() + 1);
    }

    setRecords(prev => {
      const map = new Map<string, AttendanceRecord>();
      prev.forEach(r => map.set(`${r.memberId}_${r.date}`, r));
      excusedRecords.forEach(r => map.set(`${r.memberId}_${r.date}`, r));
      const next = Array.from(map.values());
      saveAttendanceRecords(next);
      return next;
    });

    // 3. Broadcast real-time event & server action
    broadcastSyncEvent({
      type: 'LEAVE_REVIEWED',
      leave: updatedLeave,
      timestamp: Date.now()
    });
    sendLiveActionToServer('REVIEW_LEAVE', { leave: updatedLeave });

    if (excusedRecords.length > 0) {
      broadcastSyncEvent({
        type: 'PUNCH_BULK_UPDATE',
        records: excusedRecords,
        timestamp: Date.now()
      });
      sendLiveActionToServer('BULK_RECORDS', {
        records: excusedRecords
      });
    }

    // 4. Save to Firestore
    try {
      await saveLeaveToFirestore(updatedLeave);
      for (const rec of excusedRecords) {
        await saveAttendanceRecordToFirestore(rec);
      }
    } catch (err) {
      console.warn('Firestore leave approve sync deferred:', err);
    }

    trackChange(1);
    playLeaveApprovedSound();
    showToast(`✅ Leave approved for ${leave.memberName}`);
  }, [session, records, trackChange, showToast]);

  const handleRejectLeave = useCallback(async (leave: LeaveRequest, adminRemark?: string) => {
    const updatedLeave: LeaveRequest = {
      ...leave,
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedBy: session?.name || 'Administrator',
      adminRemark: adminRemark || 'Declined by Admin'
    };

    setLeaves(prev => {
      const next = prev.map(l => l.id === leave.id ? updatedLeave : l);
      saveLeaveRequests(next);
      return next;
    });

    broadcastSyncEvent({
      type: 'LEAVE_REVIEWED',
      leave: updatedLeave,
      timestamp: Date.now()
    });
    sendLiveActionToServer('REVIEW_LEAVE', { leave: updatedLeave });

    try {
      await saveLeaveToFirestore(updatedLeave);
    } catch (err) {
      console.warn('Firestore leave reject sync deferred:', err);
    }

    trackChange(1);
    playLeaveRejectedSound();
    showToast(`❌ Leave declined for ${leave.memberName}`);
  }, [session, trackChange, showToast]);

  const handleSubmitLeave = useCallback(async (newLeave: LeaveRequest) => {
    setLeaves(prev => {
      const next = [newLeave, ...prev.filter(l => l.id !== newLeave.id)];
      saveLeaveRequests(next);
      return next;
    });

    broadcastSyncEvent({
      type: 'LEAVE_SUBMITTED',
      leave: newLeave,
      timestamp: Date.now()
    });
    sendLiveActionToServer('SUBMIT_LEAVE', { leave: newLeave });

    try {
      await saveLeaveToFirestore(newLeave);
    } catch (err) {
      console.warn('Firestore leave submit sync deferred:', err);
    }

    trackChange(1);
    playLeaveSubmittedSound();
    showToast(`📋 Leave application submitted for review`);
  }, [trackChange, showToast]);

  const handleDeleteLeave = useCallback(async (leaveId: string) => {
    markLeaveDeleted(leaveId);
    setLeaves(prev => {
      const next = prev.filter(l => l.id !== leaveId);
      saveLeaveRequests(next);
      return next;
    });

    broadcastSyncEvent({
      type: 'LEAVE_DELETED',
      leaveId,
      timestamp: Date.now()
    });
    sendLiveActionToServer('DELETE_LEAVE', { leaveId });

    try {
      await deleteLeaveFromFirestore(leaveId);
    } catch (err) {
      console.warn('Firestore leave delete deferred:', err);
    }

    trackChange(1);
    showToast(`Leave application removed`);
  }, [trackChange, showToast]);

  // Linked member for employee user portal (strictly isolated real profile)
  const currentMember = useMemo(() => {
    if (!session) return undefined;
    const sMid = (session.memberId || '').toLowerCase().trim();
    const sMidStripped = sMid.replace(/^mem-/, '');
    const sEmail = (session.email || '').toLowerCase().trim();

    // 1. Direct match by memberId, stripped ID, or email
    let found = members.find(m => {
      const mId = m.id.toLowerCase().trim();
      const mStripped = mId.replace(/^mem-/, '');
      const mEmail = (m.email || '').toLowerCase().trim();
      return (
        (sMid && (mId === sMid || mStripped === sMidStripped)) ||
        (sEmail && mEmail === sEmail)
      );
    });
    if (found) return found;

    // 2. Check accounts in storage for linked memberId
    try {
      const raw = localStorage.getItem('app_attendance_accounts_v1') || localStorage.getItem('app_attendance_accounts_v3');
      if (raw) {
        const accs = JSON.parse(raw);
        if (Array.isArray(accs)) {
          const acc = accs.find((a: any) => 
            (a.email && session.email && a.email.toLowerCase().trim() === session.email.toLowerCase().trim()) ||
            (a.id && session.userId && a.id === session.userId)
          );
          if (acc && acc.memberId) {
            found = members.find(m => m.id === acc.memberId);
            if (found) return found;
          }
        }
      }
    } catch {}

    // 3. Match by name
    if (session.name) {
      found = members.find(m => m.name && m.name.toLowerCase().trim() === session.name.toLowerCase().trim());
      if (found) return found;
    }

    if (session.role === 'user') {
      const generatedId = session.memberId || ('mem-' + (session.email || 'user').replace(/[^a-zA-Z0-9]/g, '_'));
      const fallbackProfile: Member = {
        id: generatedId,
        name: session.name || (session.email ? session.email.split('@')[0] : 'Staff Member'),
        employeeId: session.email ? session.email.split('@')[0].toUpperCase() : 'EMP-001',
        department: 'Operations & Admin',
        role: 'Staff Member',
        email: session.email || '',
        phone: '',
        joinDate: formatDateKey(new Date()),
        shift: 'regular',
        avatarColor: 'from-blue-600 to-indigo-600',
        active: true
      };
      return fallbackProfile;
    }
    return undefined;
  }, [members, session]);

  // Auto-sync staff member identity to members list, Firestore, and live server so Admin side immediately displays their profile
  useEffect(() => {
    if (session && session.role === 'user' && currentMember) {
      const alreadyExists = members.some(m => 
        m.id === currentMember.id || 
        (m.email && currentMember.email && m.email.toLowerCase().trim() === currentMember.email.toLowerCase().trim())
      );
      if (!alreadyExists) {
        setMembers(prev => {
          if (prev.some(m => m.id === currentMember.id || (m.email && currentMember.email && m.email.toLowerCase().trim() === currentMember.email.toLowerCase().trim()))) return prev;
          const next = [currentMember, ...prev];
          saveMembers(next);
          return next;
        });
        saveMemberToFirestore(currentMember).catch(() => {});
        sendLiveActionToServer('ADD_MEMBER', { member: currentMember });
      }
    }
  }, [session, currentMember, members]);

  // Check if Sync to Cloud reminder should appear (Admin Only)
  const isRecentlyDismissed = Boolean(
    isReminderDismissed ||
    (syncState.lastDismissedTimestamp && Date.now() - syncState.lastDismissedTimestamp < 60 * 60 * 1000)
  );

  const shouldShowSyncReminder = Boolean(
    session &&
    session.role === 'admin' &&
    !isRecentlyDismissed &&
    syncState.unsyncedChangesCount >= 3
  );

  // If not logged in, render Advanced Cryptographic Login / Registration Screen
  if (!session) {
    return (
      <LoginScreen
        members={members}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/60 text-slate-900 flex flex-col font-sans w-full min-w-0 overflow-x-auto">
      
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onResetData={handleResetData}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        totalMembers={members.length}
        pendingLeavesCount={pendingLeavesCount}
        session={session}
        syncState={syncState}
        onOpenCloudSync={() => setIsCloudSyncModalOpen(true)}
        onOpenDatabaseStudio={() => setIsAdminDatabaseModalOpen(true)}
        onLogout={handleLogout}
        onOpenSecurityAudit={() => setIsSecurityAuditOpen(true)}
        onOpenAccountSettings={() => setIsAccountSettingsOpen(true)}
        onOpenSoundSettings={() => setIsSoundSettingsOpen(true)}
        isLiveConnected={isLiveConnected}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        isQuotaExhausted={isQuotaExhausted}
      />

      {/* Daily Free Quota Notice Banner */}
      {isQuotaExhausted && !isQuotaBannerDismissed && (
        <div id="firestore-quota-notice" className="bg-amber-50 border-b border-amber-200/90 px-4 py-2.5 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs sm:text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <span className="font-semibold">Daily Cloud Quota Reached:</span>
              <span className="text-amber-800">
                Operating smoothly via Local & Server Storage mode with full functionality. Write quota automatically resets daily.
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs">
              <button
                type="button"
                id="dismiss-quota-notice-btn"
                onClick={() => setIsQuotaBannerDismissed(true)}
                className="text-amber-700 hover:text-amber-950 font-semibold px-2 py-0.5 rounded-md hover:bg-amber-100 transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Layout: Left Sidebar for Admin, Direct Portal for Regular Employee */}
      {session.role === 'admin' ? (
        <div className="flex-1 flex w-full min-h-[calc(100vh-64px)] relative">
          
          {/* Left Navigation Sidebar */}
          <AdminSidebar
            currentTab={currentTab}
            onTabChange={(tab) => {
              setCurrentTab(tab);
              setIsSidebarOpen(false);
            }}
            totalMembers={members.length}
            pendingLeavesCount={pendingLeavesCount}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            syncState={syncState}
            onOpenCloudSync={() => setIsCloudSyncModalOpen(true)}
            onOpenDatabaseStudio={() => setIsAdminDatabaseModalOpen(true)}
            onOpenSecurityAudit={() => setIsSecurityAuditOpen(true)}
            isOpenMobile={isSidebarOpen}
            onCloseMobile={() => setIsSidebarOpen(false)}
          />

          {/* Admin Main Content Area */}
          <main className="flex-1 min-w-0 px-3 sm:px-6 lg:px-8 py-6 overflow-x-auto">
            <div className="max-w-7xl mx-auto w-full">
              <AnimatePresence mode="wait">
                
                {currentTab === 'dashboard' && (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <DashboardView
                      members={members}
                      records={records}
                      selectedDate={selectedDate}
                      onDateChange={setSelectedDate}
                      onNavigateToAttendance={(date) => {
                        if (date) setSelectedDate(date);
                        setCurrentTab('attendance');
                      }}
                      onNavigateToReports={() => setCurrentTab('reports')}
                      onSelectPerson={(mem) => setSelectedPersonForModal(mem)}
                      onOpenAddMember={() => setIsAddModalOpen(true)}
                      onOpenDatabaseStudio={() => setIsAdminDatabaseModalOpen(true)}
                      recentLivePunches={recentLivePunches}
                      isLiveConnected={isLiveConnected}
                    />
                  </motion.div>
                )}

                {currentTab === 'attendance' && (
                  <motion.div
                    key="attendance"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <DailyAttendanceView
                      members={members}
                      records={records}
                      selectedDate={selectedDate}
                      onDateChange={setSelectedDate}
                      onUpdateRecord={handleUpdateRecord}
                      onBulkUpdate={handleBulkUpdate}
                      onSelectPerson={(mem) => setSelectedPersonForModal(mem)}
                      onOpenAddMember={() => setIsAddModalOpen(true)}
                    />
                  </motion.div>
                )}

                {/* Dedicated Leave Applications Section */}
                {currentTab === 'leaves' && (
                  <motion.div
                    key="leaves"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <LeaveManagementView
                      leaves={leaves}
                      members={members}
                      records={records}
                      session={session}
                      onApproveLeave={handleApproveLeave}
                      onRejectLeave={handleRejectLeave}
                      onSubmitLeave={handleSubmitLeave}
                      onDeleteLeave={handleDeleteLeave}
                      isLiveConnected={isLiveConnected}
                    />
                  </motion.div>
                )}

                {currentTab === 'members' && (
                  <motion.div
                    key="members"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <MembersAdminView
                      members={members}
                      onAddMember={handleAddMember}
                      onUpdateMember={handleUpdateMember}
                      onDeleteMember={handleDeleteMember}
                      onSelectPerson={(mem) => setSelectedPersonForModal(mem)}
                      isAddModalOpen={isAddModalOpen}
                      setIsAddModalOpen={setIsAddModalOpen}
                    />
                  </motion.div>
                )}

                {currentTab === 'reports' && (
                  <motion.div
                    key="reports"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ReportsExportView
                      members={members}
                      records={records}
                      onSelectPerson={(mem) => setSelectedPersonForModal(mem)}
                    />
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </main>

        </div>
      ) : (
        /* Regular User / Employee Portal */
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-6 min-w-0 overflow-x-auto">
          <UserPortalView
            session={session}
            member={currentMember}
            records={records}
            selectedDate={selectedDate}
            leaves={leaves}
            onSubmitLeaveApplication={handleSubmitLeave}
            onCancelLeave={handleDeleteLeave}
            onUpdateRecord={handleUpdateRecord}
            onUpdateMember={handleUpdateMember}
            onLogout={handleLogout}
            onOpenSettings={() => setIsAccountSettingsOpen(true)}
          />
        </main>
      )}

      {/* Real Cloud Database & Manual Entry Studio Modal (Admin Only) */}
      <AnimatePresence>
        {isAdminDatabaseModalOpen && session.role === 'admin' && (
          <AdminManualEntryModal
            members={members}
            records={records}
            isCloudConnected={true}
            onClose={() => setIsAdminDatabaseModalOpen(false)}
            onAddMember={handleAddMember}
            onAddBatchMembers={handleAddBatchMembers}
            onSaveAttendanceRecord={handleUpdateRecord}
            onSaveBatchAttendance={handleBulkUpdate}
            onStartBlankDatabase={handleStartBlankDatabase}
            onResetSeedData={handleResetSeedData}
            onShowToast={showToast}
          />
        )}
      </AnimatePresence>

      {/* Person Detail Dossier Modal */}
      <AnimatePresence>
        {selectedPersonForModal && (
          <PersonDetailModal
            member={selectedPersonForModal}
            records={records}
            onUpdateMember={(updated) => {
              handleUpdateMember(updated);
              setSelectedPersonForModal(updated);
            }}
            onClose={() => setSelectedPersonForModal(null)}
          />
        )}
      </AnimatePresence>

      {/* Security Audit Center Modal (Admin Only) */}
      <AnimatePresence>
        {isSecurityAuditOpen && session.role === 'admin' && (
          <SecurityAuditModal
            onClose={() => setIsSecurityAuditOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Account Settings & Password Change Modal */}
      <AnimatePresence>
        {isAccountSettingsOpen && (
          <AccountSettingsModal
            session={session}
            onClose={() => setIsAccountSettingsOpen(false)}
            onLogout={handleLogout}
            onSessionUpdated={(updated) => setSession(updated)}
          />
        )}
      </AnimatePresence>

      {/* Audio & Notification Sound Settings Modal */}
      <AnimatePresence>
        {isSoundSettingsOpen && (
          <SoundSettingsModal
            isOpen={isSoundSettingsOpen}
            onClose={() => setIsSoundSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Cloud Backup & Sync Management Modal (Admin Only) */}
      <AnimatePresence>
        {isCloudSyncModalOpen && session.role === 'admin' && (
          <CloudSyncModal
            session={session}
            members={members}
            records={records}
            syncState={syncState}
            onClose={() => setIsCloudSyncModalOpen(false)}
            onSyncComplete={() => {
              const fresh = loadCloudSyncState();
              setSyncState(fresh);
              setIsReminderDismissed(false);
            }}
            onRestoreSnapshot={handleRestoreSnapshot}
          />
        )}
      </AnimatePresence>

      {/* Persistent / Responsive 'Sync to Cloud' Reminder Notification */}
      <AnimatePresence>
        {shouldShowSyncReminder && (
          <CloudSyncReminder
            syncState={syncState}
            onSync={handleCloudSync}
            onOpenSyncModal={() => setIsCloudSyncModalOpen(true)}
            onDismiss={handleDismissReminder}
          />
        )}
      </AnimatePresence>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-semibold flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
