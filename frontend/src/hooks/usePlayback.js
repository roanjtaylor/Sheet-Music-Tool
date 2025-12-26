import { useState, useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';

// Salamander piano samples URL (free samples hosted by Tone.js)
const SALAMANDER_URL = 'https://tonejs.github.io/audio/salamander/';

export default function usePlayback(sheetDisplayRef) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tempo, setTempo] = useState(120);
  const [currentPosition, setCurrentPosition] = useState(0);

  const pianoRef = useRef(null);
  const scheduledEventsRef = useRef([]);
  const animationFrameRef = useRef(null);
  const startTimeRef = useRef(0);
  const pauseTimeRef = useRef(0);
  const notesRef = useRef([]);
  const cursorPositionRef = useRef(0); // Track current cursor position index

  // Initialize piano sampler
  const initPiano = useCallback(async () => {
    if (pianoRef.current) return pianoRef.current;

    setIsLoading(true);
    try {
      const piano = new Tone.Sampler({
        urls: {
          A0: 'A0.mp3',
          C1: 'C1.mp3',
          'D#1': 'Ds1.mp3',
          'F#1': 'Fs1.mp3',
          A1: 'A1.mp3',
          C2: 'C2.mp3',
          'D#2': 'Ds2.mp3',
          'F#2': 'Fs2.mp3',
          A2: 'A2.mp3',
          C3: 'C3.mp3',
          'D#3': 'Ds3.mp3',
          'F#3': 'Fs3.mp3',
          A3: 'A3.mp3',
          C4: 'C4.mp3',
          'D#4': 'Ds4.mp3',
          'F#4': 'Fs4.mp3',
          A4: 'A4.mp3',
          C5: 'C5.mp3',
          'D#5': 'Ds5.mp3',
          'F#5': 'Fs5.mp3',
          A5: 'A5.mp3',
          C6: 'C6.mp3',
          'D#6': 'Ds6.mp3',
          'F#6': 'Fs6.mp3',
          A6: 'A6.mp3',
          C7: 'C7.mp3',
          'D#7': 'Ds7.mp3',
          'F#7': 'Fs7.mp3',
          A7: 'A7.mp3',
          C8: 'C8.mp3',
        },
        release: 1,
        baseUrl: SALAMANDER_URL,
      }).toDestination();

      await Tone.loaded();
      pianoRef.current = piano;
      setIsLoading(false);
      return piano;
    } catch (err) {
      console.error('Failed to load piano samples:', err);
      setIsLoading(false);
      throw err;
    }
  }, []);

  // Parse MusicXML and extract notes with timing
  const parseNotesFromMusicXML = useCallback((musicxml) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(musicxml, 'text/xml');
    const notes = [];

    // Map note types to duration in quarter notes
    const typeToQuarters = {
      'maxima': 32, 'long': 16, 'breve': 8, 'whole': 4,
      'half': 2, 'quarter': 1, 'eighth': 0.5,
      '16th': 0.25, '32nd': 0.125, '64th': 0.0625,
    };

    // Get divisions (ticks per quarter note) from the MusicXML
    let globalDivisions = 1;
    const divisionsEl = doc.querySelector('attributes divisions') || doc.querySelector('divisions');
    if (divisionsEl) {
      globalDivisions = parseFloat(divisionsEl.textContent) || 1;
    }

    // Auto-detect divisions from notes that have both <type> and <duration>
    // This ensures correct calculation even if <divisions> element is missing or wrong
    const allNotes = doc.querySelectorAll('note');
    for (const noteEl of allNotes) {
      if (noteEl.querySelector('grace') || noteEl.querySelector('chord') || noteEl.querySelector('rest')) {
        continue;
      }
      const typeEl = noteEl.querySelector('type');
      const durationEl = noteEl.querySelector('duration');
      if (typeEl && durationEl && typeToQuarters[typeEl.textContent] !== undefined) {
        // Calculate expected quarters, accounting for dots
        let expectedQuarters = typeToQuarters[typeEl.textContent];
        const dots = noteEl.querySelectorAll('dot').length;
        let dotVal = expectedQuarters / 2;
        for (let d = 0; d < dots; d++) {
          expectedQuarters += dotVal;
          dotVal /= 2;
        }

        const rawDuration = parseFloat(durationEl.textContent);
        if (rawDuration > 0 && expectedQuarters > 0) {
          const inferredDivisions = rawDuration / expectedQuarters;
          if (inferredDivisions >= 1) {
            globalDivisions = inferredDivisions;
            break;
          }
        }
      }
    }

    // Get initial time signature (default 4/4)
    let beats = 4;
    let beatType = 4;
    const timeEl = doc.querySelector('time');
    if (timeEl) {
      const beatsEl = timeEl.querySelector('beats');
      const beatTypeEl = timeEl.querySelector('beat-type');
      if (beatsEl) beats = parseInt(beatsEl.textContent) || 4;
      if (beatTypeEl) beatType = parseInt(beatTypeEl.textContent) || 4;
    }

    // Get all parts
    const parts = doc.querySelectorAll('part');

    parts.forEach((part, partIndex) => {
      const measures = part.querySelectorAll('measure');
      let measureStartTime = 0;
      let divisions = globalDivisions;
      let currentBeats = beats;
      let currentBeatType = beatType;

      measures.forEach((measure, measureIndex) => {
        // Check for new divisions in this measure
        const measureDivisionsEl = measure.querySelector('attributes > divisions');
        if (measureDivisionsEl) {
          const newDiv = parseFloat(measureDivisionsEl.textContent);
          if (!isNaN(newDiv) && newDiv > 0) {
            divisions = newDiv;
          }
        }

        // Check for time signature change
        const measureTimeEl = measure.querySelector('attributes > time');
        if (measureTimeEl) {
          const beatsEl = measureTimeEl.querySelector('beats');
          const beatTypeEl = measureTimeEl.querySelector('beat-type');
          if (beatsEl) currentBeats = parseInt(beatsEl.textContent) || currentBeats;
          if (beatTypeEl) currentBeatType = parseInt(beatTypeEl.textContent) || currentBeatType;
        }

        // Calculate measure duration in quarter notes
        const measureDuration = (currentBeats * 4) / currentBeatType;

        // Single cursor for timeline position (MusicXML standard)
        let cursor = 0;
        let maxCursor = 0; // Track the furthest point reached in this measure
        let lastNoteStart = 0;
        let prevWasRest = false;

        // Duration getter: prioritize <type>, fallback to <duration>/divisions
        const getDurationInQuarters = (element) => {
          const durationEl = element.querySelector('duration');
          const typeEl = element.querySelector('type');

          // First: try <type> element (always reliable when present)
          if (typeEl && typeToQuarters[typeEl.textContent] !== undefined) {
            let dur = typeToQuarters[typeEl.textContent];
            // Handle dots
            const dots = element.querySelectorAll('dot').length;
            let dotVal = dur / 2;
            for (let d = 0; d < dots; d++) {
              dur += dotVal;
              dotVal /= 2;
            }
            return dur;
          }

          // Second: use <duration>/divisions (the MusicXML standard way)
          if (durationEl && divisions > 0) {
            const raw = parseFloat(durationEl.textContent);
            if (!isNaN(raw) && raw > 0) {
              return raw / divisions;
            }
          }

          return 0;
        };

        const children = measure.children;

        for (let i = 0; i < children.length; i++) {
          const el = children[i];

          // Handle backup - move cursor backward
          if (el.tagName === 'backup') {
            const durationEl = el.querySelector('duration');
            if (durationEl && divisions > 0) {
              const dur = parseFloat(durationEl.textContent) / divisions;
              if (!isNaN(dur) && dur > 0) {
                cursor -= dur;
                if (cursor < 0) cursor = 0;
              }
            }
            continue;
          }

          // Handle forward - move cursor forward
          if (el.tagName === 'forward') {
            const durationEl = el.querySelector('duration');
            if (durationEl && divisions > 0) {
              const dur = parseFloat(durationEl.textContent) / divisions;
              if (!isNaN(dur) && dur > 0) {
                cursor += dur;
              }
            }
            continue;
          }

          // Handle notes and rests
          if (el.tagName === 'note') {
            const noteEl = el;

            // Skip grace notes and cue notes
            if (noteEl.querySelector('grace') || noteEl.querySelector('cue')) {
              continue;
            }

            const isChord = noteEl.querySelector('chord') !== null;
            const isRest = noteEl.querySelector('rest') !== null;
            const duration = getDurationInQuarters(noteEl);

            // Handle rests: advance cursor
            if (isRest) {
              if (!isChord && duration > 0) {
                cursor += duration;
                if (cursor > maxCursor) maxCursor = cursor;
              }
              prevWasRest = true;
              continue;
            }

            // Get pitch
            const pitchEl = noteEl.querySelector('pitch');
            if (!pitchEl) {
              continue;
            }

            const step = pitchEl.querySelector('step')?.textContent;
            const octave = pitchEl.querySelector('octave')?.textContent;
            if (!step || !octave) continue;

            // Calculate note time
            let noteTime;
            if (isChord && !prevWasRest) {
              // Chord: same time as previous note
              noteTime = lastNoteStart;
            } else {
              // New note: use current cursor position
              noteTime = cursor;
              lastNoteStart = cursor;
              cursor += duration;
              if (cursor > maxCursor) maxCursor = cursor;
            }

            prevWasRest = false;

            // Build note name
            const alterEl = pitchEl.querySelector('alter');
            const alter = alterEl ? parseInt(alterEl.textContent) : 0;
            let noteName = step;
            if (alter === 1) noteName += '#';
            else if (alter === -1) noteName += 'b';
            noteName += octave;

            // Velocity from dynamics
            let velocity = 0.7;
            const dynamicsEl = noteEl.querySelector('dynamics');
            if (dynamicsEl) {
              const dynamicValue = dynamicsEl.firstElementChild?.tagName;
              const velocityMap = {
                ppp: 0.2, pp: 0.3, p: 0.4, mp: 0.5,
                mf: 0.6, f: 0.75, ff: 0.85, fff: 0.95,
              };
              velocity = velocityMap[dynamicValue] || 0.7;
            }

            const finalTime = measureStartTime + noteTime;

            // Detect ties (notes can have multiple tie elements for start+stop)
            const tieEls = noteEl.querySelectorAll('tie');
            let tieStart = false;
            let tieStop = false;
            tieEls.forEach((tie) => {
              if (tie.getAttribute('type') === 'start') tieStart = true;
              if (tie.getAttribute('type') === 'stop') tieStop = true;
            });

            // Get staff number (for piano grand staff: 1=treble, 2=bass)
            const staffEl = noteEl.querySelector('staff');
            const staff = staffEl ? parseInt(staffEl.textContent) || 1 : 1;

            notes.push({
              pitch: noteName,
              time: finalTime,
              duration: duration > 0 ? duration : 0.25,
              velocity,
              measureIndex,
              tieStart,
              tieStop,
              partIndex,  // Track which part this note belongs to
              staff,      // Track which staff within the part (1=treble, 2=bass for piano)
            });
          }
        }

        // Advance to next measure - use actual content length if greater than stated duration
        // This handles cases where MusicXML has more content than the time signature suggests
        measureStartTime += Math.max(measureDuration, maxCursor);
      });
    });

    // Sort notes by time
    notes.sort((a, b) => a.time - b.time);

    // Merge tied notes (extend duration instead of playing twice)
    // IMPORTANT: Only merge notes from the SAME part AND staff to avoid
    // incorrectly merging notes from different hands (RH/LH) that happen
    // to have the same pitch
    const merged = [];
    let i = 0;
    while (i < notes.length) {
      const note = { ...notes[i] };
      // If this note starts a tie, find and merge continuations
      while (
        note.tieStart &&
        i + 1 < notes.length &&
        notes[i + 1].pitch === note.pitch &&
        notes[i + 1].partIndex === note.partIndex &&  // Must be same part
        notes[i + 1].staff === note.staff &&          // Must be same staff
        notes[i + 1].tieStop
      ) {
        note.duration += notes[i + 1].duration;
        // If the continuation also starts a new tie, keep looking
        note.tieStart = notes[i + 1].tieStart;
        i++;
      }
      // Clean up internal tracking fields before returning
      delete note.tieStart;
      delete note.tieStop;
      delete note.partIndex;
      delete note.staff;
      merged.push(note);
      i++;
    }

    return merged;
  }, []);

  // Schedule playback - simplified for reliable audio
  const schedulePlayback = useCallback(
    (notes, startOffset = 0) => {
      const piano = pianoRef.current;
      if (!piano) return;

      // Clear previous scheduled events
      scheduledEventsRef.current.forEach((id) => Tone.Transport.clear(id));
      scheduledEventsRef.current = [];

      // Calculate seconds per quarter note based on tempo
      const secondsPerQuarter = 60 / tempo;

      // Reset cursor at start
      cursorPositionRef.current = 0;
      if (sheetDisplayRef?.current) {
        sheetDisplayRef.current.resetCursor();
      }

      // Track last highlighted time to avoid duplicate highlights
      let lastHighlightedTime = -1;

      // Schedule each note - audio scheduling is straightforward
      notes.forEach((note) => {
        const timeInSeconds = note.time * secondsPerQuarter;

        // Skip notes before the start offset
        if (timeInSeconds < startOffset) return;

        const adjustedTime = timeInSeconds - startOffset;
        const durationInSeconds = note.duration * secondsPerQuarter;

        const eventId = Tone.Transport.schedule((time) => {
          // Play the note
          piano.triggerAttackRelease(
            note.pitch,
            durationInSeconds,
            time,
            note.velocity
          );

          // Update visual highlighting (non-blocking)
          Tone.Draw.schedule(() => {
            setCurrentPosition(note.measureIndex);

            // Simple cursor advancement - advance once per unique time
            const noteTimeKey = Math.round(note.time * 1000);
            if (noteTimeKey !== lastHighlightedTime && sheetDisplayRef?.current) {
              if (lastHighlightedTime >= 0) {
                sheetDisplayRef.current.advanceCursor();
              }
              sheetDisplayRef.current.highlightNotesAtTime();
              lastHighlightedTime = noteTimeKey;
            }
          }, time);
        }, adjustedTime);

        scheduledEventsRef.current.push(eventId);
      });

      // Get total duration and schedule end
      if (notes.length > 0) {
        const lastNote = notes[notes.length - 1];
        const totalDuration =
          (lastNote.time + lastNote.duration) * secondsPerQuarter - startOffset;

        const endEventId = Tone.Transport.schedule(() => {
          stop();
        }, totalDuration + 0.5);
        scheduledEventsRef.current.push(endEventId);
      }
    },
    [tempo, sheetDisplayRef]
  );

  // Play (always starts from beginning)
  const play = useCallback(
    async (musicxml) => {
      if (isPlaying) return;

      try {
        // Initialize audio context and piano
        await Tone.start();
        await initPiano();

        // Parse notes from MusicXML
        const notes = parseNotesFromMusicXML(musicxml);
        notesRef.current = notes;

        if (notes.length === 0) {
          console.error('No notes found in MusicXML');
          return;
        }

        // Always start from the beginning
        pauseTimeRef.current = 0;

        // Schedule playback from start
        schedulePlayback(notes, 0);

        // Start transport
        startTimeRef.current = Tone.now();
        Tone.Transport.start();
        setIsPlaying(true);
      } catch (err) {
        console.error('Playback error:', err);
      }
    },
    [isPlaying, initPiano, parseNotesFromMusicXML, schedulePlayback]
  );

  // Pause
  const pause = useCallback(() => {
    if (!isPlaying) return;

    Tone.Transport.pause();
    pauseTimeRef.current = Tone.now() - startTimeRef.current;
    setIsPlaying(false);

    // Clear highlights
    if (sheetDisplayRef?.current) {
      sheetDisplayRef.current.clearHighlights();
    }
  }, [isPlaying, sheetDisplayRef]);

  // Stop (reset to beginning)
  const stop = useCallback(() => {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    pauseTimeRef.current = 0;
    cursorPositionRef.current = 0; // Reset cursor position tracking
    setIsPlaying(false);
    setCurrentPosition(0);

    // Clear scheduled events
    scheduledEventsRef.current.forEach((id) => Tone.Transport.clear(id));
    scheduledEventsRef.current = [];

    // Clear highlights
    if (sheetDisplayRef?.current) {
      sheetDisplayRef.current.clearHighlights();
    }
  }, [sheetDisplayRef]);

  // Toggle play/pause
  const togglePlayPause = useCallback(
    (musicxml) => {
      if (isPlaying) {
        pause();
      } else {
        play(musicxml);
      }
    },
    [isPlaying, pause, play]
  );

  // Update tempo
  const updateTempo = useCallback(
    (newTempo) => {
      setTempo(newTempo);

      // If currently playing, reschedule with new tempo
      if (isPlaying && notesRef.current.length > 0) {
        const currentTime = Tone.now() - startTimeRef.current;
        Tone.Transport.stop();
        Tone.Transport.cancel();

        schedulePlayback(notesRef.current, currentTime);
        startTimeRef.current = Tone.now() - currentTime;
        Tone.Transport.start();
      }
    },
    [isPlaying, schedulePlayback]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
      if (pianoRef.current) {
        pianoRef.current.dispose();
        pianoRef.current = null;
      }
    };
  }, [stop]);

  return {
    isPlaying,
    isLoading,
    tempo,
    currentPosition,
    play,
    pause,
    stop,
    togglePlayPause,
    setTempo: updateTempo,
  };
}
