import { useState, useRef } from 'react';
import { API_URL, MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from '../constants';

export default function Upload({ onProcessed, isProcessing, setIsProcessing }) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ message: '', eta: null });
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
    setProgress({ message: 'Uploading image...', eta: null });

    try {
      // Estimate processing time (rough estimate based on file size)
      const estimatedSeconds = Math.max(5, Math.ceil(file.size / (1024 * 1024) * 3));
      setProgress({ message: 'Analyzing sheet music...', eta: estimatedSeconds });

      const formData = new FormData();
      formData.append('file', file);

      const startTime = Date.now();

      // Update ETA countdown
      const etaInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.max(0, estimatedSeconds - elapsed);
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
      setProgress({ message: '', eta: null });
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
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
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
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600">{progress.message}</p>
            {progress.eta !== null && (
              <p className="text-sm text-gray-500">
                Estimated time remaining: {progress.eta}s
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg
              className="w-12 h-12 text-gray-400"
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
            <p className="text-lg text-gray-600">
              Drag and drop your sheet music image here
            </p>
            <p className="text-sm text-gray-400">or click to select a file</p>
            <p className="text-xs text-gray-400 mt-2">PNG or JPG, max 50MB</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
