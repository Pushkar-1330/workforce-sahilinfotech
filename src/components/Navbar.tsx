import React from 'react';
import { 
  LayoutDashboard, 
  CalendarCheck2, 
  Users, 
  FileSpreadsheet, 
  RotateCcw,
  ShieldAlert,
  Settings,
  LogOut,
  UserCheck,
  CloudUpload,
  CloudCheck,
  RefreshCw,
  Database,
  CalendarOff,
  Menu,
  Volume2,
  VolumeX
} from 'lucide-react';
import { AuthSession, CloudSyncState, ViewTab } from '../types';
import { formatRelativeSyncTime } from '../utils/cloudSync';
import { isAudioEnabled } from '../utils/audioAlerts';
import { motion } from 'motion/react';
import { LiveHeaderClock } from './LiveHeaderClock';

interface NavbarProps {
  currentTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  onResetData: () => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  totalMembers: number;
  session: AuthSession;
  syncState: CloudSyncState;
  onOpenCloudSync: () => void;
  onOpenDatabaseStudio?: () => void;
  onLogout: () => void;
  onOpenSecurityAudit: () => void;
  onOpenAccountSettings: () => void;
  onOpenSoundSettings?: () => void;
  isLiveConnected?: boolean;
  pendingLeavesCount?: number;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isQuotaExhausted?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  onResetData,
  selectedDate,
  onDateChange,
  totalMembers,
  session,
  syncState,
  onOpenCloudSync,
  onOpenDatabaseStudio,
  onLogout,
  onOpenSecurityAudit,
  onOpenAccountSettings,
  onOpenSoundSettings,
  isLiveConnected = true,
  pendingLeavesCount = 0,
  isSidebarOpen = false,
  onToggleSidebar,
  isQuotaExhausted = false,
}) => {
  const tabs: { id: ViewTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'dashboard', label: 'Analytics Dashboard', icon: LayoutDashboard },
    { id: 'attendance', label: 'Daily Attendance', icon: CalendarCheck2 },
    { id: 'leaves', label: 'Leave Applications', icon: CalendarOff, badge: pendingLeavesCount },
    { id: 'members', label: 'Member Admin', icon: Users },
    { id: 'reports', label: 'Excel & Reports', icon: FileSpreadsheet },
  ];

  const currentTabObj = tabs.find(t => t.id === currentTab);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="w-full px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Left: Mobile Sidebar Toggle (Admin only) & Logo & Brand */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {session.role === 'admin' && onToggleSidebar && (
              <button
                type="button"
                id="admin-sidebar-toggle-btn"
                onClick={onToggleSidebar}
                className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Toggle Admin Sidebar"
                aria-label="Toggle Navigation Sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 ring-2 ring-indigo-500/30 shrink-0">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-base sm:text-lg tracking-tight font-sans">
                  Sahil Infotech <span className="text-indigo-600 font-semibold text-sm sm:text-base">Workforce</span>
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  session.role === 'admin' 
                    ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                    : 'bg-blue-100 text-blue-700 border border-blue-200'
                }`}>
                  {session.role}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block font-medium">
                Workforce Attendance & Analytics
              </p>
            </div>
          </div>

          {/* Center: Active Module Breadcrumb in Top Bar for Admin */}
          {session.role === 'admin' && (
            <div className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
              <span className="text-slate-400 font-medium">Active Module:</span>
              <span className="font-bold text-indigo-700 flex items-center gap-1.5">
                {currentTabObj && (
                  <>
                    <currentTabObj.icon className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{currentTabObj.label}</span>
                  </>
                )}
              </span>
            </div>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            
            {/* Real-time Digital Timer Watch Clock (Admin and User sides) */}
            <LiveHeaderClock variant="badge" showSeconds={true} showDate={true} />

            {/* Live Real-time Sync Status Indicator */}
            <div 
              id="navbar-live-status-pill"
              title={isLiveConnected ? "Live Realtime Active: Instant synchronization enabled for admin edits & employee attendance punches across all devices" : "Local Storage Active: Offline data saved locally and will synchronize when online"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                isLiveConnected
                  ? "bg-emerald-50/90 text-emerald-800 border-emerald-200 shadow-2xs"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              <span className="relative flex h-2 w-2">
                {isLiveConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isLiveConnected ? "bg-emerald-500" : "bg-slate-400"}`}></span>
              </span>
              <span className="hidden xl:inline">{isLiveConnected ? "Live Sync Active" : "Local Mode"}</span>
              <span className="xl:hidden">{isLiveConnected ? "Live" : "Local"}</span>
            </div>

            {/* Quick date jump (Admin) */}
            {session.role === 'admin' && (
              <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600">
                <span className="text-slate-400 font-medium">Focus Date:</span>
                <input
                  type="date"
                  id="quick-nav-date-picker"
                  value={selectedDate}
                  onChange={(e) => e.target.value && onDateChange(e.target.value)}
                  className="bg-transparent font-medium text-slate-800 border-none outline-hidden cursor-pointer focus:ring-0 p-0 text-xs"
                />
              </div>
            )}

            {/* Real Cloud Database & Manual Entry Studio Button (Admin Only) */}
            {session.role === 'admin' && onOpenDatabaseStudio && (
              <button
                id="real-database-studio-btn"
                onClick={onOpenDatabaseStudio}
                title="Real Cloud Firestore Database & Manual Data Entry Studio"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 hover:bg-indigo-50 bg-indigo-50/70 border border-indigo-200 transition-all shadow-2xs cursor-pointer"
              >
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Real Database Studio</span>
                <span className="sm:hidden">DB</span>
              </button>
            )}

            {/* Security Audit Log Button (Admin Only) */}
            {session.role === 'admin' && (
              <button
                id="security-audit-logs-btn"
                onClick={onOpenSecurityAudit}
                title="Security Center & Real-time Audit Logs"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-purple-700 hover:bg-purple-50 bg-white border border-purple-200 transition-colors shadow-2xs cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-purple-600" />
                <span className="hidden lg:inline">Security Center</span>
              </button>
            )}

            {/* Cloud Backup & Sync Management Button (Admin Only) */}
            {session.role === 'admin' && (
              <button
                id="header-cloud-sync-btn"
                onClick={onOpenCloudSync}
                title={`Backup Center & Cloud Sync: ${syncState.unsyncedChangesCount > 0 ? `${syncState.unsyncedChangesCount} unsaved updates` : 'All changes in sync'} (Last synced: ${formatRelativeSyncTime(syncState.lastSyncTimestamp)})`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-2xs cursor-pointer border ${
                  syncState.unsyncedChangesCount > 0
                    ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                {syncState.unsyncedChangesCount > 0 ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    <CloudUpload className="w-3.5 h-3.5 text-amber-700" />
                    <span className="hidden sm:inline font-bold">{syncState.unsyncedChangesCount} Unsynced</span>
                    <span className="sm:hidden font-bold">{syncState.unsyncedChangesCount}</span>
                  </>
                ) : (
                  <>
                    <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="hidden sm:inline font-bold">Backup Center</span>
                  </>
                )}
              </button>
            )}

            {/* Sound & Audio Alerts Button */}
            {onOpenSoundSettings && (
              <button
                id="header-sound-settings-btn"
                onClick={onOpenSoundSettings}
                title={`Notification & Punch Audio: ${isAudioEnabled() ? 'Enabled' : 'Muted'} (Click to adjust or preview)`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 bg-white border border-slate-200 transition-colors shadow-2xs cursor-pointer"
              >
                {isAudioEnabled() ? (
                  <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="hidden xl:inline">Sound</span>
              </button>
            )}

            {/* User Profile & Account Settings Button */}
            <button
              id="user-account-settings-btn"
              onClick={onOpenAccountSettings}
              title={`Logged in as ${session.name} (${session.email})`}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
            >
              <div className="w-5 h-5 rounded-md bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center">
                {session.name.charAt(0)}
              </div>
              <span className="hidden sm:inline font-semibold text-slate-800 truncate max-w-[100px]">
                {session.name.split(' ')[0]}
              </span>
              <Settings className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Logout Button */}
            <button
              id="header-logout-btn"
              onClick={onLogout}
              title="Secure Sign Out"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar (Admin only) - Clean 5-Column Grid */}
        {session.role === 'admin' && (
          <div className="grid grid-cols-5 md:hidden py-1.5 border-t border-slate-200/60 gap-1 w-full max-w-full overflow-hidden">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              const shortLabel = tab.id === 'dashboard' ? 'Analytics' : tab.id === 'attendance' ? 'Attendance' : tab.id === 'leaves' ? 'Leaves' : tab.id === 'members' ? 'Members' : 'Reports';
              return (
                <button
                  key={tab.id}
                  id={`mobile-nav-${tab.id}`}
                  onClick={() => onTabChange(tab.id)}
                  className={`relative flex flex-col items-center justify-center gap-1 py-1.5 px-0.5 rounded-xl text-xs font-medium transition-all w-full text-center cursor-pointer ${
                    isActive ? 'text-indigo-600 bg-indigo-50 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="relative">
                    <Icon className="w-4 h-4" />
                    {typeof tab.badge === 'number' && tab.badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                        {tab.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] truncate max-w-full">{shortLabel}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
};
