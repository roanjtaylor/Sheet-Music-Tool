# Sheet Music Tool

## Goal
This software aims to make learning piano pieces easy, by allowing the user to hear their sheet music accurately played back from just uploading a photo.

## User Flow
Upload image of piano sheet music, software processes it, creates a playable transcription of the music, shows the generated sheet music (perfect match to original photo), user can click "play", the piece plays with realistic piano sound and adjustable tempo.

## Technology Stack
- **Backend**: Python + FastAPI
- **OMR**: HOMR (https://github.com/liebharc/homr)
- **Frontend**: React + Vite + Tailwind CSS
- **Sheet Display**: OpenSheetMusicDisplay (OSMD)
- **Audio**: Tone.js + Salamander piano samples
- **Format**: MusicXML

## Running the Application

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Backend runs at http://localhost:8000

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at http://localhost:5173

## Features
- Drag-and-drop image upload (PNG/JPG, max 50MB)
- Real-time sheet music recognition with HOMR
- Interactive sheet music display with zoom controls
- Playback with realistic Salamander piano samples
- Adjustable tempo (20-300 BPM)
- Note highlighting during playback (red notes, yellow bar)
- Export sheet music as PNG
