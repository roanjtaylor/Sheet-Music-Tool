import { useState, useRef } from 'react';
import { API_URL, MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from '../constants';

// Estimated processing time in seconds (4 minutes)
const ESTIMATED_PROCESSING_TIME = 240;

// Arc Reactor style circular countdown component
function CircularCountdown({ secondsRemaining, totalSeconds }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, secondsRemaining / totalSeconds);
  const strokeDashoffset = circumference * (1 - progress);

  // Format time as M:SS
  const formatTime = (seconds) => {
    if (seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isOvertime = secondsRemaining <= 0;

  return (
    <div className="relative w-36 h-36">
      {/* Outer glow ring */}
      <div className="absolute inset-0 rounded-full opacity-30 blur-md bg-gradient-to-r from-[#00D4FF] to-[#DAA520]" />

      <svg className="w-full h-full transform -rotate-90 relative z-10" viewBox="0 0 120 120">
        {/* SVG Gradient Definition */}
        <defs>
          <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00D4FF" />
            <stop offset="50%" stopColor="#DAA520" />
            <stop offset="100%" stopColor="#C41E3A" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Background circle */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#2C3E50"
          strokeWidth="8"
          opacity="0.5"
        />
        {/* Inner decorative ring */}
        <circle
          cx="60"
          cy="60"
          r={radius - 10}
          fill="none"
          stroke="#1E3A5F"
          strokeWidth="2"
          opacity="0.5"
        />
        {/* Progress circle */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={isOvertime ? '#DAA520' : 'url(#arcGradient)'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          filter="url(#glow)"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <span className={`text-2xl font-bold ${isOvertime ? 'text-[#DAA520]' : 'text-[#00D4FF]'} drop-shadow-lg`}>
          {formatTime(secondsRemaining)}
        </span>
        <span className="text-xs text-[#C0C0C0] uppercase tracking-wider">
          remaining
        </span>
      </div>
    </div>
  );
}

export default function Upload({ onProcessed, isProcessing, setIsProcessing }) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ message: '', eta: null, total: null });
  const fileInputRef = useRef(null);

  const validateFile = (file) => {
    if (!file) return 'No file selected';
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return 'Invalid file type. Please upload PNG or JPG only.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`;
    }
    return null;
  };

  const processFile = async (file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProgress({
      message: 'Analyzing sheet music...',
      eta: ESTIMATED_PROCESSING_TIME,
      total: ESTIMATED_PROCESSING_TIME
    });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const startTime = Date.now();

      // Update countdown every second
      const etaInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = ESTIMATED_PROCESSING_TIME - elapsed;
        setProgress(prev => ({ ...prev, eta: remaining }));
      }, 1000);

      const response = await fetch(`${API_URL}/process`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(etaInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to process image');
      }

      const data = await response.json();
      onProcessed(data);

    } catch (err) {
      setError(err.message || 'Failed to process image. Please try again.');
    } finally {
      setIsProcessing(false);
      setProgress({ message: '', eta: null, total: null });
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (isProcessing) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      if (files.length > 1) {
        setError('Please upload only one file at a time.');
        return;
      }
      processFile(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (isProcessing) return;
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleClick = () => {
    if (!isProcessing) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <div
        className={`
          dropzone p-10 text-center cursor-pointer
          ${isProcessing ? 'opacity-70 cursor-not-allowed' : ''}
          ${dragActive ? 'active' : ''}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isProcessing}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-5 py-4">
            {progress.eta !== null && progress.total !== null ? (
              <>
                <CircularCountdown
                  secondsRemaining={progress.eta}
                  totalSeconds={progress.total}
                />
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-[#DAA520]">
                    {progress.eta > 0 ? 'Analyzing Sheet Music' : 'Almost Ready...'}
                  </p>
                  <p className="text-sm text-[#A0A0A0]">
                    {progress.eta > 0
                      ? 'AI is recognizing musical notation'
                      : 'Taking a bit longer than expected'}
                  </p>
                </div>
                {/* Scanning animation bars */}
                <div className="flex gap-1 mt-2">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-[#C41E3A] to-[#DAA520] rounded-full animate-pulse"
                      style={{
                        height: `${20 + Math.random() * 20}px`,
                        animationDelay: `${i * 0.1}s`
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 border-4 border-[#DAA520] border-t-transparent rounded-full animate-spin" />
                <p className="text-[#C0C0C0]">{progress.message}</p>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {/* Upload icon with glow */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full blur-xl bg-[#DAA520] opacity-20" />
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-[#2C3E50] to-[#1a1a2e] flex items-center justify-center border border-[#DAA520]/30">
                <svg
                  className="w-8 h-8 text-[#DAA520]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xl font-semibold text-[#C0C0C0]">
                Drop your sheet music here
              </p>
              <p className="text-sm text-[#808080]">
                or click to browse files
              </p>
            </div>

            {/* File type badges */}
            <div className="flex gap-2 mt-2">
              <span className="px-3 py-1 text-xs font-medium text-[#00D4FF] bg-[#1E3A5F]/50 rounded-full border border-[#00D4FF]/30">
                PNG
              </span>
              <span className="px-3 py-1 text-xs font-medium text-[#00D4FF] bg-[#1E3A5F]/50 rounded-full border border-[#00D4FF]/30">
                JPG
              </span>
              <span className="px-3 py-1 text-xs font-medium text-[#808080] bg-[#2C3E50]/50 rounded-full border border-[#808080]/30">
                Max 50MB
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-[#8B0000]/20 border border-[#C41E3A]/50 rounded-xl text-[#FF6B6B] backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
