import React, { useState, useMemo } from 'react';
import { 
  UserPlus, 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  Eye, 
  EyeOff,
  Mail, 
  Phone, 
  Calendar, 
  Building2, 
  CheckCircle, 
  XCircle, 
  X,
  Sparkles,
  Users,
  KeyRound,
  Lock,
  ShieldCheck,
  Camera
} from 'lucide-react';
import { Member, ShiftType } from '../types';
import { DEPARTMENTS, AVATAR_COLORS, formatDateKey } from '../utils/storage';
import { createOrUpdateMemberAccount } from '../utils/cryptoAuth';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';
import { motion, AnimatePresence } from 'motion/react';

interface MembersAdminViewProps {
  members: Member[];
  onAddMember: (member: Member) => void;
  onUpdateMember: (member: Member) => void;
  onDeleteMember: (memberId: string) => void;
  onSelectPerson: (member: Member) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
}

export const MembersAdminView: React.FC<MembersAdminViewProps> = ({
  members,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  onSelectPerson,
  isAddModalOpen,
  setIsAddModalOpen
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State for Add / Edit
  const [formName, setFormName] = useState('');
  const [formEmpId, setFormEmpId] = useState('');
  const [formDept, setFormDept] = useState<string>(DEPARTMENTS[0]);
  const [formRole, setFormRole] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formJoinDate, setFormJoinDate] = useState('2026-01-15');
  const [formShift, setFormShift] = useState<ShiftType>('regular');
  const [formAvatarColor, setFormAvatarColor] = useState<string>(AVATAR_COLORS[0]);
  const [formAvatarUrl, setFormAvatarUrl] = useState<string | undefined>(undefined);
  const [formPassword, setFormPassword] = useState('StaffSecure2026!');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [isPhotoEditorForFormOpen, setIsPhotoEditorForFormOpen] = useState(false);

  const filteredMembers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return members.filter(m => {
      const matchSearch = !term ||
        (m.name && m.name.toLowerCase().includes(term)) ||
        (m.email && m.email.toLowerCase().includes(term)) ||
        (m.employeeId && m.employeeId.toLowerCase().includes(term)) ||
        (m.role && m.role.toLowerCase().includes(term)) ||
        (m.department && m.department.toLowerCase().includes(term));
      const matchDept = selectedDept === 'All' || m.department === selectedDept;
      return matchSearch && matchDept;
    });
  }, [members, searchTerm, selectedDept]);

  const openAddModal = () => {
    // Generate next employee ID
    const nextId = `EMP-${1000 + members.length + 1}`;
    setFormName('');
    setFormEmpId(nextId);
    setFormDept(DEPARTMENTS[0]);
    setFormRole('');
    setFormEmail('');
    setFormPhone('');
    setFormJoinDate(formatDateKey(new Date()));
    setFormShift('regular');
    setFormAvatarColor(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
    setFormAvatarUrl(undefined);
    setFormPassword('StaffSecure2026!');
    setEditingMember(null);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (member: Member) => {
    setEditingMember(member);
    setFormName(member.name);
    setFormEmpId(member.employeeId);
    setFormDept(member.department);
    setFormRole(member.role);
    setFormEmail(member.email);
    setFormPhone(member.phone || '');
    setFormJoinDate(member.joinDate);
    setFormShift(member.shift);
    setFormAvatarColor(member.avatarColor);
    setFormAvatarUrl(member.avatarUrl);
    setFormPassword('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formName.trim();
    if (!cleanName) {
      setFormError('Please enter the staff member\'s full name.');
      return;
    }
    setFormError(null);

    const cleanEmpId = formEmpId.trim() || `EMP-${1000 + members.length + 1}`;
    const cleanEmail = formEmail.trim() || `${cleanName.toLowerCase().replace(/\s+/g, '.')}@company.io`;
    const cleanRole = formRole.trim() || 'Staff Member';
    const pwdToSave = formPassword ? formPassword.trim() : (editingMember ? undefined : 'StaffSecure2026!');

    if (editingMember) {
      // Update existing member
      const updated: Member = {
        ...editingMember,
        name: cleanName,
        employeeId: cleanEmpId,
        department: formDept,
        role: cleanRole,
        email: cleanEmail,
        phone: formPhone.trim() || undefined,
        joinDate: formJoinDate,
        shift: formShift,
        avatarColor: formAvatarColor,
        avatarUrl: formAvatarUrl
      };
      onUpdateMember(updated);
      await createOrUpdateMemberAccount(updated, pwdToSave).catch(err => {
        console.warn('Background account sync notice:', err);
      });
    } else {
      // Add new member
      const newMember: Member = {
        id: `mem-${Date.now()}`,
        name: cleanName,
        employeeId: cleanEmpId,
        department: formDept,
        role: cleanRole,
        email: cleanEmail,
        phone: formPhone.trim() || undefined,
        joinDate: formJoinDate,
        shift: formShift,
        avatarColor: formAvatarColor,
        avatarUrl: formAvatarUrl,
        active: true
      };
      onAddMember(newMember);
      await createOrUpdateMemberAccount(newMember, pwdToSave || 'StaffSecure2026!').catch(err => {
        console.warn('Background account sync notice:', err);
      });
    }

    // Instantly close the modal and reset state
    setIsAddModalOpen(false);
    setEditingMember(null);
    setFormName('');
    setFormEmpId('');
    setFormRole('');
    setFormEmail('');
    setFormPhone('');
    setFormPassword('');
    setFormAvatarUrl(undefined);
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      
      {/* Top Header & Add Member Button */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
              <Users className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
              Staff Administration
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Members & Attendee Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manually register and manage staff, students, or team members tracked in the daily attendance registry.
          </p>
        </div>

        <button
          id="add-new-member-btn"
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New Member</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input for filtering by Name or Email */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              id="members-search-input"
              aria-label="Filter members by name or email"
              placeholder="Search member by name or email address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs transition-all placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                type="button"
                id="clear-members-search-btn"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Department Filter */}
          <div className="w-full sm:w-48 shrink-0">
            <select
              id="members-dept-select"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full py-2.5 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs font-medium cursor-pointer"
            >
              <option value="All">All Departments</option>
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search status & results count */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-800">{filteredMembers.length}</strong> of {members.length} registered members
            </span>
            {(searchTerm || selectedDept !== 'All') && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); setSelectedDept('All'); }}
                className="text-indigo-600 hover:text-indigo-800 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Reset filter</span>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {searchTerm && (
            <span className="text-slate-400 truncate hidden sm:inline">
              Filtering by: &ldquo;<span className="text-slate-600 font-medium">{searchTerm}</span>&rdquo;
            </span>
          )}
        </div>
      </div>

      {/* Members Directory Grid */}
      {filteredMembers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map((member) => (
            <motion.div
              key={member.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={member.name}
                        onClick={() => onSelectPerson(member)}
                        className="w-12 h-12 rounded-2xl object-cover shadow-sm border border-slate-200 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                      />
                    ) : (
                      <div 
                        onClick={() => onSelectPerson(member)}
                        className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${member.avatarColor} text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0 cursor-pointer hover:opacity-90 transition-opacity`}
                      >
                        {member.name.split(' ').map(n => n[0]).join('')}
                      </div>
                    )}
                    <div>
                      <h3 
                        onClick={() => onSelectPerson(member)}
                        className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 cursor-pointer transition-colors"
                      >
                        {member.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {member.employeeId}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400 capitalize">
                          {member.shift} Shift
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    member.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {member.active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Card Body Details */}
                <div className="space-y-1.5 py-2 text-xs border-y border-slate-100 my-2">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-medium truncate">{member.department} • {member.role}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{member.email}</span>
                  </div>
                  {member.phone && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{member.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Joined: {member.joinDate}</span>
                  </div>
                </div>
              </div>

              {/* Card Actions */}
              <div className="flex items-center justify-between pt-2 gap-2">
                <button
                  id={`card-view-report-${member.id}`}
                  onClick={() => onSelectPerson(member)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Attendance Dossier</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    id={`card-edit-${member.id}`}
                    onClick={() => openEditModal(member)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                    title="Edit Member Details"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    id={`card-delete-${member.id}`}
                    onClick={() => setMemberToDelete(member)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Delete Member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            {searchTerm || selectedDept !== 'All' ? 'No Matching Staff Members' : 'No Staff in Roster (Clean Real Database)'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            {searchTerm || selectedDept !== 'All' 
              ? 'Try clearing the search filters or choosing a different department.' 
              : 'Your roster is clean. Click below to manually add your first real employee.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            {searchTerm || selectedDept !== 'All' ? (
              <button
                type="button"
                id="members-empty-clear-btn"
                onClick={() => { setSearchTerm(''); setSelectedDept('All'); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shadow-xs cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
                <span>Clear Search &amp; Filters</span>
              </button>
            ) : null}
            <button
              id="members-empty-add-btn"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Real Employee</span>
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Member Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-indigo-600" />
                  <span>{editingMember ? 'Edit Staff Member' : 'Register New Member'}</span>
                </h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveMember} className="space-y-3.5">
                
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>{formError}</span>
                  </div>
                )}
                
                {/* Full Name & Employee ID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      id="member-form-name"
                      required
                      placeholder="e.g. Johnathan Doe"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Employee ID / Code *
                    </label>
                    <input
                      type="text"
                      id="member-form-empid"
                      required
                      placeholder="e.g. EMP-1011"
                      value={formEmpId}
                      onChange={(e) => setFormEmpId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Department & Role */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Department
                    </label>
                    <select
                      id="member-form-dept"
                      value={formDept}
                      onChange={(e) => setFormDept(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Job Title / Role
                    </label>
                    <input
                      type="text"
                      id="member-form-role"
                      placeholder="e.g. Frontend Developer"
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="member-form-email"
                      placeholder="e.g. j.doe@company.io"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      id="member-form-phone"
                      placeholder="e.g. +1 (555) 000-0000"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Shift & Join Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Shift Schedule
                    </label>
                    <select
                      id="member-form-shift"
                      value={formShift}
                      onChange={(e) => setFormShift(e.target.value as ShiftType)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 capitalize"
                    >
                      <option value="regular">Regular (10:00 AM - 7:00 PM)</option>
                      <option value="morning">Morning (8:00 AM - 4:30 PM)</option>
                      <option value="evening">Evening (2:00 PM - 10:30 PM)</option>
                      <option value="night">Night Shift</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Joining Date
                    </label>
                    <input
                      type="date"
                      id="member-form-joindate"
                      value={formJoinDate}
                      onChange={(e) => setFormJoinDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* User Portal Login Password */}
                <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{editingMember ? 'Update User Login Password (Optional)' : 'User Portal Login Password *'}</span>
                    </label>
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-md">
                      Auto-hashed SHA-256
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type={showFormPassword ? 'text' : 'password'}
                      id="member-form-password"
                      placeholder={editingMember ? 'Leave blank to keep existing password' : 'Min. 6 characters (e.g. StaffSecure2026!)'}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword(!showFormPassword)}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showFormPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-indigo-600/80">
                    This staff member will use their work email/employee ID and this password to sign into the User Side.
                  </p>
                </div>

                {/* Profile Photo & Avatar Theme */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Profile Photo & Theme
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsPhotoEditorForFormOpen(true)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{formAvatarUrl ? 'Change Photo' : 'Upload / Take Photo'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Avatar Preview */}
                    <div 
                      onClick={() => setIsPhotoEditorForFormOpen(true)}
                      className="relative cursor-pointer group shrink-0"
                    >
                      {formAvatarUrl ? (
                        <img
                          src={formAvatarUrl}
                          alt="Preview"
                          className="w-12 h-12 rounded-xl object-cover border-2 border-indigo-500 shadow-xs"
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${formAvatarColor} text-white flex items-center justify-center font-bold text-base shadow-xs`}>
                          {(formName || 'User').split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                      )}
                      <div className="absolute inset-0 rounded-xl bg-slate-950/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Color Swatches */}
                    <div className="flex-1">
                      <p className="text-[11px] text-slate-500 mb-1.5">Monogram gradient background:</p>
                      <div className="flex items-center gap-2">
                        {AVATAR_COLORS.map((col, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setFormAvatarColor(col)}
                            className={`w-6 h-6 rounded-lg bg-gradient-to-tr ${col} transition-all ${
                              formAvatarColor === col ? 'ring-2 ring-indigo-600 ring-offset-2 scale-110' : 'opacity-70 hover:opacity-100'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="save-member-submit-btn"
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all"
                  >
                    {editingMember ? 'Save Changes' : 'Create Member'}
                  </button>
                </div>

              </form>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Photo Editor for Form */}
      <AnimatePresence>
        {isPhotoEditorForFormOpen && (
          <ProfilePhotoEditor
            currentAvatarUrl={formAvatarUrl}
            memberName={formName || 'New Staff Member'}
            avatarColor={formAvatarColor}
            onSavePhoto={(newUrl) => setFormAvatarUrl(newUrl)}
            onClose={() => setIsPhotoEditorForFormOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Delete Member Confirmation Modal (Safe In-App Modal, No window.confirm Blockers) */}
      <AnimatePresence>
        {memberToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-center"
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Delete Staff Member?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to remove <strong className="text-slate-800">{memberToDelete.name}</strong> ({memberToDelete.employeeId}) from the directory?
                </p>
                <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-[11px] text-amber-800 text-left">
                  ⚠️ This will permanently remove their attendance logs, leave records, and employee portal access.
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  id="cancel-delete-member-btn"
                  onClick={() => setMemberToDelete(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-delete-member-btn"
                  onClick={() => {
                    const id = memberToDelete.id;
                    setMemberToDelete(null);
                    onDeleteMember(id);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                >
                  Yes, Delete Member
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
