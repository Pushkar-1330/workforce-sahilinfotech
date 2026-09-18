import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, 
  Upload, 
  Trash2, 
  X, 
  Check, 
  RefreshCw, 
  FlipHorizontal, 
  AlertCircle, 
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';
import { processAndCompressImage } from '../utils/imageUtils';
import { motion, AnimatePresence } from 'motion/react';

interface ProfilePhotoEditorProps {
  currentAvatarUrl?: string;
  memberName: string;
  avatarColor: string;
  onSavePhoto: (newAvatarUrl: string | undefined) => void;
  onClose: () => void;
}

export const ProfilePhotoEditor: React.FC<ProfilePhotoEditorProps> = ({
  currentAvatarUrl,
  memberName,
  avatarColor,
  onSavePhoto,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>('upload');
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Camera States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [hasCapturedShot, setHasCapturedShot] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraLoading(false);
  }, []);

  // Enumerate video devices
  useEffect(() => {
    async function getDevices() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevs = devices.filter(d => d.kind === 'videoinput');
          setCameraDevices(videoDevs);
          if (videoDevs.length > 0 && !selectedDeviceId) {
            setSelectedDeviceId(videoDevs[0].deviceId);
          }
        }
      } catch (err) {
        console.warn('Unable to enumerate camera devices', err);
      }
    }
    getDevices();
  }, [selectedDeviceId]);

  // Start Camera
  const startCamera = useCallback(async (deviceId?: string) => {
    stopCamera();
    setIsCameraLoading(true);
    setErrorMessage(null);
    setHasCapturedShot(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser or environment.');
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 640 } }
          : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera startup failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Camera access was blocked. Please grant camera permission in your browser to take a photo.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No camera device detected on this system.');
      } else {
        setErrorMessage(`Camera error: ${err.message || 'Unable to connect to webcam.'}`);
      }
      setIsCameraActive(false);
    } finally {
      setIsCameraLoading(false);
    }
  }, [stopCamera]);

  // Handle switching to camera tab
  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera(selectedDeviceId);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab, selectedDeviceId, startCamera, stopCamera]);

  // Snap photo from video element
  const captureSnapshot = async () => {
    if (!videoRef.current) return;
    setIsProcessing(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const size = Math.min(video.videoWidth || 640, video.videoHeight || 640);
      canvas.width = 360;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('Canvas context unavailable');

      ctx.save();
      if (isMirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      // Center-crop video frame
      const sx = ((video.videoWidth || 640) - size) / 2;
      const sy = ((video.videoHeight || 640) - size) / 2;

      ctx.drawImage(video, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const compressed = await processAndCompressImage(rawDataUrl, 320, 0.88);
      
      setPreviewUrl(compressed);
      setHasCapturedShot(true);
      stopCamera();
    } catch (err: any) {
      setErrorMessage(`Snapshot capture failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle File Upload from device picker
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPEG, WebP, GIF).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Image size exceeds 10MB limit. Please select a smaller photo.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const compressed = await processAndCompressImage(file, 320, 0.88);
      setPreviewUrl(compressed);
    } catch (err: any) {
      setErrorMessage(`Failed to process image: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Drag & Drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please drop a valid image file.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const compressed = await processAndCompressImage(file, 320, 0.88);
      setPreviewUrl(compressed);
    } catch (err: any) {
      setErrorMessage(`Failed to process image: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Apply and save
  const handleSave = () => {
    onSavePhoto(previewUrl || undefined);
    onClose();
  };

  // Remove photo
  const handleRemovePhoto = () => {
    setPreviewUrl(null);
    setHasCapturedShot(false);
  };

  const initials = memberName.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div 
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/40 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Update Profile Photo</h3>
              <p className="text-[11px] text-slate-300">Staff Member: {memberName}</p>
            </div>
          </div>
          <button
            id="close-photo-editor-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <button
            id="tab-device-picker-btn"
            type="button"
            onClick={() => { setActiveTab('upload'); setErrorMessage(null); }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload from Device</span>
          </button>

          <button
            id="tab-camera-capture-btn"
            type="button"
            onClick={() => { setActiveTab('camera'); setErrorMessage(null); }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'camera'
                ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Take Photo (Camera)</span>
          </button>
        </div>

        {/* Main Body */}
        <div className="p-6 space-y-5">
          {/* Error Alert */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{errorMessage}</p>
                {activeTab === 'camera' && (
                  <button
                    onClick={() => startCamera(selectedDeviceId)}
                    className="mt-1 text-[11px] underline font-bold text-rose-900 cursor-pointer"
                  >
                    Retry connecting camera
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tab 1: Device Upload */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50 hover:bg-indigo-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-xs">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <h4 className="text-xs font-bold text-slate-800">
                  Click to select photo or drag & drop
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Supports PNG, JPG, WebP up to 10MB (automatically optimized)
                </p>
              </div>
            </div>
          )}

          {/* Tab 2: Browser Camera */}
          {activeTab === 'camera' && (
            <div className="space-y-4">
              {/* Camera Video Viewport */}
              <div className="relative w-full aspect-square max-w-[280px] mx-auto rounded-3xl overflow-hidden bg-slate-900 border-4 border-slate-800 shadow-inner flex items-center justify-center">
                {isCameraLoading && (
                  <div className="text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                    <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                    <span>Connecting camera...</span>
                  </div>
                )}

                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''} ${
                    !isCameraActive ? 'hidden' : ''
                  }`}
                />

                {/* Live viewfinder target overlay */}
                {isCameraActive && (
                  <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-white/30 rounded-full m-6"></div>
                )}
              </div>

              {/* Camera Controls */}
              {isCameraActive && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsMirrored(prev => !prev)}
                    title="Flip camera preview horizontally"
                    className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FlipHorizontal className="w-4 h-4" />
                    <span className="text-[11px]">Mirror</span>
                  </button>

                  <button
                    id="camera-snap-photo-btn"
                    type="button"
                    onClick={captureSnapshot}
                    disabled={isProcessing}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capture Photo</span>
                  </button>

                  {cameraDevices.length > 1 && (
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      className="text-[11px] p-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-medium cursor-pointer"
                    >
                      {cameraDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {!isCameraActive && !isCameraLoading && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => startCamera(selectedDeviceId)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Start Camera
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Live Preview of Current / New Selection */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Circular Avatar Preview */}
              <div className="relative shrink-0">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={memberName}
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-indigo-500 shadow-sm"
                  />
                ) : (
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${avatarColor} text-white flex items-center justify-center font-bold text-lg shadow-sm`}>
                    {initials}
                  </div>
                )}
                {previewUrl && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white"></span>
                )}
              </div>

              <div>
                <h5 className="text-xs font-bold text-slate-900">
                  {previewUrl ? 'Custom Profile Photo' : 'Default Monogram Avatar'}
                </h5>
                <p className="text-[11px] text-slate-500">
                  {previewUrl ? 'Ready to apply across system' : 'Displays gradient with initials'}
                </p>
              </div>
            </div>

            {/* Remove / Reset Button */}
            {previewUrl && (
              <button
                id="remove-profile-photo-btn"
                type="button"
                onClick={handleRemovePhoto}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                title="Remove custom photo and revert to initials"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            id="save-profile-photo-btn"
            type="button"
            onClick={handleSave}
            disabled={isProcessing}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Save Profile Photo</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
