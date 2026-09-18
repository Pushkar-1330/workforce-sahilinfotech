import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore,
  Firestore, 
  collection, 
  doc, 
  getDoc,
  setDoc, 
  getDocs, 
  deleteDoc, 
  writeBatch, 
  onSnapshot, 
  query, 
  where,
  setLogLevel,
  disableNetwork,
  Unsubscribe 
} from 'firebase/firestore';
import { Member, AttendanceRecord, SecurityAuditLog, LeaveRequest } from '../types';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Initialize Firebase App
let firebaseApp: FirebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp({
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket: firebaseConfigJson.storageBucket,
    messagingSenderId: firebaseConfigJson.messagingSenderId,
    appId: firebaseConfigJson.appId,
  });
} else {
  firebaseApp = getApp();
}

/**
 * Automatically purge any zombie firestore mutation or lock keys from localStorage.
 * This frees up 7MB+ of localStorage and prevents QuotaExceededError.
 */
export function cleanZombieFirestoreKeys(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('firestore_') || k.startsWith('__firestore_'))) {
        toRemove.push(k);
      }
    }
    toRemove.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
    try {
      localStorage.removeItem('firestore_quota_exhausted_date_v1');
    } catch {}
    _isQuotaExhausted = false;
    if (toRemove.length > 0) {
      console.log(`[Firestore] Purged ${toRemove.length} zombie cache keys from localStorage.`);
    }
  } catch {}
}

// Run immediately on module load to keep localStorage completely clean
cleanZombieFirestoreKeys();

// Initialize Firestore with clean, direct settings without the deadlock-prone persistentMultipleTabManager
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    firebaseApp,
    {
      ignoreUndefinedProperties: true
    },
    firebaseConfigJson.firestoreDatabaseId || undefined
  );
} catch {
  firestoreInstance = firebaseConfigJson.firestoreDatabaseId 
    ? getFirestore(firebaseApp, firebaseConfigJson.firestoreDatabaseId)
    : getFirestore(firebaseApp);
}

export const db: Firestore = firestoreInstance;

// Configure Firestore logger to silent to prevent noisy console logs
try {
  setLogLevel('silent');
} catch {
  // Ignore
}

export const MEMBERS_COLLECTION = 'members';
export const ATTENDANCE_COLLECTION = 'attendance';
export const AUDIT_COLLECTION = 'audit_logs';
export const ACCOUNTS_COLLECTION = 'user_accounts';
export const LEAVES_COLLECTION = 'leaves';
export const TOMBSTONES_COLLECTION = 'system_tombstones';
export const TOMBSTONES_DOC_ID = 'deleted_entities';

export interface CloudTombstones {
  members: string[];
  records: string[];
  leaves: string[];
  updatedAt?: string;
}

/**
 * Deeply clean an object for Firestore by omitting any fields that have `undefined` values.
 * Firestore strictly rejects setDoc/batch.set if any property value is undefined.
 */
export function cleanForFirestore<T>(data: T): any {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => cleanForFirestore(item));
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      clean[key] = (typeof value === 'object' && value !== null) ? cleanForFirestore(value) : value;
    }
  }
  return clean;
}

const QUOTA_STORAGE_KEY = 'firestore_quota_exhausted_date_v1';

function getTodayString(): string {
  try {
    return new Date().toISOString().split('T')[0];
  } catch {
    return '';
  }
}

let _isQuotaExhausted = false;

// Check if quota was marked exhausted today (with auto-clear so stale locks never block punch writes)
try {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(QUOTA_STORAGE_KEY);
    const today = getTodayString();
    if (saved !== today) {
      localStorage.removeItem(QUOTA_STORAGE_KEY);
      _isQuotaExhausted = false;
    }
  }
} catch {
  // safe fallback
}

type QuotaListener = (exhausted: boolean) => void;
const _quotaListeners: QuotaListener[] = [];

