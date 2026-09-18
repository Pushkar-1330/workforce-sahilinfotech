import React, { useState, useMemo } from 'react';
import { 
  CalendarOff, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  Plus, 
  Calendar, 
  Check, 
  X, 
  MessageSquare, 
  User, 
  Building2, 
  Trash2, 
  ChevronRight,
  Sparkles,
  FileText,
  Send,
  RefreshCw,
  Info
} from 'lucide-react';
import { LeaveRequest, LeaveStatus, LeaveType, Member, AttendanceRecord, AuthSession } from '../types';
import { DEPARTMENTS } from '../utils/storage';
import { playLeaveApprovedSound, playLeaveRejectedSound, playLeaveSubmittedSound } from '../utils/audioAlerts';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

interface LeaveManagementViewProps {
  leaves: LeaveRequest[];
  members: Member[];
  records: AttendanceRecord[];
  session: AuthSession;
  onApproveLeave: (leave: LeaveRequest, adminRemark?: string) => void;
  onRejectLeave: (leave: LeaveRequest, adminRemark: string) => void;
  onSubmitLeave: (newLeave: LeaveRequest) => void;
  onDeleteLeave: (leaveId: string) => void;
  isLiveConnected?: boolean;
}

const LEAVE_TYPE_LABELS: Record<LeaveType, { label: string; badgeClass: string; desc: string }> = {
  sick: { 
    label: 'Sick Leave', 
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200', 
    desc: 'Medical condition, doctor appointment, or illness recovery' 
  },
  casual: { 
    label: 'Casual Leave', 
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200', 
    desc: 'Short personal matters, travel, or errands' 
  },
  vacation: { 
    label: 'Vacation / Annual', 
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200', 
    desc: 'Planned annual vacation or holiday time-off' 
  },
  emergency: { 
    label: 'Emergency Leave', 
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200', 
    desc: 'Unplanned urgent family or personal circumstance' 
  },
  maternity: { 
    label: 'Maternity Leave', 
    badgeClass: 'bg-pink-50 text-pink-700 border-pink-200', 
    desc: 'Maternal health and infant care' 
  },
  paternity: { 
    label: 'Paternity Leave', 
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200', 
    desc: 'Paternal family leave for new child' 
  },
  other: { 
    label: 'Other Absence', 
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', 
    desc: 'Other approved non-working time' 
  }
};

