import { AttendanceRecord, Member, LeaveRequest } from '../types';

export type RealtimeSyncMessage = 
  | { type: 'PUNCH_UPDATE'; record: AttendanceRecord; memberName?: string; member?: Member; timestamp: number }
  | { type: 'PUNCH_BULK_UPDATE'; records: AttendanceRecord[]; timestamp: number }
  | { type: 'MEMBERS_UPDATE'; members: Member[]; timestamp: number }
  | { type: 'MEMBER_ADDED'; member: Member; timestamp: number }
  | { type: 'MEMBER_UPDATED'; member: Member; timestamp: number }
  | { type: 'MEMBER_DELETED'; memberId: string; timestamp: number }
  | { type: 'RECORD_UPDATED'; record: AttendanceRecord; timestamp: number }
  | { type: 'BULK_RECORDS_UPDATED'; records: AttendanceRecord[]; timestamp: number }
  | { type: 'LEAVE_SUBMITTED'; leave: LeaveRequest; timestamp: number }
  | { type: 'LEAVE_REVIEWED'; leave: LeaveRequest; timestamp: number }
  | { type: 'LEAVE_DELETED'; leaveId: string; timestamp: number }
  | { type: 'LEAVES_UPDATE'; leaves: LeaveRequest[]; timestamp: number }
  | { type: 'INIT_STATE'; data: { members: Member[]; records: AttendanceRecord[]; accounts?: any[]; leaves?: LeaveRequest[]; lastUpdated?: number }; members?: Member[]; records?: AttendanceRecord[]; leaves?: LeaveRequest[]; timestamp: number }
  | { type: 'STATE_SYNCED'; members: Member[]; records: AttendanceRecord[]; leaves?: LeaveRequest[]; accounts?: any[]; timestamp: number }
  | { type: 'DATA_CLEARED'; timestamp: number }
  | { type: 'DATA_RESET'; members: Member[]; records: AttendanceRecord[]; leaves?: LeaveRequest[]; timestamp: number }
  | { type: 'STATE_REFRESH'; timestamp: number };

export interface ServerLiveSnapshot {
  modified?: boolean;
  members: Member[];
  records: AttendanceRecord[];
  accounts?: any[];
  leaves?: LeaveRequest[];
  lastUpdated?: number;
  timestamp?: number;
}

const CHANNEL_NAME = 'attendapro_realtime_sync_bus_v1';
const STORAGE_SYNC_EVENT_KEY = 'attendapro_cross_tab_sync_event_v1';

// Unique client identifier to prevent double-processing self-sent messages
export const CLIENT_SESSION_ID = 'client_' + Math.random().toString(36).substring(2, 9);

let broadcastChannel: BroadcastChannel | null = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch {
  broadcastChannel = null;
}

let isFirestoreConnectedGlobal = true;
let notifyActiveConnectionGlobal: ((connected: boolean) => void) | null = null;

export function notifyFirestoreActive(active: boolean = true): void {
  isFirestoreConnectedGlobal = active;
  if (notifyActiveConnectionGlobal) {
    notifyActiveConnectionGlobal(active || (typeof navigator !== 'undefined' && navigator.onLine));
  }
}

let isServerBackendAvailable: boolean | null = null;

/**
 * Fetch live database state snapshot from the Node backend (/api/live/state)
 */