export function checkIsQuotaExhausted(): boolean {
  return _isQuotaExhausted;
}

export function markQuotaExhausted(exhausted: boolean = true): void {
  if (_isQuotaExhausted === exhausted) return;
  _isQuotaExhausted = exhausted;
  try {
    if (typeof window !== 'undefined') {
      if (exhausted) {
        localStorage.setItem(QUOTA_STORAGE_KEY, getTodayString());
      } else {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
      }
    }
  } catch {}
  _quotaListeners.forEach(listener => {
    try {
      listener(exhausted);
    } catch {}
  });
}

export function onQuotaExhaustedChange(listener: QuotaListener): () => void {
  _quotaListeners.push(listener);
  try {
    listener(_isQuotaExhausted);
  } catch {}
  return () => {
    const idx = _quotaListeners.indexOf(listener);
    if (idx !== -1) _quotaListeners.splice(idx, 1);
  };
}

export function isQuotaError(err: any): boolean {
  if (!err) return false;
  // Browser LocalStorage DOMException is NOT a Google Cloud Firestore quota error!
  if (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014) {
    return false;
  }
  const errMsg = (err?.message || err?.toString() || '').toLowerCase();
  if (errMsg.includes('localstorage') || errMsg.includes('storage') || errMsg.includes('setitem')) {
    return false;
  }
  const errCode = (err?.code || '').toLowerCase();
  return (
    errCode === 'resource-exhausted' ||
    errCode === 'firestore/resource-exhausted' ||
    errMsg.includes('resource_exhausted') ||
    errMsg.includes('quota exceeded for quota metric') ||
    errMsg.includes('free daily write units exceeded')
  );
}

export function handleFirestoreError(err: any, context: string): void {
  if (isQuotaError(err)) {
    markQuotaExhausted(true);
    return;
  }

  const errMsg = (err?.message || err?.toString() || '').toLowerCase();
  const errCode = (err?.code || '').toLowerCase();

  // Handle transient connectivity or unavailable backend gracefully
  if (
    errCode === 'unavailable' ||
    errMsg.includes('could not reach') ||
    errMsg.includes('offline mode') ||
    errMsg.includes('network') ||
    errMsg.includes('client is offline')
  ) {
    return;
  }

  console.warn(`[Firestore ${context}]:`, err);
}

/**
 * Executes a Firestore write with a timeout so UI never hangs if client is offline
 */
const FIRESTORE_WRITE_TIMEOUT_MS = 6000;

