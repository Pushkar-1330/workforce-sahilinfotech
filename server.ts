import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp as initFirebaseApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  writeBatch,
  query,
  where,
  disableNetwork,
  setLogLevel
} from 'firebase/firestore';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable CORS for all domains, proxies, and preview iframes
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// In-memory persistent database file
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const QUOTA_FILE = path.join(DATA_DIR, 'firestore-quota.json');

// Server-side Firestore initialization & dual-persistence engine
let serverDb: any = null;
let firestoreDbId = '';

try {
  setLogLevel('silent');
} catch {}

// Filter Firestore quota noise from node console
const origConsoleError = console.error;
console.error = function (...args: any[]) {
  const text = args.map(a => (typeof a === 'string' ? a : (a?.message || ''))).join(' ');
  if (
    text.includes('RESOURCE_EXHAUSTED') || 
    text.includes('Free daily write units per project') ||
    text.includes('resource-exhausted')
  ) {
    markServerFirestoreQuotaExhausted();
    return;
  }
  origConsoleError.apply(console, args);
};

let isServerFirestoreQuotaExhausted = false;

// Check if quota was exhausted today
try {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (fs.existsSync(QUOTA_FILE)) {
    const qData = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf-8'));
    if (qData && qData.exhaustedDate === todayStr) {
      isServerFirestoreQuotaExhausted = true;
      console.log(`[Server Firestore] Daily free quota reached for today (${todayStr}). Operating via local db.json persistence.`);
    }
  }
} catch {
  // safe fallback
}

try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    firestoreDbId = firebaseConfig.firestoreDatabaseId || '';
    const fbApp = getApps().length > 0 ? getApp() : initFirebaseApp(firebaseConfig);
    serverDb = firestoreDbId ? getFirestore(fbApp, firestoreDbId) : getFirestore(fbApp);
    console.log('[Server Firestore] Initialized successfully with database:', firestoreDbId);

    // If quota is already known to be exhausted today, immediately disable network on this instance
    if (isServerFirestoreQuotaExhausted && serverDb) {
      disableNetwork(serverDb).catch(() => {});
    }
  }
} catch (err) {
  console.warn('[Server Firestore] Init notice:', err);
}

function cleanForFirestoreServer(data: any): any {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => cleanForFirestoreServer(item));
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      clean[key] = (typeof value === 'object' && value !== null) ? cleanForFirestoreServer(value) : value;
    }
  }
  return clean;
}

function markServerFirestoreQuotaExhausted() {
  if (!isServerFirestoreQuotaExhausted) {
    isServerFirestoreQuotaExhausted = true;
    const todayStr = new Date().toISOString().slice(0, 10);
    console.log(`[Server Firestore] Daily free quota reached (${todayStr}). Closing network streams and switching to local db.json persistence.`);
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(QUOTA_FILE, JSON.stringify({ exhaustedDate: todayStr, timestamp: Date.now() }), 'utf-8');
    } catch {}
    if (serverDb) {
      disableNetwork(serverDb).catch(() => {});
    }
  }
}

function checkQuotaExhaustedError(err: any): boolean {
  if (!err) return false;
  const msg = (err?.message || err?.toString() || '').toLowerCase();
  const code = (err?.code || '').toLowerCase();
  if (
    code === 'resource-exhausted' ||
    code === '8' ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('free daily write units') ||
    msg.includes('free daily read units')
  ) {
    markServerFirestoreQuotaExhausted();
    return true;
  }
  return false;
}

async function persistDocToFirestore(collName: string, docId: string, data: any) {
  if (!serverDb || isServerFirestoreQuotaExhausted || !docId || !data) return;
  try {
    const clean = cleanForFirestoreServer(data);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
    await Promise.race([
      setDoc(doc(serverDb, collName, docId), clean, { merge: true }),
      timeoutPromise
    ]);
  } catch (err: any) {
    if (err?.message === 'timeout') return;
    if (checkQuotaExhaustedError(err)) return;
    console.warn(`[Server Firestore] Failed to sync ${collName}/${docId}:`, err);
  }
}

async function removeDocFromFirestore(collName: string, docId: string) {
  if (!serverDb || isServerFirestoreQuotaExhausted || !docId) return;
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
    await Promise.race([
      deleteDoc(doc(serverDb, collName, docId)),
      timeoutPromise
    ]);
  } catch (err: any) {
    if (err?.message === 'timeout') return;
    if (checkQuotaExhaustedError(err)) return;
    console.warn(`[Server Firestore] Failed to delete ${collName}/${docId}:`, err);
  }
}

interface ServerState {
  members: any[];
  records: any[];
  leaves: any[];
  accounts: any[];
  deletedMemberIds?: string[];
  deletedRecordIds?: string[];
  deletedLeaveIds?: string[];
  lastUpdated: number;
}

