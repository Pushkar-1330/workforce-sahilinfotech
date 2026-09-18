import React, { useState } from 'react';
import { 
  X, 
  Lock, 
  KeyRound, 
  User, 
  Mail, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff,
  LogOut
} from 'lucide-react';
import { AuthSession } from '../types';
import { 
  evaluatePasswordStrength, 
  generateSalt, 
  hashPassword, 
  loadAccounts, 
  logSecurityEvent, 
  saveAccounts, 
  verifyPassword 
} from '../utils/cryptoAuth';

interface AccountSettingsModalProps {
  session: AuthSession;
  onClose: () => void;
  onLogout: () => void;
  onSessionUpdated: (updatedSession: AuthSession) => void;
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  session,
  onClose,
  onLogout,
  onSessionUpdated
}) => {
  // Form states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newName, setNewName] = useState(session.name);

  // UI states
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const passwordStrength = evaluatePasswordStrength(newPassword);

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!currentPassword || !newPassword) {
      setErrorMessage('Please fill in both current and new passwords.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match.');
      return;
    }

    setIsUpdating(true);

    try {
      const accounts = loadAccounts();
      const accountIndex = accounts.findIndex(a => a.id === session.userId || a.email.toLowerCase() === session.email.toLowerCase());

      if (accountIndex === -1) {
        setErrorMessage('Account record not found.');
        setIsUpdating(false);
        return;
      }

      const account = accounts[accountIndex];

      // Verify current password
      const isCurrentValid = await verifyPassword(currentPassword, account.passwordHash, account.salt);
      if (!isCurrentValid) {
        setErrorMessage('Current password entered is incorrect.');
        logSecurityEvent('LOGIN_FAILED', session.email, 'Failed password change attempt: Incorrect old password', session.role);
        setIsUpdating(false);
        return;
      }

      // Hash new password
      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);

      account.passwordHash = newHash;
      account.salt = newSalt;
      account.name = newName.trim() || account.name;
      saveAccounts(accounts);

      logSecurityEvent('PASSWORD_CHANGED', session.email, 'User updated security credentials with fresh cryptographic salt', session.role);

      setSuccessMessage('Password updated securely with new cryptographic salt.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Update session name if changed
      if (newName.trim() && newName !== session.name) {
        onSessionUpdated({ ...session, name: newName.trim() });
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to update password.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Account Security & Credentials</h2>
              <p className="text-xs text-slate-400">Manage your profile and encrypted password</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">

          {/* Account Profile Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                {session.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{session.name}</h3>
                <p className="text-xs text-slate-500 font-mono">{session.email}</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 uppercase tracking-wider">
              {session.role}
            </span>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Password Change Form */}
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Display Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Current Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Verify your existing password"
                  className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  New Password
                </label>
                {newPassword && (
                  <span className="text-[10px] font-semibold text-slate-500">
                    Strength: <span className={passwordStrength.score >= 3 ? 'text-emerald-600' : 'text-amber-600'}>{passwordStrength.label}</span>
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {newPassword.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex gap-1">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`h-full flex-1 transition-colors duration-300 ${
                          passwordStrength.score >= step ? passwordStrength.color : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isUpdating}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              {isUpdating ? 'Updating Hash...' : 'Save & Update Password'}
            </button>
          </form>

        </div>

        {/* Footer Logout Option */}
        <div className="p-4 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Session SHA-256 Token
          </span>

          <button
            onClick={() => { onClose(); onLogout(); }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>End Session & Sign Out</span>
          </button>
        </div>

      </div>
    </div>
  );
};
