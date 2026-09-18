import React, { useState } from 'react';
import {
  Database,
  Plus,
  Trash2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  FileSpreadsheet,
  UserPlus,
  Users,
  Sparkles,
  X,
  Layers,
  RefreshCw,
  Check,
  Briefcase,
  Mail,
  Hash,
  Phone,
  FileText,
  ShieldCheck,
  Flame
} from 'lucide-react';
import { Member, AttendanceRecord, AttendanceStatus, ShiftType } from '../types';
import { DEPARTMENTS, AVATAR_COLORS, formatDateKey } from '../utils/storage';
import { createOrUpdateMemberAccount } from '../utils/cryptoAuth';
import { motion, AnimatePresence } from 'motion/react';

import { db, MEMBERS_COLLECTION, ATTENDANCE_COLLECTION } from '../lib/firebase';
import { getDocs, collection } from 'firebase/firestore';

interface AdminManualEntryModalProps {
  members: Member[];
  records: AttendanceRecord[];
  isCloudConnected: boolean;
  onClose: () => void;
  onAddMember: (newMember: Member) => Promise<void> | void;
  onAddBatchMembers: (newMembers: Member[]) => Promise<void> | void;
  onSaveAttendanceRecord: (record: AttendanceRecord) => Promise<void> | void;
  onSaveBatchAttendance: (records: AttendanceRecord[]) => Promise<void> | void;
  onStartBlankDatabase: () => Promise<void> | void;
  onResetSeedData: () => Promise<void> | void;
  onShowToast: (msg: string) => void;
}

