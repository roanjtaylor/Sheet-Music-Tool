import os
import tempfile
import shutil
from pathlib import Path
from typing import Tuple, List

import onnxruntime as ort
from homr.main import process_image, ProcessingConfig, download_weights
from homr.music_xml_generator import XmlGeneratorArguments

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