export const LeaveManagementView: React.FC<LeaveManagementViewProps> = ({
  leaves,
  members,
  records,
  session,
  onApproveLeave,
  onRejectLeave,
  onSubmitLeave,
  onDeleteLeave,
  isLiveConnected = true
}) => {
  // Filter States
  const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [leaveToDelete, setLeaveToDelete] = useState<LeaveRequest | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [reviewModalState, setReviewModalState] = useState<{
    isOpen: boolean;
    leave: LeaveRequest | null;
    action: 'approve' | 'reject';
    remark: string;
  }>({
    isOpen: false,
    leave: null,
    action: 'approve',
    remark: ''
  });

  // Admin Create Form State
  const [newMemberId, setNewMemberId] = useState<string>('');
  const [newLeaveType, setNewLeaveType] = useState<LeaveType>('casual');
  const [newStartDate, setNewStartDate] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [newEndDate, setNewEndDate] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [newReason, setNewReason] = useState<string>('');
  const [newAutoApprove, setNewAutoApprove] = useState<boolean>(true);
  const [newAdminRemark, setNewAdminRemark] = useState<string>('');

  // Calculate leave duration helper
  const calculateDays = (start: string, end: string): number => {
    if (!start || !end) return 1;
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 3600 * 24)) + 1;
    return Math.max(1, isNaN(diff) ? 1 : diff);
  };

  // Filter out any fake/sample leaves to ensure only real employee leaves are shown
  const realLeaves = useMemo(() => {
    return (leaves || []).filter(l => l && l.id && !l.id.startsWith('leave-sample-') && !l.id.includes('sample'));
  }, [leaves]);

  // Metrics / Stats (Calculated strictly from real leaves)
  const metrics = useMemo(() => {
    const total = realLeaves.length;
    const pending = realLeaves.filter(l => l.status === 'pending').length;
    const approved = realLeaves.filter(l => l.status === 'approved').length;
    const rejected = realLeaves.filter(l => l.status === 'rejected').length;

    // Total days approved
    const totalApprovedDays = realLeaves
      .filter(l => l.status === 'approved')
      .reduce((sum, l) => sum + (l.totalDays || 1), 0);

    return { total, pending, approved, rejected, totalApprovedDays };
  }, [realLeaves]);

  // Filtered List
  const filteredLeaves = useMemo(() => {
    return realLeaves.filter((leave) => {
      if (statusFilter !== 'all' && leave.status !== statusFilter) return false;
      if (departmentFilter !== 'all' && leave.department !== departmentFilter) return false;
      if (typeFilter !== 'all' && leave.leaveType !== typeFilter) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const member = members.find(m => 
          m.id === leave.memberId || 
          (m.email && leave.memberId && leave.memberId.includes(m.email.replace(/[^a-zA-Z0-9]/g, '_'))) ||
          (m.name && leave.memberName && m.name.toLowerCase().trim() === leave.memberName.toLowerCase().trim())
        );
        const name = (leave.memberName || member?.name || '').toLowerCase();
        const empId = (leave.employeeId || member?.employeeId || '').toLowerCase();
        const reason = (leave.reason || '').toLowerCase();
        const type = (LEAVE_TYPE_LABELS[leave.leaveType]?.label || '').toLowerCase();

        return name.includes(query) || empId.includes(query) || reason.includes(query) || type.includes(query);
      }

      return true;
    }).sort((a, b) => {
      // Pending first, then by applied date descending
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.appliedAt || '').getTime() - new Date(a.appliedAt || '').getTime();
    });
  }, [realLeaves, members, statusFilter, departmentFilter, typeFilter, searchQuery]);

  // Handle Opening Review Modal
  const openReviewModal = (leave: LeaveRequest, action: 'approve' | 'reject') => {
    setReviewError(null);
    setReviewModalState({
      isOpen: true,
      leave,
      action,
      remark: action === 'approve' ? 'Approved. Attendance updated.' : ''
    });
  };

  // Submit Review Modal
  const handleConfirmReview = () => {
    if (!reviewModalState.leave) return;
    if (reviewModalState.action === 'approve') {
      playLeaveApprovedSound();
      onApproveLeave(reviewModalState.leave, reviewModalState.remark.trim() || undefined);
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 }
      });
    } else {
      if (!reviewModalState.remark.trim()) {
        setReviewError('Please provide a brief reason or remark for rejecting the leave application.');
        return;
      }
      playLeaveRejectedSound();
      onRejectLeave(reviewModalState.leave, reviewModalState.remark.trim());
    }

    setReviewError(null);
    setReviewModalState({
      isOpen: false,
      leave: null,
      action: 'approve',
      remark: ''
    });
  };

  // Handle Submitting New Leave from Admin
  const handleCreateNewLeave = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const selectedMem = members.find(m => m.id === newMemberId);
    if (!selectedMem) {
      setCreateError('Please select a valid staff member');
      return;
    }

    const days = calculateDays(newStartDate, newEndDate);
    const newLeave: LeaveRequest = {
      id: 'leave-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      memberId: selectedMem.id,
      memberName: selectedMem.name,
      employeeId: selectedMem.employeeId,
      department: selectedMem.department,
      avatarColor: selectedMem.avatarColor,
      leaveType: newLeaveType,
      startDate: newStartDate,
      endDate: newEndDate,
      totalDays: days,
      reason: newReason.trim() || 'Direct administrative leave entry',
      status: newAutoApprove ? 'approved' : 'pending',
      appliedAt: new Date().toISOString(),
      ...(newAutoApprove ? {
        reviewedAt: new Date().toISOString(),
        reviewedBy: session.name || 'Admin',
        adminRemark: newAdminRemark.trim() || 'Direct approval by Administrator'
      } : {})
    };

    if (newAutoApprove) {
      playLeaveApprovedSound();
    } else {
      playLeaveSubmittedSound();
    }
    onSubmitLeave(newLeave);
    setIsNewModalOpen(false);
    setNewReason('');
    setNewAdminRemark('');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* View Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <CalendarOff className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
              Leave Applications & Approvals
            </h1>
            {isLiveConnected && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Stream Active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 max-w-2xl">
            Dedicated administrative portal for reviewing staff leave requests, approving medical and planned absences, and auto-updating official attendance rosters in real time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="admin-apply-leave-btn"
            onClick={() => {
              if (members.length > 0) {
                setNewMemberId(members[0].id);
              }
              setIsNewModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Staff Leave</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Applications */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Requests</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{metrics.total}</span>
            <span className="text-[11px] text-slate-500">recorded</span>
          </div>
        </div>

        {/* Pending Review */}
        <div className={`bg-white rounded-2xl p-4 border shadow-xs transition-all ${
          metrics.pending > 0 ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200/80'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              {metrics.pending > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>}
              Pending Review
            </span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${metrics.pending > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {metrics.pending}
            </span>
            <span className="text-[11px] text-slate-500">needs action</span>
          </div>
        </div>

        {/* Approved Leaves */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Approved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{metrics.approved}</span>
            <span className="text-[11px] text-slate-500">granted</span>
          </div>
        </div>

        {/* Rejected Leaves */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Declined</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600">{metrics.rejected}</span>
            <span className="text-[11px] text-slate-500">rejected</span>
          </div>
        </div>

        {/* Total Days Approved */}
        <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-4 border border-indigo-100 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 mb-1.5">
            <span className="text-xs font-semibold text-indigo-900 uppercase tracking-wider">Approved Days</span>
            <Calendar className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-700">{metrics.totalApprovedDays}</span>
            <span className="text-[11px] text-indigo-600/80 font-medium">total days off</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        {/* Status Pills */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              id="leave-filter-all"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              All Applications ({metrics.total})
            </button>

            <button
              id="leave-filter-pending"
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-amber-500 text-white shadow-2xs font-semibold'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Action</span>
              {metrics.pending > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === 'pending' ? 'bg-white text-amber-700' : 'bg-amber-200 text-amber-900'
                }`}>
                  {metrics.pending}
                </span>
              )}
            </button>

            <button
              id="leave-filter-approved"
              onClick={() => setStatusFilter('approved')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'approved'
                  ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/60'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approved ({metrics.approved})</span>
            </button>

            <button
              id="leave-filter-rejected"
              onClick={() => setStatusFilter('rejected')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'rejected'
                  ? 'bg-rose-600 text-white shadow-2xs font-semibold'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Declined ({metrics.rejected})</span>
            </button>
          </div>

          <span className="text-xs text-slate-500 hidden sm:inline">
            Showing <strong>{filteredLeaves.length}</strong> of {leaves.length} records
          </span>
        </div>

        {/* Search and Secondary Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search staff name, EMP-ID, or leave reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-sans"
            />
          </div>

          {/* Department Filter */}
          <div className="relative">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Departments</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Leave Type Filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Leave Types</option>
              {Object.entries(LEAVE_TYPE_LABELS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Leave Applications List */}
      {filteredLeaves.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3 border border-slate-100">
            <CalendarOff className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">No Leave Applications Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
            {searchQuery || statusFilter !== 'all' || departmentFilter !== 'all' || typeFilter !== 'all'
              ? 'No leave requests match your active filters. Try resetting the search or status filter.'
              : 'There are currently no leave applications submitted by team members.'}
          </p>
          {(searchQuery || statusFilter !== 'all' || departmentFilter !== 'all' || typeFilter !== 'all') && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setDepartmentFilter('all');
                setTypeFilter('all');
                setSearchQuery('');
              }}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredLeaves.map((leave) => {
            const member = members.find(m => 
              m.id === leave.memberId || 
              (m.email && leave.memberId && leave.memberId.includes(m.email.replace(/[^a-zA-Z0-9]/g, '_'))) ||
              (m.name && leave.memberName && m.name.toLowerCase().trim() === leave.memberName.toLowerCase().trim())
            );
            const memberName = leave.memberName || member?.name || 'Staff Member';
            const empId = leave.employeeId || member?.employeeId || 'EMP-XXXX';
            const dept = leave.department || member?.department || 'General';
            const avatarColor = leave.avatarColor || member?.avatarColor || 'from-indigo-600 to-purple-600';
            const typeConfig = LEAVE_TYPE_LABELS[leave.leaveType] || LEAVE_TYPE_LABELS.other;
            const isPending = leave.status === 'pending';
            const isApproved = leave.status === 'approved';
            const isRejected = leave.status === 'rejected';

            // Format dates
            const startFormatted = new Date(leave.startDate + 'T00:00:00').toLocaleDateString('default', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });
            const endFormatted = new Date(leave.endDate + 'T00:00:00').toLocaleDateString('default', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });
            const isSingleDay = leave.startDate === leave.endDate;

            return (
              <motion.div
                key={leave.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white rounded-2xl p-5 border transition-all shadow-xs ${
                  isPending 
                    ? 'border-amber-300 ring-2 ring-amber-100/80' 
                    : isApproved
                      ? 'border-slate-200/80 hover:border-emerald-200'
                      : 'border-slate-200/80 opacity-80'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Staff Info & Badges */}
                  <div className="flex items-start gap-3.5 min-w-[280px]">
                    <div className="relative shrink-0">
                      {member?.avatarUrl ? (
                        <img 
                          src={member.avatarUrl} 
                          alt={memberName} 
                          className="w-11 h-11 rounded-xl object-cover ring-1 ring-slate-200"
                        />
                      ) : (
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${avatarColor} flex items-center justify-center text-white font-bold text-sm shadow-xs`}>
                          {memberName.charAt(0)}
                        </div>
                      )}
                      {isPending && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white"></span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900 font-sans">{memberName}</h3>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {empId}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeConfig.badgeClass}`}>
                          {typeConfig.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{dept}</span>
                        </span>
                        <span>•</span>
                        <span>
                          Applied {new Date(leave.appliedAt).toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dates & Reason Column */}
                  <div className="flex-1 lg:px-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-900">
                        {isSingleDay ? startFormatted : `${startFormatted}  →  ${endFormatted}`}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {leave.totalDays} {leave.totalDays === 1 ? 'Day' : 'Days'}
                      </span>
                    </div>

                    {/* Reason quotation box */}
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <p className="italic">{leave.reason || 'No detailed reason specified.'}</p>
                    </div>

                    {/* Review Feedback / Remark if already reviewed */}
                    {leave.adminRemark && (
                      <div className={`mt-2 p-2 rounded-xl text-xs flex items-start gap-1.5 ${
                        isApproved 
                          ? 'bg-emerald-50/70 border border-emerald-100 text-emerald-800' 
                          : 'bg-rose-50/70 border border-rose-100 text-rose-800'
                      }`}>
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <div>
                          <strong className="font-semibold">
                            {isApproved ? 'Admin Approval Note:' : 'Decline Reason:'}
                          </strong>{' '}
                          <span>{leave.adminRemark}</span>
                          {leave.reviewedBy && (
                            <span className="text-[10px] opacity-75 ml-1">— {leave.reviewedBy}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Controls & Status */}
                  <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    {/* Status indicator */}
                    <div className="shrink-0">
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
                          Pending Review
                        </span>
                      )}
                      {isApproved && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Approved
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          Declined
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      {isPending ? (
                        <>
                          <button
                            id={`btn-approve-leave-${leave.id}`}
                            onClick={() => openReviewModal(leave, 'approve')}
                            title="Approve Leave and Auto-update Attendance"
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>

                          <button
                            id={`btn-reject-leave-${leave.id}`}
                            onClick={() => openReviewModal(leave, 'reject')}
                            title="Decline Leave Request"
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Decline</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => openReviewModal(leave, isApproved ? 'reject' : 'approve')}
                          title="Re-evaluate Status"
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-all cursor-pointer"
                        >
                          {isApproved ? 'Revoke / Change' : 'Re-approve'}
                        </button>
                      )}

                      <button
                        onClick={() => setLeaveToDelete(leave)}
                        title="Delete Record"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Review Modal (Approve / Reject Dialog) */}
      <AnimatePresence>
        {reviewModalState.isOpen && reviewModalState.leave && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`p-2 rounded-xl ${
                    reviewModalState.action === 'approve' 
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                      : 'bg-rose-50 text-rose-600 border border-rose-200'
                  }`}>
                    {reviewModalState.action === 'approve' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {reviewModalState.action === 'approve' ? 'Approve Leave Request' : 'Decline Leave Request'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {reviewModalState.leave.memberName} ({reviewModalState.leave.employeeId})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setReviewModalState(prev => ({ ...prev, isOpen: false }))}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Leave Briefing */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 mb-4 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Leave Duration:</span>
                  <strong className="font-semibold text-slate-900">
                    {reviewModalState.leave.startDate} to {reviewModalState.leave.endDate} ({reviewModalState.leave.totalDays} days)
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Leave Type:</span>
                  <strong className="font-semibold text-slate-900">
                    {LEAVE_TYPE_LABELS[reviewModalState.leave.leaveType]?.label || reviewModalState.leave.leaveType}
                  </strong>
                </div>
                <div className="pt-1 border-t border-slate-200/60">
                  <span className="text-slate-500 block mb-0.5">Staff Reason:</span>
                  <p className="italic text-slate-800">"{reviewModalState.leave.reason}"</p>
                </div>
              </div>

              {reviewModalState.action === 'approve' ? (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Automatic Attendance Excused Sync</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Approving this request will automatically mark attendance on these dates as <strong>Excused Leave</strong> in the company master roster.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mb-4 p-3 rounded-xl bg-rose-50/70 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-[11px]">
                    Please provide an explanation for declining this leave request so the employee understands next steps.
                  </p>
                </div>
              )}

              {/* Admin Remark Input */}
              {reviewError && (
                <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{reviewError}</span>
                </div>
              )}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {reviewModalState.action === 'approve' ? 'Admin Feedback (Optional)' : 'Decline Reason & Remarks (Required)'}
                </label>
                <textarea
                  rows={3}
                  value={reviewModalState.remark}
                  onChange={(e) => setReviewModalState(prev => ({ ...prev, remark: e.target.value }))}
                  placeholder={
                    reviewModalState.action === 'approve' 
                      ? 'e.g. Approved. Please coordinate urgent tasks before departure.' 
                      : 'e.g. Critical release sprint scheduled on these dates; please reschedule.'
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Footer buttons */}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewModalState(prev => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReview}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-xs transition-all cursor-pointer ${
                    reviewModalState.action === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {reviewModalState.action === 'approve' ? 'Confirm Approval' : 'Confirm Decline'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Record Staff Leave Modal */}
      <AnimatePresence>
        {isNewModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                    <CalendarOff className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Record Staff Leave</h3>
                    <p className="text-xs text-slate-500">Log planned or medical leave on behalf of an employee</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsNewModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateNewLeave} className="space-y-3.5">
                {createError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>{createError}</span>
                  </div>
                )}
                {/* Select Member */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Staff Member
                  </label>
                  <select
                    required
                    value={newMemberId}
                    onChange={(e) => setNewMemberId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.employeeId}) — {m.department}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Leave Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Leave Type
                  </label>
                  <select
                    required
                    value={newLeaveType}
                    onChange={(e) => setNewLeaveType(e.target.value as LeaveType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} — {v.desc}</option>
                    ))}
                  </select>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      required
                      value={newStartDate}
                      onChange={(e) => {
                        setNewStartDate(e.target.value);
                        if (e.target.value > newEndDate) {
                          setNewEndDate(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      required
                      min={newStartDate}
                      value={newEndDate}
                      onChange={(e) => setNewEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-sans"
                    />
                  </div>
                </div>

                {/* Duration hint */}
                <div className="text-right">
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                    Total Duration: {calculateDays(newStartDate, newEndDate)} Day(s)
                  </span>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reason / Purpose of Leave
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    placeholder="e.g. Approved medical leave with doctor note / Family event..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Direct Approval Checkbox */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAutoApprove}
                      onChange={(e) => setNewAutoApprove(e.target.checked)}
                      className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-800">
                      Pre-approve immediately and update attendance records
                    </span>
                  </label>
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
                  >
                    Save Leave Application
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Leave Confirmation Modal */}
      <AnimatePresence>
        {leaveToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-center"
            >
              <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Delete Leave Request?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Remove the leave request for <strong className="text-slate-800">{leaveToDelete.memberName}</strong> ({leaveToDelete.startDate} to {leaveToDelete.endDate})?
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  id="cancel-delete-leave-btn"
                  onClick={() => setLeaveToDelete(null)}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-delete-leave-btn"
                  onClick={() => {
                    const id = leaveToDelete.id;
                    setLeaveToDelete(null);
                    onDeleteLeave(id);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                >
                  Yes, Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