function reconcileServerState(state: ServerState): boolean {
  let modified = false;
  if (!Array.isArray(state.members)) state.members = [];
  if (!Array.isArray(state.records)) state.records = [];
  if (!Array.isArray(state.leaves)) state.leaves = [];
  if (!Array.isArray(state.accounts)) state.accounts = [];
  if (!Array.isArray(state.deletedMemberIds)) state.deletedMemberIds = [];
  if (!Array.isArray(state.deletedRecordIds)) state.deletedRecordIds = [];
  if (!Array.isArray(state.deletedLeaveIds)) state.deletedLeaveIds = [];

  const deletedMemberSet = new Set(state.deletedMemberIds);
  const deletedRecordSet = new Set(state.deletedRecordIds);
  const deletedLeaveSet = new Set(state.deletedLeaveIds);

  // Self-heal: If an active user account exists in state.accounts, they are NOT deleted
  state.accounts.forEach((acc: any) => {
    if (acc && acc.role === 'user') {
      if (acc.memberId) {
        deletedMemberSet.delete(acc.memberId);
        state.deletedMemberIds = state.deletedMemberIds!.filter(id => id !== acc.memberId);
      }
      if (acc.email) {
        const derivedId = 'mem-' + acc.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
        deletedMemberSet.delete(derivedId);
        state.deletedMemberIds = state.deletedMemberIds!.filter(id => id !== derivedId);
      }
    }
  });

  // Prune any deleted members
  const origMemCount = state.members.length;
  state.members = state.members.filter((m: any) => m && m.id && !deletedMemberSet.has(m.id));
  if (state.members.length !== origMemCount) modified = true;

  // Prune records: NEVER prune records that have checkInTime or checkOutTime (punch data)!
  const origRecCount = state.records.length;
  state.records = state.records.filter((r: any) => 
    r && r.id && 
    !deletedRecordSet.has(r.id) && 
    (r.checkInTime || r.checkOutTime || !r.memberId || !deletedMemberSet.has(r.memberId))
  );
  if (state.records.length !== origRecCount) modified = true;

  // Prune any leaves belonging to deleted members or marked deleted
  const origLeaveCount = state.leaves.length;
  state.leaves = state.leaves.filter((l: any) => 
    l && l.id && 
    !deletedLeaveSet.has(l.id) &&
    (!l.memberId || !deletedMemberSet.has(l.memberId))
  );
  if (state.leaves.length !== origLeaveCount) modified = true;

  // Prune accounts belonging to deleted members
  const origAccCount = state.accounts.length;
  state.accounts = state.accounts.filter((a: any) => 
    !a.memberId || !deletedMemberSet.has(a.memberId)
  );
  if (state.accounts.length !== origAccCount) modified = true;

  const existingMemberIds = new Set(state.members.map((m: any) => m.id));
  const emailToMember = new Map<string, any>();
  state.members.forEach((m: any) => {
    if (m.email) emailToMember.set(m.email.toLowerCase().trim(), m);
  });

  // 1. Reconcile from user accounts: Guarantee every employee account exists in members roster (unless deleted)
  state.accounts.forEach((acc: any) => {
    if (acc && acc.role === 'user' && acc.email) {
      if (acc.memberId && deletedMemberSet.has(acc.memberId)) return;
      const emailLower = acc.email.toLowerCase().trim();
      let member = emailToMember.get(emailLower);
      if (!member && acc.memberId && existingMemberIds.has(acc.memberId)) {
        member = state.members.find((m: any) => m.id === acc.memberId);
      }
      if (!member) {
        const memId = acc.memberId || ('mem-' + emailLower.replace(/[^a-zA-Z0-9]/g, '_'));
        if (deletedMemberSet.has(memId)) return;

        const newMember = {
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
          active: true,
        };
        state.members.push(newMember);
        existingMemberIds.add(memId);
        emailToMember.set(emailLower, newMember);
        acc.memberId = memId;
        modified = true;
      } else if (!acc.memberId) {
        acc.memberId = member.id;
        modified = true;
      }
    }
  });

  // 2. Reconcile from leave requests: Ensure any employee with leave is in members roster (unless deleted)
  state.leaves.forEach((leave: any) => {
    if (leave && leave.memberId && !existingMemberIds.has(leave.memberId)) {
      const memId = leave.memberId;
      if (deletedMemberSet.has(memId)) return;

      const cleanName = leave.memberName || (memId.startsWith('mem-') ? memId.replace(/^mem-/, '').replace(/_/g, ' ') : 'Staff Member');
      const newMember = {
        id: memId,
        name: cleanName,
        employeeId: leave.employeeId || memId.replace(/^mem-/, '').toUpperCase(),
        department: leave.department || 'Operations & Admin',
        role: 'Staff Member',
        email: memId.includes('_gmail_com') ? memId.replace(/^mem-/, '').replace(/_gmail_com$/, '@gmail.com') : '',
        phone: '',
        joinDate: leave.startDate || '2026-09-01',
        shift: 'regular',
        avatarColor: leave.avatarColor || 'from-blue-600 to-indigo-600',
        active: true,
      };
      state.members.push(newMember);
      existingMemberIds.add(memId);
      if (newMember.email) emailToMember.set(newMember.email.toLowerCase().trim(), newMember);
      modified = true;
    }
  });

  // 3. Reconcile from attendance records: Ensure any member who punched is in members roster
  state.records.forEach((rec: any) => {
    if (rec && rec.memberId && !existingMemberIds.has(rec.memberId)) {
      const memId = rec.memberId;
      // If member has active punch in or attendance status, unmark any tombstone
      if (rec.checkInTime || rec.checkOutTime || rec.status === 'present' || rec.status === 'late') {
        deletedMemberSet.delete(memId);
        state.deletedMemberIds = state.deletedMemberIds!.filter(id => id !== memId);
      }
      if (deletedMemberSet.has(memId)) return;

      const matchingAccount = state.accounts.find((a: any) => a.memberId === memId || (a.email && 'mem-' + a.email.replace(/[^a-zA-Z0-9]/g, '_') === memId));
      const matchingLeave = state.leaves.find((l: any) => l.memberId === memId);
      const name = matchingLeave?.memberName || matchingAccount?.name || (rec.notes?.includes('for ') ? rec.notes.split('for ')[1]?.split(' ')[0] : (memId.startsWith('mem-') ? memId.replace(/^mem-/, '').replace(/_/g, ' ') : 'Staff Member'));
      const email = matchingAccount?.email || (memId.includes('_gmail_com') ? memId.replace(/^mem-/, '').replace(/_gmail_com$/, '@gmail.com') : '');

      const newMember = {
        id: memId,
        name,
        employeeId: matchingLeave?.employeeId || matchingAccount?.employeeId || memId.replace(/^mem-/, '').toUpperCase(),
        department: matchingLeave?.department || matchingAccount?.department || 'Operations & Admin',
        role: 'Staff Member',
        email,
        phone: matchingAccount?.phone || '',
        joinDate: rec.date || '2026-09-01',
        shift: 'regular',
        avatarColor: matchingLeave?.avatarColor || 'from-blue-600 to-indigo-600',
        active: true,
      };
      state.members.push(newMember);
      existingMemberIds.add(memId);
      if (newMember.email) emailToMember.set(newMember.email.toLowerCase().trim(), newMember);
      modified = true;
    }
  });

  return modified;
}

function writeDbFile(state: ServerState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Server DB] Error saving db.json:', err);
  }
}

