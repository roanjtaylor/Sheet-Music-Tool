import { useState, useEffect, useRef } from 'react';
import {
  getAllProjects,
  getProject,
  deleteProject,
  renameProject,
  saveProject
} from '../services/projectStorage';
import { API_URL } from '../constants';

/**
 * Project card component for displaying a single project in the bar
 */
function ProjectCard({
  project,
  isSelected,
  isDemo,
  onClick,
  onDelete,
  onRename,
  isLoading
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleRename = () => {
    if (editName.trim() && editName !== project.name) {
      onRename(project.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setEditName(project.name);
      setIsEditing(false);
    }
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className={`
        relative flex-shrink-0 w-48 rounded-xl overflow-hidden cursor-pointer
        transition-all duration-200 transform hover:scale-105
        ${isSelected
          ? 'ring-2 ring-[#DAA520] shadow-lg shadow-[#DAA520]/30'
          : 'hover:ring-1 hover:ring-[#DAA520]/50'
        }
        ${isLoading ? 'opacity-50 pointer-events-none' : ''}
      `}
      onClick={() => !isEditing && onClick(project)}
    >
      {/* Thumbnail or placeholder */}
      <div className="h-28 bg-gradient-to-br from-[#1a1a2e] to-[#2C3E50] flex items-center justify-center relative">
        {project.thumbnailUrl ? (
          <img
            src={project.thumbnailUrl}
            alt={project.name}
            className="w-full h-full object-cover opacity-70"
          />
        ) : (
          <svg className="w-12 h-12 text-[#DAA520]/50" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
        )}

        {/* Demo badge */}
        {isDemo && (
          <div className="absolute top-2 left-2 px-2 py-0.5 text-xs font-medium bg-[#DAA520] text-[#1a1a2e] rounded-full">
            Demo
          </div>
        )}

        {/* Menu button */}
        {!isDemo && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="absolute top-2 right-2 p-1 rounded-full bg-[#1a1a2e]/70 hover:bg-[#1a1a2e] text-[#C0C0C0] transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </button>
        )}

        {/* Dropdown menu */}
        {showMenu && (
          <div
            className="absolute top-10 right-2 bg-[#1a1a2e] border border-[#DAA520]/30 rounded-lg shadow-xl z-20 min-w-[120px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setShowMenu(false);
                setIsEditing(true);
              }}
              className="w-full px-3 py-2 text-left text-sm text-[#C0C0C0] hover:bg-[#2C3E50] flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
              Rename
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                if (confirm(`Delete "${project.name}"?`)) {
                  onDelete(project.id);
                }
              }}
              className="w-full px-3 py-2 text-left text-sm text-[#FF6B6B] hover:bg-[#2C3E50] flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
              Delete
            </button>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]/80">
            <div className="w-8 h-8 border-3 border-[#DAA520] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Project info */}
      <div className="p-3 bg-gradient-to-b from-[#2C3E50] to-[#1a1a2e]">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-[#1a1a2e] border border-[#DAA520]/50 rounded px-2 py-1 text-sm text-[#C0C0C0] focus:outline-none focus:border-[#DAA520]"
          />
        ) : (
          <h3 className="text-sm font-medium text-[#C0C0C0] truncate" title={project.name}>
            {project.name}
          </h3>
        )}
        <div className="flex items-center gap-2 mt-1">
          {project.metadata?.time_signature && (
            <span className="text-xs text-[#808080]">
              {project.metadata.time_signature}
            </span>
          )}
          {project.metadata?.key_signature && (
            <span className="text-xs text-[#808080]">
              {project.metadata.key_signature}
            </span>
          )}
          {project.updatedAt && (
            <span className="text-xs text-[#606060] ml-auto">
              {formatDate(project.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Click overlay to close menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Upload card component for adding new projects
 */
function UploadCard({ onClick, isProcessing }) {
  return (
    <div
      onClick={!isProcessing ? onClick : undefined}
      className={`
        flex-shrink-0 w-48 h-[148px] rounded-xl border-2 border-dashed
        border-[#DAA520]/30 hover:border-[#DAA520]/60
        bg-gradient-to-br from-[#1a1a2e]/50 to-[#2C3E50]/50
        flex flex-col items-center justify-center gap-3 cursor-pointer
        transition-all duration-200 hover:scale-105
        ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <div className="w-12 h-12 rounded-full bg-[#1E3A5F]/50 flex items-center justify-center border border-[#DAA520]/30">
        <svg className="w-6 h-6 text-[#DAA520]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
        </svg>
      </div>
      <span className="text-sm text-[#C0C0C0]">Upload New</span>
    </div>
  );
}

/**
 * Main ProjectsBar component
 */
export default function ProjectsBar({
  onProjectLoad,
  onUploadClick,
  isProcessing,
  currentProjectId,
  refreshTrigger
}) {
  const [projects, setProjects] = useState([]);
  const [loadingProjectId, setLoadingProjectId] = useState(null);
  const [demoProject, setDemoProject] = useState(null);
  const scrollRef = useRef(null);

  // Load projects from IndexedDB
  const loadProjects = async () => {
    try {
      const savedProjects = await getAllProjects();
      setProjects(savedProjects);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  // Initialize: load projects and check for demo
  useEffect(() => {
    loadProjects();

    // Create a demo project entry for "Let It Snow" from backend cache
    setDemoProject({
      id: 'demo_letitsnow',
      name: 'Let It Snow',
      metadata: {
        title: 'Let It Snow',
        time_signature: '4/4'
      },
      isDemo: true
    });
  }, []);

  // Reload projects when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadProjects();
    }
  }, [refreshTrigger]);

  // Handle project selection
  const handleProjectClick = async (project) => {
    if (loadingProjectId) return;

    setLoadingProjectId(project.id);

    try {
      if (project.isDemo) {
        // Load demo from backend API
        const response = await fetch(`${API_URL}/test-files/LetItSnow`);
        if (!response.ok) {
          throw new Error('Failed to load demo project');
        }
        const data = await response.json();
        onProjectLoad({
          ...data,
          projectId: project.id,
          projectName: project.name,
          isDemo: true
        });
      } else {
        // Load from IndexedDB
        const fullProject = await getProject(project.id);
        if (fullProject) {
          onProjectLoad({
            musicxml: fullProject.musicxml,
            metadata: fullProject.metadata,
            tempo: fullProject.settings?.tempo || fullProject.metadata?.tempo || 120,
            voiceAnalysis: fullProject.voiceAnalysis,
            warnings: [],
            errors: [],
            projectId: fullProject.id,
            projectName: fullProject.name,
            settings: fullProject.settings
          });
        }
      }
    } catch (err) {
      console.error('Failed to load project:', err);
      alert(`Failed to load project: ${err.message}`);
    } finally {
      setLoadingProjectId(null);
    }
  };

  // Handle project deletion
  const handleDelete = async (id) => {
    try {
      await deleteProject(id);
      await loadProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert('Failed to delete project');
    }
  };

  // Handle project rename
  const handleRename = async (id, newName) => {
    try {
      await renameProject(id, newName);
      await loadProjects();
    } catch (err) {
      console.error('Failed to rename project:', err);
      alert('Failed to rename project');
    }
  };

  // Scroll buttons for the projects bar
  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  const allProjects = [
    ...(demoProject ? [demoProject] : []),
    ...projects
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#C0C0C0]">
          Your Projects
        </h2>
        <div className="text-sm text-[#808080]">
          {projects.length} saved project{projects.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="relative">
        {/* Scroll left button */}
        {allProjects.length > 4 && (
          <button
            onClick={scrollLeft}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-[#1a1a2e]/90 border border-[#DAA520]/30 text-[#DAA520] flex items-center justify-center hover:bg-[#2C3E50] transition-colors shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
        )}

        {/* Projects scroll container */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-[#DAA520]/30 scrollbar-track-transparent px-2"
          style={{ scrollbarWidth: 'thin' }}
        >
          {/* Upload card first */}
          <UploadCard onClick={onUploadClick} isProcessing={isProcessing} />

          {/* Project cards */}
          {allProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isSelected={currentProjectId === project.id}
              isDemo={project.isDemo}
              onClick={handleProjectClick}
              onDelete={handleDelete}
              onRename={handleRename}
              isLoading={loadingProjectId === project.id}
            />
          ))}
        </div>

        {/* Scroll right button */}
        {allProjects.length > 4 && (
          <button
            onClick={scrollRight}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-[#1a1a2e]/90 border border-[#DAA520]/30 text-[#DAA520] flex items-center justify-center hover:bg-[#2C3E50] transition-colors shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
