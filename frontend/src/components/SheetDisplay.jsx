import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { OpenSheetMusicDisplay as OSMD } from 'opensheetmusicdisplay';
import { HIGHLIGHT_COLOR, DEFAULT_COLOR } from '../constants';

const SheetDisplay = forwardRef(function SheetDisplay(
  { musicxml, errors = [], zoom = 1.0 },
  ref
) {
  const containerRef = useRef(null);
  const osmdRef = useRef(null);

  // Initialize OSMD with cursor enabled
  useEffect(() => {
    if (!containerRef.current) return;

    osmdRef.current = new OSMD(containerRef.current, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawComposer: true,
      drawCredits: true,
      drawPartNames: true,
      autoBeam: true, // Automatically beam eighth notes and shorter together
      followCursor: false, // Disabled to allow free scrolling during playback
      cursorsOptions: [{
        type: 0, // Standard cursor
        color: HIGHLIGHT_COLOR,
        alpha: 0.5,
        follow: false, // Disabled to allow free scrolling
      }],
    });

    return () => {
      if (osmdRef.current) {
        osmdRef.current = null;
      }
    };
  }, []);

  // Load MusicXML when it changes
  useEffect(() => {
    if (!osmdRef.current || !musicxml) return;

    const loadSheet = async () => {
      try {
        await osmdRef.current.load(musicxml);
        osmdRef.current.render();
        // Cursor will be hidden initially
        if (osmdRef.current.cursor) {
          osmdRef.current.cursor.hide();
        }
      } catch (err) {
        console.error('Failed to load MusicXML:', err);
      }
    };

    loadSheet();
  }, [musicxml]);

  // Update zoom
  useEffect(() => {
    if (!osmdRef.current || !musicxml) return;

    osmdRef.current.zoom = zoom;
    osmdRef.current.render();
  }, [zoom, musicxml]);

  // Reset all highlighted elements back to default color
  const resetAllRedElements = useCallback(() => {
    const svgContainer = containerRef.current?.querySelector('svg');
    if (!svgContainer) return;

    // Find all elements with highlight fill and reset to default
    const redElements = svgContainer.querySelectorAll(`[fill="${HIGHLIGHT_COLOR}"], [fill="red"]`);
    redElements.forEach((el) => {
      el.setAttribute('fill', DEFAULT_COLOR);
    });

    // Also check style.fill
    const allPaths = svgContainer.querySelectorAll('path, ellipse');
    allPaths.forEach((el) => {
      if (el.style.fill === HIGHLIGHT_COLOR || el.style.fill === 'red' || el.style.fill === 'rgb(255, 0, 0)') {
        el.style.fill = '';
        el.setAttribute('fill', DEFAULT_COLOR);
      }
    });
  }, []);

  // Clear highlights and hide cursor
  const clearHighlights = useCallback(() => {
    resetAllRedElements();
    if (osmdRef.current?.cursor) {
      try {
        osmdRef.current.cursor.hide();
      } catch {
        // Ignore
      }
    }
  }, [resetAllRedElements]);

  // Color notes under the current cursor position red
  const highlightNotesAtTime = useCallback(() => {
    if (!osmdRef.current?.cursor) return;

    // First, reset all red elements back to black
    resetAllRedElements();

    try {
      const cursor = osmdRef.current.cursor;
      cursor.show();

      // Get graphical notes under cursor using OSMD's API
      let gNotesUnderCursor = [];
      try {
        gNotesUnderCursor = cursor.GNotesUnderCursor() || [];
      } catch {
        // Some OSMD versions may not have this method
      }

      // Color each graphical note red
      gNotesUnderCursor.forEach((gNote) => {
        let svgElement = null;

        // Try different paths to get the SVG element
        if (gNote.vfnote && gNote.vfnote[0] && gNote.vfnote[0].attrs) {
          svgElement = gNote.vfnote[0].attrs.el;
        } else if (gNote.vfnote && gNote.vfnote.attrs) {
          svgElement = gNote.vfnote.attrs.el;
        }

        if (svgElement) {
          const paths = svgElement.querySelectorAll('path, ellipse');
          paths.forEach((path) => {
            path.setAttribute('fill', HIGHLIGHT_COLOR);
          });
        }
      });

      // Also color using the cursor's voice entries (catches both staves)
      if (cursor.Iterator?.CurrentVoiceEntries) {
        cursor.Iterator.CurrentVoiceEntries.forEach((ve) => {
          ve.Notes.forEach((note) => {
            const sheet = osmdRef.current.GraphicSheet;
            if (sheet) {
              try {
                const gNotes = sheet.findGraphicalNote(note);
                if (gNotes) {
                  const gNoteArray = Array.isArray(gNotes) ? gNotes : [gNotes];
                  gNoteArray.forEach((gn) => {
                    if (gn?.vfnote?.[0]?.attrs?.el) {
                      const svgEl = gn.vfnote[0].attrs.el;
                      const paths = svgEl.querySelectorAll('path, ellipse');
                      paths.forEach((path) => {
                        path.setAttribute('fill', HIGHLIGHT_COLOR);
                      });
                    }
                  });
                }
              } catch {
                // Ignore individual note errors
              }
            }
          });
        });
      }
    } catch {
      // Ignore highlight errors
    }
  }, [resetAllRedElements]);

  // Helper to check if cursor has actual notes (not rests)
  const cursorHasNotes = useCallback(() => {
    try {
      const cursor = osmdRef.current?.cursor;
      if (!cursor) return true;

      // Check using NotesUnderCursor - filter out rests
      const notes = cursor.NotesUnderCursor() || [];

      // A note is a rest if it doesn't have a pitch or is marked as rest
      const actualNotes = notes.filter(note => {
        if (!note) return false;
        if (note.isRest === true) return false;
        // Check if note has pitch (not a rest)
        return note.pitch !== undefined && note.pitch !== null;
      });

      return actualNotes.length > 0;
    } catch {
      return true; // Assume has notes if we can't check
    }
  }, []);

  // Advance cursor to next position, skipping rest-only positions
  const advanceCursor = useCallback(() => {
    if (!osmdRef.current?.cursor) return false;

    try {
      const cursor = osmdRef.current.cursor;
      if (cursor.Iterator?.EndReached) return false;

      // Advance at least once
      cursor.next();

      // Skip any rest-only positions
      while (!cursor.Iterator?.EndReached && !cursorHasNotes()) {
        cursor.next();
      }

      return !cursor.Iterator?.EndReached;
    } catch {
      return false;
    }
  }, [cursorHasNotes]);

  // Reset cursor to beginning, skipping initial rests
  const resetCursor = useCallback(() => {
    if (!osmdRef.current?.cursor) return;

    try {
      const cursor = osmdRef.current.cursor;
      cursor.reset();
      cursor.show();

      // Skip initial rest positions so first highlight matches first note
      while (!cursor.Iterator?.EndReached && !cursorHasNotes()) {
        cursor.next();
      }
    } catch {
      // Ignore
    }
  }, [cursorHasNotes]);

  // Build a map of cursor positions to their timestamps (in quarter notes)
  // This allows proper synchronization between audio time and cursor position
  const buildCursorTimeMap = useCallback(() => {
    if (!osmdRef.current?.cursor) return [];

    const timeMap = [];

    try {
      const cursor = osmdRef.current.cursor;
      cursor.reset();

      let cursorIndex = 0;

      while (!cursor.Iterator?.EndReached) {
        const timestamp = cursor.Iterator?.CurrentSourceTimestamp;
        const timeInQuarters = timestamp ? timestamp.RealValue : 0;

        if (cursorHasNotes()) {
          timeMap.push({
            cursorIndex,
            timeInQuarters: Math.round(timeInQuarters * 1000) / 1000,
          });
        }

        cursor.next();
        cursorIndex++;
      }

      cursor.reset();
      return timeMap;
    } catch {
      return [];
    }
  }, [cursorHasNotes]);

  // Get iterator for playback
  const getPlaybackIterator = useCallback(() => {
    if (!osmdRef.current) return null;

    try {
      const cursor = osmdRef.current.cursor;
      if (!cursor) return null;

      cursor.show();
      cursor.reset();

      return {
        next: () => {
          cursor.next();
          return !cursor.Iterator.EndReached;
        },
        reset: () => {
          cursor.reset();
        },
        getCurrentNotes: () => {
          return cursor.NotesUnderCursor();
        },
        getCurrentMeasureIndex: () => {
          return cursor.Iterator.CurrentMeasureIndex;
        },
        isEndReached: () => {
          return cursor.Iterator.EndReached;
        },
        hide: () => {
          cursor.hide();
        },
        show: () => {
          cursor.show();
        },
      };
    } catch (err) {
      console.error('Error getting playback iterator:', err);
      return null;
    }
  }, []);

  // Copy as PNG
  const copyAsPng = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      const svgElement = containerRef.current.querySelector('svg');
      if (!svgElement) return;

      // Clone SVG and prepare for export
      const clonedSvg = svgElement.cloneNode(true);
      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // Create canvas and draw SVG
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const scale = 2; // Higher resolution
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);

        // Copy to clipboard
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
              ]);
              alert('Sheet music copied to clipboard!');
            } catch {
              // Fallback: download as file
              const downloadUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = downloadUrl;
              a.download = 'sheet-music.png';
              a.click();
              URL.revokeObjectURL(downloadUrl);
            }
          }
        }, 'image/png');

        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (err) {
      console.error('Failed to copy as PNG:', err);
    }
  }, []);

  // Move cursor to a specific absolute position index
  const moveCursorToPosition = useCallback((targetIndex) => {
    if (!osmdRef.current?.cursor) return false;

    try {
      const cursor = osmdRef.current.cursor;
      cursor.reset();
      cursor.show();

      // Move to the target position
      for (let i = 0; i < targetIndex && !cursor.Iterator?.EndReached; i++) {
        cursor.next();
      }

      return !cursor.Iterator?.EndReached;
    } catch {
      return false;
    }
  }, []);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    highlightNotesAtTime,
    clearHighlights,
    getPlaybackIterator,
    advanceCursor,
    resetCursor,
    buildCursorTimeMap,
    moveCursorToPosition,
    copyAsPng,
    getOSMD: () => osmdRef.current,
  }), [highlightNotesAtTime, clearHighlights, getPlaybackIterator, advanceCursor, resetCursor, buildCursorTimeMap, moveCursorToPosition, copyAsPng]);

  return (
    <div className="w-full">
      {errors.length > 0 && (
        <div className="mb-4 p-4 bg-[#DAA520]/10 border border-[#DAA520]/30 rounded-xl backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-[#DAA520] flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-[#DAA520] font-medium">
                Some areas could not be fully recognized
              </p>
              <ul className="mt-2 text-sm text-[#B8860B] space-y-1">
                {errors.map((error, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-[#DAA520]" />
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Sheet container with gradient border */}
      <div className="sheet-container p-1">
        <div
          ref={containerRef}
          className="w-full bg-white rounded-lg overflow-auto"
          style={{ minHeight: '400px' }}
        />
      </div>
    </div>
  );
});

export default SheetDisplay;
