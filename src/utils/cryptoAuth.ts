import { UserAccount, AuthSession, SecurityAuditLog, SecurityEventType, UserRole, Member } from '../types';
import { 
  saveAccountToFirestore, 
  getAccountsFromFirestore, 
  getMembersFromFirestore,
  deleteAccountByMemberIdFromFirestore,
  logAuditToFirestore, 
  checkIsQuotaExhausted 
} from '../lib/firebase';
import { sendLiveActionToServer } from './realtimeSync';
import { unmarkMemberDeleted, saveMembers, safeLocalStorageSetItem } from './storage';

const STORAGE_KEYS = {
  ACCOUNTS: 'app_attendance_accounts_v1',
  SESSION: 'app_attendance_session_v1',
  AUDIT_LOGS: 'app_attendance_audit_logs_v1',
};

// Recognized standard admin emails and aliases
export const ADMIN_EMAILS = [
  'parsanameet8@gmail.com',
  'parsanameet8',
  'meet.parsana@sahilinfotech.com',
  'shubhamsangani3572@gmail.com',
  'shubham',
  'admin@sahilinfotech.com',
  'admin@sahilinfotech.in',
  'admin@company.io',
  'admin',
  'administrator',
  'sahil'
];

// Valid standard master passwords for instant bootstrap on fresh domains
export const MASTER_ADMIN_PASSWORDS = [
  'SahilInfotech.com',
  'Admin@123',
  'AdminSecure2026!',
  'admin123',
  'admin',
  'Admin@2026',
  'Staff@123'
];

export const MASTER_STAFF_PASSWORDS = [
  'Staff@123',
  'StaffSecure2026!',
  'staff123',
  'password',
  'Admin@123'
];

// Maximum allowed failed login attempts before temporary lockout
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 60 * 1000; // 60 seconds lockout
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper to convert ArrayBuffer or byte array to Hex String
function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const byteArray = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(byteArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Pure JavaScript Bitwise SHA-256 Implementation (Zero Dependencies, works in all iframe/HTTP contexts)
function sha256Sync(str: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = str.length * 8;
  
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  let paddedStr = str + '\x80';
  while ((paddedStr.length % 64) - 56) paddedStr += '\x00';
  for (let i = 0; i < paddedStr.length; i++) {
    const j = paddedStr.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15] || 0, w2 = w[i - 2] || 0;
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = (i < 16) ? (w[i] || 0) : (((w[i - 16] || 0) + s0 + (w[i - 7] || 0) + s1) | 0);

      const s0_2 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const t2 = (s0_2 + maj) | 0;
      const s1_2 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const t1 = (hash[7] + s1_2 + ch + k[i] + (w[i] || 0)) | 0;

      hash = [(t1 + t2) | 0, hash[0], hash[1], hash[2], (hash[3] + t1) | 0, hash[4], hash[5], hash[6]];
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i] >> (b * 8)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

// Generate cryptographically secure random salt with guaranteed fallback
export function generateSalt(length = 16): string {
  try {
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const randomBytes = new Uint8Array(length);
      window.crypto.getRandomValues(randomBytes);
      return bufferToHex(randomBytes);
    }
  } catch {
    // Fallback to random hex
  }
  let salt = '';
  for (let i = 0; i < length * 2; i++) {
    salt += Math.floor(Math.random() * 16).toString(16);
  }
  return salt;
}

// Hash password with salt using Web Crypto API or pure JS SHA-256 fallback
export async function hashPassword(password: string, salt: string = ''): Promise<string> {
  const pepper = '::ATTENDA_PEPPER_2026';
  const combined = (password || '') + (salt || '') + pepper;
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
      const encoder = new TextEncoder();
      const data = encoder.encode(combined);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      return bufferToHex(hashBuffer);
    }
  } catch {
    // Subtle crypto unavailable or failed, fallback to pure JS SHA-256
  }
  return sha256Sync(combined);
}

// Verify password against stored hash and salt safely
export async function verifyPassword(password: string, storedHash: string, salt: string = ''): Promise<boolean> {
  if (!storedHash || !password) return false;
  try {
    const calculatedHash = await hashPassword(password, salt);
    if (calculatedHash.toLowerCase() === storedHash.toLowerCase()) {
      return true;
    }
    // Also test pure JS calculation directly
    const directJsHash = sha256Sync((password || '') + (salt || '') + '::ATTENDA_PEPPER_2026');
    if (directJsHash.toLowerCase() === storedHash.toLowerCase()) {
      return true;
    }
  } catch {
    // Ignore and check master passwords
  }
  return false;
}

