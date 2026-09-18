import React, { useState, useEffect } from 'react';
import { 
  Volume2, 
  VolumeX, 
  X, 
  Play, 
  CheckCircle2, 
  LogIn, 
  LogOut, 
  FileText, 
  Sparkles, 
  Bell, 
  Sliders
} from 'lucide-react';
import { 
  isAudioEnabled, 
  setAudioEnabled, 
  getAudioVolume, 
  setAudioVolume, 
  testAudioTone 
} from '../utils/audioAlerts';

interface SoundSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SoundSettingsModal: React.FC<SoundSettingsModalProps> = ({ isOpen, onClose }) => {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(0.75);
  const [activeTest, setActiveTest] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEnabled(isAudioEnabled());
      setVolume(getAudioVolume());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    setAudioEnabled(next);
    if (next) {
      testAudioTone('punch_in');
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setAudioVolume(val);
  };

  const playPreview = (type: 'punch_in' | 'punch_out' | 'leave_submit' | 'leave_approve' | 'leave_reject' | 'notification', id: string) => {
    setActiveTest(id);
    testAudioTone(type);
    setTimeout(() => {
      setActiveTest(null);
    }, 700);
  };

  const soundProfiles = [
    {
      id: 'punch_in',
      type: 'punch_in' as const,
      title: 'Punch In (Check-In)',
      desc: 'Bright, ascending marimba triad for clocking in',
      icon: LogIn,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
    },
    {
      id: 'punch_out',
      type: 'punch_out' as const,
      title: 'Punch Out (Check-Out)',
      desc: 'Warm, peaceful descending chord for shift completion',
      icon: LogOut,
      color: 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100',
    },
    {
      id: 'leave_submit',
      type: 'leave_submit' as const,
      title: 'Leave Application Submitted',
      desc: 'Fluid dispatch chime with crystalline overtone',
      icon: FileText,
      color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100',
    },
    {
      id: 'leave_approve',
      type: 'leave_approve' as const,
      title: 'Leave Approved',
      desc: 'Joyful 4-note major fanfare chime for approval',
      icon: Sparkles,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100',
    },
    {
      id: 'leave_reject',
      type: 'leave_reject' as const,
      title: 'Leave Request Update',
      desc: 'Gentle, soft two-tone notice for status change',
      icon: Bell,
      color: 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100',
    },
    {
      id: 'notification',
      type: 'notification' as const,
      title: 'Live Real-Time Alerts',
      desc: 'Refined dual glass ping for live events & sync',
      icon: Bell,
      color: 'text-violet-600 bg-violet-50 border-violet-200 hover:bg-violet-100',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        id="sound-settings-modal-dialog"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Audio Chimes & Notification Sounds</h2>
              <p className="text-xs text-slate-500">Acoustic harmonic audio alerts for punches and leave workflows</p>
            </div>
          </div>
          <button
            id="close-sound-settings-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          
          {/* Master Toggle & Volume */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {enabled ? (
                  <Volume2 className="w-5 h-5 text-indigo-600" />
                ) : (
                  <VolumeX className="w-5 h-5 text-slate-400" />
                )}
                <div>
                  <div className="text-sm font-bold text-slate-800">Sound Effects & Alerts</div>
                  <div className="text-xs text-slate-500">
                    {enabled ? 'Audio enabled for punches, leaves & notifications' : 'Audio is currently muted'}
                  </div>
                </div>
              </div>
              <button
                id="toggle-sound-master-btn"
                type="button"
                onClick={handleToggle}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  enabled ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {enabled && (
              <div className="pt-3 border-t border-slate-200/70 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sliders className="w-3.5 h-3.5 text-slate-400" />
                    Chime Volume
                  </span>
                  <span className="font-bold text-slate-700">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  id="sound-volume-slider"
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            )}
          </div>

          {/* Interactive Sound Preview Gallery */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preview Sound Suite</h3>
              <span className="text-[11px] text-slate-400">Click to listen</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {soundProfiles.map((item) => {
                const Icon = item.icon;
                const isPlaying = activeTest === item.id;
                return (
                  <button
                    key={item.id}
                    id={`preview-sound-${item.id}`}
                    type="button"
                    onClick={() => playPreview(item.type, item.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isPlaying 
                        ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/40' 
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 transition-colors ${item.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">{item.title}</div>
                        <div className="text-[11px] text-slate-500 truncate">{item.desc}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pl-2">
                      <span className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all ${
                        isPlaying 
                          ? 'bg-indigo-600 text-white border-indigo-600' 
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}>
                        {isPlaying ? (
                          <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span className="text-[11px]">{isPlaying ? 'Playing' : 'Test'}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            Powered by Web Audio API • Instant zero-lag playback
          </p>
          <button
            id="done-sound-settings-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
