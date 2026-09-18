import React from 'react';
import { 
  LayoutDashboard, 
  CalendarCheck2, 
  Users, 
  FileSpreadsheet, 
  CalendarOff,
  Database,
  ShieldAlert,
  CloudUpload,
  CloudCheck,
  Calendar,
  X,
  Sparkles
} from 'lucide-react';
import { ViewTab, CloudSyncState } from '../types';
import { formatRelativeSyncTime } from '../utils/cloudSync';

interface AdminSidebarProps {
  currentTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  totalMembers: number;
  pendingLeavesCount: number;
  selectedDate: string;
  onDateChange: (date: string) => void;
  syncState: CloudSyncState;
  onOpenCloudSync: () => void;
  onOpenDatabaseStudio: () => void;
  onOpenSecurityAudit: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: ViewTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeType?: 'count' | 'info' | 'pulse';
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentTab,
  onTabChange,
  totalMembers,
  pendingLeavesCount,
  selectedDate,
  onDateChange,
  syncState,
  onOpenCloudSync,
  onOpenDatabaseStudio,
  onOpenSecurityAudit,
  isOpenMobile,
  onCloseMobile,
}) => {
  const navItems: NavItem[] = [
    { 
      id: 'dashboard', 
      label: 'Analytics Dashboard', 
      description: 'Real-time metrics & insights',
      icon: LayoutDashboard,
      badge: 'Live',
      badgeType: 'pulse'
    },
    { 
      id: 'attendance', 
      label: 'Daily Attendance', 
      description: 'Punch logs & daily tracking',
      icon: CalendarCheck2 
    },
    { 
      id: 'leaves', 
      label: 'Leave Applications', 
      description: 'Requests & approvals',
      icon: CalendarOff,
      badge: pendingLeavesCount > 0 ? `${pendingLeavesCount} Pending` : undefined,
      badgeType: 'count'
    },
    { 
      id: 'members', 
      label: 'Member Admin', 
      description: 'Staff directory & profiles',
      icon: Users,
      badge: `${totalMembers}`,
      badgeType: 'info'
    },
    { 
      id: 'reports', 
      label: 'Excel & Reports', 
      description: 'Export & monthly sheets',
      icon: FileSpreadsheet 
    },
  ];

  const todayStr = new Date().toISOString().split('T')[0];
  const isTodaySelected = selectedDate === todayStr;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white text-slate-800">
      
      {/* Mobile Drawer Header */}
      <div className="flex md:hidden items-center justify-between p-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
            <CalendarCheck2 className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-sm text-slate-900">Admin Navigation</div>
            <div className="text-[11px] text-slate-500">Sahil Infotech Workforce</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Navigation Items */}
      <div className="flex-1 py-4 px-3 overflow-y-auto space-y-6">
        
        {/* Section Label */}
        <div>
          <div className="px-3 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase font-mono">
              Core Modules
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-semibold">
              <Sparkles className="w-3 h-3" />
              Admin Suite
            </span>
          </div>

          <nav className="space-y-1.5" aria-label="Admin Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full group relative flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-150 cursor-pointer border ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold border-indigo-600 shadow-sm shadow-indigo-600/25'
                      : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-transparent hover:border-slate-200/80'
                  }`}
                >
                  <div className={`shrink-0 p-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={`text-sm tracking-tight truncate ${isActive ? 'text-white font-bold' : 'font-medium'}`}>
                        {item.label}
                      </span>

                      {item.badge && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          isActive
                            ? 'bg-white text-indigo-900'
                            : item.badgeType === 'count'
                            ? 'bg-amber-500 text-white animate-pulse'
                            : item.badgeType === 'pulse'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className={`text-[11px] truncate mt-0.5 ${isActive ? 'text-indigo-100' : 'text-slate-400 group-hover:text-slate-500'}`}>
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quick Date Focus Filter */}
        <div className="pt-2 border-t border-slate-100">
          <div className="px-3 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase font-mono">
              Focus Date
            </span>
            {!isTodaySelected && (
              <button
                type="button"
                onClick={() => onDateChange(todayStr)}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
              >
                Reset to Today
              </button>
            )}
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Viewing Records For:</span>
            </div>
            <input
              type="date"
              id="sidebar-focus-date-picker"
              value={selectedDate}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              className="w-full bg-white font-medium text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
            />
          </div>
        </div>

        {/* System Administration Shortcuts */}
        <div className="pt-2 border-t border-slate-100">
          <div className="px-3 pb-2">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase font-mono">
              Admin Utilities
            </span>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              id="sidebar-database-studio-btn"
              onClick={onOpenDatabaseStudio}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100/70 border border-indigo-200/80 transition-colors cursor-pointer text-left"
            >
              <Database className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <div className="flex-1 truncate">
                <div className="font-bold">Real Database Studio</div>
                <div className="text-[10px] text-indigo-600/80 font-normal">Firestore raw data & entries</div>
              </div>
            </button>

            <button
              type="button"
              id="sidebar-security-audit-btn"
              onClick={onOpenSecurityAudit}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-purple-700 bg-purple-50/60 hover:bg-purple-100/60 border border-purple-200/80 transition-colors cursor-pointer text-left"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <div className="flex-1 truncate">
                <div className="font-bold">Security Center</div>
                <div className="text-[10px] text-purple-600/80 font-normal">Audit logs & security rules</div>
              </div>
            </button>
          </div>
        </div>

        {/* Cloud Sync Status Card */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            id="sidebar-cloud-sync-card"
            onClick={onOpenCloudSync}
            className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer shadow-2xs ${
              syncState.unsyncedChangesCount > 0
                ? 'bg-amber-50/90 border-amber-200 text-amber-900 hover:bg-amber-100/90'
                : 'bg-emerald-50/90 border-emerald-200 text-emerald-900 hover:bg-emerald-100/90'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                {syncState.unsyncedChangesCount > 0 ? (
                  <>
                    <CloudUpload className="w-4 h-4 text-amber-700" />
                    <span>Backup Pending</span>
                  </>
                ) : (
                  <>
                    <CloudCheck className="w-4 h-4 text-emerald-700" />
                    <span>Cloud Synced</span>
                  </>
                )}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                syncState.unsyncedChangesCount > 0 ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
              }`}>
                {syncState.unsyncedChangesCount > 0 ? `${syncState.unsyncedChangesCount} unsaved` : 'Active'}
              </span>
            </div>
            <p className="text-[10px] opacity-80 truncate">
              {formatRelativeSyncTime(syncState.lastSyncTimestamp)}
            </p>
          </button>
        </div>

      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-slate-200/80 bg-slate-50/80">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="font-medium">Admin Portal v2.0</span>
          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Online
          </span>
        </div>
      </div>

    </div>
  );

  return (
    <>
      {/* Desktop Sticky Left Sidebar */}
      <aside 
        id="admin-desktop-sidebar"
        className="hidden md:block w-64 lg:w-72 shrink-0 border-r border-slate-200/80 bg-white sticky top-16 h-[calc(100vh-64px)] overflow-hidden shadow-xs z-30"
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 z-50 md:hidden bg-slate-900/50 backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        >
          <div 
            id="admin-mobile-sidebar"
            className="fixed inset-y-0 left-0 w-4/5 max-w-xs bg-white shadow-2xl z-50 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
