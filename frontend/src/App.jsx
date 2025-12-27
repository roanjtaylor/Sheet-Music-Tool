import { useState, useRef, useCallback } from 'react';
import Upload from './components/Upload';
import SheetDisplay from './components/SheetDisplay';
import PlaybackControls from './components/PlaybackControls';
import ErrorDisplay from './components/ErrorDisplay';
import usePlayback from './hooks/usePlayback';

function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [zoom, setZoom] = useState(1.0);

  const sheetDisplayRef = useRef(null);
  const playback = usePlayback(sheetDisplayRef);

  const handleProcessed = useCallback((data) => {
    setResult(data);
    // Set tempo from MusicXML if available
    if (data.tempo) {
      playback.setTempo(data.tempo);
    }
  }, [playback]);

  const handlePlayPause = useCallback(() => {
    if (result?.musicxml) {
      playback.togglePlayPause(result.musicxml);
    }
  }, [result, playback]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(2.0, z + 0.1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.5, z - 0.1));
  }, []);

  const handleCopyPng = useCallback(() => {
    if (sheetDisplayRef.current) {
      sheetDisplayRef.current.copyAsPng();
    }
  }, []);

  const hasSheet = result?.musicxml && result.musicxml.length > 0;

  return (
    <div className="min-h-screen relative">
      {/* Animated Background */}
      <div className="animated-bg">
        <div className="gradient-blob gradient-blob-1" />
        <div className="gradient-blob gradient-blob-2" />
        <div className="gradient-blob gradient-blob-3" />
        <div className="gradient-blob gradient-blob-4" />
      </div>

      {/* Noise texture overlay for that skeuomorphic feel */}
      <div className="noise-overlay" />

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Header - Brushed Metal Style */}
        <header className="brushed-metal">
          <div className="max-w-6xl mx-auto px-6 py-5">
            <div className="flex items-center gap-4">
              {/* Logo/Icon */}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#C41E3A] to-[#8B0000] shadow-lg border border-[#DAA520]">
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-shine">
                  Sheet Music Tool
                </h1>
                <p className="text-sm text-[#A0A0A0] mt-0.5">
                  Upload piano sheet music and hear it played back
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 py-8 pb-28">
          {/* Upload Section */}
          <Upload
            onProcessed={handleProcessed}
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
          />

          {/* Error/Warning Display */}
          {result && (
            <ErrorDisplay
              errors={result.errors || []}
              warnings={result.warnings || []}
            />
          )}

          {/* Sheet Music Display */}
          {hasSheet && (
            <div className="mt-8">
              <SheetDisplay
                ref={sheetDisplayRef}
                musicxml={result.musicxml}
                errors={result.errors || []}
                zoom={zoom}
              />
            </div>
          )}
        </main>

        {/* Floating Playback Controls */}
        {hasSheet && (
          <PlaybackControls
            isPlaying={playback.isPlaying}
            isLoading={playback.isLoading}
            tempo={playback.tempo}
            onPlayPause={handlePlayPause}
            onTempoChange={playback.setTempo}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onCopyPng={handleCopyPng}
            zoom={zoom}
            disabled={!hasSheet}
          />
        )}
      </div>
    </div>
  );
}

export default App;
