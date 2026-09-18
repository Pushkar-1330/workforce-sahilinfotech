import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  ShieldAlert,
  CalendarCheck2,
  Info
} from 'lucide-react';
import { 
  loadAccounts, 
  authenticateCredentials
} from '../utils/cryptoAuth';
import { AuthSession, Member } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface LoginScreenProps {
  members: Member[];
  onLoginSuccess: (session: AuthSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  members,
  onLoginSuccess
}) => {
  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Lockout countdown state
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState<number>(0);

  // Check lockout on email change or mount
  useEffect(() => {
    if (!email) return;
    const accounts = loadAccounts();
    const acc = accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
    if (acc && acc.lockedUntil && acc.lockedUntil > Date.now()) {
      const rem = Math.ceil((acc.lockedUntil - Date.now()) / 1000);
      setLockoutRemainingSec(rem);
    } else {
      setLockoutRemainingSec(0);
    }
  }, [email]);

  // Lockout countdown timer ticker
  useEffect(() => {
    if (lockoutRemainingSec <= 0) return;
    const timer = setInterval(() => {
      setLockoutRemainingSec(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemainingSec]);

  // Handle Login Submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your work email/ID and password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await authenticateCredentials(email, password, members);

      if (!res.success || !res.session) {
        if (res.lockoutSec) {
          setLockoutRemainingSec(res.lockoutSec);
        }
        setErrorMessage(res.error || 'Invalid credentials. Please verify your Employee ID / Email and password.');
        setIsLoading(false);
        return;
      }

      setSuccessMessage(`Authenticated as ${res.session.role === 'admin' ? 'Administrator' : 'Staff Member'}. Opening portal...`);
      setTimeout(() => {
        onLoginSuccess(res.session!);
      }, 400);

    } catch (err: any) {
      console.error('Authentication exception:', err);
      setErrorMessage(err?.message || 'Authentication error. Please verify your ID/Email and password or ask your Administrator.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 sm:px-6 py-12 relative overflow-hidden">
      
      {/* Subtle geometric background accents */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Authentication Card */}
      <motion.div 
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden relative z-10"
      >
        
        {/* Header Branding */}
        <div className="p-6 sm:p-8 pb-5 text-center border-b border-slate-700/60 bg-gradient-to-b from-slate-800/80 to-slate-800/30">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-500/10 mb-3">
            <CalendarCheck2 className="w-6 h-6" />
          </div>
          
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
            <span>Sahil Infotech</span>
            <span className="text-indigo-400">Workforce</span>
          </h1>
          
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Sign in to access your daily attendance, workforce analytics & punch records
          </p>

          {/* Security Badge */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/60 border border-slate-700 text-[11px] text-slate-300 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted SHA-256 Authentication</span>
          </div>
        </div>

        {/* Form Container */}
        <div className="p-6 sm:p-8 pt-6">

          {/* Feedback Banners */}
          <AnimatePresence mode="wait">
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span className="font-medium">{errorMessage}</span>
              </motion.div>
            )}

            {successMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <span className="font-medium">{successMessage}</span>
              </motion.div>
            )}

            {lockoutRemainingSec > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-4 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Brute-force security lock active</span>
                </div>
                <div className="font-mono font-bold text-amber-300 px-2 py-0.5 bg-amber-950/60 rounded border border-amber-500/30">
                  {lockoutRemainingSec}s
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ======================= LOGIN FORM ======================= */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Work Email, Username, or Employee ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="login-email-input"
                  type="text"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  disabled={lockoutRemainingSec > 0 || isLoading}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 transition-all font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  disabled={lockoutRemainingSec > 0 || isLoading}
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 transition-all font-sans"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={lockoutRemainingSec > 0 || isLoading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Staff Account Info Notice */}
          <div className="mt-5 p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              Staff member accounts & login passwords are created and managed directly by the System Administrator in the Staff Directory.
            </span>
          </div>

        </div>

        {/* Footer Security Guarantee */}
        <div className="px-6 py-3.5 bg-slate-900/90 border-t border-slate-700/60 text-center flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <Lock className="w-3.5 h-3.5 text-slate-500" />
          <span>Sahil Infotech Private Limited • Shift: 10:00 AM - 07:00 PM</span>
        </div>

      </motion.div>
    </div>
  );
};
