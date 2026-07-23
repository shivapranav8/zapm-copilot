import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure upload directory exists
const uploadDir = '/tmp/meeting-uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const ext = path.extname(file.originalname);
        cb(null, `meeting-${uniqueSuffix}${ext}`);
    }
});

// File filter - accept video and audio files
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimeTypes = [
        'video/mp4',
        'video/mpeg',
        'video/quicktime', // MOV
        'video/x-msvideo', // AVI
        'video/x-matroska', // MKV
        'video/webm',
        'audio/mpeg',      // MP3
        'audio/mp3',
        'audio/wav',
        'audio/x-wav',
        'audio/ogg',
        'audio/webm',
        'audio/m4a',
        'audio/x-m4a',
        'audio/mp4',       // M4A
    ];

    const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.mpeg', '.mpg', '.mp3', '.wav', '.ogg', '.m4a'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Supported: MP4, MOV, AVI, MKV, WebM, MP3, WAV, M4A, OGG.'));
    }
};

// Create multer upload instance
export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max file size
    },
});

// Cleanup function to delete uploaded files after processing
export function cleanupFile(filePath: string): void {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️  Deleted temporary file: ${filePath}`);
        }
    } catch (error) {
        console.error(`Failed to delete file ${filePath}:`, error);
    }
}

// Cleanup old files (older than 1 hour)
export function cleanupOldFiles(): void {
    try {
        const files = fs.readdirSync(uploadDir);
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        files.forEach(file => {
            const filePath = path.join(uploadDir, file);
            const stats = fs.statSync(filePath);

            if (now - stats.mtimeMs > oneHour) {
                fs.unlinkSync(filePath);
                console.log(`🗑️  Deleted old file: ${file}`);
            }
        });
    } catch (error) {
        console.error('Failed to cleanup old files:', error);
    }
}

// Note: setInterval not used in serverless — cleanup runs per-request after processing
