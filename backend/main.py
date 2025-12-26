from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import time

from homr_wrapper import process_sheet_music, extract_tempo_from_musicxml

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

    # Extract tempo from MusicXML
    tempo = 120
    if musicxml:
        tempo = extract_tempo_from_musicxml(musicxml)

    success = bool(musicxml) and len(errors) == 0

    return ProcessResponse(
        success=success,
        musicxml=musicxml,
        tempo=tempo,
        warnings=warnings,
        errors=errors,
        processing_time=processing_time
    )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
