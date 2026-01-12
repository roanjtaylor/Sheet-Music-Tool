import { useState, useRef, useCallback, useEffect } from 'react';
import ProjectsBar from './components/ProjectsBar';
import UploadModal from './components/UploadModal';
import SheetDisplay from './components/SheetDisplay';
import PlaybackControls from './components/PlaybackControls';
import ErrorDisplay from './components/ErrorDisplay';
import usePlayback from './hooks/usePlayback';
import { saveProject, updateProjectSettings } from './services/projectStorage';

function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [zoom, setZoom] = useState(1.0);

  // Project management state
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [currentProjectName, setCurrentProjectName] = useState(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [projectRefreshTrigger, setProjectRefreshTrigger] = useState(0);

  // For project refresh/update
  const [refreshProjectId, setRefreshProjectId] = useState(null);
  const [refreshProjectName, setRefreshProjectName] = useState(null);

  const sheetDisplayRef = useRef(null);
  const playback = usePlayback(sheetDisplayRef);

  // Handle new project processed (from upload)
  const handleProcessed = useCallback(async (data) => {
    setResult(data);

    // Set tempo from MusicXML if available
    if (data.tempo) {
      playback.setTempo(data.tempo);
    }

    // Save to IndexedDB if we have the original file
    if (data.originalFile && data.musicxml) {
      try {
        const savedProject = await saveProject({
          musicxml: data.musicxml,
          originalImage: data.originalFile,
          metadata: data.metadata || {},
          voiceAnalysis: data.voiceAnalysis || {},
          filename: data.filename,
          id: data.existingProjectId || null,  // Update existing if provided
          name: data.existingProjectName || null,
          settings: {
            tempo: data.tempo || 120,
            zoom: zoom,
            noteType: playback.noteType
          }
        });

        setCurrentProjectId(savedProject.id);
        setCurrentProjectName(savedProject.name);

        // Trigger ProjectsBar refresh
        setProjectRefreshTrigger(prev => prev + 1);
      } catch (err) {
        console.error('Failed to save project:', err);
        // Still show the result even if save fails
      }
    }
  }, [playback, zoom]);

  // Handle loading a project from ProjectsBar
  const handleProjectLoad = useCallback((data) => {
    setResult({
      musicxml: data.musicxml,
      metadata: data.metadata,
      tempo: data.tempo,
      warnings: data.warnings || [],
      errors: data.errors || [],
      voiceAnalysis: data.voiceAnalysis
    });

    setCurrentProjectId(data.projectId);
    setCurrentProjectName(data.projectName);

    // Apply saved settings
    if (data.settings?.tempo) {
      playback.setTempo(data.settings.tempo, data.settings.noteType);
    } else if (data.tempo) {
      playback.setTempo(data.tempo);
    }

    if (data.settings?.zoom) {
      setZoom(data.settings.zoom);
    }
  }, [playback]);

  // Handle upload button click
  const handleUploadClick = useCallback(() => {
    setRefreshProjectId(null);
    setRefreshProjectName(null);
    setIsUploadModalOpen(true);
  }, []);

  // Handle project refresh (re-upload to update)
  const handleRefreshProject = useCallback((projectId, projectName) => {
    setRefreshProjectId(projectId);
    setRefreshProjectName(projectName);
    setIsUploadModalOpen(true);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (result?.musicxml) {
      playback.togglePlayPause(result.musicxml);
    }
  }, [result, playback]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => {
      const newZoom = Math.min(2.0, z + 0.1);
      // Save zoom to project if we have one
      if (currentProjectId) {
        updateProjectSettings(currentProjectId, { zoom: newZoom }).catch(console.error);
      }
      return newZoom;
    });
  }, [currentProjectId]);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => {
      const newZoom = Math.max(0.5, z - 0.1);
      // Save zoom to project if we have one
      if (currentProjectId) {
        updateProjectSettings(currentProjectId, { zoom: newZoom }).catch(console.error);
      }
      return newZoom;
    });
  }, [currentProjectId]);

  const handleCopyPng = useCallback(() => {
    if (sheetDisplayRef.current) {
      sheetDisplayRef.current.copyAsPng();
    }
  }, []);

  // Save tempo changes to project
  const handleTempoChange = useCallback((newTempo, newNoteType) => {
    playback.setTempo(newTempo, newNoteType);

    // Save to project if we have one
    if (currentProjectId) {
      updateProjectSettings(currentProjectId, {
        tempo: newTempo,
        noteType: newNoteType
      }).catch(console.error);
    }
  }, [currentProjectId, playback]);

  const hasSheet = result?.musicxml && result.musicxml.length > 0;

  return (
    <div className="min-h-screen relative">
      {/* Animated Background */}
      <div className="animated-bg">
        <div className="gradient-blob gradient-blob-1" />
        <div className="gradient-blob gradient-blob-2" />
        <div className="gradient-blob gradient-blob-3" />
        <div className="gradient-blob gradient-blob-4" />
        <div className="gradient-blob gradient-blob-5" />
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
                <p className="text-sm text-[#FFD700] mt-0.5 opacity-90">
                  Upload piano sheet music and hear it played back
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 py-8 pb-28">
          {/* Projects Bar - replaces Upload component */}
          <ProjectsBar
            onProjectLoad={handleProjectLoad}
            onUploadClick={handleUploadClick}
            isProcessing={isProcessing}
            currentProjectId={currentProjectId}
            refreshTrigger={projectRefreshTrigger}
          />

          {/* Current project info */}
          {currentProjectName && (
            <div className="max-w-6xl mx-auto px-4 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[#808080]">Now playing:</span>
                <span className="text-[#DAA520] font-medium">{currentProjectName}</span>
                {result?.metadata?.composer && (
                  <span className="text-[#606060]">by {result.metadata.composer}</span>
                )}
              </div>
              {currentProjectId && !currentProjectId.startsWith('demo_') && (
                <button
                  onClick={() => handleRefreshProject(currentProjectId, currentProjectName)}
                  className="px-3 py-1.5 text-xs rounded-lg bg-[#1E3A5F]/50 text-[#00D4FF] border border-[#00D4FF]/30 hover:border-[#00D4FF]/60 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  Re-upload
                </button>
              )}
            </div>
          )}

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
                tempo={playback.tempo}
                noteType={playback.noteType}
              />
            </div>
          )}

          {/* Voice Analysis Debug Info (hidden by default, can be enabled for development) */}
          {false && result?.voiceAnalysis && (
            <div className="mt-4 p-4 bg-[#1a1a2e]/80 border border-[#DAA520]/20 rounded-lg text-xs text-[#808080]">
              <h4 className="text-[#DAA520] font-medium mb-2">Voice Analysis (Debug)</h4>
              <pre className="overflow-auto">
                {JSON.stringify(result.voiceAnalysis, null, 2)}
              </pre>
            </div>
          )}
        </main>

        {/* Floating Playback Controls */}
        {hasSheet && (
          <PlaybackControls
            isPlaying={playback.isPlaying}
            isLoading={playback.isLoading}
            tempo={playback.tempo}
            noteType={playback.noteType}
            onPlayPause={handlePlayPause}
            onTempoChange={handleTempoChange}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onCopyPng={handleCopyPng}
            zoom={zoom}
            disabled={!hasSheet}
          />
        )}
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onProcessed={handleProcessed}
        existingProjectId={refreshProjectId}
        existingProjectName={refreshProjectName}
      />
    </div>
  );
}

export default App;