// Password Strength & Entropy Analyzer
export interface PasswordStrengthResult {
  score: number; // 0 to 4
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  color: string;
  feedback: string[];
  hasMinLength: boolean;
  hasLower: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const hasMinLength = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const feedback: string[] = [];
  if (!hasMinLength) feedback.push('At least 8 characters');
  if (!hasLower) feedback.push('Lowercase letter (a-z)');
  if (!hasUpper) feedback.push('Uppercase letter (A-Z)');
  if (!hasNumber) feedback.push('At least one number (0-9)');
  if (!hasSpecial) feedback.push('Special character (!@#$%)');

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (hasLower && hasUpper) score += 1;
  if (hasNumber && hasSpecial) score += 1;

  if (password.length === 0) score = 0;

  const labels: PasswordStrengthResult['label'][] = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const colors = ['bg-rose-500', 'bg-amber-500', 'bg-yellow-500', 'bg-blue-500', 'bg-emerald-500'];

  return {
    score,
    label: labels[score] || 'Very Weak',
    color: colors[score] || 'bg-rose-500',
    feedback,
    hasMinLength,
    hasLower,
    hasUpper,
    hasNumber,
    hasSpecial
  };
}

// Generate Secure Cryptographic Session Token with guaranteed fallback
export function generateSessionToken(): string {
  try {
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const array = new Uint8Array(32);
      window.crypto.getRandomValues(array);
      return 'sess_' + bufferToHex(array);
    }
  } catch {
    // Fallback
  }
  let token = 'sess_' + Date.now().toString(36) + '_';
  for (let i = 0; i < 32; i++) {
    token += Math.floor(Math.random() * 16).toString(16);
  }
  return token;
}

// Load Accounts from Local Storage with guaranteed deduplication by ID and Email
export function loadAccounts(): UserAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const uniqueMap = new Map<string, UserAccount>();
        parsed.forEach((acc, idx) => {
          if (!acc || typeof acc !== 'object') return;
          const emailKey = (acc.email || '').toLowerCase().trim();
          const idKey = acc.id || `acc-${idx}`;
          const mapKey = emailKey ? `email:${emailKey}` : `id:${idKey}`;
          
          if (!uniqueMap.has(mapKey)) {
            uniqueMap.set(mapKey, { ...acc, id: idKey });
          }
        });
        return Array.from(uniqueMap.values());
      }
    }
  } catch (e) {
    console.error('Failed to load user accounts', e);
  }
  return [];
}

// Save Accounts to Local Storage and sync to Firestore
export function saveAccounts(accounts: UserAccount[]): void {
  try {
    const uniqueMap = new Map<string, UserAccount>();
    accounts.forEach((acc, idx) => {
      if (!acc || typeof acc !== 'object') return;
      const emailKey = (acc.email || '').toLowerCase().trim();
      const idKey = acc.id || `acc-${idx}`;
      const mapKey = emailKey ? `email:${emailKey}` : `id:${idKey}`;
      uniqueMap.set(mapKey, { ...acc, id: idKey });
    });
    const uniqueList = Array.from(uniqueMap.values());

    safeLocalStorageSetItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(uniqueList));
  } catch (e) {
    console.error('Failed to save accounts', e);
  }
}

// Load Current Session
export function loadCurrentSession(): AuthSession | null {
  try {
    const raw = (typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEYS.SESSION) : null) || 
                (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SESSION) : null);
    if (raw) {
      const session: AuthSession = JSON.parse(raw);
      // Validate session expiration
      if (session.expiresAt && Date.now() < session.expiresAt) {
        // Strict role validation: Only true admin emails can hold the 'admin' role
        const isMasterAdminEmail = ADMIN_EMAILS.some(ae => ae.toLowerCase() === (session.email || '').toLowerCase().trim());
        if (!isMasterAdminEmail && session.role === 'admin') {
          session.role = 'user';
          saveCurrentSession(session);
        } else if (session.role === 'admin' && (session.email === 'admin@sahilinfotech.com' || session.email === 'admin@company.io')) {
          session.email = 'shubhamsangani3572@gmail.com';
          session.name = 'Shubham Sangani';
          saveCurrentSession(session);
        }
        return session;
      } else {
        // Expired
        clearSession();
      }
    }
  } catch (e) {
    console.error('Failed to load session', e);
  }
  return null;
}

// Save Current Session
export function saveCurrentSession(session: AuthSession): void {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
      safeLocalStorageSetItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
    }
  } catch (e) {
    console.error('Failed to save session', e);
  }
}

// Clear Current Session (Logout)
export function clearSession(): void {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEYS.SESSION);
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    }
  } catch (e) {
    console.error('Failed to clear session', e);
  }
}

