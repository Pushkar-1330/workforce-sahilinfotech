import React, { useState, useMemo } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  X, 
  UserX, 
  Lock, 
  KeyRound, 
  FileSpreadsheet, 
  AlertTriangle, 
  CheckCircle2, 
  RotateCcw,
  Users,
  Search,
  Filter
} from 'lucide-react';
import { SecurityAuditLog, SecurityEventType, UserAccount } from '../types';
import { loadAccounts, loadSecurityLogs, saveAccounts } from '../utils/cryptoAuth';

interface SecurityAuditModalProps {
  onClose: () => void;
}

export const SecurityAuditModal: React.FC<SecurityAuditModalProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<SecurityAuditLog[]>(() => loadSecurityLogs());
  const [accounts, setAccounts] = useState<UserAccount[]>(() => loadAccounts());
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Unlock an account if locked out
  const handleUnlockAccount = (accId: string) => {
    const updated = accounts.map(a => {
      if (a.id === accId) {
        return { ...a, lockedUntil: undefined, failedLoginAttempts: 0 };
      }
      return a;
    });
    setAccounts(updated);
    saveAccounts(updated);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesFilter = selectedFilter === 'ALL' || log.eventType === selectedFilter;
      const matchesSearch = 
        log.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.eventType.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [logs, selectedFilter, searchQuery]);

  const getEventBadge = (type: SecurityEventType) => {
    switch (type) {
      case 'LOGIN_SUCCESS':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">LOGIN SUCCESS</span>;
      case 'LOGIN_FAILED':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">LOGIN FAILED</span>;
      case 'ACCOUNT_LOCKED':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">ACCOUNT LOCKED</span>;
      case 'USER_REGISTERED':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">REGISTERED</span>;
      case 'PASSWORD_CHANGED':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">PASSWORD RESET</span>;
      case 'ATTENDANCE_EXPORT':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">DATA EXPORT</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-800">{type}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Security Center & Audit Log</h2>
              <p className="text-xs text-slate-400">Real-time authentication monitoring, crypt-tokens & access logs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Summary Cards */}
        <div className="p-6 pb-2 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 border-b border-slate-200">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-500">Registered Accounts</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">{accounts.length}</span>
              <span className="text-xs text-indigo-600 font-semibold">
                {accounts.filter(a => a.role === 'admin').length} Admins, {accounts.filter(a => a.role === 'user').length} Staff
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-500">Failed Attempts Tracked</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-rose-600">
                {logs.filter(l => l.eventType === 'LOGIN_FAILED').length}
              </span>
              <span className="text-xs text-slate-500">Audit events</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-500">Locked Accounts</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-amber-600">
                {accounts.filter(a => a.lockedUntil && a.lockedUntil > Date.now()).length}
              </span>
              <span className="text-xs text-emerald-600 font-semibold">Brute-force shield active</span>
            </div>
          </div>
        </div>

        {/* Registered Users Quick Table with Unlock Option */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Registered Account Directory
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {accounts.map((acc, index) => {
              const isLocked = acc.lockedUntil && acc.lockedUntil > Date.now();
              const uniqueKey = acc.id ? `${acc.id}-${acc.email || index}` : `acc-${index}`;
              return (
                <div key={uniqueKey} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <span>{acc.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        acc.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {acc.role}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate max-w-[170px]">{acc.email}</div>
                  </div>

                  {isLocked ? (
                    <button
                      onClick={() => handleUnlockAccount(acc.id)}
                      className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Unlock
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Active
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Audit Filter & Search */}
        <div className="p-4 px-6 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-1 max-w-sm bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search audit trail by email, action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-hidden w-full text-slate-900"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            {['ALL', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'USER_REGISTERED', 'ACCOUNT_LOCKED'].map((type) => (
              <button
                key={type}
                onClick={() => setSelectedFilter(type)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors shrink-0 ${
                  selectedFilter === type 
                    ? 'bg-slate-900 text-white' 
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Audit Trail List */}
        <div className="flex-1 overflow-y-auto p-6">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Event Type</th>
                <th className="py-2.5 px-3">User / Email</th>
                <th className="py-2.5 px-3">Details & Parameters</th>
                <th className="py-2.5 px-3">Simulated IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log, index) => (
                  <tr key={log.id ? `${log.id}-${index}` : `log-${index}`} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3">
                      {getEventBadge(log.eventType)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {log.email}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {log.details}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                      {log.ipSimulated || '127.0.0.1'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                    No security events matching current criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Logs are retained client-side and verified via SHA-256 integrity hash</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition-colors cursor-pointer"
          >
            Close Security Center
          </button>
        </div>

      </div>
    </div>
  );
};