export async function withFirestoreTimeout<T>(
  action: () => Promise<T>,
  context: string,
  timeoutMs: number = FIRESTORE_WRITE_TIMEOUT_MS
): Promise<T | null> {
  if (_isQuotaExhausted) {
    return null;
  }

  let timer: any;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[Firestore ${context}] operation taking longer than ${timeoutMs}ms; completing in background.`);
      // CRITICAL FIX: NEVER call markQuotaExhausted on a network timeout!
      // Quota is ONLY exhausted when Firestore explicitly returns a quota error!
      resolve(null);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([action(), timeoutPromise]);
    return result;
  } catch (err: any) {
    handleFirestoreError(err, context);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (isQuotaError(event?.reason)) {
      markQuotaExhausted(true);
      event.preventDefault();
    }
  });
}

/**
 * Real-time listener for all Accounts in Firestore
 */
export function subscribeToAccounts(
  onData: (accounts: any[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const q = query(collection(db, ACCOUNTS_COLLECTION));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({ ...data, id: docSnap.id });
        });
        onData(list);
      },
      (error) => {
        handleFirestoreError(error, 'subscribeToAccounts');
        if (onError) onError(error);
      }
    );
  } catch (err) {
    handleFirestoreError(err, 'subscribeToAccounts');
    return () => {};
  }
}

/**
 * Save single account to Firestore
 */
export async function saveAccountToFirestore(account: any): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const cleanAccount = cleanForFirestore(account);
    const docId = cleanAccount.id || (cleanAccount.email ? cleanAccount.email.replace(/[^a-zA-Z0-9]/g, '_') : `acc_${Date.now()}`);
    const ref = doc(db, ACCOUNTS_COLLECTION, docId);
    await setDoc(ref, { ...cleanAccount, id: docId }, { merge: true });
  }, 'saveAccountToFirestore');
}

export async function deleteAccountFromFirestore(accountId: string): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const ref = doc(db, ACCOUNTS_COLLECTION, accountId);
    await deleteDoc(ref);
  }, 'deleteAccountFromFirestore');
}

export async function deleteAccountByMemberIdFromFirestore(memberId: string, memberEmail?: string): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const docsToDelete = new Map<string, any>();
    const allAliases = new Set<string>();
    if (memberId) {
      allAliases.add(memberId);
      allAliases.add(memberId.toLowerCase().trim());
      const stripped = memberId.toLowerCase().trim().replace(/^mem-/, '');
      allAliases.add(stripped);
      allAliases.add('mem-' + stripped);
    }
    if (memberEmail && memberEmail.trim()) {
      const emailLower = memberEmail.toLowerCase().trim();
      allAliases.add(emailLower);
      allAliases.add('mem-' + emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
      allAliases.add(emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
    }

    // 1. Direct query across aliases
    for (const alias of allAliases) {
      try {
        const qMem = query(collection(db, ACCOUNTS_COLLECTION), where('memberId', '==', alias));
        const snapMem = await getDocs(qMem);
        snapMem.forEach(d => docsToDelete.set(d.id, d.ref));
      } catch {}
      try {
        const qEmail = query(collection(db, ACCOUNTS_COLLECTION), where('email', '==', alias));
        const snapEmail = await getDocs(qEmail);
        snapEmail.forEach(d => docsToDelete.set(d.id, d.ref));
      } catch {}
    }

    // 2. Scan all accounts for matching memberId/email or doc ID
    try {
      const snapAll = await getDocs(collection(db, ACCOUNTS_COLLECTION));
      snapAll.forEach(d => {
        const data = d.data();
        const dMid = (data.memberId || '').toLowerCase().trim();
        const dEmail = (data.email || '').toLowerCase().trim();
        const dId = d.id.toLowerCase().trim();
        for (const alias of allAliases) {
          const a = alias.toLowerCase().trim();
          if (dMid === a || dEmail === a || dId === a || dId.includes(a)) {
            docsToDelete.set(d.id, d.ref);
          }
        }
      });
    } catch {}

    if (docsToDelete.size > 0) {
      const batch = writeBatch(db);
      docsToDelete.forEach(ref => batch.delete(ref));
      await batch.commit();
    }
  }, 'deleteAccountByMemberIdFromFirestore');
}

/**
 * Fetch all accounts from Firestore
 */
export async function getAccountsFromFirestore(): Promise<any[]> {
  try {
    const snap = await getDocs(collection(db, ACCOUNTS_COLLECTION));
    const list: any[] = [];
    snap.forEach(d => {
      list.push({ ...d.data(), id: d.id });
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, 'getAccountsFromFirestore');
    return [];
  }
}

/**
 * Real-time listener for all Members in Firestore
 */
export function subscribeToMembers(
  onData: (members: Member[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const q = query(collection(db, MEMBERS_COLLECTION));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: Member[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Member;
          list.push({ ...data, id: docSnap.id });
        });
        onData(list);
      },
      (error) => {
        handleFirestoreError(error, 'subscribeToMembers');
        if (onError) onError(error);
      }
    );
  } catch (err) {
    handleFirestoreError(err, 'subscribeToMembers');
    return () => {};
  }
}

/**
 * Real-time listener for all Attendance Records in Firestore
 */
export function subscribeToAttendance(
  onData: (records: AttendanceRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const q = query(collection(db, ATTENDANCE_COLLECTION));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: AttendanceRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as AttendanceRecord;
          list.push({ ...data, id: docSnap.id });
        });
        onData(list);
      },
      (error) => {
        handleFirestoreError(error, 'subscribeToAttendance');
        if (onError) onError(error);
      }
    );
  } catch (err) {
    handleFirestoreError(err, 'subscribeToAttendance');
    return () => {};
  }
}

/**
 * Fetch all members from Firestore directly
 */
export async function getMembersFromFirestore(): Promise<Member[]> {
  try {
    const snap = await getDocs(collection(db, MEMBERS_COLLECTION));
    const list: Member[] = [];
    snap.forEach(d => {
      list.push({ ...(d.data() as Member), id: d.id });
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, 'getMembersFromFirestore');
    return [];
  }
}

/**
 * Fetch all attendance records from Firestore directly (authoritative snapshot on startup)
 */
export async function getAttendanceFromFirestore(): Promise<AttendanceRecord[]> {
  try {
    const snap = await getDocs(collection(db, ATTENDANCE_COLLECTION));
    const list: AttendanceRecord[] = [];
    snap.forEach(d => {
      list.push({ ...(d.data() as AttendanceRecord), id: d.id });
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, 'getAttendanceFromFirestore');
    return [];
  }
}

/**
 * Fetch all leaves from Firestore directly (authoritative snapshot on startup)
 */
export async function getLeavesFromFirestore(): Promise<LeaveRequest[]> {
  try {
    const snap = await getDocs(collection(db, LEAVES_COLLECTION));
    const list: LeaveRequest[] = [];
    snap.forEach(d => {
      list.push({ ...(d.data() as LeaveRequest), id: d.id });
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, 'getLeavesFromFirestore');
    return [];
  }
}

/**
 * Directly fetch today's attendance record for a member across any of their ID aliases
 * Supports both att- and rec- document ID prefixes for bidirectional compatibility
 */
export async function getTodayAttendanceRecord(
  memberIds: string[],
  date: string
): Promise<AttendanceRecord | null> {
  if (!memberIds || memberIds.length === 0 || !date) return null;
  const validIds = Array.from(new Set(memberIds.filter(Boolean)));

  // 1. Direct document lookups across both att- and rec- prefixes (fastest path)
  for (const mid of validIds) {
    for (const prefix of ['att-', 'rec-']) {
      try {
        const docRef = doc(db, ATTENDANCE_COLLECTION, `${prefix}${mid}-${date}`);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as AttendanceRecord;
          if (data && (data.checkInTime || data.status)) {
            return { ...data, id: snap.id };
          }
        }
      } catch {
        // Continue to next alias or query
      }
    }
  }

  // 2. Query fallback across aliases
  try {
    const q = query(
      collection(db, ATTENDANCE_COLLECTION),
      where('date', '==', date)
    );
    const snap = await getDocs(q);
    const lowerValidIds = validIds.map(id => id.toLowerCase().trim());
    let found: AttendanceRecord | null = null;
    snap.forEach(d => {
      if (found) return;
      const data = d.data() as AttendanceRecord;
      const rMid = (data.memberId || '').toLowerCase().trim();
      if (
        lowerValidIds.includes(rMid) ||
        lowerValidIds.some(id => d.id.toLowerCase().includes(id))
      ) {
        found = { ...data, id: d.id };
      }
    });
    return found;
  } catch (err) {
    handleFirestoreError(err, 'getTodayAttendanceRecord');
    return null;
  }
}

/**
 * Real-time listener for today's attendance record of a specific member across any of their ID aliases
 * Supports both att- and rec- doc ID prefixes so punches by user and edits by admin sync bidirectionally
 */
export function subscribeToMemberTodayAttendance(
  memberIds: string[],
  date: string,
  onRecord: (record: AttendanceRecord | null) => void
): Unsubscribe {
  if (!memberIds || memberIds.length === 0 || !date) {
    return () => {};
  }
  const validIds = Array.from(new Set(memberIds.filter(Boolean)));
  const unsubs: Unsubscribe[] = [];

  // Listen to both att- and rec- document IDs across all aliases
  validIds.forEach(mid => {
    ['att-', 'rec-'].forEach(prefix => {
      try {
        const docRef = doc(db, ATTENDANCE_COLLECTION, `${prefix}${mid}-${date}`);
        const unsub = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as AttendanceRecord;
            if (data && (data.checkInTime || data.status)) {
              onRecord({ ...data, id: docSnap.id });
            }
          }
        }, (err) => {
          handleFirestoreError(err, 'subscribeToMemberTodayAttendance doc');
        });
        unsubs.push(unsub);
      } catch {
        // safe fallback
      }
    });
  });

  return () => {
    unsubs.forEach(u => {
      try { u(); } catch {}
    });
  };
}

/**
 * Save single member to Firestore
 */
export async function saveMemberToFirestore(member: Member): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const cleanMember = cleanForFirestore(member);
    const ref = doc(db, MEMBERS_COLLECTION, member.id);
    await setDoc(ref, cleanMember);
  }, 'saveMemberToFirestore');
}

/**
 * Delete member from Firestore with cascading cleanup of accounts, attendance records, and leaves
 */
export async function deleteMemberFromFirestore(
  memberId: string, 
  memberEmail?: string,
  employeeId?: string,
  memberName?: string
): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const ref = doc(db, MEMBERS_COLLECTION, memberId);
    await deleteDoc(ref);
    if (memberId.startsWith('mem-')) {
      await deleteDoc(doc(db, MEMBERS_COLLECTION, memberId.replace(/^mem-/, ''))).catch(() => {});
    }
    if (memberEmail) {
      await deleteDoc(doc(db, MEMBERS_COLLECTION, 'mem-' + memberEmail.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_'))).catch(() => {});
    }
  }, 'deleteMemberFromFirestore');

  // Record permanent cloud tombstones across all known aliases so other devices purge them
  const tombstoneIds: string[] = [memberId];
  if (memberEmail) tombstoneIds.push(memberEmail, 'mem-' + memberEmail.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_'));
  if (employeeId) tombstoneIds.push(employeeId);
  await addTombstonesToFirestore('members', tombstoneIds).catch(() => {});

  // Cascading cleanup of linked account, records, and leaves across all possible alias forms
  await deleteAccountByMemberIdFromFirestore(memberId, memberEmail).catch(() => {});
  await deleteMemberRecordsFromFirestore(memberId, memberEmail, employeeId).catch(() => {});
  await deleteMemberLeavesFromFirestore(memberId, memberEmail, memberName).catch(() => {});
}

export async function deleteMemberRecordsFromFirestore(
  memberId: string,
  memberEmail?: string,
  employeeId?: string
): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const allAliases = new Set<string>();
    if (memberId) {
      allAliases.add(memberId);
      allAliases.add(memberId.toLowerCase().trim());
      const stripped = memberId.toLowerCase().trim().replace(/^mem-/, '');
      allAliases.add(stripped);
      allAliases.add('mem-' + stripped);
    }
    if (memberEmail && memberEmail.trim()) {
      const emailLower = memberEmail.toLowerCase().trim();
      allAliases.add(emailLower);
      allAliases.add('mem-' + emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
      allAliases.add(emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
    }
    if (employeeId && employeeId.trim()) {
      allAliases.add(employeeId);
      allAliases.add(employeeId.toLowerCase().trim());
    }

    const docsToDelete = new Map<string, any>();

    for (const alias of allAliases) {
      try {
        const q = query(collection(db, ATTENDANCE_COLLECTION), where('memberId', '==', alias));
        const snap = await getDocs(q);
        snap.forEach(d => docsToDelete.set(d.id, d.ref));
      } catch {}
    }

    try {
      const snapAll = await getDocs(collection(db, ATTENDANCE_COLLECTION));
      snapAll.forEach(d => {
        const data = d.data();
        const rMid = (data.memberId || '').toLowerCase().trim();
        const docId = d.id.toLowerCase().trim();
        for (const alias of allAliases) {
          const a = alias.toLowerCase().trim();
          if (rMid === a || docId === a || docId.includes(a)) {
            docsToDelete.set(d.id, d.ref);
          }
        }
      });
    } catch {}

    if (docsToDelete.size > 0) {
      const refs = Array.from(docsToDelete.values());
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db);
        refs.slice(i, i + 400).forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }
  }, 'deleteMemberRecordsFromFirestore');
}

export async function deleteMemberLeavesFromFirestore(
  memberId: string,
  memberEmail?: string,
  memberName?: string
): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const allAliases = new Set<string>();
    if (memberId) {
      allAliases.add(memberId);
      allAliases.add(memberId.toLowerCase().trim());
      const stripped = memberId.toLowerCase().trim().replace(/^mem-/, '');
      allAliases.add(stripped);
      allAliases.add('mem-' + stripped);
    }
    if (memberEmail && memberEmail.trim()) {
      const emailLower = memberEmail.toLowerCase().trim();
      allAliases.add(emailLower);
      allAliases.add('mem-' + emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
    }

    const docsToDelete = new Map<string, any>();

    for (const alias of allAliases) {
      try {
        const q = query(collection(db, LEAVES_COLLECTION), where('memberId', '==', alias));
        const snap = await getDocs(q);
        snap.forEach(d => docsToDelete.set(d.id, d.ref));
      } catch {}
    }

    try {
      const snapAll = await getDocs(collection(db, LEAVES_COLLECTION));
      snapAll.forEach(d => {
        const data = d.data();
        const lMid = (data.memberId || '').toLowerCase().trim();
        const lName = (data.memberName || '').toLowerCase().trim();
        if (memberName && lName === memberName.toLowerCase().trim()) {
          docsToDelete.set(d.id, d.ref);
        }
        for (const alias of allAliases) {
          const a = alias.toLowerCase().trim();
          if (lMid === a || d.id.toLowerCase().includes(a)) {
            docsToDelete.set(d.id, d.ref);
          }
        }
      });
    } catch {}

    if (docsToDelete.size > 0) {
      const refs = Array.from(docsToDelete.values());
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db);
        refs.slice(i, i + 400).forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }
  }, 'deleteMemberLeavesFromFirestore');
}

/**
 * Save single attendance record to Firestore (authoritative replace so cleared check-in/out times are not resurrected)
 */
export async function saveAttendanceRecordToFirestore(record: AttendanceRecord): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    // Standardize docId to att-${record.memberId}-${record.date}
    const docId = `att-${record.memberId}-${record.date}`;
    const cleanRecord = cleanForFirestore({ ...record, id: docId });
    const ref = doc(db, ATTENDANCE_COLLECTION, docId);
    // Explicitly write without merge so removed times (e.g. status marked absent) are properly cleared
    await setDoc(ref, cleanRecord);

    // Clean up any legacy rec- prefixed duplicate document
    if (record.id && record.id.startsWith('rec-') && record.id !== docId) {
      try {
        await deleteDoc(doc(db, ATTENDANCE_COLLECTION, record.id));
      } catch {}
    }
  }, 'saveAttendanceRecordToFirestore');
}

/**
 * Delete attendance record from Firestore
 */
export async function deleteAttendanceRecordFromFirestore(recordId: string, memberId?: string, date?: string): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const ref = doc(db, ATTENDANCE_COLLECTION, recordId);
    await deleteDoc(ref);
  }, 'deleteAttendanceRecordFromFirestore direct');

  // Also query by memberId and date if provided to ensure no orphaned duplicate keys
  if (memberId && date) {
    await withFirestoreTimeout(async () => {
      const q = query(
        collection(db, ATTENDANCE_COLLECTION),
        where('memberId', '==', memberId),
        where('date', '==', date)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }, 'deleteAttendanceRecordFromFirestore query');
  }

  // Record in cloud tombstones so other devices never resurrect this record
  await addTombstonesToFirestore('records', [recordId]).catch(() => {});
}

/**
 * Batch write multiple attendance records
 */
export async function batchSaveAttendanceToFirestore(records: AttendanceRecord[]): Promise<void> {
  if (checkIsQuotaExhausted() || !records || records.length === 0) return;
  await withFirestoreTimeout(async () => {
    const chunks: AttendanceRecord[][] = [];
    for (let i = 0; i < records.length; i += 400) {
      chunks.push(records.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((rec) => {
        const docId = rec.id || `att-${rec.memberId}-${rec.date}`;
        const cleanRec = cleanForFirestore({ ...rec, id: docId });
        const ref = doc(db, ATTENDANCE_COLLECTION, docId);
        batch.set(ref, cleanRec, { merge: true });
      });
      await batch.commit();
    }
  }, 'batchSaveAttendanceToFirestore');
}

/**
 * Batch write multiple members
 */
export async function batchSaveMembersToFirestore(members: Member[]): Promise<void> {
  if (checkIsQuotaExhausted() || !members || members.length === 0) return;
  await withFirestoreTimeout(async () => {
    const chunks: Member[][] = [];
    for (let i = 0; i < members.length; i += 400) {
      chunks.push(members.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((mem) => {
        const cleanMem = cleanForFirestore(mem);
        const ref = doc(db, MEMBERS_COLLECTION, mem.id);
        batch.set(ref, cleanMem, { merge: true });
      });
      await batch.commit();
    }
  }, 'batchSaveMembersToFirestore');
}

/**
 * Clear all data from Firestore for a fresh start with real data
 */
export async function clearAllFirestoreData(): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    // Clear members
    const memberDocs = await getDocs(collection(db, MEMBERS_COLLECTION));
    if (!memberDocs.empty) {
      const memberBatch = writeBatch(db);
      memberDocs.forEach((d) => memberBatch.delete(d.ref));
      await memberBatch.commit();
    }

    // Clear attendance
    const attDocs = await getDocs(collection(db, ATTENDANCE_COLLECTION));
    if (!attDocs.empty) {
      const docs = attDocs.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // Clear leaves
    const leaveDocs = await getDocs(collection(db, LEAVES_COLLECTION));
    if (!leaveDocs.empty) {
      const docs = leaveDocs.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // Clear staff user accounts (preserving master administrators)
    const accDocs = await getDocs(collection(db, ACCOUNTS_COLLECTION));
    if (!accDocs.empty) {
      const batch = writeBatch(db);
      accDocs.forEach((d) => {
        const data = d.data();
        const email = (data.email || '').toLowerCase().trim();
        if (email !== 'shubhamsangani3572@gmail.com' && email !== 'parsanameet8@gmail.com' && email !== 'admin@sahilinfotech.com') {
          batch.delete(d.ref);
        }
      });
      await batch.commit();
    }

    // Reset cloud tombstones
    await resetTombstonesInFirestore();
  }, 'clearAllFirestoreData');
}

/**
 * Write security audit event to Firestore
 */
export async function logAuditToFirestore(log: SecurityAuditLog): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const cleanLog = cleanForFirestore(log);
    const ref = doc(db, AUDIT_COLLECTION, log.id);
    await setDoc(ref, cleanLog);
  }, 'logAuditToFirestore');
}

/**
 * Save single leave request to Firestore
 */
export async function saveLeaveToFirestore(leave: LeaveRequest): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const cleanLeave = cleanForFirestore(leave);
    const ref = doc(db, LEAVES_COLLECTION, leave.id);
    await setDoc(ref, cleanLeave);
  }, 'saveLeaveToFirestore');
}

/**
 * Delete leave request from Firestore
 */
export async function deleteLeaveFromFirestore(leaveId: string): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const ref = doc(db, LEAVES_COLLECTION, leaveId);
    await deleteDoc(ref);
  }, 'deleteLeaveFromFirestore');

  // Record in cloud tombstones
  await addTombstonesToFirestore('leaves', [leaveId]).catch(() => {});
}

/**
 * Subscribe to leaves collection
 */
export function subscribeToLeaves(
  onUpdate: (leaves: LeaveRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const q = query(collection(db, LEAVES_COLLECTION));
    return onSnapshot(
      q,
      (snapshot) => {
        const leaves: LeaveRequest[] = [];
        snapshot.forEach((docSnap) => {
          const docId = docSnap.id;
          if (docId.startsWith('leave-sample-') || docId.includes('sample')) {
            // Clean up obsolete sample leaves from Firestore if quota is available
            if (!checkIsQuotaExhausted()) {
              deleteDoc(docSnap.ref).catch(() => {});
            }
            return;
          }
          const data = docSnap.data() as LeaveRequest;
          if (data && data.id && !data.id.startsWith('leave-sample-') && !data.id.includes('sample')) {
            leaves.push({ ...data, id: docSnap.id });
          }
        });
        onUpdate(leaves);
      },
      (err) => {
        handleFirestoreError(err, 'subscribeToLeaves');
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    handleFirestoreError(err, 'subscribeToLeaves setup');
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Fetch tombstones from Firestore
 */
export async function getTombstonesFromFirestore(): Promise<CloudTombstones | null> {
  try {
    const ref = doc(db, TOMBSTONES_COLLECTION, TOMBSTONES_DOC_ID);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as CloudTombstones;
    }
  } catch (err) {
    handleFirestoreError(err, 'getTombstonesFromFirestore');
  }
  return null;
}

/**
 * Real-time listener for tombstones (deleted entities) across all devices
 */
export function subscribeToTombstones(
  onUpdate: (tombstones: CloudTombstones) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const ref = doc(db, TOMBSTONES_COLLECTION, TOMBSTONES_DOC_ID);
    return onSnapshot(
      ref,
      (docSnap) => {
        if (docSnap.exists()) {
          onUpdate(docSnap.data() as CloudTombstones);
        } else {
          onUpdate({ members: [], records: [], leaves: [] });
        }
      },
      (err) => {
        handleFirestoreError(err, 'subscribeToTombstones');
        if (onError) onError(err);
      }
    );
  } catch (err) {
    handleFirestoreError(err, 'subscribeToTombstones setup');
    return () => {};
  }
}

/**
 * Add deleted IDs to cloud tombstones
 */
export async function addTombstonesToFirestore(
  type: 'members' | 'records' | 'leaves',
  ids: string[]
): Promise<void> {
  if (checkIsQuotaExhausted() || !ids || ids.length === 0) return;
  await withFirestoreTimeout(async () => {
    const ref = doc(db, TOMBSTONES_COLLECTION, TOMBSTONES_DOC_ID);
    const snap = await getDoc(ref);
    const current: CloudTombstones = snap.exists()
      ? (snap.data() as CloudTombstones)
      : { members: [], records: [], leaves: [] };
    
    const set = new Set(current[type] || []);
    ids.forEach(id => {
      if (id) {
        set.add(id);
        set.add(id.toLowerCase().trim());
      }
    });

    await setDoc(ref, {
      ...current,
      [type]: Array.from(set),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }, 'addTombstonesToFirestore');
}

/**
 * Reset tombstones in Firestore
 */
export async function resetTombstonesInFirestore(): Promise<void> {
  if (checkIsQuotaExhausted()) return;
  await withFirestoreTimeout(async () => {
    const ref = doc(db, TOMBSTONES_COLLECTION, TOMBSTONES_DOC_ID);
    await setDoc(ref, {
      members: [],
      records: [],
      leaves: [],
      updatedAt: new Date().toISOString()
    });
  }, 'resetTombstonesInFirestore');
}