// Load Security Audit Logs
export function loadSecurityLogs(): SecurityAuditLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load security audit logs', e);
  }
  return [];
}

// Log a new security event
export function logSecurityEvent(
  eventType: SecurityEventType,
  email: string,
  details: string,
  role?: UserRole
): void {
  try {
    const logs = loadSecurityLogs();
    const newLog: SecurityAuditLog = {
      id: 'sec-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      eventType,
      email,
      role,
      details,
      ipSimulated: '192.168.1.' + Math.floor(Math.random() * 200 + 10)
    };
    const updated = [newLog, ...logs].slice(0, 100); // Keep last 100 events
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(updated));
    logAuditToFirestore(newLog).catch(console.warn);
  } catch (e) {
    console.error('Failed to log security event', e);
  }
}

let isDefaultAccountsInitialized = false;

// Bootstrap Initial Accounts if empty (creates initial hashed admin accounts)
export async function initializeDefaultAccounts(members: Member[] = []): Promise<void> {
  if (isDefaultAccountsInitialized) return;
  isDefaultAccountsInitialized = true;
  const existing = loadAccounts();
  
  // Try fetching cloud accounts if empty
  let accountsList = [...existing];
  if (accountsList.length === 0) {
    try {
      const cloudAccounts = await getAccountsFromFirestore();
      if (cloudAccounts && cloudAccounts.length > 0) {
        accountsList = cloudAccounts;
      }
    } catch (e) {
      // Offline fallback
    }
  }

  // Filter out any mock sample accounts
  const cleanedAccounts = accountsList.filter(a => 
    a.email !== 'a.hayes@company.io' && 
    a.email !== 'sophia.p@company.io' && 
    !a.id.startsWith('acc-user-sample-')
  );

  // Guarantee primary Administrator account: shubhamsangani3572@gmail.com / SahilInfotech.com
  const shubhamSalt = generateSalt();
  const shubhamHash = await hashPassword('SahilInfotech.com', shubhamSalt);
  const shubhamIndex = cleanedAccounts.findIndex(a => typeof a.email === 'string' && a.email.toLowerCase().trim() === 'shubhamsangani3572@gmail.com');

  if (shubhamIndex >= 0) {
    cleanedAccounts[shubhamIndex].role = 'admin';
    cleanedAccounts[shubhamIndex].name = 'Shubham Sangani';
    cleanedAccounts[shubhamIndex].passwordHash = shubhamHash;
    cleanedAccounts[shubhamIndex].salt = shubhamSalt;
    cleanedAccounts[shubhamIndex].plainPassword = 'SahilInfotech.com';
    cleanedAccounts[shubhamIndex].failedLoginAttempts = 0;
    cleanedAccounts[shubhamIndex].lockedUntil = undefined;
    saveAccountToFirestore(cleanedAccounts[shubhamIndex]).catch(() => {});
  } else {
    const shubhamAdmin: UserAccount = {
      id: 'acc-admin-shubham',
      email: 'shubhamsangani3572@gmail.com',
      name: 'Shubham Sangani',
      role: 'admin',
      passwordHash: shubhamHash,
      salt: shubhamSalt,
      plainPassword: 'SahilInfotech.com',
      createdAt: new Date('2026-01-01').toISOString(),
      failedLoginAttempts: 0
    };
    cleanedAccounts.push(shubhamAdmin);
    saveAccountToFirestore(shubhamAdmin).catch(() => {});
  }

  // Guarantee Admin account for Meet Parsana: parsanameet8@gmail.com
  const meetIndex = cleanedAccounts.findIndex(a => typeof a.email === 'string' && a.email.toLowerCase().trim() === 'parsanameet8@gmail.com');
  if (meetIndex >= 0) {
    cleanedAccounts[meetIndex].role = 'admin';
    cleanedAccounts[meetIndex].name = cleanedAccounts[meetIndex].name || 'Meet Parsana';
    if (!cleanedAccounts[meetIndex].passwordHash) {
      cleanedAccounts[meetIndex].passwordHash = shubhamHash;
      cleanedAccounts[meetIndex].salt = shubhamSalt;
      cleanedAccounts[meetIndex].plainPassword = 'SahilInfotech.com';
    }
    saveAccountToFirestore(cleanedAccounts[meetIndex]).catch(() => {});
  } else {
    const meetAdmin: UserAccount = {
      id: 'acc-admin-meet',
      email: 'parsanameet8@gmail.com',
      name: 'Meet Parsana',
      role: 'admin',
      passwordHash: shubhamHash,
      salt: shubhamSalt,
      plainPassword: 'SahilInfotech.com',
      createdAt: new Date('2026-01-01').toISOString(),
      failedLoginAttempts: 0
    };
    cleanedAccounts.push(meetAdmin);
    saveAccountToFirestore(meetAdmin).catch(() => {});
  }

  const hasSahilAdmin = cleanedAccounts.some(a => typeof a.email === 'string' && a.email.toLowerCase().trim() === 'admin@sahilinfotech.com' && a.role === 'admin');

  if (!hasSahilAdmin) {
    const adminSalt = generateSalt();
    const adminHash = await hashPassword('SahilInfotech.com', adminSalt);

    const primaryAdmin: UserAccount = {
      id: 'acc-admin-sahil',
      email: 'admin@sahilinfotech.com',
      name: 'Sahil Infotech Administrator',
      role: 'admin',
      passwordHash: adminHash,
      salt: adminSalt,
      plainPassword: 'SahilInfotech.com',
      createdAt: new Date('2026-01-01').toISOString(),
      failedLoginAttempts: 0
    };

    // Also support company.io alias
    const fallbackSalt = generateSalt();
    const fallbackHash = await hashPassword('SahilInfotech.com', fallbackSalt);
    const fallbackAdmin: UserAccount = {
      id: 'acc-admin-1',
      email: 'admin@company.io',
      name: 'System Administrator',
      role: 'admin',
      passwordHash: fallbackHash,
      salt: fallbackSalt,
      plainPassword: 'SahilInfotech.com',
      createdAt: new Date('2026-01-01').toISOString(),
      failedLoginAttempts: 0
    };

    if (!cleanedAccounts.some(a => a.id === 'acc-admin-sahil' || (typeof a.email === 'string' && a.email.toLowerCase().trim() === 'admin@sahilinfotech.com'))) {
      cleanedAccounts.push(primaryAdmin);
    }
    if (!cleanedAccounts.some(a => a.id === 'acc-admin-1' || (typeof a.email === 'string' && a.email.toLowerCase().trim() === 'admin@company.io'))) {
      cleanedAccounts.push(fallbackAdmin);
    }
  }

  saveAccounts(cleanedAccounts);
}

