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
    // IMPORTANT: Skip tuplet notes as their <duration> is already scaled and would
    // give incorrect division values (e.g., triplet quarter with duration 2 instead of 3)
    const allNotes = doc.querySelectorAll('note');
    for (const noteEl of allNotes) {
      if (noteEl.querySelector('grace') || noteEl.querySelector('chord') || noteEl.querySelector('rest')) {
        continue;
      }
      // Skip tuplet notes - they have scaled durations that would throw off our calculation
      if (noteEl.querySelector('time-modification')) {
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

        // Helper: get tuplet time modification ratio
        // Returns the multiplier to apply to base duration (e.g., 2/3 for triplets)
        const getTupletRatio = (element) => {
          const timeMod = element.querySelector('time-modification');
          if (!timeMod) return 1;

          const actualNotes = timeMod.querySelector('actual-notes');
          const normalNotes = timeMod.querySelector('normal-notes');

          if (actualNotes && normalNotes) {
            const actual = parseInt(actualNotes.textContent) || 1;
            const normal = parseInt(normalNotes.textContent) || 1;
            // Triplet (3 notes in time of 2): actual=3, normal=2, ratio=2/3
            // Duplet (2 notes in time of 3): actual=2, normal=3, ratio=3/2
            return normal / actual;
          }
          return 1;
        };

        // Duration getter: prioritize <type>, fallback to <duration>/divisions
        // Accounts for tuplets via <time-modification> element
        const getDurationInQuarters = (element) => {
          const durationEl = element.querySelector('duration');
          const typeEl = element.querySelector('type');
          const tupletRatio = getTupletRatio(element);

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
            // Apply tuplet ratio (e.g., triplet quarter = 1 * 2/3 = 0.666...)
            return dur * tupletRatio;
          }

          // Second: use <duration>/divisions (the MusicXML standard way)
          // Note: MusicXML <duration> already has tuplet scaling applied,
          // so we don't multiply by tupletRatio here
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

            // Skip cue notes (but not grace notes - we handle those specially)
            if (noteEl.querySelector('cue')) {
              continue;
            }

            // Handle grace notes - play them with short duration before the main note
            const graceEl = noteEl.querySelector('grace');
            if (graceEl) {
              const pitchEl = noteEl.querySelector('pitch');
              if (pitchEl) {
                const step = pitchEl.querySelector('step')?.textContent;
                const octave = pitchEl.querySelector('octave')?.textContent;
                if (step && octave) {
                  // Build grace note name with accidentals
                  const alterEl = pitchEl.querySelector('alter');
                  const alter = alterEl ? parseInt(alterEl.textContent) : 0;
                  let graceName = step;
                  if (alter === 1) graceName += '#';
                  else if (alter === -1) graceName += 'b';
                  graceName += octave;

                  // Grace notes are played with short duration just before the beat
                  // Use 1/8 of a quarter note (0.125) as grace note duration
                  const graceDuration = 0.125;
                  // Place grace note slightly before the current cursor position
                  const graceTime = Math.max(0, measureStartTime + cursor - graceDuration);

                  notes.push({
                    pitch: graceName,
                    time: graceTime,
                    duration: graceDuration,
                    velocity: 0.6, // Slightly softer than main notes
                    measureIndex,
                    tieStart: false,
                    tieStop: false,
                    partIndex,
                    staff: noteEl.querySelector('staff') ? parseInt(noteEl.querySelector('staff').textContent) || 1 : 1,
                    isGrace: true, // Mark as grace note for potential special handling
                  });
                }
              }
              continue; // Don't process grace note further as regular note
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

            // Detect ties - MusicXML has TWO ways to represent ties:
            // 1. <tie type="start/stop"/> at note level (for sound/playback)
            // 2. <tied type="start/stop"/> inside <notations> (for visual display)
            // HOMR generates <tied> elements, so we need to check both!
            let tieStart = false;
            let tieStop = false;

            // Check <tie> elements (at note level)
            const tieEls = noteEl.querySelectorAll('tie');
            tieEls.forEach((tie) => {
              if (tie.getAttribute('type') === 'start') tieStart = true;
              if (tie.getAttribute('type') === 'stop') tieStop = true;
            });

            // Check <tied> elements (inside <notations>) - this is what HOMR generates
            const notationsEl = noteEl.querySelector('notations');
            if (notationsEl) {
              const tiedEls = notationsEl.querySelectorAll('tied');
              tiedEls.forEach((tied) => {
                if (tied.getAttribute('type') === 'start') tieStart = true;
                if (tied.getAttribute('type') === 'stop') tieStop = true;
              });
            }

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
              voice: noteVoice,  // Track voice for correct tie merging
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
    // IMPORTANT: Only merge notes from the SAME part, staff, AND voice to avoid
    // incorrectly merging notes from different hands or voices that happen
    // to have the same pitch. Grace notes cannot have ties.
    //
    // This implementation uses a map-based approach to handle ties that span
    // across non-adjacent notes (e.g., when notes from other voices are between them).
    const merged = [];
    const tieMap = new Map(); // key: "pitch-staff-part-voice", value: index in merged array

    for (let i = 0; i < notes.length; i++) {
      const note = { ...notes[i] };
      // Include voice in the key to correctly match ties within the same voice
      const key = `${note.pitch}-${note.staff}-${note.partIndex}-${note.voice}`;

      // Skip grace notes from tie processing (they can't have ties)
      if (note.isGrace) {
        // Clean up and add grace note directly
        delete note.tieStart;
        delete note.tieStop;
        delete note.partIndex;
        delete note.staff;
        delete note.voice;
        delete note.isGrace;
        merged.push(note);
        continue;
      }

      // If this note ends a tie and we have a pending tie for this pitch/voice
      if (note.tieStop && tieMap.has(key)) {
        const origIdx = tieMap.get(key);
        // Extend the original note's duration
        merged[origIdx].duration += note.duration;

        // If this note also starts a new tie, update the map to point to the original
        // (the chain continues from the same original note)
        if (note.tieStart) {
          // Keep the map entry pointing to the original note
        } else {
          // Tie chain ends here, remove from map
          tieMap.delete(key);
        }
        // Don't add this note to merged (it's been absorbed)
        continue;
      }

      // Clean up internal tracking fields before adding
      const cleanNote = { ...note };
      delete cleanNote.tieStart;
      delete cleanNote.tieStop;
      delete cleanNote.partIndex;
      delete cleanNote.staff;
      delete cleanNote.voice;
      delete cleanNote.isGrace;
      merged.push(cleanNote);

      // If this note starts a tie, record its position for future continuation
      if (note.tieStart) {
        tieMap.set(key, merged.length - 1);
      }
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
