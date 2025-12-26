import { useState, useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { SALAMANDER_PIANO_URL, DEFAULT_TEMPO, MIN_TEMPO, MAX_TEMPO } from '../constants';

export default function usePlayback(sheetDisplayRef) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tempo, setTempo] = useState(DEFAULT_TEMPO);
  const [currentPosition, setCurrentPosition] = useState(0);

  const pianoRef = useRef(null);
  const scheduledEventsRef = useRef([]);
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
        baseUrl: SALAMANDER_PIANO_URL,
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

        // Track cursor position per voice to handle multiple independent timelines
        // In music notation, each voice within a staff has its own timeline.
        // A minim in voice 1 and crotchets in voice 2 can overlap - they're independent.
        let cursor = 0;
        let maxCursor = 0; // Track the furthest point reached in this measure
        let lastNoteStart = 0;
        let prevWasRest = false;
        const voiceCursors = {}; // Track cursor per voice (keyed by "staff-voice")
        let currentStaff = null; // Track which staff we're currently processing
        let currentVoice = null; // Track which voice we're currently processing

        // Track chord processing to handle mixed-duration chords correctly
        // When a chord has notes with different durations (e.g., minim + crotchet),
        // the cursor should advance by the minimum duration to avoid delaying
        // subsequent melody notes
        let chordMinDuration = Infinity;
        let chordStartTime = 0;
        let inChord = false;

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

          // Handle backup - move cursor backward (switching to a different voice)
          if (el.tagName === 'backup') {
            // Save current voice's cursor position before switching
            // This is critical: each voice has its own timeline, so we must
            // remember where we were in the current voice
            if (currentVoice !== null) {
              // Apply chord adjustment before saving
              if (inChord && chordMinDuration !== Infinity) {
                const adjustedCursor = chordStartTime + chordMinDuration;
                if (adjustedCursor < cursor) {
                  cursor = adjustedCursor;
                }
              }
              voiceCursors[currentVoice] = cursor;
            }
            const durationEl = el.querySelector('duration');
            if (durationEl && divisions > 0) {
              const dur = parseFloat(durationEl.textContent) / divisions;
              if (!isNaN(dur) && dur > 0) {
                cursor -= dur;
                if (cursor < 0) cursor = 0;
              }
            }
            // Reset state for new voice
            prevWasRest = false;
            currentStaff = null;
            currentVoice = null; // Will be set by next note
            inChord = false;
            chordMinDuration = Infinity;
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
            // Reset chord tracking - forward means explicit position change
            inChord = false;
            chordMinDuration = Infinity;
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

            // Get staff and voice for this note (defaults: staff=1, voice=1)
            const staffEl = noteEl.querySelector('staff');
            const noteStaff = staffEl ? parseInt(staffEl.textContent) || 1 : 1;
            const voiceEl = noteEl.querySelector('voice');
            const noteVoice = voiceEl ? parseInt(voiceEl.textContent) || 1 : 1;
            // Create a unique key for this voice (staff-voice combination)
            const voiceKey = `${noteStaff}-${noteVoice}`;

            // Handle voice switching (different voice or staff = different timeline)
            // Each voice has its own independent cursor - a minim in voice 1
            // doesn't affect when notes in voice 2 are played
            if (currentVoice !== null && voiceKey !== currentVoice) {
              // Save current voice's cursor before switching
              if (inChord && chordMinDuration !== Infinity) {
                const adjustedCursor = chordStartTime + chordMinDuration;
                if (adjustedCursor < cursor) {
                  cursor = adjustedCursor;
                }
              }
              voiceCursors[currentVoice] = cursor;
              // Restore target voice's cursor (or start from current position if first time)
              if (voiceCursors[voiceKey] !== undefined) {
                cursor = voiceCursors[voiceKey];
              }
              // Note: if voiceCursors[voiceKey] is undefined, keep current cursor
              // (backup already positioned us correctly)

              // Reset chord tracking when switching voices
              inChord = false;
              chordMinDuration = Infinity;
            }
            currentStaff = noteStaff;
            currentVoice = voiceKey;

            // Handle rests: advance cursor
            if (isRest) {
              if (!isChord && duration > 0) {
                cursor += duration;
                if (cursor > maxCursor) maxCursor = cursor;
                voiceCursors[voiceKey] = cursor; // Update voice cursor
              }
              // Reset chord tracking - a rest ends any pending chord adjustment
              inChord = false;
              chordMinDuration = Infinity;
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
              // Track minimum duration in this chord for proper cursor advancement
              chordMinDuration = Math.min(chordMinDuration, duration);
              inChord = true;
            } else {
              // New note: not part of a chord (or first note of a new chord)

              // If we just finished processing a chord with mixed durations,
              // adjust the cursor to use the minimum duration. This ensures
              // subsequent melody notes aren't delayed when the first chord note
              // was longer than others (e.g., minim with crotchet).
              if (inChord && chordMinDuration !== Infinity) {
                const adjustedCursor = chordStartTime + chordMinDuration;
                if (adjustedCursor < cursor) {
                  cursor = adjustedCursor;
                  if (currentVoice !== null) {
                    voiceCursors[currentVoice] = cursor;
                  }
                }
              }

              // Reset chord tracking
              inChord = false;
              chordMinDuration = duration; // This note becomes potential first of new chord
              chordStartTime = cursor;

              // Set note time and advance cursor
              noteTime = cursor;
              lastNoteStart = cursor;
              cursor += duration;
              if (cursor > maxCursor) maxCursor = cursor;
              voiceCursors[voiceKey] = cursor; // Update voice cursor
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

            // noteStaff was already extracted earlier for cursor tracking

            notes.push({
              pitch: noteName,
              time: finalTime,
              duration: duration > 0 ? duration : 0.25,
              velocity,
              measureIndex,
              tieStart,
              tieStop,
              partIndex,  // Track which part this note belongs to
              staff: noteStaff,  // Track which staff within the part (1=treble, 2=bass for piano)
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

  // Stop (reset to beginning) - defined before schedulePlayback since it's called from there
  const stop = useCallback(() => {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    pauseTimeRef.current = 0;
    cursorPositionRef.current = 0;
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
    [tempo, sheetDisplayRef, stop]
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
