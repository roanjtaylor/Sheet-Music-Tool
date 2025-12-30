// API Configuration
export const API_URL = 'http://localhost:8000';

// File Upload Limits
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const ALLOWED_FILE_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

// Audio Configuration
export const SALAMANDER_PIANO_URL = 'https://tonejs.github.io/audio/salamander/';
export const DEFAULT_TEMPO = 120;
export const MIN_TEMPO = 20;
export const MAX_TEMPO = 300;

// Note type options for tempo marking
export const NOTE_TYPES = [
  { value: 'whole', label: 'Whole', symbol: '𝅝', multiplier: 4 },
  { value: 'half', label: 'Half', symbol: '𝅗𝅥', multiplier: 2 },
  { value: 'quarter', label: 'Crotchet', symbol: '♩', multiplier: 1 },
  { value: 'eighth', label: 'Quaver', symbol: '♪', multiplier: 0.5 },
  { value: 'dotted-quarter', label: 'Dotted Crotchet', symbol: '♩.', multiplier: 1.5 },
  { value: 'dotted-eighth', label: 'Dotted Quaver', symbol: '♪.', multiplier: 0.75 },
];
export const DEFAULT_NOTE_TYPE = 'quarter';

// Display Configuration
export const HIGHLIGHT_COLOR = '#ff0000';
export const DEFAULT_COLOR = '#000000';
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.0;
export const ZOOM_STEP = 0.1;
