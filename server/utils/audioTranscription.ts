import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { extractAudioFromVideo } from './videoProcessing';
try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
} catch (e) {
    console.warn('⚠️  Could not set ffmpeg path (likely running bundled Mac binary on Linux Catalyst). Video processing will fail.');
}

const PLATFORM_AI_BASE = 'https://platformai.zoho.in/internalapi';
const PORTAL_ID = process.env.ZOHO_PLATFORM_AI_PORTAL_ID || 'ZAPM';

/**
 * Call PlatformAI transcript endpoint with retries.
 * Endpoint: POST /internalapi/v2/ai/transcript
 * Accepts multipart/form-data with a `file` field.
 * Returns the transcript text.
 */
async function callPlatformAITranscript(filePath: string, zohoToken: string, maxRetries = 3): Promise<string> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const fileBuffer = fs.readFileSync(filePath);
            const fileName = path.basename(filePath);
            const mimeType = fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';

            const formData = new FormData();
            formData.append('file', new Blob([fileBuffer], { type: mimeType }), fileName);

            const res = await fetch(`${PLATFORM_AI_BASE}/v2/ai/transcript`, {
                method: 'POST',
                headers: {
                    'portal_id': PORTAL_ID,
                    'Authorization': `Zoho-oauthtoken ${zohoToken}`,
                },
                body: formData,
            });

            const data = await res.json() as any;

            if (!res.ok) {
                throw new Error(`PlatformAI transcript error ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
            }

            const transcript = data?.data?.transcript;
            if (transcript === undefined || transcript === null) {
                throw new Error(`Unexpected PlatformAI transcript response: ${JSON.stringify(data).slice(0, 200)}`);
            }

            return transcript as string;
        } catch (error: any) {
            lastError = error;
            console.warn(`⚠️ PlatformAI transcript attempt ${attempt}/${maxRetries} failed: ${error.message}`);
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, attempt * 3000));
            }
        }
    }
    throw lastError;
}

/**
 * Transcribe large audio file by splitting into chunks
 */
async function transcribeLargeAudio(audioFilePath: string, zohoToken: string): Promise<string> {
    console.log('📦 File too large for single request (> 3MB). Splitting into 5-min chunks...');

    const chunkDir = path.join(path.dirname(audioFilePath), 'chunks_' + Date.now());
    if (!fs.existsSync(chunkDir)) {
        fs.mkdirSync(chunkDir);
    }

    try {
        // Split audio into 20-minute chunks (approx 5MB at 32k bitrate)
        await new Promise<void>((resolve, reject) => {
            ffmpeg(audioFilePath)
                .output(path.join(chunkDir, 'chunk_%03d.mp3'))
                .audioCodec('libmp3lame')
                .audioBitrate('16k')
                .audioFrequency(16000)
                .audioChannels(1)
                .format('segment')
                .outputOptions(['-segment_time', '300', '-reset_timestamps', '1'])
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .run();
        });

        const chunkFiles = fs.readdirSync(chunkDir)
            .filter(f => f.endsWith('.mp3'))
            .sort()
            .map(f => path.join(chunkDir, f));

        console.log(`🧩 Split into ${chunkFiles.length} chunks. Transcribing in parallel...`);
        const startAll = Date.now();

        const results = await Promise.all(
            chunkFiles.map(async (chunkPath, i) => {
                const stats = fs.statSync(chunkPath);
                console.log(`🎤 Chunk ${i + 1}: starting (${(stats.size / 1024 / 1024).toFixed(2)} MB)...`);
                const t = Date.now();
                const text = await callPlatformAITranscript(chunkPath, zohoToken);
                console.log(`✅ Chunk ${i + 1} done in ${Math.round((Date.now() - t) / 1000)}s`);
                return text;
            })
        );

        console.log(`✅ All ${chunkFiles.length} chunks transcribed in ${Math.round((Date.now() - startAll) / 1000)}s`);
        return results.join(' ').trim();

    } catch (error) {
        console.error('❌ Chunk transcription failed:', error);
        throw error;
    } finally {
        try {
            if (fs.existsSync(chunkDir)) {
                fs.rmSync(chunkDir, { recursive: true, force: true });
                console.log('🗑️  Cleaned up audio chunks');
            }
        } catch (e) {
            console.error('Failed to cleanup chunks:', e);
        }
    }
}

/**
 * Transcribe audio file using PlatformAI Whisper endpoint
 */
export async function transcribeAudio(audioFilePath: string, zohoToken: string): Promise<string> {
    console.log('\n🎤 Transcribing audio with PlatformAI Whisper...');
    console.log(`📁 File: ${audioFilePath}`);

    try {
        const stats = fs.statSync(audioFilePath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        console.log(`📊 File size: ${fileSizeInMB.toFixed(2)} MB`);

        // Chunk anything > 3 MB — PlatformAI times out on large single files
        if (fileSizeInMB > 3) {
            return await transcribeLargeAudio(audioFilePath, zohoToken);
        }

        const transcription = await callPlatformAITranscript(audioFilePath, zohoToken);
        console.log('✅ Transcription completed');
        console.log(`📝 Transcript length: ${transcription.length} characters`);
        return transcription;
    } catch (error) {
        console.error('❌ Transcription failed:', error);
        throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Transcribe video file (extracts audio first, then transcribes)
 */
export async function transcribeVideo(videoFilePath: string, zohoToken: string): Promise<{ transcript: string; audioPath: string }> {
    console.log('\n🎬 Processing video file...');
    console.log(`📁 Video: ${videoFilePath}`);

    const videoStats = fs.statSync(videoFilePath);
    const videoSizeMB = videoStats.size / (1024 * 1024);

    // Skip ffmpeg if video is under 25MB — send directly to PlatformAI
    if (videoSizeMB <= 24) {
        console.log(`⚡ Video is ${videoSizeMB.toFixed(1)} MB — sending directly to PlatformAI (no ffmpeg needed)`);
        try {
            const transcript = await callPlatformAITranscript(videoFilePath, zohoToken);
            return { transcript, audioPath: videoFilePath };
        } catch (error) {
            console.warn('⚠️  Direct video transcription failed, falling back to ffmpeg:', error);
        }
    }

    try {
        const audioPath = await extractAudioFromVideo(videoFilePath);
        const transcript = await transcribeAudio(audioPath, zohoToken);
        return { transcript, audioPath };
    } catch (error) {
        console.error('❌ Video transcription failed:', error);
        throw new Error(`Failed to transcribe video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
