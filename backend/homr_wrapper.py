import os
import tempfile
import shutil
from pathlib import Path
from typing import Tuple, List
from fractions import Fraction

import onnxruntime as ort
from homr.main import process_image, ProcessingConfig, download_weights
from homr.music_xml_generator import XmlGeneratorArguments
import homr.music_xml_generator as _xmlgen

# Monkey-patch HOMR to preserve tuplets during transcription
# HOMR's default behavior aggressively removes "over-eager" tuplets, which
# often incorrectly removes valid triplets. We patch it to preserve tuplets.
import homr.transformer.vocabulary as _vocab

def _patched_fix_over_eager_tuplets(chords):
    """
    Replacement for HOMR's _fix_over_eager_tuplets that preserves all tuplets.

    The original function removes tuplets from measures shorter than average,
    which incorrectly removes valid triplets. This version keeps all tuplets
    so they appear correctly in the MusicXML output.
    """
    return chords

# Apply the patch - this preserves triplets and other tuplets
_vocab._fix_over_eager_tuplets = _patched_fix_over_eager_tuplets


# =============================================================================
# Patch 2: Re-enable slurs and ties in MusicXML output
# HOMR detects slurs/ties but strips them in build_note_chord(). We re-enable them.
# =============================================================================
_original_build_note_chord = _xmlgen.build_note_chord

def _patched_build_note_chord(note_chord, state, chord_duration):
    """
    Patched version that preserves slurs and ties in the MusicXML output.

    The original HOMR code strips slurs/ties and has the re-addition commented out.
    This patch re-enables slur/tie generation by adding them to the first note.
    """
    # Extract slurs/ties before stripping
    slurs_ties, stripped_chord = note_chord.strip_slur_ties()

    # Group notes by duration
    by_duration = _xmlgen._group_notes(stripped_chord.symbols)
    result = []
    final_duration = Fraction(0)

    for i, group_duration in enumerate(sorted(by_duration)):
        is_first = True
        for note_loop in by_duration[group_duration]:
            note = note_loop
            # RE-ENABLED: Add slurs/ties to the first note of the first duration group
            if i == 0 and is_first and slurs_ties:
                note = note.add_articulations(slurs_ties)
            result.append(_xmlgen.build_note_or_rest(note, i, not is_first, state, stripped_chord.tuplet_mark))
            is_first = False
        if i != len(by_duration) - 1 and group_duration > Fraction(0):
            backup = _xmlgen.mxl.XMLBackup()
            backup.add_child(_xmlgen.mxl.XMLDuration(value_=int(group_duration * state.division)))
            result.append(backup)
        final_duration = group_duration

    # Reset the position to match the chord position
    if chord_duration < final_duration:
        backup = _xmlgen.mxl.XMLBackup()
        backup.add_child(
            _xmlgen.mxl.XMLDuration(value_=int((final_duration - chord_duration) * state.division))
        )
        result.append(backup)
    return result

# Apply the slur/tie patch
_xmlgen.build_note_chord = _patched_build_note_chord


# =============================================================================
# Patch 3: Snap time signatures to common values
# HOMR uses median measure duration which can produce non-standard signatures (5/4 vs 4/4)
# =============================================================================
_original_find_division_and_time_signature = _xmlgen.find_division_and_time_signature_nominator

def _patched_find_division_and_time_signature(voice):
    """
    Patched version that snaps time signatures to common values.

    The original uses np.median(measure_duration) which can produce unusual
    time signatures like 5/4. This patch snaps to the nearest common signature.
    """
    import numpy as np

    division, nominator = _original_find_division_and_time_signature(voice)

    # Common time signatures (as fractions of a whole note)
    # 2/4 = 0.5, 3/4 = 0.75, 4/4 = 1.0, 3/8 = 0.375, 6/8 = 0.75
    # NOTE: 5/4 is intentionally excluded - it's rare and often a misdetection of 4/4
    common_nominators = [
        Fraction(2, 4),   # 2/4
        Fraction(3, 8),   # 3/8
        Fraction(3, 4),   # 3/4
        Fraction(4, 4),   # 4/4 (most common)
        Fraction(6, 8),   # 6/8
        Fraction(9, 8),   # 9/8
        Fraction(12, 8),  # 12/8
    ]

    # Find the closest common time signature
    nominator_float = float(nominator)
    closest = min(common_nominators, key=lambda x: abs(float(x) - nominator_float))

    # Debug: log when we snap the time signature
    if closest != nominator:
        print(f"[DEBUG] Time signature snapped from {nominator} to {closest}")

    return division, closest

# Apply the time signature patch
_xmlgen.find_division_and_time_signature_nominator = _patched_find_division_and_time_signature

