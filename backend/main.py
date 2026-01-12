from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import time
import os
from pathlib import Path

from homr_wrapper import (
    process_sheet_music,
    extract_tempo_from_musicxml,
    extract_metadata_from_musicxml,
    analyze_voices_from_musicxml
)

# Directory for pre-processed test files (cached MusicXML)
CACHE_DIR = Path(__file__).parent / "cache"
TEST_IMAGES_DIR = Path(__file__).parent.parent / "test-images"

app = FastAPI(title="Sheet Music Tool API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg"]


class ProcessResponse(BaseModel):
    success: bool
    musicxml: str
    tempo: int
    warnings: List[str]
    errors: List[str]
    processing_time: float
    metadata: Dict[str, Any] = {}  # Title, composer, tempo_text, time/key signatures
    voiceAnalysis: Optional[Dict[str, Any]] = None  # Voice/melody detection for levels system


@app.post("/process", response_model=ProcessResponse)
async def process_image(file: UploadFile = File(...)):
    """
    Process an uploaded sheet music image and return MusicXML.
    """
    # Validate file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: PNG, JPG. Got: {file.content_type}"
        )

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: 50MB. Got: {len(content) / 1024 / 1024:.1f}MB"
        )

    # Process the image
    start_time = time.time()
    musicxml, warnings, errors = process_sheet_music(content, file.filename)
    processing_time = time.time() - start_time

    # Extract tempo, metadata, and voice analysis from MusicXML
    tempo = 120
    metadata = {}
    voice_analysis = None
    if musicxml:
        tempo = extract_tempo_from_musicxml(musicxml)
        metadata = extract_metadata_from_musicxml(musicxml)
        voice_analysis = analyze_voices_from_musicxml(musicxml)

    success = bool(musicxml) and len(errors) == 0

    return ProcessResponse(
        success=success,
        musicxml=musicxml,
        tempo=tempo,
        warnings=warnings,
        errors=errors,
        processing_time=processing_time,
        metadata=metadata,
        voiceAnalysis=voice_analysis
    )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


class TestFilesResponse(BaseModel):
    files: List[str]


@app.get("/test-files", response_model=TestFilesResponse)
async def list_test_files():
    """List available test files that can be instantly loaded."""
    # Check cache directory for available pre-processed files
    files = []
    if CACHE_DIR.exists():
        for f in CACHE_DIR.glob("*.musicxml"):
            # Return the base name without extension
            files.append(f.stem)
    return TestFilesResponse(files=files)


@app.get("/test-files/{filename}", response_model=ProcessResponse)
async def get_test_file(filename: str):
    """
    Get a pre-processed test file for instant testing.
    If the cached MusicXML doesn't exist, process the image and cache it.
    """
    # Security: only allow alphanumeric and underscores
    safe_filename = "".join(c for c in filename if c.isalnum() or c in "_-")
    if safe_filename != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Ensure cache directory exists
    CACHE_DIR.mkdir(exist_ok=True)

    cache_path = CACHE_DIR / f"{filename}.musicxml"
    image_path = None

    # Find the source image (try multiple extensions)
    for ext in [".png", ".jpg", ".jpeg"]:
        potential_path = TEST_IMAGES_DIR / f"{filename}{ext}"
        if potential_path.exists():
            image_path = potential_path
            break

    if not image_path:
        raise HTTPException(status_code=404, detail=f"Test image not found: {filename}")

    # Check if we have a cached version
    if cache_path.exists():
        # Load from cache
        musicxml = cache_path.read_text(encoding="utf-8")
        tempo = extract_tempo_from_musicxml(musicxml)
        metadata = extract_metadata_from_musicxml(musicxml)
        voice_analysis = analyze_voices_from_musicxml(musicxml)

        return ProcessResponse(
            success=True,
            musicxml=musicxml,
            tempo=tempo,
            warnings=["Loaded from cache (instant)"],
            errors=[],
            processing_time=0.0,
            metadata=metadata,
            voiceAnalysis=voice_analysis
        )

    # No cache - process the image and cache it
    start_time = time.time()
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    musicxml, warnings, errors = process_sheet_music(image_bytes, image_path.name)
    processing_time = time.time() - start_time

    # Cache the result if successful
    if musicxml and len(errors) == 0:
        cache_path.write_text(musicxml, encoding="utf-8")
        warnings.append("Result cached for instant future access")

    tempo = 120
    metadata = {}
    voice_analysis = None
    if musicxml:
        tempo = extract_tempo_from_musicxml(musicxml)
        metadata = extract_metadata_from_musicxml(musicxml)
        voice_analysis = analyze_voices_from_musicxml(musicxml)

    success = bool(musicxml) and len(errors) == 0

    return ProcessResponse(
        success=success,
        musicxml=musicxml,
        tempo=tempo,
        warnings=warnings,
        errors=errors,
        processing_time=processing_time,
        metadata=metadata,
        voiceAnalysis=voice_analysis
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
