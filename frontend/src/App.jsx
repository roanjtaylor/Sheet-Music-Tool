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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800">
            Sheet Music Tool
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload piano sheet music and hear it played back
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
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
  );
}

export default App;