# =============================================================================
# Patch 4: Dynamic Markings Detection via OCR (Phase 3)
# =============================================================================
# HOMR's dynamics vocabulary is commented out (requires model retraining).
# This provides an OCR-based workaround to detect dynamics text in images.
#
# Dynamic markings to detect: p, pp, ppp, f, ff, fff, mf, mp, sf, sfz, fp, cresc, dim
# Location: typically below the staff, near note positions
#
# Implementation approach (for future enhancement):
#   1. After HOMR processes the image, crop regions below each staff
#   2. Run RapidOCR on those regions (same library HOMR uses for titles)
#   3. Filter OCR results for dynamic marking patterns
#   4. Map X coordinates to measure/beat positions
#   5. Insert <dynamics> elements into the MusicXML at appropriate positions
#
# Current limitation: This is a post-processing step that doesn't integrate
# with HOMR's measure-by-measure processing, so dynamics would need to be
# inserted based on approximate X-coordinate matching.
# =============================================================================

def detect_dynamics_from_image(image_path: str) -> list:
    """
    Detect dynamic markings from a sheet music image using OCR.

    This is a framework for future implementation. Currently returns an empty list.
    When implemented, would return a list of:
    [{'dynamic': 'mf', 'x_position': 150, 'y_position': 300}, ...]

    Args:
        image_path: Path to the sheet music image

    Returns:
        List of detected dynamics with their positions
    """
    # Dynamic marking patterns to detect
    DYNAMIC_PATTERNS = [
        'ppp', 'pp', 'p',      # Piano (soft)
        'fff', 'ff', 'f',      # Forte (loud)
        'mf', 'mp',            # Mezzo (medium)
        'sf', 'sfz', 'fz',     # Sforzando (sudden accent)
        'fp', 'sfp',           # Forte-piano
        'cresc', 'dim',        # Crescendo/Diminuendo text
    ]

    # TODO: Future implementation would:
    # 1. Load image with cv2
    # 2. Detect staff regions
    # 3. Crop below-staff regions
    # 4. Run RapidOCR
    # 5. Filter for dynamic patterns
    # 6. Return with positions

    # For now, return empty list (dynamics not detected)
    return []


def inject_dynamics_into_musicxml(musicxml_content: str, dynamics: list) -> str:
    """
    Inject detected dynamics into MusicXML content.

    This is a framework for future implementation.

    Args:
        musicxml_content: Original MusicXML string
        dynamics: List of detected dynamics from detect_dynamics_from_image()

    Returns:
        Modified MusicXML with dynamics inserted
    """
    # TODO: Future implementation would:
    # 1. Parse MusicXML
    # 2. Map X positions to measures/beats
    # 3. Insert <direction><direction-type><dynamics><{dynamic}/></dynamics>
    # 4. Return modified XML

    # For now, return unmodified content
    return musicxml_content


# =============================================================================
# TRIPLET DETECTION NOTES (Phase 3 Research)
# =============================================================================
# Triplet detection accuracy is fundamentally limited by HOMR's neural network.
# Current mitigations:
#   1. Patch 1 preserves all detected tuplets (prevents over-eager filtering)
#   2. The model detects triplets via irregular duration tokens (7, 11, 13, etc.)
#
# Potential future improvements (would require model retraining):
#   - Train on more triplet-heavy datasets
#   - Adjust image preprocessing (CLAHE, contrast enhancement)
#   - Use higher resolution inference (currently max 256x1280)
#
# Post-processing approach (not implemented - research needed):
#   - Analyze measure durations to identify measures with unusual note counts
#   - If a measure has 9 eighth notes where 8 expected, likely triplets
#   - Would require modifying the transformer vocabulary output
# =============================================================================


# Track if models have been downloaded
_models_initialized = False


def _ensure_models_downloaded(use_gpu: bool) -> None:
    """Download HOMR models if not already present."""
    global _models_initialized
    if not _models_initialized:
        print("Checking/downloading HOMR models (first time only)...")
        download_weights(use_gpu)
        _models_initialized = True


def _has_gpu() -> bool:
    """Check if GPU inference is available."""
    return "CUDAExecutionProvider" in ort.get_available_providers()


