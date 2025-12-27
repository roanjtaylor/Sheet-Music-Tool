import { MIN_TEMPO, MAX_TEMPO, MIN_ZOOM, MAX_ZOOM } from '../constants';

export default function PlaybackControls({
  isPlaying,
  isLoading,
  tempo,
  onPlayPause,
  onTempoChange,
  onZoomIn,
  onZoomOut,
  onCopyPng,
  zoom,
  disabled,
}) {
  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 control-panel px-6 py-4 flex items-center gap-5 z-50">
      {/* Play/Pause Button - Iron Man styled */}
      <button
        onClick={onPlayPause}
        disabled={disabled || isLoading}
        className={`
          w-14 h-14 rounded-full flex items-center justify-center
          transition-all duration-200 relative
          ${disabled || isLoading
            ? 'bg-[#2C3E50] text-[#5a5a6a] cursor-not-allowed'
            : 'iron-button text-white'
          }
        `}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {/* Arc reactor glow effect when playing */}
        {isPlaying && !isLoading && (
          <div className="absolute inset-0 rounded-full bg-[#C41E3A] opacity-30 animate-ping" />
        )}

        {isLoading ? (
          <div className="w-6 h-6 border-3 border-[#DAA520] border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <svg className="w-6 h-6 relative z-10" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="w-6 h-6 ml-1 relative z-10" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Divider */}
      <div className="w-px h-10 bg-gradient-to-b from-transparent via-[#DAA520]/30 to-transparent" />

      {/* Tempo Control */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[#808080] uppercase tracking-wider">Tempo</span>
        <input
          type="range"
          min={MIN_TEMPO}
          max={MAX_TEMPO}
          value={tempo}
          onChange={(e) => onTempoChange(parseInt(e.target.value))}
          disabled={disabled}
          className="w-28 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <span className="text-sm font-semibold text-[#DAA520] w-16 tabular-nums">
          {tempo} <span className="text-[#808080] font-normal">BPM</span>
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-10 bg-gradient-to-b from-transparent via-[#DAA520]/30 to-transparent" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onZoomOut}
          disabled={disabled || zoom <= MIN_ZOOM}
          className={`
            w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold
            transition-all duration-200 glossy-button
            ${disabled || zoom <= MIN_ZOOM
              ? 'text-[#4a4a5a] cursor-not-allowed opacity-50'
              : 'text-[#C0C0C0] hover:text-[#DAA520]'
            }
          `}
          title="Zoom Out"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        <span className="text-sm font-medium text-[#C0C0C0] w-14 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={onZoomIn}
          disabled={disabled || zoom >= MAX_ZOOM}
          className={`
            w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold
            transition-all duration-200 glossy-button
            ${disabled || zoom >= MAX_ZOOM
              ? 'text-[#4a4a5a] cursor-not-allowed opacity-50'
              : 'text-[#C0C0C0] hover:text-[#DAA520]'
            }
          `}
          title="Zoom In"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-10 bg-gradient-to-b from-transparent via-[#DAA520]/30 to-transparent" />

      {/* Copy as PNG Button */}
      <button
        onClick={onCopyPng}
        disabled={disabled}
        className={`
          px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium
          transition-all duration-200 glossy-button
          ${disabled
            ? 'text-[#4a4a5a] cursor-not-allowed opacity-50'
            : 'text-[#C0C0C0] hover:text-[#DAA520]'
          }
        `}
        title="Copy as PNG"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <span className="hidden sm:inline">Export</span>
      </button>
    </div>
  );
}
