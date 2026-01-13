import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { OpenSheetMusicDisplay as OSMD } from 'opensheetmusicdisplay';
import { HIGHLIGHT_COLOR, DEFAULT_COLOR, NOTE_TYPES, DEFAULT_NOTE_TYPE } from '../constants';

const SheetDisplay = forwardRef(function SheetDisplay(
  { musicxml, errors = [], zoom = 1.0, tempo = 120, noteType = DEFAULT_NOTE_TYPE },
  ref
) {
  const currentNoteInfo = NOTE_TYPES.find(n => n.value === noteType) || NOTE_TYPES[2];
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
    const redFillElements = svgContainer.querySelectorAll(`[fill="${HIGHLIGHT_COLOR}"], [fill="red"]`);
    redFillElements.forEach((el) => {
      el.setAttribute('fill', DEFAULT_COLOR);
    });

    // Find all elements with highlight stroke (for stems, beams, etc.) and reset
    // This includes stems where we explicitly set stroke during highlighting
    const redStrokeElements = svgContainer.querySelectorAll(`[stroke="${HIGHLIGHT_COLOR}"], [stroke="red"]`);
    redStrokeElements.forEach((el) => {
      // Reset stroke to black (default for stems)
      el.setAttribute('stroke', DEFAULT_COLOR);
    });

    // Also check style.fill and style.stroke for inline styles
    const allShapes = svgContainer.querySelectorAll('path, ellipse, line, rect');
    allShapes.forEach((el) => {
      // Reset fill styles
      if (el.style.fill === HIGHLIGHT_COLOR || el.style.fill === 'red' || el.style.fill === 'rgb(255, 0, 0)') {
        el.style.fill = '';
        el.setAttribute('fill', DEFAULT_COLOR);
      }
      // Reset stroke styles
      if (el.style.stroke === HIGHLIGHT_COLOR || el.style.stroke === 'red' || el.style.stroke === 'rgb(255, 0, 0)') {
        el.style.stroke = '';
        el.setAttribute('stroke', DEFAULT_COLOR);
      }
    });

    // Reset any stem groups that were highlighted
    const stemGroups = svgContainer.querySelectorAll('.vf-stem, [class*="stem"]');
    stemGroups.forEach((stemGroup) => {
      const paths = stemGroup.querySelectorAll('path, line, rect');
      paths.forEach((path) => {
        if (path.getAttribute('stroke') === HIGHLIGHT_COLOR || path.getAttribute('stroke') === 'red') {
          path.setAttribute('stroke', DEFAULT_COLOR);
        }
        if (path.getAttribute('fill') === HIGHLIGHT_COLOR || path.getAttribute('fill') === 'red') {
          path.setAttribute('fill', DEFAULT_COLOR);
        }
      });
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

      // Helper function to color all parts of a note (head, stem, beam, flags)
      const colorNoteElement = (svgElement) => {
        if (!svgElement) return;

        // Color all paths and shapes - handles note heads (ellipse/path with fill)
        // and stems/beams/flags (path with stroke)
        const shapes = svgElement.querySelectorAll('path, ellipse, line, rect');
        shapes.forEach((shape) => {
          // Set fill for note heads and filled elements
          const currentFill = shape.getAttribute('fill');
          if (currentFill && currentFill !== 'none' && currentFill !== 'transparent') {
            shape.setAttribute('fill', HIGHLIGHT_COLOR);
          }

          // Set stroke for stems, beams, and outlined elements
          // Stems often don't have an explicit stroke attribute - they use default black
          // So we need to set stroke on all path/line elements that could be stems
          const currentStroke = shape.getAttribute('stroke');
          if (currentStroke && currentStroke !== 'none' && currentStroke !== 'transparent') {
            shape.setAttribute('stroke', HIGHLIGHT_COLOR);
          }

          // For paths and lines without explicit stroke, check computed style
          // and set stroke anyway since stems render as black by default
          if (shape.tagName.toLowerCase() === 'path' || shape.tagName.toLowerCase() === 'line') {
            const computedStyle = window.getComputedStyle(shape);
            const computedStroke = computedStyle.stroke;
            // If it has any visible stroke (computed), set our highlight color
            if (computedStroke && computedStroke !== 'none' && computedStroke !== 'transparent') {
              shape.setAttribute('stroke', HIGHLIGHT_COLOR);
            }
            // Also set stroke if the path has stroke-width (means it's meant to be stroked)
            const strokeWidth = computedStyle.strokeWidth;
            if (strokeWidth && parseFloat(strokeWidth) > 0) {
              shape.setAttribute('stroke', HIGHLIGHT_COLOR);
            }
          }
        });

        // Also look for stem groups (VexFlow uses class 'vf-stem' for stem groups)
        const stemGroups = svgElement.querySelectorAll('.vf-stem, [class*="stem"]');
        stemGroups.forEach((stemGroup) => {
          const stemPaths = stemGroup.querySelectorAll('path, line, rect');
          stemPaths.forEach((path) => {
            path.setAttribute('stroke', HIGHLIGHT_COLOR);
            // Some stems might use fill instead of stroke for thick stems
            const currentFill = path.getAttribute('fill');
            if (currentFill && currentFill !== 'none' && currentFill !== 'transparent') {
              path.setAttribute('fill', HIGHLIGHT_COLOR);
            }
          });
        });
      };

      // Color each graphical note red
      gNotesUnderCursor.forEach((gNote) => {
        let svgElement = null;
        let vfNote = null;

        // Try different paths to get the SVG element and VexFlow note
        if (gNote.vfnote && gNote.vfnote[0] && gNote.vfnote[0].attrs) {
          svgElement = gNote.vfnote[0].attrs.el;
          vfNote = gNote.vfnote[0];
        } else if (gNote.vfnote && gNote.vfnote.attrs) {
          svgElement = gNote.vfnote.attrs.el;
          vfNote = gNote.vfnote;
        }

        colorNoteElement(svgElement);

        // Also try to find and color the stem via VexFlow's stem property
        // This is the correct way - access the note's OWN stem reference
        if (vfNote && vfNote.stem) {
          try {
            // VexFlow stem object may have its own SVG element
            if (vfNote.stem.el) {
              colorNoteElement(vfNote.stem.el);
            }
            // Or access via attrs
            if (vfNote.stem.attrs && vfNote.stem.attrs.el) {
              colorNoteElement(vfNote.stem.attrs.el);
            }
          } catch {
            // Ignore stem access errors
          }
        }

        // Try to find stem by ID pattern (OSMD uses "vf-{id}-stem" pattern)
        // This is safe because we're looking for a specific ID, not all stems
        if (svgElement) {
          const noteId = svgElement.id || svgElement.getAttribute('id');
          if (noteId) {
            const svgRoot = containerRef.current?.querySelector('svg');
            if (svgRoot) {
              // Look for stem element with matching ID
              const stemId = noteId + '-stem';
              try {
                const stemById = svgRoot.querySelector(`#${CSS.escape(stemId)}, [id="${stemId}"]`);
                if (stemById) {
                  colorNoteElement(stemById);
                }
              } catch {
                // Invalid selector, skip
              }
              // Also try without the vf- prefix variations
              const stemIdVariants = [
                `vf-${noteId}-stem`,
                `${noteId.replace('vf-', '')}-stem`,
              ];
              stemIdVariants.forEach((sid) => {
                try {
                  const stemEl = svgRoot.querySelector(`[id="${sid}"]`);
                  if (stemEl) colorNoteElement(stemEl);
                } catch {
                  // Invalid selector, skip
                }
              });
            }
          }
        }

        // Look for stem ONLY within the note's immediate SVG group (not parent containers)
        // This avoids coloring stems from other notes in the same system
        if (svgElement) {
          // Only search within this specific element, not parents
          const localStems = svgElement.querySelectorAll('.vf-stem path, .vf-stem line, .vf-stem rect');
          localStems.forEach((stemPath) => {
            stemPath.setAttribute('stroke', HIGHLIGHT_COLOR);
            const fill = stemPath.getAttribute('fill');
            if (fill && fill !== 'none' && fill !== 'transparent') {
              stemPath.setAttribute('fill', HIGHLIGHT_COLOR);
            }
          });

          // Check for thin rectangles ONLY within this element (stems can be rects)
          const localRects = svgElement.querySelectorAll('rect');
          localRects.forEach((rect) => {
            // Stems are typically thin (width < 5) and tall (height > width * 3)
            const width = parseFloat(rect.getAttribute('width')) || 0;
            const height = parseFloat(rect.getAttribute('height')) || 0;
            if (width > 0 && width < 5 && height > width * 3) {
              rect.setAttribute('fill', HIGHLIGHT_COLOR);
            }
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
                      colorNoteElement(svgEl);

                      // Color stems ONLY within this specific note's element
                      // Do NOT search parent hierarchy as that catches other notes' stems
                      const localRects = svgEl.querySelectorAll('rect');
                      localRects.forEach((rect) => {
                        const width = parseFloat(rect.getAttribute('width')) || 0;
                        const height = parseFloat(rect.getAttribute('height')) || 0;
                        if (width > 0 && width < 5 && height > width * 3) {
                          rect.setAttribute('fill', HIGHLIGHT_COLOR);
                        }
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
        <div className="w-full bg-white rounded-lg overflow-auto" style={{ minHeight: '400px' }}>
          {/* Tempo marking - displayed above the first music line */}
          <div className="px-6 pt-4 pb-0">
            <div className="text-left font-serif text-lg text-black">
              <span className="font-bold">{currentNoteInfo.symbol}</span>
              <span className="mx-1">=</span>
              <span className="font-semibold">{tempo}</span>
            </div>
          </div>
          {/* OSMD container */}
          <div ref={containerRef} className="w-full" />
        </div>
      </div>
    </div>
  );
});

export default SheetDisplay;