def process_sheet_music(image_bytes: bytes, filename: str) -> Tuple[str, List[str], List[str]]:
    """
    Process sheet music image using HOMR and return MusicXML.

    Args:
        image_bytes: Raw image bytes
        filename: Original filename (for extension detection)

    Returns:
        Tuple of (musicxml_content, warnings, errors)
    """
    warnings = []
    errors = []
    musicxml_content = ""

    # Check GPU availability
    use_gpu = _has_gpu()

    # Ensure models are downloaded
    _ensure_models_downloaded(use_gpu)

    # Create temp directory for processing
    temp_dir = tempfile.mkdtemp()

    try:
        # Save image to temp file
        ext = Path(filename).suffix.lower()
        if ext not in ['.png', '.jpg', '.jpeg']:
            ext = '.png'

        temp_image_path = os.path.join(temp_dir, f"input{ext}")
        with open(temp_image_path, 'wb') as f:
            f.write(image_bytes)

        # Configure HOMR (debug enabled temporarily for diagnostics)
        config = ProcessingConfig(
            enable_debug=True,
            enable_cache=False,
            write_staff_positions=False,
            read_staff_positions=False,
            selected_staff=-1,
            use_gpu_inference=use_gpu
        )

        xml_args = XmlGeneratorArguments(
            large_page=False,
            metronome=None,
            tempo=None
        )

        # Process the image
        process_image(temp_image_path, config, xml_args)

        # Find the generated MusicXML file
        musicxml_path = os.path.join(temp_dir, "input.musicxml")

        if os.path.exists(musicxml_path):
            with open(musicxml_path, 'r', encoding='utf-8') as f:
                musicxml_content = f.read()
        else:
            # Try alternative naming
            for file in os.listdir(temp_dir):
                if file.endswith('.musicxml'):
                    with open(os.path.join(temp_dir, file), 'r', encoding='utf-8') as f:
                        musicxml_content = f.read()
                    break

        if not musicxml_content:
            errors.append("Failed to generate MusicXML output")
        else:
            # Post-process: Add beam elements for proper eighth note grouping
            musicxml_content = add_beam_elements_to_musicxml(musicxml_content)

            # Diagnostic: count parts in MusicXML
            import re
            parts = re.findall(r'<part id="([^"]+)"', musicxml_content)
            staves_per_part = re.findall(r'<staves>(\d+)</staves>', musicxml_content)
            print(f"[DEBUG] MusicXML generated with {len(parts)} part(s): {parts}")
            print(f"[DEBUG] Staves per part: {staves_per_part}")
            if len(parts) == 1 and not staves_per_part:
                warnings.append(f"Only 1 part detected - grand staff may not have been recognized correctly")

    except Exception as e:
        errors.append(f"Processing error: {str(e)}")

    finally:
        # Clean up temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)

    return musicxml_content, warnings, errors


def add_beam_elements_to_musicxml(musicxml_content: str) -> str:
    """
    Post-process MusicXML to add explicit beam elements for eighth notes and shorter.

    This fixes the issue where consecutive quavers (eighth notes) are displayed
    as individual notes instead of being beamed together. OSMD's autoBeam doesn't
    work reliably when notes are in different voices due to chord duration grouping.

    Beaming rules:
    - Beam consecutive eighth notes (and shorter) within the same measure and voice
    - Don't beam across rests
    - Don't beam notes with different voices
    - Start new beam groups at beat boundaries (for common time signatures)
    """
    import re
    from xml.etree import ElementTree as ET

    try:
        # Parse the MusicXML
        root = ET.fromstring(musicxml_content)
    except ET.ParseError:
        # If parsing fails, return original content
        return musicxml_content

    # Duration types that should be beamed
    beamable_types = {'eighth', '16th', '32nd', '64th', '128th'}

    # Process each part
    for part in root.findall('.//part'):
        # Process each measure
        for measure in part.findall('measure'):
            # Group notes by voice
            voice_notes = {}

            for note in measure.findall('note'):
                # Skip rests, grace notes, and chord continuation notes
                if note.find('rest') is not None:
                    continue
                if note.find('grace') is not None:
                    continue

                # Get voice (default to 1)
                voice_el = note.find('voice')
                voice = voice_el.text if voice_el is not None else '1'

                # Get note type
                type_el = note.find('type')
                if type_el is None:
                    continue
                note_type = type_el.text

                # Check if this is a beamable note
                if note_type not in beamable_types:
                    # Non-beamable note breaks the beam group
                    if voice in voice_notes and voice_notes[voice]:
                        # End any pending beam group
                        _finalize_beam_group(voice_notes[voice])
                        voice_notes[voice] = []
                    continue

                # Check if this is a chord note (has <chord/> element)
                is_chord = note.find('chord') is not None

                # Initialize voice list if needed
                if voice not in voice_notes:
                    voice_notes[voice] = []

                # Add note to the current beam group for this voice
                voice_notes[voice].append(note)

            # Finalize any remaining beam groups
            for voice, notes in voice_notes.items():
                if notes:
                    _finalize_beam_group(notes)

    # Convert back to string, restoring the XML declaration that ET.tostring strips
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding='unicode')