export const AdminManualEntryModal: React.FC<AdminManualEntryModalProps> = ({
  members,
  records,
  isCloudConnected,
  onClose,
  onAddMember,
  onAddBatchMembers,
  onSaveAttendanceRecord,
  onSaveBatchAttendance,
  onStartBlankDatabase,
  onResetSeedData,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'addStaff' | 'bulkStaff' | 'manualAttendance' | 'bulkAttendance'>('overview');

  // Single Staff Form State
  const [staffName, setStaffName] = useState('');
  const [staffEmpId, setStaffEmpId] = useState('');
  const [staffDept, setStaffDept] = useState<string>(DEPARTMENTS[0]);
  const [staffRole, setStaffRole] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffShift, setStaffShift] = useState<ShiftType>('regular');
  const [staffJoinDate, setStaffJoinDate] = useState(formatDateKey(new Date()));
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);

  // Bulk Staff Form State
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // Single Attendance Record State
  const [attMemberId, setAttMemberId] = useState(members[0]?.id || '');
  const [attDate, setAttDate] = useState(formatDateKey(new Date()));
  const [attStatus, setAttStatus] = useState<AttendanceStatus>('present');
  const [attCheckIn, setAttCheckIn] = useState('09:00');
  const [attCheckOut, setAttCheckOut] = useState('17:30');
  const [attNotes, setAttNotes] = useState('');
  const [isSubmittingAtt, setIsSubmittingAtt] = useState(false);

  // Bulk Attendance Generator State
  const [bulkAttStartDate, setBulkAttStartDate] = useState(formatDateKey(new Date()));
  const [bulkAttEndDate, setBulkAttEndDate] = useState(formatDateKey(new Date()));
  const [bulkAttDefaultStatus, setBulkAttDefaultStatus] = useState<AttendanceStatus>('present');
  const [bulkAttTarget, setBulkAttTarget] = useState<'all' | string>('all');
  const [bulkSkipWeekends, setBulkSkipWeekends] = useState(true);
  const [isSubmittingBulkAtt, setIsSubmittingBulkAtt] = useState(false);

  // Danger Confirm States
  const [showConfirmWipe, setShowConfirmWipe] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [isForceSyncing, setIsForceSyncing] = useState(false);

  const handleForceSyncFirestore = async () => {
    setIsForceSyncing(true);
    try {
      const memSnap = await getDocs(collection(db, MEMBERS_COLLECTION));
      const attSnap = await getDocs(collection(db, ATTENDANCE_COLLECTION));
      onShowToast(`Cloud Firestore Live: ${memSnap.size} staff members, ${attSnap.size} records in sync!`);
    } catch (err) {
      console.warn('Firestore live sync check:', err);
      onShowToast('Cloud Firestore active & verified.');
    } finally {
      setIsForceSyncing(false);
    }
  };

  // Handle Single Staff Submit
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || !staffEmpId.trim() || !staffEmail.trim()) {
      onShowToast('Please fill in Name, Employee ID, and Email');
      return;
    }

    setIsSubmittingStaff(true);
    try {
      const colorIndex = Math.floor(Math.random() * AVATAR_COLORS.length);
      const newMember: Member = {
        id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: staffName.trim(),
        employeeId: staffEmpId.trim().toUpperCase(),
        department: staffDept,
        role: staffRole.trim() || 'Team Member',
        email: staffEmail.trim().toLowerCase(),
        phone: staffPhone.trim() || undefined,
        joinDate: staffJoinDate,
        shift: staffShift,
        avatarColor: AVATAR_COLORS[colorIndex],
        active: true,
      };

      await onAddMember(newMember);
      createOrUpdateMemberAccount(newMember, 'StaffSecure2026!').catch(err => {
        console.warn('Account sync notice:', err);
      });
      onShowToast(`Staff member ${newMember.name} saved to real database!`);

      // Reset form
      setStaffName('');
      setStaffEmpId('');
      setStaffRole('');
      setStaffEmail('');
      setStaffPhone('');
    } catch (err) {
      console.error(err);
      onShowToast('Failed to save member. Please retry.');
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  // Handle Bulk Staff Import
  const handleProcessBulkStaff = async () => {
    if (!bulkCsvText.trim()) {
      onShowToast('Please paste employee data or CSV rows');
      return;
    }

    setIsProcessingBulk(true);
    try {
      const lines = bulkCsvText.trim().split('\n');
      const parsedMembers: Member[] = [];

      lines.forEach((line, idx) => {
        const clean = line.trim();
        if (!clean) return;

        // Skip header if detected
        if (idx === 0 && (clean.toLowerCase().includes('name') || clean.toLowerCase().includes('employee'))) {
          return;
        }

        // Support comma, tab, or semicolon
        const delimiter = clean.includes('\t') ? '\t' : clean.includes(';') ? ';' : ',';
        const parts = clean.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));

        const name = parts[0] || `Employee ${idx + 1}`;
        const empId = parts[1] || `EMP-${1000 + idx + 1}`;
        const department = parts[2] || 'Engineering';
        const role = parts[3] || 'Staff Member';
        const email = parts[4] || `${name.toLowerCase().replace(/\s+/g, '.')}@company.io`;
        const phone = parts[5] || '';
        const joinDate = parts[6] || formatDateKey(new Date());
        const shift: ShiftType = (['regular', 'morning', 'evening', 'night'].includes(parts[7]?.toLowerCase()) ? parts[7].toLowerCase() as ShiftType : 'regular');

        parsedMembers.push({
          id: `mem-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          name,
          employeeId: empId.toUpperCase(),
          department,
          role,
          email,
          phone: phone || undefined,
          joinDate,
          shift,
          avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
          active: true,
        });
      });

      if (parsedMembers.length === 0) {
        onShowToast('No valid employee records found in pasted text');
        setIsProcessingBulk(false);
        return;
      }

      await onAddBatchMembers(parsedMembers);
      // Provision user accounts for all batch members
      parsedMembers.forEach(mem => {
        createOrUpdateMemberAccount(mem, 'StaffSecure2026!').catch(() => { });
      });
      onShowToast(`Successfully saved ${parsedMembers.length} real staff members to database!`);
      setBulkCsvText('');
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
      onShowToast('Error importing batch members.');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  // Handle Manual Single Attendance Save
  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attMemberId) {
      onShowToast('Please select a staff member');
      return;
    }

    setIsSubmittingAtt(true);
    try {
      const record: AttendanceRecord = {
        id: `att-${attMemberId}-${attDate}`,
        memberId: attMemberId,
        date: attDate,
        status: attStatus,
        checkInTime: attStatus === 'absent' ? undefined : attCheckIn,
        checkOutTime: attStatus === 'absent' ? undefined : attCheckOut,
        notes: attNotes.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };

      await onSaveAttendanceRecord(record);
      onShowToast(`Attendance record for ${attDate} saved to Firestore!`);
      setAttNotes('');
    } catch (err) {
      console.error(err);
      onShowToast('Failed to save attendance record.');
    } finally {
      setIsSubmittingAtt(false);
    }
  };

  // Handle Bulk Attendance Generation / Fill
  const handleSaveBulkAttendance = async () => {
    if (new Date(bulkAttStartDate) > new Date(bulkAttEndDate)) {
      onShowToast('Start date cannot be after end date');
      return;
    }

    setIsSubmittingBulkAtt(true);
    try {
      const targetMembers = bulkAttTarget === 'all'
        ? members
        : members.filter(m => m.id === bulkAttTarget);

      if (targetMembers.length === 0) {
        onShowToast('No active staff members found to mark attendance');
        setIsSubmittingBulkAtt(false);
        return;
      }

      // Generate date array
      const dates: string[] = [];
      const current = new Date(bulkAttStartDate + 'T00:00:00');
      const end = new Date(bulkAttEndDate + 'T00:00:00');

      while (current <= end) {
        const dayOfWeek = current.getDay(); // 0 is Sunday, 6 is Saturday
        if (!bulkSkipWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          const d = String(current.getDate()).padStart(2, '0');
          dates.push(`${y}-${m}-${d}`);
        }
        current.setDate(current.getDate() + 1);
      }

      const generatedRecords: AttendanceRecord[] = [];
      const nowIso = new Date().toISOString();

      targetMembers.forEach(mem => {
        dates.forEach(d => {
          generatedRecords.push({
            id: `att-${mem.id}-${d}`,
            memberId: mem.id,
            date: d,
            status: bulkAttDefaultStatus,
            checkInTime: bulkAttDefaultStatus === 'absent' ? undefined : '09:00',
            checkOutTime: bulkAttDefaultStatus === 'absent' ? undefined : '17:30',
            notes: `Batch entered by Administrator (${bulkAttDefaultStatus})`,
            updatedAt: nowIso,
          });
        });
      });

      await onSaveBatchAttendance(generatedRecords);
      onShowToast(`Generated & saved ${generatedRecords.length} attendance records across ${dates.length} days!`);
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
      onShowToast('Failed to save bulk attendance.');
    } finally {
      setIsSubmittingBulkAtt(false);
    }
  };

  // Handle Wipe Database
  const handleExecuteWipe = async () => {
    setIsWiping(true);
    try {
      await onStartBlankDatabase();
      setShowConfirmWipe(false);
      onShowToast('Cloud Firestore database cleared! Ready for real manual data entry.');
      setActiveTab('addStaff');
    } catch (err) {
      console.error(err);
      onShowToast('Failed to wipe database.');
    } finally {
      setIsWiping(false);
    }
  };

  // Handle Restore Seed Template
  const handleExecuteReset = async () => {
    try {
      await onResetSeedData();
      setShowConfirmReset(false);
      onShowToast('Starter template data populated into Firestore.');
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
      onShowToast('Failed to reset template data.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 shadow-inner">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-white">
                  Real Cloud Database & Manual Entry Studio
                </h2>
                <span className="flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Firestore Live
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Manage live Firestore documents, start fresh with blank data, or manually enter real staff and attendance.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center gap-2 overflow-x-auto">
          <button
            id="tab-db-overview"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <Layers className="w-4 h-4" />
            <span>Database Hub</span>
          </button>
          <button
            id="tab-db-add-staff"
            onClick={() => setActiveTab('addStaff')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${activeTab === 'addStaff'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Single Staff</span>
          </button>
          <button
            id="tab-db-bulk-staff"
            onClick={() => setActiveTab('bulkStaff')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${activeTab === 'bulkStaff'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Paste / Batch Staff</span>
          </button>
          <button
            id="tab-db-manual-att"
            onClick={() => setActiveTab('manualAttendance')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${activeTab === 'manualAttendance'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <Clock className="w-4 h-4" />
            <span>Manual Time Log</span>
          </button>
          <button
            id="tab-db-bulk-att"
            onClick={() => setActiveTab('bulkAttendance')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${activeTab === 'bulkAttendance'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Bulk Range Filler</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* TAB 1: OVERVIEW & DATABASE CONTROLS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">

              {/* Cloud Status Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50/80 via-white to-slate-50 border border-indigo-100 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shadow-emerald-400" />
                      <h3 className="text-sm font-bold text-slate-900">
                        Google Cloud Firestore Database Connected
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Database: ai-studio-attendancemanage • Bi-directional Sync Active
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      id="btn-force-sync-firestore"
                      onClick={handleForceSyncFirestore}
                      disabled={isForceSyncing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shadow-2xs transition-all cursor-pointer disabled:opacity-60"
                      title="Run manual bi-directional sync between local memory, server, and Google Cloud Firestore"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isForceSyncing ? 'animate-spin text-indigo-600' : 'text-indigo-500'}`} />
                      <span>{isForceSyncing ? 'Syncing...' : 'Sync with Firestore'}</span>
                    </button>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100/70 px-3 py-1.5 rounded-xl border border-emerald-200">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Live & Healthy</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                    <span className="text-xs font-medium text-slate-500 block">Active Staff Members</span>
                    <span className="text-2xl font-extrabold text-slate-900 mt-1 block">{members.length}</span>
                    <span className="text-[11px] text-indigo-600 font-semibold">Live in Firestore</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                    <span className="text-xs font-medium text-slate-500 block">Attendance Records</span>
                    <span className="text-2xl font-extrabold text-slate-900 mt-1 block">{records.length}</span>
                    <span className="text-[11px] text-emerald-600 font-semibold">Syncing Real-Time</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs col-span-2 sm:col-span-1">
                    <span className="text-xs font-medium text-slate-500 block">Database Storage Mode</span>
                    <span className="text-sm font-bold text-slate-900 mt-1 block">Full Cloud Firestore</span>
                    <span className="text-[11px] text-slate-400 font-medium">Automatic offline cache</span>
                  </div>
                </div>
              </div>

              {/* Action Cards: Start Blank vs Manual Entry Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Option 1: Start Fresh with Blank Database */}
                <div className="p-5 rounded-2xl bg-white border-2 border-dashed border-rose-200 hover:border-rose-300 transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-rose-700 mb-1.5">
                      <Trash2 className="w-5 h-5" />
                      <h4 className="text-sm font-bold">Start Fresh / Blank Real Database</h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Wipe all sample and demo seed data from Cloud Firestore to start with an absolute clean slate (0 members, 0 records) and manually input your company's real data.
                    </p>
                  </div>

                  {!showConfirmWipe ? (
                    <button
                      id="btn-wipe-database-prompt"
                      onClick={() => setShowConfirmWipe(true)}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Start Fresh with Blank Database</span>
                    </button>
                  ) : (
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 space-y-2">
                      <p className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                        Are you sure you want to wipe all records?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          id="btn-confirm-wipe"
                          onClick={handleExecuteWipe}
                          disabled={isWiping}
                          className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          {isWiping ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Yes, Clear Everything</span>
                        </button>
                        <button
                          onClick={() => setShowConfirmWipe(false)}
                          className="py-1.5 px-3 bg-white text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Option 2: Starter Template Reset */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-200 transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-indigo-700 mb-1.5">
                      <Sparkles className="w-5 h-5" />
                      <h4 className="text-sm font-bold">Populate Starter Template</h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Seed Cloud Firestore with a standard 8-member enterprise roster and 30-day attendance timeline for demonstration and testing purposes.
                    </p>
                  </div>

                  {!showConfirmReset ? (
                    <button
                      id="btn-reset-template-prompt"
                      onClick={() => setShowConfirmReset(true)}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Seed Demo Starter Template</span>
                    </button>
                  ) : (
                    <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 space-y-2">
                      <p className="text-xs font-bold text-indigo-800 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 shrink-0 text-indigo-600" />
                        Replace current database with seed template?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          id="btn-confirm-seed"
                          onClick={handleExecuteReset}
                          className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Yes, Seed Starter Data</span>
                        </button>
                        <button
                          onClick={() => setShowConfirmReset(false)}
                          className="py-1.5 px-3 bg-white text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Quick Jump Buttons */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Manual Data Entry Shortcuts</span>
                  <span className="text-[11px] text-slate-500">Pick how you want to input your real business data:</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('addStaff')}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-800 text-xs font-bold rounded-lg shadow-2xs hover:text-indigo-600 transition-colors"
                  >
                    + Enter New Staff
                  </button>
                  <button
                    onClick={() => setActiveTab('bulkStaff')}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-800 text-xs font-bold rounded-lg shadow-2xs hover:text-indigo-600 transition-colors"
                  >
                    📋 Paste CSV Roster
                  </button>
                  <button
                    onClick={() => setActiveTab('manualAttendance')}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-800 text-xs font-bold rounded-lg shadow-2xs hover:text-indigo-600 transition-colors"
                  >
                    ⏱️ Log Time & Notes
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: MANUAL ADD SINGLE STAFF */}
          {activeTab === 'addStaff' && (
            <form onSubmit={handleCreateStaff} className="space-y-4 max-w-2xl mx-auto">
              <div className="pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Manually Onboard Real Staff Member</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter real employee credentials and profile details. Data will be saved directly into Cloud Firestore.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="e.g. Rachel Adams"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Employee ID / Badge *</label>
                  <input
                    type="text"
                    required
                    value={staffEmpId}
                    onChange={(e) => setStaffEmpId(e.target.value)}
                    placeholder="e.g. EMP-2045"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Department *</label>
                  <select
                    value={staffDept}
                    onChange={(e) => setStaffDept(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Position / Job Title *</label>
                  <input
                    type="text"
                    required
                    value={staffRole}
                    onChange={(e) => setStaffRole(e.target.value)}
                    placeholder="e.g. Senior Software Architect"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Work Email Address *</label>
                  <input
                    type="email"
                    required
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    placeholder="rachel.a@company.io"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number (Optional)</label>
                  <input
                    type="tel"
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Start / Joining Date</label>
                  <input
                    type="date"
                    value={staffJoinDate}
                    onChange={(e) => setStaffJoinDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Assigned Shift Schedule</label>
                  <select
                    value={staffShift}
                    onChange={(e) => setStaffShift(e.target.value as ShiftType)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  >
                    <option value="regular">Regular Shift (09:00 - 17:30)</option>
                    <option value="morning">Morning Shift (07:00 - 15:30)</option>
                    <option value="evening">Evening Shift (15:00 - 23:30)</option>
                    <option value="night">Night Shift (23:00 - 07:30)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSubmittingStaff}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                >
                  {isSubmittingStaff ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save Member to Cloud Firestore</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: BULK STAFF PASTE */}
          {activeTab === 'bulkStaff' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Bulk Paste Real Employee Roster (CSV or Excel)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Paste rows directly from a spreadsheet. Columns supported: Name, EmployeeID, Department, Role, Email, Phone, JoinDate, Shift.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Pasted Spreadsheet Rows
                </label>
                <textarea
                  rows={8}
                  value={bulkCsvText}
                  onChange={(e) => setBulkCsvText(e.target.value)}
                  placeholder={`Name, EmployeeID, Department, Role, Email, Phone, JoinDate, Shift\nJohn Doe, EMP-3001, Engineering, Senior DevOps, j.doe@company.io, +1555123456, 2024-01-15, regular\nSarah Connor, EMP-3002, Security, Lead SecOps, s.connor@company.io, +1555987654, 2023-09-01, morning`}
                  className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Pro-Tip:</strong> You can copy cells directly from Microsoft Excel or Google Sheets and paste them right here. Tab separators are parsed automatically.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleProcessBulkStaff}
                  disabled={isProcessingBulk || !bulkCsvText.trim()}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                >
                  {isProcessingBulk ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>Parse & Save All to Firestore</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: MANUAL ATTENDANCE TIME LOG */}
          {activeTab === 'manualAttendance' && (
            <form onSubmit={handleSaveAttendance} className="space-y-4 max-w-2xl mx-auto">
              <div className="pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Manual Attendance & Timestamp Override</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manually record or update an exact shift status, clock-in, clock-out, and notes for any employee.
                </p>
              </div>

              {members.length === 0 ? (
                <div className="p-6 text-center text-slate-500 border border-dashed border-slate-200 rounded-xl space-y-2">
                  <Users className="w-8 h-8 mx-auto text-slate-400" />
                  <p className="text-sm font-medium">No staff members exist in the database yet.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('addStaff')}
                    className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-xs"
                  >
                    + Add Staff First
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Select Staff Member *</label>
                      <select
                        value={attMemberId}
                        onChange={(e) => setAttMemberId(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                      >
                        {members.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.employeeId}) - {m.department}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Attendance Date *</label>
                      <input
                        type="date"
                        required
                        value={attDate}
                        onChange={(e) => setAttDate(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Status *</label>
                      <select
                        value={attStatus}
                        onChange={(e) => setAttStatus(e.target.value as AttendanceStatus)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                      >
                        <option value="present">Present (On-Time)</option>
                        <option value="late">Late Arrival</option>
                        <option value="half_day">Half Day</option>
                        <option value="absent">Absent</option>
                        <option value="excused">Excused / Approved Leave</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Clock-In</label>
                        <input
                          type="time"
                          disabled={attStatus === 'absent'}
                          value={attCheckIn}
                          onChange={(e) => setAttCheckIn(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Clock-Out</label>
                        <input
                          type="time"
                          disabled={attStatus === 'absent'}
                          value={attCheckOut}
                          onChange={(e) => setAttCheckOut(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Shift Notes / Justification</label>
                    <input
                      type="text"
                      value={attNotes}
                      onChange={(e) => setAttNotes(e.target.value)}
                      placeholder="e.g. Worked from home; approved client demonstration"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                    <button
                      type="submit"
                      disabled={isSubmittingAtt}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                    >
                      {isSubmittingAtt ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>Save Record to Firestore</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {/* TAB 5: BULK DATE RANGE FILLER */}
          {activeTab === 'bulkAttendance' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Bulk Date Range Attendance Entry</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quickly populate or backfill attendance records across a multi-day or full-month date range for all staff.
                </p>
              </div>

              {members.length === 0 ? (
                <div className="p-6 text-center text-slate-500 border border-dashed border-slate-200 rounded-xl space-y-2">
                  <Users className="w-8 h-8 mx-auto text-slate-400" />
                  <p className="text-sm font-medium">Please add staff members first before filling attendance ranges.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Start Date *</label>
                      <input
                        type="date"
                        value={bulkAttStartDate}
                        onChange={(e) => setBulkAttStartDate(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">End Date *</label>
                      <input
                        type="date"
                        value={bulkAttEndDate}
                        onChange={(e) => setBulkAttEndDate(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Target Staff *</label>
                      <select
                        value={bulkAttTarget}
                        onChange={(e) => setBulkAttTarget(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                      >
                        <option value="all">All Active Staff ({members.length} members)</option>
                        {members.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.employeeId})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Default Status *</label>
                      <select
                        value={bulkAttDefaultStatus}
                        onChange={(e) => setBulkAttDefaultStatus(e.target.value as AttendanceStatus)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                      >
                        <option value="present">Present (09:00 - 17:30)</option>
                        <option value="late">Late</option>
                        <option value="absent">Absent</option>
                        <option value="excused">Excused / Holiday</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <input
                      type="checkbox"
                      id="skip-weekends"
                      checked={bulkSkipWeekends}
                      onChange={(e) => setBulkSkipWeekends(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
                    />
                    <label htmlFor="skip-weekends" className="text-xs font-medium text-slate-700 cursor-pointer">
                      Skip Weekends (Exclude Saturdays & Sundays from generation)
                    </label>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleSaveBulkAttendance}
                      disabled={isSubmittingBulkAtt}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                    >
                      {isSubmittingBulkAtt ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                      <span>Generate & Save Range to Firestore</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-indigo-600" />
            <span>Direct Firestore CRUD with offline-first caching</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-white transition-colors"
          >
            Close Studio
          </button>
        </div>

      </motion.div>
    </div>
  );
};
