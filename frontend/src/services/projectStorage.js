/**
 * IndexedDB-based storage service for sheet music projects.
 *
 * Each project stores:
 * - id: Auto-generated unique identifier
 * - name: Project name (auto-extracted from metadata or filename, user-editable)
 * - musicxml: The processed MusicXML content
 * - originalImage: The original uploaded image as a Blob
 * - metadata: Extracted metadata (title, composer, tempo, time signature, key, etc.)
 * - voiceAnalysis: Voice/melody detection results for future levels system
 * - settings: User preferences (tempo, zoom, beat unit)
 * - createdAt: Timestamp of creation
 * - updatedAt: Timestamp of last update
 */

const DB_NAME = 'SheetMusicProjects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

let dbPromise = null;

/**
 * Initialize and open the IndexedDB database
 */
function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create the projects object store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });

        // Create indexes for efficient querying
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Generate a unique project ID
 */
function generateId() {
  return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extract a display name from metadata or filename
 */
function extractProjectName(metadata, filename) {
  // Priority: title from metadata > filename without extension
  if (metadata?.title) {
    return metadata.title;
  }

  if (filename) {
    // Remove extension and clean up
    return filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
  }

  return `Project ${new Date().toLocaleDateString()}`;
}

/**
 * Convert a File/Blob to base64 for storage
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert base64 back to Blob
 */
function base64ToBlob(base64) {
  const parts = base64.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

/**
 * Save a new project or update an existing one
 *
 * @param {Object} projectData - Project data to save
 * @param {string} projectData.musicxml - MusicXML content
 * @param {Blob|File} projectData.originalImage - Original image file
 * @param {Object} projectData.metadata - Extracted metadata
 * @param {Object} projectData.voiceAnalysis - Voice analysis results
 * @param {string} projectData.filename - Original filename
 * @param {string} [projectData.id] - Existing project ID (for updates)
 * @param {string} [projectData.name] - Custom project name
 * @param {Object} [projectData.settings] - User settings
 * @returns {Promise<Object>} Saved project with ID
 */
export async function saveProject(projectData) {
  const db = await openDB();

  const {
    musicxml,
    originalImage,
    metadata = {},
    voiceAnalysis = {},
    filename = '',
    id = null,
    name = null,
    settings = {}
  } = projectData;

  // Convert image to base64 for storage
  let imageBase64 = null;
  if (originalImage) {
    imageBase64 = await blobToBase64(originalImage);
  }

  const now = new Date().toISOString();

  const project = {
    id: id || generateId(),
    name: name || extractProjectName(metadata, filename),
    musicxml,
    originalImage: imageBase64,
    metadata,
    voiceAnalysis,
    settings: {
      tempo: settings.tempo || metadata.tempo || 120,
      zoom: settings.zoom || 1.0,
      noteType: settings.noteType || 'quarter',
      ...settings
    },
    createdAt: id ? undefined : now, // Only set on create
    updatedAt: now
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // For updates, we need to get the existing project first to preserve createdAt
    if (id) {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (existing) {
          project.createdAt = existing.createdAt;
        } else {
          project.createdAt = now;
        }

        const putRequest = store.put(project);
        putRequest.onsuccess = () => resolve(project);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    } else {
      project.createdAt = now;
      const addRequest = store.put(project);
      addRequest.onsuccess = () => resolve(project);
      addRequest.onerror = () => reject(addRequest.error);
    }
  });
}

/**
 * Get all projects, sorted by most recently updated
 * @returns {Promise<Array>} Array of projects (without full musicxml/image for performance)
 */
export async function getAllProjects() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Return lightweight project summaries, sorted by updatedAt descending
      const projects = request.result
        .map(project => ({
          id: project.id,
          name: project.name,
          metadata: project.metadata,
          settings: project.settings,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          // Include a flag indicating if image exists
          hasImage: !!project.originalImage,
          // Include thumbnail data URL if available (small enough to include)
          thumbnailUrl: project.originalImage || null
        }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      resolve(projects);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a single project by ID
 * @param {string} id - Project ID
 * @returns {Promise<Object|null>} Full project data or null if not found
 */
export async function getProject(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const project = request.result;
      if (project && project.originalImage) {
        // Convert base64 back to blob for the image
        project.originalImageBlob = base64ToBlob(project.originalImage);
      }
      resolve(project || null);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a project by ID
 * @param {string} id - Project ID
 * @returns {Promise<void>}
 */
export async function deleteProject(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update project name
 * @param {string} id - Project ID
 * @param {string} newName - New project name
 * @returns {Promise<Object>} Updated project
 */
export async function renameProject(id, newName) {
  const project = await getProject(id);
  if (!project) {
    throw new Error(`Project ${id} not found`);
  }

  project.name = newName;
  project.updatedAt = new Date().toISOString();

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(project);

    request.onsuccess = () => resolve(project);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update project settings (tempo, zoom, noteType, etc.)
 * @param {string} id - Project ID
 * @param {Object} settings - Settings to update
 * @returns {Promise<Object>} Updated project
 */
export async function updateProjectSettings(id, settings) {
  const project = await getProject(id);
  if (!project) {
    throw new Error(`Project ${id} not found`);
  }

  project.settings = { ...project.settings, ...settings };
  project.updatedAt = new Date().toISOString();

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(project);

    request.onsuccess = () => resolve(project);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Check if database has any projects
 * @returns {Promise<boolean>}
 */
export async function hasProjects() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();

    request.onsuccess = () => resolve(request.result > 0);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all projects (use with caution!)
 * @returns {Promise<void>}
 */
export async function clearAllProjects() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export default {
  saveProject,
  getAllProjects,
  getProject,
  deleteProject,
  renameProject,
  updateProjectSettings,
  hasProjects,
  clearAllProjects
};