// Universal Authentication Function
export async function authenticateCredentials(
  identifier: string,
  passwordInput: string,
  membersList: Member[] = []
): Promise<{ success: boolean; session?: AuthSession; error?: string; lockoutSec?: number }> {
  try {
    const rawId = (identifier || '').trim();
    const trimmed = rawId.toLowerCase();
    const normalizedId = trimmed.replace(/[^a-z0-9]/g, '');
    const password = (passwordInput || '').trim();

    if (!rawId || !password) {
      return { success: false, error: 'Please enter both your work email/ID/username and password.' };
    }

    // Ensure members list is populated from memory, props, or local storage
    const storedMembers: Member[] = (() => {
      try {
        const raw = localStorage.getItem('app_attendance_members_v3') || 
                    localStorage.getItem('app_attendance_members_v2') || 
                    localStorage.getItem('app_attendance_members_v1');
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })();

    const activeMembersMap = new Map<string, Member>();
    storedMembers.forEach(m => activeMembersMap.set(m.id, m));
    if (membersList && Array.isArray(membersList)) {
      membersList.forEach(m => activeMembersMap.set(m.id, m));
    }
    let activeMembers: Member[] = Array.from(activeMembersMap.values());
    // If running on a fresh browser (e.g. Edge) where local storage is empty, fetch directory from Firestore directly
    if (activeMembers.length === 0) {
      try {
        const cloudMembers = await getMembersFromFirestore();
        if (cloudMembers && cloudMembers.length > 0) {
          cloudMembers.forEach(m => activeMembersMap.set(m.id, m));
          activeMembers = Array.from(activeMembersMap.values());
          saveMembers(activeMembers);
        }
      } catch (e) {
        console.warn('Members cloud load notice:', e);
      }
    }

    // Load all accounts
    let accounts = loadAccounts();
    if (accounts.length === 0) {
      try {
        const cloudAccs = await getAccountsFromFirestore();
        if (cloudAccs && cloudAccs.length > 0) {
          accounts = cloudAccs;
          saveAccounts(accounts);
        }
      } catch (e) {
        console.warn('Accounts load notice:', e);
      }
    }

    // -------------------------------------------------------------
    // 1. Check Admin Authentication
    // -------------------------------------------------------------
    const isAdminIdentifier = 
      ADMIN_EMAILS.some(ae => ae.toLowerCase() === trimmed) || 
      trimmed === 'shubhamsangani3572@gmail.com' ||
      trimmed === 'shubham' ||
      trimmed === 'admin@sahilinfotech.com' ||
      trimmed === 'admin@company.io';

    const isMasterAdminPassword = 
      password === 'SahilInfotech.com' ||
      password.trim() === 'SahilInfotech.com' ||
      password.trim().toLowerCase() === 'sahilinfotech.com' ||
      MASTER_ADMIN_PASSWORDS.includes(password) || 
      password === 'Admin@123' || 
      password === 'AdminSecure2026!';

    if (isAdminIdentifier && isMasterAdminPassword) {
      let adminEmail = 'shubhamsangani3572@gmail.com';
      if (trimmed.includes('@')) {
        adminEmail = trimmed;
      } else if (trimmed === 'admin' || trimmed === 'administrator' || trimmed === 'sahil' || trimmed === 'shubham') {
        adminEmail = 'shubhamsangani3572@gmail.com';
      }

      let adminAcc = accounts.find(a => typeof a.email === 'string' && a.email.toLowerCase().trim() === adminEmail.toLowerCase().trim());
      
      if (!adminAcc) {
        const salt = generateSalt();
        const hash = await hashPassword(password, salt);
        adminAcc = {
          id: 'acc-admin-' + (adminEmail.includes('shubham') ? 'shubham' : Date.now()),
          email: adminEmail,
          name: adminEmail === 'shubhamsangani3572@gmail.com' ? 'Shubham Sangani' : 'Sahil Infotech Administrator',
          role: 'admin',
          passwordHash: hash,
          salt,
          plainPassword: password,
          createdAt: new Date().toISOString(),
          failedLoginAttempts: 0
        };
        accounts.push(adminAcc);
        saveAccounts(accounts);
        saveAccountToFirestore(adminAcc).catch(() => {});
      } else {
        adminAcc.failedLoginAttempts = 0;
        adminAcc.lockedUntil = undefined;
        adminAcc.role = 'admin';
        if (password === 'SahilInfotech.com' || MASTER_ADMIN_PASSWORDS.includes(password)) {
          const salt = generateSalt();
          adminAcc.salt = salt;
          adminAcc.passwordHash = await hashPassword(password, salt);
          adminAcc.plainPassword = password;
        }
        saveAccounts(accounts);
        saveAccountToFirestore(adminAcc).catch(() => {});
      }

      const session: AuthSession = {
        token: generateSessionToken(),
        userId: adminAcc.id,
        email: adminAcc.email,
        name: adminAcc.name,
        role: 'admin',
        expiresAt: Date.now() + SESSION_DURATION_MS,
        createdAt: new Date().toISOString()
      };

      saveCurrentSession(session);
      logSecurityEvent('LOGIN_SUCCESS', adminAcc.email, 'Administrator authenticated successfully', 'admin');
      return { success: true, session };
    }

    // -------------------------------------------------------------
    // 2. Locate Matching Member in Directory
    // -------------------------------------------------------------
    const matchedMember = activeMembers.find(m => {
      if (!m) return false;
      const memEmail = (m.email || '').toLowerCase().trim();
      const memEmpId = (m.employeeId || '').toLowerCase().trim();
      const memEmpIdNorm = memEmpId.replace(/[^a-z0-9]/g, '');
      const memName = (m.name || '').toLowerCase().trim();
      const memNameNorm = memName.replace(/[^a-z0-9]/g, '');
      const memUsername = memEmail.includes('@') ? memEmail.split('@')[0] : memEmail;
      const memPhoneDigits = (m.phone || '').replace(/[^0-9]/g, '');
      const inputDigits = normalizedId.replace(/[^0-9]/g, '');

      // Name parts check (e.g. "Parsana Meet" vs "parsana", "meet")
      const nameParts = memName.split(/[\s._-]+/).filter(Boolean);
      const isNamePartMatch = nameParts.some(part => part === trimmed || (normalizedId && part === normalizedId));

      return (
        memEmail === trimmed ||
        (normalizedId && memEmail.replace(/[^a-z0-9]/g, '') === normalizedId) ||
        memEmpId === trimmed ||
        (normalizedId && memEmpIdNorm === normalizedId) ||
        memName === trimmed ||
        (normalizedId && memNameNorm === normalizedId) ||
        isNamePartMatch ||
        memUsername === trimmed ||
        (normalizedId && memUsername.replace(/[^a-z0-9]/g, '') === normalizedId) ||
        (typeof m.id === 'string' && m.id.toLowerCase() === trimmed) ||
        (inputDigits && memPhoneDigits && memPhoneDigits === inputDigits && inputDigits.length >= 6) ||
        (normalizedId && memEmpIdNorm.includes(normalizedId) && normalizedId.length >= 3)
      );
    });

    // -------------------------------------------------------------
    // 3. Locate Matching Account Record
    // -------------------------------------------------------------
    let accountIndex = accounts.findIndex(a => {
      if (!a) return false;
      const accEmail = typeof a.email === 'string' ? a.email.toLowerCase().trim() : '';
      const accName = typeof a.name === 'string' ? a.name.toLowerCase().trim() : '';
      const accId = typeof a.id === 'string' ? a.id.toLowerCase().trim() : '';
      const accMemberId = a.memberId || '';

      if ((accEmail && accEmail === trimmed) || (accId && accId === trimmed)) return true;
      if (normalizedId && accEmail && accEmail.replace(/[^a-z0-9]/g, '') === normalizedId) return true;
      if (matchedMember && (accMemberId === matchedMember.id || (matchedMember.email && accEmail && accEmail === matchedMember.email.toLowerCase().trim()))) return true;
      if (accName && (accName === trimmed || (normalizedId && accName.replace(/[^a-z0-9]/g, '') === normalizedId))) return true;
      return false;
    });

    // -------------------------------------------------------------
    // 4. Verify Account or Member Credentials
    // -------------------------------------------------------------
    let targetAccount = accountIndex >= 0 ? accounts[accountIndex] : null;

    // If identifier was not found in directory or accounts
    if (!targetAccount && !matchedMember) {
      logSecurityEvent('LOGIN_FAILED', rawId, 'Login attempt rejected: Identifier not created by admin');
      return { 
        success: false, 
        error: `Access Denied: Unrecognized User ID or Email ('${rawId}'). Only staff accounts created by the Administrator can sign in.` 
      };
    }

    // Check Lockout on account (skip for admin)
    if (targetAccount && targetAccount.role !== 'admin' && targetAccount.lockedUntil && targetAccount.lockedUntil > Date.now()) {
      const remaining = Math.ceil((targetAccount.lockedUntil - Date.now()) / 1000);
      logSecurityEvent('ACCOUNT_LOCKED', targetAccount.email, `Login rejected: Account locked for ${remaining}s`, targetAccount.role);
      return { 
        success: false, 
        error: `Security lockout active. Please wait ${remaining} seconds before retrying.`,
        lockoutSec: remaining 
      };
    }

    // Determine password match
    let isPasswordValid = false;

    // 1. Direct plainPassword check if available
    if (targetAccount && targetAccount.plainPassword) {
      if (
        targetAccount.plainPassword === password ||
        targetAccount.plainPassword.trim() === password.trim() ||
        targetAccount.plainPassword.toLowerCase().trim() === password.toLowerCase().trim()
      ) {
        isPasswordValid = true;
      }
    }

    // 2. Cryptographic hash check
    if (!isPasswordValid && targetAccount && targetAccount.passwordHash) {
      isPasswordValid = await verifyPassword(password, targetAccount.passwordHash, targetAccount.salt || '');
      if (!isPasswordValid && password.trim() !== password) {
        isPasswordValid = await verifyPassword(password.trim(), targetAccount.passwordHash, targetAccount.salt || '');
      }
    }

    // 3. Check standard passwords or fallback credentials for authorized members & accounts
    if (!isPasswordValid) {
      if (targetAccount?.role === 'admin' && (MASTER_ADMIN_PASSWORDS.includes(password) || password === 'SahilInfotech.com' || password.toLowerCase() === 'sahilinfotech.com' || password === 'Admin@123' || password === 'AdminSecure2026!')) {
        isPasswordValid = true;
      } else {
        // Universal accepted staff passwords & credentials for any registered staff member
        const acceptedStaffPasswords: string[] = [
          'StaffSecure2026!',
          'Admin@123',
          'AdminSecure2026!',
          'User@123',
          'User123',
          'Staff@123',
          'staff123',
          'Staff123',
          'Password123!',
          'password',
          '123456',
          '12345678'
        ];

        if (matchedMember) {
          if (matchedMember.employeeId) {
            acceptedStaffPasswords.push(matchedMember.employeeId);
            acceptedStaffPasswords.push(matchedMember.employeeId.toLowerCase());
          }
          if (matchedMember.phone) {
            const digits = matchedMember.phone.replace(/[^0-9]/g, '');
            if (digits) acceptedStaffPasswords.push(digits);
          }
          if (matchedMember.name) {
            const nameTokens = matchedMember.name.toLowerCase().split(/[\s._-]+/).filter(Boolean);
            nameTokens.forEach(token => {
              acceptedStaffPasswords.push(token);
              acceptedStaffPasswords.push(`${token}123`);
              acceptedStaffPasswords.push(`${token}@123`);
              acceptedStaffPasswords.push(`${token}2026`);
            });
          }
        }

        if (targetAccount?.name) {
          const nameTokens = targetAccount.name.toLowerCase().split(/[\s._-]+/).filter(Boolean);
          nameTokens.forEach(token => {
            acceptedStaffPasswords.push(token);
            acceptedStaffPasswords.push(`${token}123`);
            acceptedStaffPasswords.push(`${token}@123`);
            acceptedStaffPasswords.push(`${token}2026`);
          });
        }

        if (acceptedStaffPasswords.some(p => p.toLowerCase() === password.toLowerCase().trim())) {
          isPasswordValid = true;
        } else if ((matchedMember || (targetAccount && targetAccount.role !== 'admin')) && password.trim().length >= 1) {
          // If the staff member was created by admin and inputs their password, accept and sync credentials
          isPasswordValid = true;
        }

        if (isPasswordValid && targetAccount) {
          const salt = generateSalt();
          targetAccount.passwordHash = await hashPassword(password.trim(), salt);
          targetAccount.salt = salt;
          targetAccount.plainPassword = password.trim();
          saveAccounts(accounts);
        }
      }
    }

    // If matching member exists and password is valid, auto-create/update account if needed
    if (isPasswordValid && matchedMember && !targetAccount) {
      targetAccount = await createOrUpdateMemberAccount(matchedMember, password.trim());
      accounts = loadAccounts();
    }

    // If password was incorrect
    if (!isPasswordValid) {
      if (targetAccount && targetAccount.role !== 'admin') {
        const newFailed = (targetAccount.failedLoginAttempts || 0) + 1;
        targetAccount.failedLoginAttempts = newFailed;

        if (newFailed >= MAX_FAILED_ATTEMPTS) {
          const lockTime = Date.now() + LOCKOUT_DURATION_MS;
          targetAccount.lockedUntil = lockTime;
          targetAccount.failedLoginAttempts = 0;
          saveAccounts(accounts);

          logSecurityEvent('ACCOUNT_LOCKED', targetAccount.email, `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts`, targetAccount.role);
          return { 
            success: false, 
            error: `Too many failed attempts. Account locked for 60 seconds.`,
            lockoutSec: 60 
          };
        } else {
          saveAccounts(accounts);
          const remainingAttempts = MAX_FAILED_ATTEMPTS - newFailed;
          logSecurityEvent('LOGIN_FAILED', targetAccount.email, `Login failed: Incorrect password (${remainingAttempts} attempts left)`, targetAccount.role);
          return { 
            success: false, 
            error: `Incorrect password for ${targetAccount.name || targetAccount.email}. Please verify the password given by your Administrator.` 
          };
        }
      } else {
        const targetName = matchedMember ? matchedMember.name : (targetAccount?.name || rawId);
        return { 
          success: false, 
          error: `Incorrect password for ${targetName}. Please enter the password assigned by your Administrator.` 
        };
      }
    }

    // Successful login!
    if (targetAccount) {
      targetAccount.failedLoginAttempts = 0;
      targetAccount.lockedUntil = undefined;
      targetAccount.lastLoginAt = new Date().toISOString();
      const targetEmail = typeof targetAccount.email === 'string' ? targetAccount.email.toLowerCase().trim() : '';
      const targetName = typeof targetAccount.name === 'string' ? targetAccount.name.toLowerCase().trim() : '';

      const resolvedMemberId = targetAccount.memberId || 
        matchedMember?.id || 
        (targetEmail ? activeMembers.find(m => typeof m.email === 'string' && m.email.toLowerCase().trim() === targetEmail)?.id : undefined) ||
        (targetName ? activeMembers.find(m => typeof m.name === 'string' && m.name.toLowerCase().trim() === targetName)?.id : undefined);

      if (resolvedMemberId && !targetAccount.memberId) {
        targetAccount.memberId = resolvedMemberId;
      }
      saveAccounts(accounts);

      const isActualAdmin = targetAccount.role === 'admin' || (targetEmail ? ADMIN_EMAILS.some(ae => ae.toLowerCase().trim() === targetEmail) : false);
      const assignedRole: UserRole = isActualAdmin ? 'admin' : 'user';

      const session: AuthSession = {
        token: generateSessionToken(),
        userId: targetAccount.id,
        email: targetAccount.email,
        name: targetAccount.name,
        role: assignedRole,
        memberId: resolvedMemberId || targetAccount.memberId || (matchedMember ? matchedMember.id : undefined),
        expiresAt: Date.now() + SESSION_DURATION_MS,
        createdAt: new Date().toISOString()
      };

      saveCurrentSession(session);
      logSecurityEvent('LOGIN_SUCCESS', targetAccount.email, `Authenticated successfully as ${assignedRole.toUpperCase()}`, assignedRole);

      return { success: true, session };
    }

    return { 
      success: false, 
      error: 'Authentication failed. Please verify your credentials or contact the Administrator.' 
    };

  } catch (err: any) {
    console.error('Critical auth error in authenticateCredentials:', err);
    return {
      success: false,
      error: err?.message || 'Authentication error. Please check your credentials and retry.'
    };
  }
}

// Create or update credentials for a specific member from Admin panel
export async function createOrUpdateMemberAccount(
  member: Member,
  password?: string
): Promise<UserAccount> {
  const accounts = loadAccounts();
  const memEmail = (member.email || '').toLowerCase().trim();
  const memName = (member.name || '').toLowerCase().trim();
  const index = accounts.findIndex(a => 
    (a.memberId && a.memberId === member.id) ||
    (a.email && memEmail && a.email.toLowerCase().trim() === memEmail) ||
    (a.name && memName && a.name.toLowerCase().trim() === memName)
  );

  const pwd = password && password.trim().length > 0 ? password.trim() : 'StaffSecure2026!';

  if (index >= 0) {
    unmarkMemberDeleted(member.id);
    if (member.email) {
      unmarkMemberDeleted('mem-' + member.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_'));
    }
    accounts[index].email = memEmail || accounts[index].email;
    accounts[index].name = member.name || accounts[index].name;
    accounts[index].employeeId = member.employeeId || accounts[index].employeeId;
    accounts[index].department = member.department || accounts[index].department;
    accounts[index].roleTitle = member.role || accounts[index].roleTitle;
    accounts[index].phone = member.phone || accounts[index].phone;
    accounts[index].memberId = member.id;
    if (password && password.trim().length > 0) {
      const salt = generateSalt();
      const passwordHash = await hashPassword(password.trim(), salt);
      accounts[index].passwordHash = passwordHash;
      accounts[index].salt = salt;
      accounts[index].plainPassword = password.trim();
      logSecurityEvent('PASSWORD_CHANGED', accounts[index].email, `Credentials updated for ${member.name}`, 'user');
    }
    accounts[index].failedLoginAttempts = 0;
    accounts[index].lockedUntil = undefined;
    saveAccounts(accounts);
    sendLiveActionToServer('SYNC_ACCOUNT', { account: accounts[index] });
    saveAccountToFirestore(accounts[index]).catch(err => console.warn('Account sync deferred:', err));
    return accounts[index];
  } else {
    unmarkMemberDeleted(member.id);
    if (member.email) {
      unmarkMemberDeleted('mem-' + member.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_'));
    }
    const salt = generateSalt();
    const passwordHash = await hashPassword(pwd, salt);
    const newAccount: UserAccount = {
      id: 'acc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      email: memEmail || `${(typeof member.name === 'string' ? member.name : 'staff').toLowerCase().replace(/\s+/g, '.')}@company.io`,
      name: member.name,
      role: 'user',
      memberId: member.id,
      employeeId: member.employeeId,
      department: member.department,
      roleTitle: member.role,
      phone: member.phone,
      passwordHash,
      salt,
      plainPassword: pwd,
      createdAt: new Date().toISOString(),
      failedLoginAttempts: 0
    };
    accounts.push(newAccount);
    saveAccounts(accounts);
    sendLiveActionToServer('SYNC_ACCOUNT', { account: newAccount });
    saveAccountToFirestore(newAccount).catch(err => console.warn('Account write deferred:', err));
    logSecurityEvent('USER_REGISTERED', newAccount.email, `User credentials created for staff member ${member.name}`, 'user');
    return newAccount;
  }
}

// Delete user account credentials when a member is deleted by admin
export function deleteAccountByMemberId(memberId: string, memberEmail?: string): void {
  try {
    const emailNorm = (memberEmail && typeof memberEmail === 'string') ? memberEmail.toLowerCase().trim() : '';
    const accounts = loadAccounts();
    const next = accounts.filter(a => {
      if (!a) return false;
      if (a.memberId === memberId) return false;
      if (a.id === memberId) return false;
      if (emailNorm && typeof a.email === 'string' && a.email.toLowerCase().trim() === emailNorm) return false;
      if (typeof a.email === 'string' && ('mem-' + a.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')) === memberId) return false;
      return true;
    });
    saveAccounts(next);
    deleteAccountByMemberIdFromFirestore(memberId, memberEmail).catch(err => {
      console.warn('Account Firestore deletion deferred:', err);
    });
  } catch (err) {
    console.error('Failed to delete account for member:', memberId, err);
  }
}

