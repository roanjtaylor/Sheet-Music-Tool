import { useState, useEffect, useRef } from 'react';
import { MIN_TEMPO, MAX_TEMPO, NOTE_TYPES } from '../constants';

export default function TempoModal({
  isOpen,
  onClose,
  tempo,
  noteType,
  onApply,
}) {
  const [localTempo, setLocalTempo] = useState(tempo);
  const [localNoteType, setLocalNoteType] = useState(noteType);
  const inputRef = useRef(null);

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalTempo(tempo);
      setLocalNoteType(noteType);
      // Focus the input after a short delay to allow modal to render
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, tempo, noteType]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        handleApply();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, localTempo, localNoteType]);

  const handleApply = () => {
    // Clamp tempo to valid range
    const clampedTempo = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, localTempo));
    onApply(clampedTempo, localNoteType);
    onClose();
  };

  const handleTempoChange = (e) => {
    const value = e.target.value;
    // Allow empty string for typing, otherwise parse as integer
    if (value === '') {
      setLocalTempo('');
    } else {
      const parsed = parseInt(value);
      if (!isNaN(parsed)) {
        setLocalTempo(parsed);
      }
    }
  };

  const handleTempoBlur = () => {
    // On blur, clamp to valid range
    if (localTempo === '' || isNaN(localTempo)) {
      setLocalTempo(tempo); // Revert to previous value
    } else {
      setLocalTempo(Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, localTempo)));
    }
  };

  const currentNoteInfo = NOTE_TYPES.find(n => n.value === localNoteType) || NOTE_TYPES[2];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card p-6 w-80 max-w-[90vw]">
        <h2 className="text-lg font-bold text-[#DAA520] mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          Tempo Settings
        </h2>

        {/* Tempo Preview */}
        <div className="text-center mb-5 py-3 bg-[#1a1a2e] rounded-lg border border-[#DAA520]/20">
          <span className="text-3xl font-serif text-white">
            {currentNoteInfo.symbol} = {localTempo || '—'}
          </span>
        </div>

        {/* BPM Input */}
        <div className="mb-4">
          <label className="block text-xs text-[#808080] uppercase tracking-wider mb-2">
            Beats Per Minute
          </label>
          <input
            ref={inputRef}
            type="number"
            min={MIN_TEMPO}
            max={MAX_TEMPO}
            value={localTempo}
            onChange={handleTempoChange}
            onBlur={handleTempoBlur}
            className="w-full px-4 py-3 bg-[#2C3E50] text-white text-lg font-semibold rounded-lg border border-[#DAA520]/30 focus:border-[#DAA520] focus:outline-none transition-colors text-center"
            placeholder="120"
          />
          <p className="text-xs text-[#606060] mt-1 text-center">
            Range: {MIN_TEMPO} - {MAX_TEMPO} BPM
          </p>
        </div>

        {/* Note Type Dropdown */}
        <div className="mb-6">
          <label className="block text-xs text-[#808080] uppercase tracking-wider mb-2">
            Beat Unit
          </label>
          <select
            value={localNoteType}
            onChange={(e) => setLocalNoteType(e.target.value)}
            className="w-full px-4 py-3 bg-[#2C3E50] text-white rounded-lg border border-[#DAA520]/30 focus:border-[#DAA520] focus:outline-none transition-colors cursor-pointer appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23DAA520'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '20px',
            }}
          >
            {NOTE_TYPES.map((note) => (
              <option key={note.value} value={note.value}>
                {note.symbol} {note.label}
              </option>
            ))}
          </select>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-[#C0C0C0] glossy-button hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2.5 rounded-lg text-white font-medium transition-all"
            style={{
              background: 'linear-gradient(180deg, #C41E3A 0%, #8B0000 100%)',
              border: '1px solid #DAA520',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