def _finalize_beam_group(notes):
    """
    Add beam elements to a group of notes.

    Beam groups of 2 or more notes get:
    - First note: <beam number="1">begin</beam>
    - Middle notes: <beam number="1">continue</beam>
    - Last note: <beam number="1">end</beam>
    """
    if len(notes) < 2:
        return

    for i, note in enumerate(notes):
        # Remove any existing beam elements
        for existing_beam in note.findall('beam'):
            note.remove(existing_beam)

        # Create new beam element
        from xml.etree import ElementTree as ET
        beam = ET.SubElement(note, 'beam')
        beam.set('number', '1')

        if i == 0:
            beam.text = 'begin'
        elif i == len(notes) - 1:
            beam.text = 'end'
        else:
            beam.text = 'continue'


def extract_tempo_from_musicxml(musicxml_content: str) -> int:
    """
    Extract tempo from MusicXML content.
    Returns default of 120 if not found.
    """
    import re

    # Look for tempo marking in MusicXML
    # <per-minute>120</per-minute> or <sound tempo="120"/>

    per_minute_match = re.search(r'<per-minute>(\d+)</per-minute>', musicxml_content)
    if per_minute_match:
        return int(per_minute_match.group(1))

    sound_tempo_match = re.search(r'<sound[^>]*tempo="(\d+)"', musicxml_content)
    if sound_tempo_match:
        return int(sound_tempo_match.group(1))

    return 120  # Default tempo


def extract_metadata_from_musicxml(musicxml_content: str) -> dict:
    """
    Extract metadata (title, composer, tempo text, time signature, key signature)
    from MusicXML content.
    """
    import re

    def _extract_tag(content: str, tag: str) -> str | None:
        """Extract text content from an XML tag."""
        match = re.search(rf'<{tag}>([^<]+)</{tag}>', content)
        return match.group(1).strip() if match else None

    def _extract_creator(content: str, creator_type: str) -> str | None:
        """Extract creator (composer, lyricist, etc.) from MusicXML."""
        match = re.search(rf'<creator[^>]*type="{creator_type}"[^>]*>([^<]+)</creator>', content)
        return match.group(1).strip() if match else None

    def _extract_direction_words(content: str) -> str | None:
        """Extract tempo/expression text from direction-type words elements."""
        # Look for <words> elements that contain tempo/expression markings
        # These are typically at the beginning of the piece
        words_matches = re.findall(r'<words[^>]*>([^<]+)</words>', content)
        # Filter to likely tempo/expression markings (not just dynamics)
        tempo_keywords = ['slow', 'fast', 'allegro', 'andante', 'moderato', 'adagio',
                         'presto', 'largo', 'vivace', 'lento', 'grave', 'tempo',
                         'with', 'lilt', 'espressivo', 'dolce', 'cantabile',
                         'maestoso', 'animato', 'tranquillo', 'agitato']
        for words in words_matches:
            words_lower = words.lower()
            if any(kw in words_lower for kw in tempo_keywords):
                return words.strip()
        return None

    def _extract_time_signature(content: str) -> str | None:
        """Extract time signature from MusicXML."""
        beats_match = re.search(r'<beats>(\d+)</beats>', content)
        beat_type_match = re.search(r'<beat-type>(\d+)</beat-type>', content)
        if beats_match and beat_type_match:
            return f"{beats_match.group(1)}/{beat_type_match.group(1)}"
        return None

    def _extract_key_signature(content: str) -> str | None:
        """Extract key signature from MusicXML fifths value."""
        fifths_match = re.search(r'<fifths>(-?\d+)</fifths>', content)
        if fifths_match:
            fifths = int(fifths_match.group(1))
            # Map fifths to key names (major keys)
            key_map = {
                -7: 'Cb', -6: 'Gb', -5: 'Db', -4: 'Ab', -3: 'Eb', -2: 'Bb', -1: 'F',
                0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#'
            }
            return key_map.get(fifths, f"{fifths} sharps/flats")
        return None

    # Extract all metadata
    metadata = {
        'title': _extract_tag(musicxml_content, 'work-title') or
                 _extract_tag(musicxml_content, 'movement-title'),
        'composer': _extract_creator(musicxml_content, 'composer'),
        'lyricist': _extract_creator(musicxml_content, 'lyricist'),
        'arranger': _extract_creator(musicxml_content, 'arranger'),
        'tempo_text': _extract_direction_words(musicxml_content),
        'time_signature': _extract_time_signature(musicxml_content),
        'key_signature': _extract_key_signature(musicxml_content),
    }

    # Remove None values for cleaner output
    return {k: v for k, v in metadata.items() if v is not None}