function loadServerState(): ServerState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const state: ServerState = {
        members: Array.isArray(parsed.members) ? parsed.members : [],
        records: Array.isArray(parsed.records) ? parsed.records : [],
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        leaves: Array.isArray(parsed.leaves) ? parsed.leaves.filter((l: any) => l && l.id && !l.id.startsWith('leave-sample-') && !l.id.includes('sample')) : [],
        deletedMemberIds: Array.isArray(parsed.deletedMemberIds) ? parsed.deletedMemberIds : [],
        deletedRecordIds: Array.isArray(parsed.deletedRecordIds) ? parsed.deletedRecordIds : [],
        deletedLeaveIds: Array.isArray(parsed.deletedLeaveIds) ? parsed.deletedLeaveIds : [],
        lastUpdated: parsed.lastUpdated || Date.now(),
      };
      const modified = reconcileServerState(state);
      if (modified) {
        state.lastUpdated = Date.now();
        writeDbFile(state);
      }
      return state;
    }
  } catch (err) {
    console.error('[Server DB] Error reading db.json:', err);
  }
  return {
    members: [],
    records: [],
    accounts: [],
    leaves: [],
    lastUpdated: Date.now(),
  };
}

let serverState: ServerState = loadServerState();
let saveTimer: NodeJS.Timeout | null = null;

async function syncFromFirestore(): Promise<boolean> {
  if (!serverDb || isServerFirestoreQuotaExhausted) return false;
  try {
    const [mSnap, aSnap, lSnap, accSnap] = await Promise.all([
      getDocs(collection(serverDb, 'members')),
      getDocs(collection(serverDb, 'attendance')),
      getDocs(collection(serverDb, 'leaves')),
      getDocs(collection(serverDb, 'user_accounts'))
    ]);

    let modified = false;

    const deletedMemberSet = new Set(serverState.deletedMemberIds || []);
    const deletedRecordSet = new Set(serverState.deletedRecordIds || []);
    const deletedLeaveSet = new Set(serverState.deletedLeaveIds || []);

    // Merge members: preserve all existing members in db.json unless deleted, and union with Firestore
    const memMap = new Map<string, any>();
    serverState.members.forEach(m => {
      if (m && m.id && !deletedMemberSet.has(m.id)) {
        memMap.set(m.id, m);
      }
    });
    mSnap.forEach(d => {
      const data = d.data();
      if (d.id && !d.id.startsWith('mem-sample-') && !d.id.includes('sample') && !deletedMemberSet.has(d.id)) {
        const existing = memMap.get(d.id);
        memMap.set(d.id, { ...(existing || {}), ...data, id: d.id });
      }
    });
    serverState.members = Array.from(memMap.values());

    // Merge records: preserve all existing records (especially today's check-ins/check-outs) unless deleted
    const recMap = new Map<string, any>();
    serverState.records.forEach(r => {
      if (r && r.id && !deletedRecordSet.has(r.id)) {
        const key = r.id || `${r.memberId}_${r.date}`;
        recMap.set(key, r);
      }
    });
    aSnap.forEach(d => {
      const data = d.data();
      if (d.id && !d.id.startsWith('att-sample-') && !d.id.includes('sample') && !deletedRecordSet.has(d.id)) {
        const key = d.id || `${data.memberId}_${data.date}`;
        const existing = recMap.get(key) || Array.from(recMap.values()).find(r => r.memberId === data.memberId && r.date === data.date);
        if (existing) {
          recMap.set(existing.id || key, {
            ...data,
            id: d.id,
            checkInTime: existing.checkInTime || data.checkInTime,
            checkOutTime: existing.checkOutTime || data.checkOutTime,
            status: (existing.checkInTime && (!data.checkInTime || data.status === 'absent')) ? existing.status : (data.status || existing.status),
            notes: data.notes || existing.notes,
            updatedAt: data.updatedAt || existing.updatedAt
          });
        } else {
          recMap.set(key, { ...data, id: d.id });
        }
      }
    });
    serverState.records = Array.from(recMap.values());

    // Merge leaves
    const leaveMap = new Map<string, any>();
    serverState.leaves.forEach(l => {
      if (l && l.id && !deletedLeaveSet.has(l.id)) {
        leaveMap.set(l.id, l);
      }
    });
    lSnap.forEach(d => {
      const data = d.data();
      if (!d.id.startsWith('leave-sample-') && !d.id.includes('sample') && !deletedLeaveSet.has(d.id)) {
        const existing = leaveMap.get(d.id);
        leaveMap.set(d.id, { ...(existing || {}), ...data, id: d.id });
      }
    });
    serverState.leaves = Array.from(leaveMap.values());

    // Merge accounts from Firestore
    const accMap = new Map<string, any>();
    serverState.accounts.forEach(a => accMap.set(a.id || a.email, a));
    accSnap.forEach(d => {
      const data = d.data();
      accMap.set(d.id, { ...(accMap.get(d.id) || {}), ...data, id: d.id });
    });
    serverState.accounts = Array.from(accMap.values());

    reconcileServerState(serverState);
    serverState.lastUpdated = Date.now();
    writeDbFile(serverState);
    console.log(`[Server Firestore] Hydrated and merged: ${serverState.members.length} members, ${serverState.records.length} records, ${serverState.leaves.length} leaves.`);
    return true;
  } catch (err) {
    if (checkQuotaExhaustedError(err)) return false;
    console.warn('[Server Firestore] Hydration notice:', err);
    return false;
  }
}

// Initial Firestore sync on boot
setTimeout(() => {
  syncFromFirestore().catch(() => {});
}, 100);

function saveServerState(immediate = false): void {
  serverState.lastUpdated = Date.now();
  const doWrite = () => {
    saveTimer = null;
    writeDbFile(serverState);
  };

  if (immediate) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    doWrite();
    return;
  }

  if (!saveTimer) {
    saveTimer = setTimeout(doWrite, 150);
  }
}

// Active Server-Sent Events (SSE) client subscribers
const sseClients = new Set<express.Response>();