export async function fetchLiveStateFromServer(since?: number, force?: boolean): Promise<ServerLiveSnapshot | null> {
  if (isServerBackendAvailable === false) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const url = `/api/live/state?since=${since || 0}&force=${force ? '1' : '0'}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      isServerBackendAvailable = true;
      const data = await res.json();
      return data;
    } else {
      // Returned HTML or 404/405 - static hosting environment (e.g. Apache/cPanel)
      isServerBackendAvailable = false;
    }
  } catch {
    isServerBackendAvailable = false;
  }
  return null;
}

/**
 * Send an action to the server-side live coordinator (/api/live/action)
 */
export async function sendLiveActionToServer(action: string, payload: any): Promise<any> {
  if (isServerBackendAvailable === false) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('/api/live/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload, _senderId: CLIENT_SESSION_ID }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      isServerBackendAvailable = true;
      return await res.json();
    } else {
      isServerBackendAvailable = false;
    }
  } catch {
    isServerBackendAvailable = false;
  }
  return null;
}

/**
 * Broadcast an event to all open browser tabs/windows (local machine)
 */
export function broadcastSyncEvent(message: RealtimeSyncMessage): void {
  try {
    const wrapped = { ...message, _senderId: CLIENT_SESSION_ID };
    if (broadcastChannel) {
      broadcastChannel.postMessage(wrapped);
    }
    localStorage.setItem(STORAGE_SYNC_EVENT_KEY, JSON.stringify({
      ...wrapped,
      _nonce: Math.random().toString(36).substring(2, 9)
    }));
  } catch (err) {
    console.warn('[RealtimeSync] Broadcast error:', err);
  }
}

/**
 * Subscribe to both cross-device SSE server stream (/api/live/stream) AND cross-tab/window local events.
 * Guarantees real-time push synchronization across mobile, laptop, and admin screens.
 */
export function subscribeToRealtimeSync(
  onMessage: (message: RealtimeSyncMessage) => void,
  onConnectionChange?: (connected: boolean) => void
): () => void {
  const processedNonces = new Set<string>();
  let eventSource: EventSource | null = null;
  let reconnectTimer: any = null;
  let isStopped = false;

  const updateConnection = (connected: boolean) => {
    const isEffectiveConnected = connected || isFirestoreConnectedGlobal || (typeof navigator !== 'undefined' && navigator.onLine);
    if (notifyActiveConnectionGlobal) {
      notifyActiveConnectionGlobal(isEffectiveConnected);
    }
    if (onConnectionChange) {
      onConnectionChange(isEffectiveConnected);
    }
  };

  const processIncoming = (msg: any) => {
    if (!msg || typeof msg !== 'object' || !msg.type) return;

    // Deduplicate nonces
    const entityId = msg.record?.id || 
                     msg.member?.id || 
                     msg.memberId || 
                     msg.leave?.id || 
                     msg.leaveId || 
                     '';
    
    if (msg.type !== 'INIT_STATE' && msg.type !== 'STATE_SYNCED' && msg.type !== 'DATA_RESET') {
      const nonce = `${msg.type}_${msg.timestamp || ''}_${entityId}`;
      if (processedNonces.has(nonce)) return;
      processedNonces.add(nonce);
      if (processedNonces.size > 300) {
        const first = processedNonces.values().next().value;
        if (first) processedNonces.delete(first);
      }
    }

    onMessage(msg as RealtimeSyncMessage);
  };

  const handleBcMessage = (event: MessageEvent) => {
    if (event.data && typeof event.data === 'object' && event.data.type) {
      if (event.data._senderId !== CLIENT_SESSION_ID) {
        processIncoming(event.data);
      }
    }
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === STORAGE_SYNC_EVENT_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed && parsed.type && parsed._senderId !== CLIENT_SESSION_ID) {
          processIncoming(parsed);
        }
      } catch {}
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBcMessage);
  }
  window.addEventListener('storage', handleStorageEvent);

  let consecutiveSseFailures = 0;

  // Setup Server-Sent Events (SSE) stream for cross-device synchronization (Mobile, Laptop, Admin, Staff)
  function connectSSE() {
    if (isStopped || isServerBackendAvailable === false) {
      updateConnection(true);
      return;
    }
    try {
      if (eventSource) {
        eventSource.close();
      }
      eventSource = new EventSource('/api/live/stream');
      
      eventSource.onopen = () => {
        consecutiveSseFailures = 0;
        isServerBackendAvailable = true;
        updateConnection(true);
      };

      eventSource.onmessage = (event) => {
        if (!event.data) return;
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && parsed.type) {
            // Ignore messages broadcast by self to prevent double-processing
            if (parsed._senderId === CLIENT_SESSION_ID) return;
            processIncoming(parsed);
          }
        } catch {}
      };

      eventSource.onerror = () => {
        consecutiveSseFailures++;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // If SSE fails (e.g. running on static Apache cPanel host where /api/live/* returns HTML),
        // cleanly disable SSE polling to avoid infinite reconnect loops.
        // Google Firestore onSnapshot handles 100% of live synchronization!
        if (consecutiveSseFailures >= 2) {
          isServerBackendAvailable = false;
          updateConnection(true);
          return;
        }
        if (!isStopped) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectSSE, 4000);
        }
      };
    } catch {
      isServerBackendAvailable = false;
      updateConnection(true);
    }
  }

  connectSSE();

  const handleOnline = () => {
    updateConnection(true);
    connectSSE();
  };
  const handleOffline = () => {
    updateConnection(false);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Initial connection update
  updateConnection(true);

  return () => {
    isStopped = true;
    clearTimeout(reconnectTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBcMessage);
    }
    window.removeEventListener('storage', handleStorageEvent);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
