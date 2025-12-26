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
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg border border-gray-200 px-4 py-3 flex items-center gap-4 z-50">
      {/* Play/Pause Button */}
      <button
        onClick={onPlayPause}
        disabled={disabled || isLoading}
        className={`
          w-12 h-12 rounded-full flex items-center justify-center
          transition-colors duration-200
          ${disabled || isLoading
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-blue-500 hover:bg-blue-600 text-white'
          }
        `}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Divider */}
      <div className="w-px h-8 bg-gray-200" />

      {/* Tempo Control */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Tempo:</span>
        <input
          type="range"
          min={MIN_TEMPO}
          max={MAX_TEMPO}
          value={tempo}
          onChange={(e) => onTempoChange(parseInt(e.target.value))}
          disabled={disabled}
          className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-sm font-medium text-gray-700 w-16">
          {tempo} BPM
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-gray-200" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onZoomOut}
          disabled={disabled || zoom <= MIN_ZOOM}
          className={`
            w-8 h-8 rounded flex items-center justify-center text-lg font-bold
            transition-colors duration-200
            ${disabled || zoom <= MIN_ZOOM
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }
          `}
          title="Zoom Out"
        >
          −
        </button>
        <span className="text-sm text-gray-600 w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          disabled={disabled || zoom >= MAX_ZOOM}
          className={`
            w-8 h-8 rounded flex items-center justify-center text-lg font-bold
            transition-colors duration-200
            ${disabled || zoom >= MAX_ZOOM
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }
          `}
          title="Zoom In"
        >
          +
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-gray-200" />

      {/* Copy as PNG Button */}
      <button
        onClick={onCopyPng}
        disabled={disabled}
        className={`
          px-3 py-2 rounded flex items-center gap-2 text-sm
          transition-colors duration-200
          ${disabled
            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
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
        Copy as PNG
      </button>
    </div>
  );
}