function broadcastSSE(type: string, data: any): void {
  const payload = `data: ${JSON.stringify({ type, ...data, data, timestamp: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    liveClientsCount: sseClients.size,
    membersCount: serverState.members.length,
    recordsCount: serverState.records.length,
    leavesCount: serverState.leaves.length,
    firestoreReady: Boolean(serverDb),
    firestoreQuotaExhausted: isServerFirestoreQuotaExhausted,
  });
});

// Live Diagnostics endpoint for verifying sync health
app.get('/api/live/diagnostics', async (req, res) => {
  let firestoreStatus = 'disconnected';
  let firestoreCounts = { members: 0, records: 0, leaves: 0, accounts: 0 };
  if (serverDb) {
    if (isServerFirestoreQuotaExhausted) {
      firestoreStatus = 'quota_exhausted';
    } else {
      try {
        const [m, a, l, acc] = await Promise.all([
          getDocs(collection(serverDb, 'members')),
          getDocs(collection(serverDb, 'attendance')),
          getDocs(collection(serverDb, 'leaves')),
          getDocs(collection(serverDb, 'user_accounts')),
        ]);
        firestoreStatus = 'connected';
        firestoreCounts = {
          members: m.size,
          records: a.size,
          leaves: l.size,
          accounts: acc.size
        };
      } catch (e: any) {
        if (checkQuotaExhaustedError(e)) {
          firestoreStatus = 'quota_exhausted';
        } else {
          firestoreStatus = 'error: ' + (e?.message || e);
        }
      }
    }
  }

  res.json({
    status: 'ok',
    serverState: {
      membersCount: serverState.members.length,
      recordsCount: serverState.records.length,
      leavesCount: serverState.leaves.length,
      accountsCount: serverState.accounts.length,
      lastUpdated: serverState.lastUpdated,
      liveClientsCount: sseClients.size,
    },
    firestore: {
      status: firestoreStatus,
      databaseId: firestoreDbId,
      counts: firestoreCounts,
    },
    timestamp: new Date().toISOString()
  });
});

// Force bi-directional sync endpoint
app.post('/api/live/sync-firestore', async (req, res) => {
  try {
    await syncFromFirestore();
    // Also push local items to Firestore if Firestore lacks them
    if (serverDb) {
      for (const m of serverState.members) {
        await persistDocToFirestore('members', m.id, m);
      }
      for (const r of serverState.records) {
        const id = r.id || ('att-' + r.memberId + '-' + r.date);
        await persistDocToFirestore('attendance', id, { ...r, id });
      }
      for (const l of serverState.leaves) {
        await persistDocToFirestore('leaves', l.id, l);
      }
    }
    broadcastSSE('STATE_SYNCED', {
      members: serverState.members,
      records: serverState.records,
      leaves: serverState.leaves,
      accounts: serverState.accounts,
      lastUpdated: serverState.lastUpdated,
      timestamp: Date.now()
    });
    res.json({ 
      status: 'ok', 
      synced: true, 
      counts: { 
        members: serverState.members.length, 
        records: serverState.records.length, 
        leaves: serverState.leaves.length 
      } 
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Sync failed' });
  }
});

// SSE Live Stream Endpoint with high-durability headers for Cloud Run / reverse proxies
app.get('/api/live/stream', (req, res) => {
  if (req.socket) {
    req.socket.setKeepAlive(true);
    req.socket.setTimeout(0);
  }
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial comment to establish bidirectional stream through proxies immediately
  res.write(': stream-connected\n\n');

  sseClients.add(res);

  // Send initial state snapshot to newly connected client
  res.write(`data: ${JSON.stringify({
    type: 'INIT_STATE',
    data: {
      members: serverState.members,
      records: serverState.records,
      accounts: serverState.accounts,
      leaves: serverState.leaves,
      lastUpdated: serverState.lastUpdated,
    },
    members: serverState.members,
    records: serverState.records,
    accounts: serverState.accounts,
    leaves: serverState.leaves,
    lastUpdated: serverState.lastUpdated,
    timestamp: Date.now(),
  })}\n\n`);

  // Active 5-second heartbeat ping to prevent Google Cloud Run ingress / GFE timeout
  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(pingInterval);
      sseClients.delete(res);
    }
  }, 5000);

  req.on('close', () => {
    clearInterval(pingInterval);
    sseClients.delete(res);
  });
});

// Current state snapshot endpoint with query-based delta support
app.get('/api/live/state', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (reconcileServerState(serverState)) {
    saveServerState(true);
  }

  const since = Number(req.query.since);
  const force = req.query.force === '1' || req.query.force === 'true';

  if (!force && since && serverState.lastUpdated <= since) {
    return res.json({
      modified: false,
      lastUpdated: serverState.lastUpdated,
      counts: {
        members: serverState.members.length,
        records: serverState.records.length,
        leaves: serverState.leaves.length,
      },
      timestamp: Date.now()
    });
  }

  res.json({
    modified: true,
    members: serverState.members,
    records: serverState.records,
    accounts: serverState.accounts,
    leaves: serverState.leaves,
    lastUpdated: serverState.lastUpdated,
    timestamp: Date.now(),
  });
});

// Handle real-time actions from Admin or User
app.post('/api/live/action', async (req, res) => {
  const { action, payload } = req.body || {};

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }

  try {
    switch (action) {
      case 'PUNCH_ATTENDANCE': {
        const { record, memberName } = payload || {};
        if (record && record.memberId && record.date) {
          // Find matching account or member
          const matchingAccount = serverState.accounts.find(
            (a: any) => a.memberId === record.memberId || (a.email && 'mem-' + a.email.replace(/[^a-zA-Z0-9]/g, '_') === record.memberId)
          );
          const resolvedName = memberName || matchingAccount?.name || (record.memberId.startsWith('mem-') ? record.memberId.replace(/^mem-/, '').replace(/_/g, ' ') : 'Staff Member');
          const resolvedEmail = matchingAccount?.email || (record.memberId.includes('_gmail_com') ? record.memberId.replace(/^mem-/, '').replace(/_gmail_com$/, '@gmail.com') : '');

          let memIdx = serverState.members.findIndex((m: any) => m.id === record.memberId);
          if (memIdx < 0 && resolvedEmail) {
            memIdx = serverState.members.findIndex((m: any) => m.email && m.email.toLowerCase() === resolvedEmail.toLowerCase());
          }

          let memberObj: any;
          if (memIdx >= 0) {
            memberObj = serverState.members[memIdx];
            if (memberName && (!memberObj.name || memberObj.name === 'Staff Member')) {
              memberObj.name = memberName;
            }
            if (resolvedEmail && !memberObj.email) {
              memberObj.email = resolvedEmail;
            }
          } else {
            memberObj = {
              id: record.memberId,
              name: resolvedName,
              employeeId: matchingAccount?.employeeId || record.memberId.replace(/^mem-/, '').toUpperCase(),
              department: matchingAccount?.department || 'Operations & Admin',
              role: matchingAccount?.roleTitle || 'Staff Member',
              email: resolvedEmail,
              phone: matchingAccount?.phone || '',
              joinDate: record.date || '2026-09-01',
              shift: 'regular',
              avatarColor: 'from-blue-600 to-indigo-600',
              active: true,
            };
            serverState.members.unshift(memberObj);
            broadcastSSE('MEMBER_ADDED', { member: memberObj, timestamp: Date.now() });
          }

          if (matchingAccount && !matchingAccount.memberId) {
            matchingAccount.memberId = record.memberId;
          }

          const recMem = serverState.members.find((m: any) => 
            m.id === record.memberId || 
            (m.email && record.memberId.includes(m.email.replace(/[^a-zA-Z0-9]/g, '_')))
          );
          const aliases = new Set<string>();
          aliases.add(record.memberId.toLowerCase());
          if (recMem?.id) aliases.add(recMem.id.toLowerCase());
          if (recMem?.email) {
            const em = recMem.email.toLowerCase().trim();
            aliases.add(em);
            aliases.add('mem-' + em.replace(/[^a-zA-Z0-9]/g, '_'));
          }

          const idx = serverState.records.findIndex(
            (r: any) => (r.id && record.id && r.id === record.id) || 
                        (r.date === record.date && (aliases.has(r.memberId?.toLowerCase()) || (r.id && Array.from(aliases).some(a => r.id.includes(a)))))
          );
          let finalRecord = record;
          if (idx >= 0) {
            const prevRec = serverState.records[idx];
            const isExplicitAbsent = record.status === 'absent' && !record.checkInTime;
            finalRecord = {
              ...prevRec,
              ...record,
              checkInTime: isExplicitAbsent ? undefined : (record.checkInTime !== undefined ? record.checkInTime : prevRec.checkInTime),
              checkOutTime: isExplicitAbsent ? undefined : (record.checkOutTime !== undefined ? record.checkOutTime : prevRec.checkOutTime),
              updatedAt: record.updatedAt || new Date().toISOString()
            };
            serverState.records[idx] = finalRecord;
          } else {
            finalRecord = {
              ...record,
              updatedAt: record.updatedAt || new Date().toISOString()
            };
            serverState.records.push(finalRecord);
          }

          reconcileServerState(serverState);
          saveServerState(true);

          // Broadcast to ALL connected clients (Admin and Users) immediately
          broadcastSSE('PUNCH_UPDATE', {
            record: finalRecord,
            memberName: resolvedName,
            member: memberObj,
            lastUpdated: serverState.lastUpdated,
            timestamp: Date.now(),
          });

          // Dual-persist to Cloud Firestore in background
          const recDocId = finalRecord.id || ('att-' + finalRecord.memberId + '-' + finalRecord.date);
          persistDocToFirestore('attendance', recDocId, { ...finalRecord, id: recDocId }).catch(() => {});
          if (memberObj && memberObj.id) {
            persistDocToFirestore('members', memberObj.id, memberObj).catch(() => {});
          }
        }
        break;
      }

      case 'ADD_MEMBER': {
        const { member } = payload || {};
        if (member && member.id) {
          // If member was previously deleted, unmark tombstone
          if (Array.isArray(serverState.deletedMemberIds)) {
            serverState.deletedMemberIds = serverState.deletedMemberIds.filter(id => id !== member.id);
          }
          const idx = serverState.members.findIndex((m: any) => m.id === member.id);
          if (idx >= 0) {
            serverState.members[idx] = { ...serverState.members[idx], ...member };
          } else {
            serverState.members.unshift(member);
          }
          reconcileServerState(serverState);
          saveServerState(true);
          persistDocToFirestore('members', member.id, member);
          broadcastSSE('MEMBER_ADDED', { member, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
        }
        break;
      }

      case 'UPDATE_MEMBER': {
        const { member } = payload || {};
        if (member && member.id) {
          const idx = serverState.members.findIndex((m: any) => m.id === member.id);
          if (idx >= 0) {
            serverState.members[idx] = { ...serverState.members[idx], ...member };
          } else {
            serverState.members.push(member);
          }

          // Also update linked account in serverState and Firestore
          if (Array.isArray(serverState.accounts)) {
            const accIdx = serverState.accounts.findIndex((a: any) => 
              a.memberId === member.id || 
              (a.email && member.email && a.email.toLowerCase().trim() === member.email.toLowerCase().trim())
            );
            if (accIdx >= 0) {
              serverState.accounts[accIdx] = {
                ...serverState.accounts[accIdx],
                name: member.name || serverState.accounts[accIdx].name,
                email: member.email || serverState.accounts[accIdx].email,
                employeeId: member.employeeId || serverState.accounts[accIdx].employeeId,
                department: member.department || serverState.accounts[accIdx].department,
                roleTitle: member.role || serverState.accounts[accIdx].roleTitle
              };
              const accDocId = serverState.accounts[accIdx].id || `acc_${serverState.accounts[accIdx].email.replace(/[^a-zA-Z0-9]/g, '_')}`;
              persistDocToFirestore('user_accounts', accDocId, serverState.accounts[accIdx]);
            }
          }

          // Also update member leaves display name
          if (Array.isArray(serverState.leaves)) {
            serverState.leaves.forEach((l: any) => {
              if (l.memberId === member.id) {
                l.memberName = member.name || l.memberName;
                l.employeeId = member.employeeId || l.employeeId;
                l.department = member.department || l.department;
                persistDocToFirestore('leaves', l.id, l);
              }
            });
          }

          reconcileServerState(serverState);
          saveServerState(true);
          persistDocToFirestore('members', member.id, member);
          broadcastSSE('MEMBER_UPDATED', { member, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
        }
        break;
      }

      case 'DELETE_MEMBER': {
        const { memberId } = payload || {};
        if (memberId) {
          if (!Array.isArray(serverState.deletedMemberIds)) serverState.deletedMemberIds = [];
          if (!serverState.deletedMemberIds.includes(memberId)) {
            serverState.deletedMemberIds.push(memberId);
          }
          serverState.members = serverState.members.filter((m: any) => m.id !== memberId);
          serverState.records = serverState.records.filter((r: any) => r.memberId !== memberId);
          serverState.leaves = serverState.leaves.filter((l: any) => l.memberId !== memberId);
          serverState.accounts = serverState.accounts.filter((a: any) => a.memberId !== memberId);
          
          saveServerState(true);
          removeDocFromFirestore('members', memberId);

          // Deep Firestore cascading cleanup for this member
          if (serverDb && !isServerFirestoreQuotaExhausted) {
            getDocs(query(collection(serverDb, 'attendance'), where('memberId', '==', memberId)))
              .then(snap => snap.forEach(d => deleteDoc(d.ref))).catch(() => {});
            getDocs(query(collection(serverDb, 'leaves'), where('memberId', '==', memberId)))
              .then(snap => snap.forEach(d => deleteDoc(d.ref))).catch(() => {});
            getDocs(query(collection(serverDb, 'user_accounts'), where('memberId', '==', memberId)))
              .then(snap => snap.forEach(d => deleteDoc(d.ref))).catch(() => {});
          }

          broadcastSSE('MEMBER_DELETED', { memberId, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
        }
        break;
      }

      case 'UPDATE_RECORD': {
        const { record } = payload || {};
        if (record && record.memberId && record.date) {
          const recId = record.id || ('att-' + record.memberId + '-' + record.date);
          const cleanRecord = { ...record, id: recId };
          if (cleanRecord.status === 'absent') {
            cleanRecord.checkInTime = undefined;
            cleanRecord.checkOutTime = undefined;
          }

          const recMem = serverState.members.find((m: any) => 
            m.id === record.memberId || 
            (m.email && record.memberId.includes(m.email.replace(/[^a-zA-Z0-9]/g, '_')))
          );
          const aliases = new Set<string>();
          aliases.add(record.memberId.toLowerCase());
          if (recMem?.id) aliases.add(recMem.id.toLowerCase());
          if (recMem?.email) {
            const em = recMem.email.toLowerCase().trim();
            aliases.add(em);
            aliases.add('mem-' + em.replace(/[^a-zA-Z0-9]/g, '_'));
          }

          const idx = serverState.records.findIndex(
            (r: any) => (r.id && record.id && r.id === record.id) || 
                        (r.date === record.date && (aliases.has(r.memberId?.toLowerCase()) || (r.id && Array.from(aliases).some(a => r.id.includes(a)))))
          );
          if (idx >= 0) {
            const prevRec = serverState.records[idx];
            if (!cleanRecord.checkInTime && prevRec.checkInTime && cleanRecord.status !== 'absent') {
              cleanRecord.checkInTime = prevRec.checkInTime;
            }
            if (!cleanRecord.checkOutTime && prevRec.checkOutTime) {
              cleanRecord.checkOutTime = prevRec.checkOutTime;
            }
            serverState.records[idx] = cleanRecord;
          } else {
            serverState.records.push(cleanRecord);
          }
          reconcileServerState(serverState);
          saveServerState(true);
          broadcastSSE('RECORD_UPDATED', { record: cleanRecord, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
          broadcastSSE('PUNCH_UPDATE', { record: cleanRecord, memberName: payload?.memberName, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
          persistDocToFirestore('attendance', recId, cleanRecord).catch(() => {});
        }
        break;
      }

      case 'DELETE_RECORD': {
        const { recordId, memberId, date } = payload || {};
        if (!Array.isArray(serverState.deletedRecordIds)) serverState.deletedRecordIds = [];
        if (recordId && !serverState.deletedRecordIds.includes(recordId)) {
          serverState.deletedRecordIds.push(recordId);
        }

        serverState.records = serverState.records.filter((r: any) => {
          if (recordId && r.id === recordId) return false;
          if (memberId && date && r.memberId === memberId && r.date === date) return false;
          return true;
        });

        saveServerState(true);
        if (recordId) {
          await removeDocFromFirestore('attendance', recordId);
        }
        if (serverDb && !isServerFirestoreQuotaExhausted && memberId && date) {
          getDocs(query(collection(serverDb, 'attendance'), where('memberId', '==', memberId), where('date', '==', date)))
            .then(snap => snap.forEach(d => deleteDoc(d.ref))).catch(() => {});
        }
        broadcastSSE('RECORD_DELETED', { recordId, memberId, date, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
        break;
      }

      case 'SYNC_ACCOUNT': {
        const { account } = payload || {};
        if (account && (account.id || account.email)) {
          const accId = account.id || `acc_${account.email.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const cleanAcc = { ...account, id: accId };
          const idx = serverState.accounts.findIndex((a: any) => a.id === accId || (a.email && a.email.toLowerCase() === (account.email || '').toLowerCase()));
          if (idx >= 0) {
            serverState.accounts[idx] = { ...serverState.accounts[idx], ...cleanAcc };
          } else {
            serverState.accounts.push(cleanAcc);
          }
          reconcileServerState(serverState);
          saveServerState(true);
          persistDocToFirestore('user_accounts', accId, cleanAcc);
          broadcastSSE('ACCOUNT_UPDATED', { account: cleanAcc, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
        }
        break;
      }

      case 'DELETE_ACCOUNT': {
        const { accountId, memberId, email } = payload || {};
        serverState.accounts = serverState.accounts.filter((a: any) => {
          if (accountId && a.id === accountId) return false;
          if (memberId && a.memberId === memberId) return false;
          if (email && a.email && a.email.toLowerCase() === email.toLowerCase()) return false;
          return true;
        });
        saveServerState(true);
        if (accountId) removeDocFromFirestore('user_accounts', accountId);
        if (serverDb && !isServerFirestoreQuotaExhausted && memberId) {
          getDocs(query(collection(serverDb, 'user_accounts'), where('memberId', '==', memberId)))
            .then(snap => snap.forEach(d => deleteDoc(d.ref))).catch(() => {});
        }
        broadcastSSE('ACCOUNT_DELETED', { accountId, memberId, email, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
        break;
      }

      case 'BULK_RECORDS': {
        const { records } = payload || {};
        if (Array.isArray(records)) {
          const map = new Map<string, any>();
          serverState.records.forEach((r: any) => map.set(`${r.memberId}_${r.date}`, r));
          records.forEach((r: any) => map.set(`${r.memberId}_${r.date}`, r));
          serverState.records = Array.from(map.values());
          reconcileServerState(serverState);
          saveServerState(true);
          broadcastSSE('BULK_RECORDS_UPDATED', { records, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
          records.forEach((r: any) => {
            const id = r.id || ('att-' + r.memberId + '-' + r.date);
            persistDocToFirestore('attendance', id, { ...r, id }).catch(() => {});
          });
        }
        break;
      }

      case 'SYNC_STATE': {
        const { members, records, accounts, deletedMemberIds, deletedRecordIds, deletedLeaveIds } = payload || {};
        let modified = false;

        // Ingest deleted tombstones from client
        if (Array.isArray(deletedMemberIds) && deletedMemberIds.length > 0) {
          if (!Array.isArray(serverState.deletedMemberIds)) serverState.deletedMemberIds = [];
          deletedMemberIds.forEach((id: string) => {
            if (!serverState.deletedMemberIds!.includes(id)) {
              serverState.deletedMemberIds!.push(id);
              modified = true;
            }
          });
        }
        if (Array.isArray(deletedRecordIds) && deletedRecordIds.length > 0) {
          if (!Array.isArray(serverState.deletedRecordIds)) serverState.deletedRecordIds = [];
          deletedRecordIds.forEach((id: string) => {
            if (!serverState.deletedRecordIds!.includes(id)) {
              serverState.deletedRecordIds!.push(id);
              modified = true;
            }
          });
        }
        if (Array.isArray(deletedLeaveIds) && deletedLeaveIds.length > 0) {
          if (!Array.isArray(serverState.deletedLeaveIds)) serverState.deletedLeaveIds = [];
          deletedLeaveIds.forEach((id: string) => {
            if (!serverState.deletedLeaveIds!.includes(id)) {
              serverState.deletedLeaveIds!.push(id);
              modified = true;
            }
          });
        }

        const delMemSet = new Set(serverState.deletedMemberIds || []);
        const delRecSet = new Set(serverState.deletedRecordIds || []);
        const delLeaveSet = new Set(serverState.deletedLeaveIds || []);

        if (Array.isArray(members) && members.length > 0) {
          const map = new Map<string, any>();
          serverState.members.forEach((m: any) => {
            if (!delMemSet.has(m.id)) map.set(m.id, m);
          });
          members.forEach((m: any) => {
            if (m && m.id && !delMemSet.has(m.id)) {
              const existing = map.get(m.id);
              if (existing) {
                map.set(m.id, { ...existing, ...m });
              } else {
                map.set(m.id, m);
              }
            }
          });
          serverState.members = Array.from(map.values());
          modified = true;
        }
        if (Array.isArray(records) && records.length > 0) {
          const map = new Map<string, any>();
          serverState.records.forEach((r: any) => {
            if (!delRecSet.has(r.id) && !delMemSet.has(r.memberId)) {
              map.set(`${r.memberId}_${r.date}`, r);
            }
          });
          records.forEach((r: any) => {
            if (r && r.memberId && r.date && !delRecSet.has(r.id) && !delMemSet.has(r.memberId)) {
              const key = `${r.memberId}_${r.date}`;
              const existing = map.get(key);
              if (existing) {
                const existingUpdated = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
                const incomingUpdated = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
                const hasExistingPunch = Boolean(existing.checkInTime || existing.checkOutTime);
                const hasIncomingPunch = Boolean(r.checkInTime || r.checkOutTime);

                if (hasExistingPunch && !hasIncomingPunch) {
                  // Keep existing punch, do not let an empty/stale client record erase it
                  map.set(key, { ...r, ...existing });
                } else if (incomingUpdated >= existingUpdated || !hasExistingPunch) {
                  map.set(key, {
                    ...existing,
                    ...r,
                    checkInTime: r.checkInTime || existing.checkInTime,
                    checkOutTime: r.checkOutTime || existing.checkOutTime,
                    status: (r.checkInTime || existing.checkInTime) ? (r.status || existing.status) : (r.status || existing.status || 'absent'),
                    notes: r.notes || existing.notes,
                    updatedAt: r.updatedAt || existing.updatedAt || new Date().toISOString()
                  });
                }
              } else {
                map.set(key, r);
              }
            }
          });
          serverState.records = Array.from(map.values());
          modified = true;
        }
        if (Array.isArray(accounts) && accounts.length > 0) {
          const map = new Map<string, any>();
          serverState.accounts.forEach((a: any) => {
            if (!delMemSet.has(a.memberId)) map.set(a.id || a.email, a);
          });
          accounts.forEach((a: any) => {
            if (!delMemSet.has(a.memberId)) map.set(a.id || a.email, a);
          });
          serverState.accounts = Array.from(map.values());
          modified = true;
        }
        if (Array.isArray(payload?.leaves)) {
          const realLeaves = payload.leaves.filter((l: any) => 
            l && l.id && 
            !l.id.startsWith('leave-sample-') && 
            !l.id.includes('sample') &&
            !delLeaveSet.has(l.id) &&
            !delMemSet.has(l.memberId)
          );
          const map = new Map<string, any>();
          serverState.leaves.forEach((l: any) => {
            if (!delLeaveSet.has(l.id) && !delMemSet.has(l.memberId)) map.set(l.id, l);
          });
          realLeaves.forEach((l: any) => map.set(l.id, l));
          serverState.leaves = Array.from(map.values());
          modified = true;
        }
        
        if (reconcileServerState(serverState)) {
          modified = true;
        }

        if (modified) {
          saveServerState(true);
          // Sync items to Firestore
          if (Array.isArray(members)) members.forEach((m: any) => {
            if (!delMemSet.has(m.id)) persistDocToFirestore('members', m.id, m);
          });
          if (Array.isArray(records)) records.forEach((r: any) => {
            if (!delRecSet.has(r.id) && !delMemSet.has(r.memberId)) {
              const id = r.id || ('att-' + r.memberId + '-' + r.date);
              persistDocToFirestore('attendance', id, { ...r, id });
            }
          });
          if (Array.isArray(payload?.leaves)) payload.leaves.forEach((l: any) => {
            if (!delMemSet.has(l.memberId)) persistDocToFirestore('leaves', l.id, l);
          });

          broadcastSSE('STATE_SYNCED', {
            members: serverState.members,
            records: serverState.records,
            accounts: serverState.accounts,
            leaves: serverState.leaves,
            lastUpdated: serverState.lastUpdated,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'SUBMIT_LEAVE': {
        const { leave } = payload || {};
        if (leave && leave.id && leave.memberId) {
          const idx = serverState.leaves.findIndex((l: any) => l.id === leave.id);
          if (idx >= 0) {
            serverState.leaves[idx] = leave;
          } else {
            serverState.leaves.unshift(leave);
          }

          // Ensure member exists with leave info
          let mem = serverState.members.find((m: any) => m.id === leave.memberId);
          if (!mem) {
            mem = {
              id: leave.memberId,
              name: leave.memberName || 'Staff Member',
              employeeId: leave.employeeId || leave.memberId.replace(/^mem-/, '').toUpperCase(),
              department: leave.department || 'Operations & Admin',
              role: 'Staff Member',
              email: leave.memberId.includes('_gmail_com') ? leave.memberId.replace(/^mem-/, '').replace(/_gmail_com$/, '@gmail.com') : '',
              phone: '',
              joinDate: leave.startDate || '2026-09-01',
              shift: 'regular',
              avatarColor: leave.avatarColor || 'from-blue-600 to-indigo-600',
              active: true,
            };
            serverState.members.unshift(mem);
            persistDocToFirestore('members', mem.id, mem);
            broadcastSSE('MEMBER_ADDED', { member: mem, timestamp: Date.now() });
          }

          reconcileServerState(serverState);
          saveServerState(true);
          await persistDocToFirestore('leaves', leave.id, leave);
          broadcastSSE('LEAVE_SUBMITTED', { leave, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
        }
        break;
      }

      case 'REVIEW_LEAVE': {
        const { leave } = payload || {};
        if (leave && leave.id) {
          const idx = serverState.leaves.findIndex((l: any) => l.id === leave.id);
          if (idx >= 0) {
            serverState.leaves[idx] = leave;
          } else {
            serverState.leaves.unshift(leave);
          }
          saveServerState(true);
          await persistDocToFirestore('leaves', leave.id, leave);
          broadcastSSE('LEAVE_REVIEWED', { leave, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
        }
        break;
      }

      case 'DELETE_LEAVE': {
        const { leaveId } = payload || {};
        if (leaveId) {
          if (!Array.isArray(serverState.deletedLeaveIds)) serverState.deletedLeaveIds = [];
          if (!serverState.deletedLeaveIds.includes(leaveId)) {
            serverState.deletedLeaveIds.push(leaveId);
          }
          serverState.leaves = serverState.leaves.filter((l: any) => l.id !== leaveId);
          saveServerState(true);
          await removeDocFromFirestore('leaves', leaveId);
          broadcastSSE('LEAVE_DELETED', { leaveId, lastUpdated: serverState.lastUpdated, timestamp: Date.now() });
        }
        break;
      }

      case 'CLEAR_ALL': {
        serverState.members = [];
        serverState.records = [];
        serverState.leaves = [];
        saveServerState(true);
        if (serverDb && !isServerFirestoreQuotaExhausted) {
          getDocs(collection(serverDb, 'members')).then(s => s.forEach(d => deleteDoc(d.ref))).catch(() => {});
          getDocs(collection(serverDb, 'attendance')).then(s => s.forEach(d => deleteDoc(d.ref))).catch(() => {});
          getDocs(collection(serverDb, 'leaves')).then(s => s.forEach(d => deleteDoc(d.ref))).catch(() => {});
        }
        broadcastSSE('DATA_CLEARED', { timestamp: Date.now() });
        break;
      }

      case 'RESET_SEED': {
        const { members, records, leaves } = payload || {};
        serverState.members = Array.isArray(members) ? members : [];
        serverState.records = Array.isArray(records) ? records : [];
        serverState.leaves = Array.isArray(leaves) ? leaves : [];
        saveServerState(true);
        if (serverDb) {
          serverState.members.forEach(m => persistDocToFirestore('members', m.id, m));
          serverState.records.forEach(r => {
            const id = r.id || ('att-' + r.memberId + '-' + r.date);
            persistDocToFirestore('attendance', id, { ...r, id });
          });
        }
        broadcastSSE('DATA_RESET', {
          members: serverState.members,
          records: serverState.records,
          leaves: serverState.leaves,
          timestamp: Date.now(),
        });
        break;
      }

      case 'PING': {
        // Simple health-check probe
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.json({ 
      success: true, 
      state: {
        members: serverState.members,
        records: serverState.records,
        accounts: serverState.accounts,
        leaves: serverState.leaves,
        lastUpdated: serverState.lastUpdated
      },
      timestamp: Date.now() 
    });
  } catch (err: any) {
    console.error('[Server Live Action Error]:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// Strict 404 handler for any unhandled /api route - guarantees API calls NEVER return index.html
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.path });
});

// Vite Middleware for dev & static serving for prod
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || (typeof process.argv[1] === 'string' && process.argv[1].includes('dist'));

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: {
          ignored: [
            '**/data/**',
            '**/data/db.json',
            '**/.data/**',
            '**/dist/**',
            '**/data/*',
            '**/*.json',
          ],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AttendaPro] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
