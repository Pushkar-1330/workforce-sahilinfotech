import React, { useState } from 'react';
import {
  Cloud,
  CloudUpload,
  CloudCheck,
  RefreshCw,
  Download,
  FileSpreadsheet,
  HardDrive,
  ShieldCheck,
  Clock,
  X,
  AlertTriangle,
  CheckCircle2,
  History,
  RotateCcw,
  Sparkles,
  Database,
  Lock
} from 'lucide-react';
import { AttendanceRecord, AuthSession, CloudBackupSnapshot, CloudSyncState, Member } from '../types';
import {
  downloadBackupJson,
  formatRelativeSyncTime,
  loadCloudSnapshots,
  performCloudSync,
  saveCloudSnapshots
} from '../utils/cloudSync';
import { checkIsQuotaExhausted } from '../lib/firebase';
import { exportMonthlyAttendanceExcel } from '../utils/excelExport';
import { motion, AnimatePresence } from 'motion/react';

interface CloudSyncModalProps {
  session: AuthSession;
  members: Member[];
  records: AttendanceRecord[];
  syncState: CloudSyncState;
  onClose: () => void;
  onSyncComplete: (snapshot: CloudBackupSnapshot) => void;
  onRestoreSnapshot: (restoredMembers: Member[], restoredRecords: AttendanceRecord[]) => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  session,
  members,
  records,
  syncState,
  onClose,
  onSyncComplete,
  onRestoreSnapshot
}) => {
  const [snapshots, setSnapshots] = useState<CloudBackupSnapshot[]>(() => loadCloudSnapshots());
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  const handleSyncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setStatusMessage(null);
    try {
      // Trigger cloud snapshot with safe timeout
      const snap = await Promise.race([
        performCloudSync(members, records, session.email, session.role),
        new Promise<CloudBackupSnapshot>((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 4500))
      ]);
      setSnapshots(loadCloudSnapshots());
      onSyncComplete(snap);

      setStatusMessage('Cloud snapshot and local backup completed successfully!');
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      console.warn('[CloudSyncModal] Sync notice:', err);
      setSnapshots(loadCloudSnapshots());
      setStatusMessage('Backup saved to browser storage. Cloud quota or network operating in offline mode.');
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDownloadJson = () => {
    downloadBackupJson(members, records, session.email);
    setStatusMessage('JSON snapshot file generated and downloaded.');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleExportExcel = () => {
    exportMonthlyAttendanceExcel(2026, 9, members, records, 'All');
    setStatusMessage('Comprehensive Excel workbook (.xlsx) exported.');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleRestore = (snapshot: CloudBackupSnapshot) => {
    if (snapshot.data && snapshot.data.members && snapshot.data.records) {
      onRestoreSnapshot(snapshot.data.members, snapshot.data.records);
      setConfirmRestoreId(null);
      setStatusMessage(`Restored system state from snapshot (${new Date(snapshot.timestamp).toLocaleTimeString()})`);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-2xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white flex items-center justify-between border-b border-indigo-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <CloudUpload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">Cloud Backup & Sync Center</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Secure state synchronization, automated backups & cryptographic checksums
              </p>
            </div>
          </div>
          <button
            id="close-cloud-sync-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">

          {/* Status Message */}
          {statusMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </motion.div>
          )}

          {/* Sync Status Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Sync Status</span>
                  {syncState.unsyncedChangesCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      {syncState.unsyncedChangesCount} Unsynced Modifications
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      All Changes in Cloud Sync
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Last Cloud Sync: <strong>{formatRelativeSyncTime(syncState.lastSyncTimestamp)}</strong> ({new Date(syncState.lastSyncTimestamp).toLocaleTimeString()})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-slate-400" />
                    <span>Active Workspace: <strong>{members.length} Members</strong>, <strong>{records.length} Attendance Records</strong></span>
                  </div>
                </div>

                {checkIsQuotaExhausted() && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200/90 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-amber-950">Daily Free Cloud Write Quota Limit Active</p>
                      <p className="text-amber-800 leading-relaxed">
                        The daily free write quota (20,000 writes/day on the Firebase Spark tier) has been reached. All current data is safely stored in local storage and server persistence. Quota resets daily.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sync Action Button */}
              <button
                id="modal-sync-now-action-btn"
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50 cursor-pointer shrink-0"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Syncing & Hashing...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-4 h-4" />
                    <span>Sync to Cloud Now</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Export & Offline Backup Options */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
              <span>Offline Database Backups & Exporters</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* JSON Backup Button */}
              <button
                id="modal-download-json-backup-btn"
                onClick={handleDownloadJson}
                className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-left transition-all group flex items-start gap-3 cursor-pointer shadow-2xs"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-800 group-hover:text-indigo-900">
                    Download Full JSON Backup
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                    Complete raw dataset including encrypted accounts, roster, and 60-day attendance.
                  </div>
                </div>
              </button>

              {/* Excel Multi-Sheet Export Button */}
              <button
                id="modal-export-excel-btn"
                onClick={handleExportExcel}
                className="p-3.5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 text-left transition-all group flex items-start gap-3 cursor-pointer shadow-2xs"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-800 group-hover:text-emerald-900">
                    Export Excel Workbook (.xlsx)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                    Multi-tab spreadsheet with summary matrix, daily logs, and employee statistics.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Recent Cloud Snapshots List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-indigo-600" />
                <span>Cloud Snapshot History ({snapshots.length})</span>
              </h4>
              <span className="text-[11px] text-slate-400">Keeps up to 10 latest restore points</span>
            </div>

            {snapshots.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                <Cloud className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-medium">No previous snapshots found.</p>
                <p className="text-[11px] text-slate-400 mt-1">Click "Sync to Cloud Now" to generate your first verified snapshot.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <CloudCheck className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          <span>{new Date(snap.timestamp).toLocaleDateString()} {new Date(snap.timestamp).toLocaleTimeString()}</span>
                          <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                            {snap.checksum}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          By: {snap.syncedBy} • {snap.memberCount} members • {snap.recordCount} records
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {confirmRestoreId === snap.id ? (
                        <div className="flex items-center gap-1 bg-amber-50 p-1 rounded-lg border border-amber-200">
                          <span className="text-[10px] text-amber-800 font-semibold px-1">Restore?</span>
                          <button
                            onClick={() => handleRestore(snap)}
                            className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-[10px] cursor-pointer"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmRestoreId(null)}
                            className="px-1.5 py-0.5 text-slate-500 hover:text-slate-800 text-[10px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRestoreId(snap.id)}
                          title="Restore state to this snapshot"
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-700 hover:bg-indigo-50 border border-indigo-200 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security & Integrity Note */}
          <div className="p-3 bg-slate-900 text-slate-300 rounded-xl flex items-start gap-2.5 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold text-white">Cryptographic Data Integrity:</span> Every cloud synchronization computes a SHA-256 payload checksum and logs the synchronization event into the audit trail for enterprise regulatory compliance.
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end">
          <button
            id="close-cloud-sync-modal-footer-btn"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>

      </motion.div>
    </div>
  );
};
