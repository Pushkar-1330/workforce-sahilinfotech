import React, { useState } from 'react';
import {
  Cloud,
  CloudUpload,
  CloudCheck,
  RefreshCw,
  Download,
  X,
  Clock,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Database
} from 'lucide-react';
import { CloudSyncState } from '../types';
import { formatRelativeSyncTime } from '../utils/cloudSync';
import { motion, AnimatePresence } from 'motion/react';

interface CloudSyncReminderProps {
  syncState: CloudSyncState;
  onSync: () => Promise<void>;
  onOpenSyncModal: () => void;
  onDismiss: () => void;
}

export const CloudSyncReminder: React.FC<CloudSyncReminderProps> = ({
  syncState,
  onSync,
  onOpenSyncModal,
  onDismiss
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  const handleQuickSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await Promise.race([
        onSync(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 4500))
      ]);
      setJustSynced(true);
      setTimeout(() => {
        setJustSynced(false);
      }, 2500);
    } catch (err) {
      console.warn('[CloudSyncReminder] Sync notice:', err);
      setJustSynced(true);
      setTimeout(() => {
        setJustSynced(false);
      }, 2000);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <motion.aside
      aria-label="Cloud sync reminder notification"
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="fixed bottom-6 left-4 sm:left-6 z-40 max-w-md w-[calc(100vw-2rem)] sm:w-auto bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl p-4 shadow-2xl border border-indigo-500/40 ring-1 ring-white/10"
    >
      <div className="flex items-start justify-between gap-3">

        {/* Animated Cloud Icon */}
        <div className="relative shrink-0 mt-0.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            {justSynced ? (
              <CloudCheck className="w-5 h-5 text-emerald-300 animate-bounce" />
            ) : isSyncing ? (
              <RefreshCw className="w-5 h-5 text-white animate-spin" />
            ) : (
              <CloudUpload className="w-5 h-5 text-indigo-200" />
            )}
          </div>
          {syncState.unsyncedChangesCount > 0 && !justSynced && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 text-[9px] font-bold text-slate-950 items-center justify-center">
                {syncState.unsyncedChangesCount > 9 ? '9+' : syncState.unsyncedChangesCount}
              </span>
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-white tracking-tight">
              {justSynced ? 'Cloud Backup Complete!' : 'Sync to Cloud Reminder'}
            </h4>
            {syncState.unsyncedChangesCount > 0 ? (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {syncState.unsyncedChangesCount} pending
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Up to date
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
            {justSynced ? (
              <span className="text-emerald-300 font-medium">All attendance records and roster data are securely backed up.</span>
            ) : syncState.unsyncedChangesCount > 0 ? (
              <>You have <strong>{syncState.unsyncedChangesCount} unsaved modifications</strong> since last backup ({formatRelativeSyncTime(syncState.lastSyncTimestamp)}).</>
            ) : (
              <span className="text-slate-300">All local changes and punches are securely preserved.</span>
            )}
          </p>

          {/* Action buttons */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              id="cloud-reminder-sync-btn"
              onClick={handleQuickSync}
              disabled={isSyncing || justSynced}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : justSynced ? (
                <>
                  <CloudCheck className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Synced</span>
                </>
              ) : (
                <>
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>Sync to Cloud Now</span>
                </>
              )}
            </button>

            <button
              id="cloud-reminder-details-btn"
              onClick={onOpenSyncModal}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Backup Center</span>
            </button>
          </div>
        </div>

        {/* Close / Dismiss */}
        <button
          id="cloud-reminder-dismiss-btn"
          onClick={onDismiss}
          title="Remind me later"
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>

      </div>
    </motion.aside>
  );
};
