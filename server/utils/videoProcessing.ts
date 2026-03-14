import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
} catch (e) {
    console.warn('⚠️  Could not set ffmpeg path for video processing (likely running bundled Mac binary on Linux Catalyst).');
}

// Lazy OpenAI client — initialized only when actually used (not at startup)
let _openai: OpenAI | null = null;
function getOpenAI() {
    if (!_openai) {
        _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return _openai;
}

/**
 * Extract audio from video file
 */
export async function extractAudioFromVideo(videoPath: string): Promise<string> {
    console.log('\n🎬 Extracting audio from video...');
    console.log(`📁 Video: ${videoPath}`);

    const audioPath = videoPath.replace(path.extname(videoPath), '.mp3');

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .output(audioPath)
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .noVideo()
            .on('start', (commandLine) => {
                console.log('🎵 FFmpeg command:', commandLine);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`⏳ Progress: ${Math.round(progress.percent)}%`);
                }
            })
            .on('end', () => {
                console.log('✅ Audio extraction complete');
                console.log(`📁 Audio file: ${audioPath}`);
                resolve(audioPath);
            })
            .on('error', (err) => {
                console.error('❌ Audio extraction failed:', err);
                reject(err);
            })
            .run();
    });
}

/**
 * Extract key frames from video for screen analysis
 */
export async function extractKeyFrames(videoPath: string, intervalSeconds: number = 30): Promise<string[]> {
    console.log('\n🖼️  Extracting key frames from video...');
    console.log(`📁 Video: ${videoPath}`);
    console.log(`⏱️  Interval: ${intervalSeconds} seconds`);

    const framesDir = videoPath.replace(path.extname(videoPath), '_frames');
    if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }

            const duration = metadata.format.duration || 0;
            const frameCount = Math.floor(duration / intervalSeconds);

            console.log(`📊 Video duration: ${Math.round(duration)}s`);
            console.log(`🖼️  Extracting ${frameCount} frames...`);

            ffmpeg(videoPath)
                .screenshots({
                    count: frameCount,
                    folder: framesDir,
                    filename: 'frame-%i.png',
                    size: '1280x720'
                })
                .on('end', () => {
                    const frames = fs.readdirSync(framesDir)
                        .filter(f => f.endsWith('.png'))
                        .map(f => path.join(framesDir, f))
                        .sort();

                    console.log(`✅ Extracted ${frames.length} frames`);
                    resolve(frames);
                })
                .on('error', (err) => {
                    console.error('❌ Frame extraction failed:', err);
                    reject(err);
                });
        });
    });
}

/**
 * Analyze frames using GPT-4 Vision
 */
export async function analyzeFramesWithVision(framePaths: string[]): Promise<string> {
    console.log('\n👁️  Analyzing frames with GPT-4 Vision...');
    console.log(`🖼️  Total frames: ${framePaths.length}`);

    // Limit to max 20 frames to control costs
    const sampled = framePaths.filter((_, i) => i % Math.ceil(framePaths.length / 20) === 0).slice(0, 20);
    console.log(`📊 Analyzing ${sampled.length} sampled frames`);

    const frameAnalyses: string[] = [];

    for (let i = 0; i < sampled.length; i++) {
        const framePath = sampled[i];
        console.log(`🔍 Analyzing frame ${i + 1}/${sampled.length}...`);

        try {
            // Read image and convert to base64
            const imageBuffer = fs.readFileSync(framePath);
            const base64Image = imageBuffer.toString('base64');

            const response = await getOpenAI().chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Analyze this meeting screenshot. Describe what you see: slides, diagrams, code, whiteboard content, or any other visual information. Be concise and focus on key information.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 300
            });

            const analysis = response.choices[0]?.message?.content || '';
            if (analysis.trim()) {
                frameAnalyses.push(`Frame ${i + 1}: ${analysis}`);
            }
        } catch (error) {
            console.error(`Failed to analyze frame ${i + 1}:`, error);
        }
    }

    const visualContext = frameAnalyses.join('\n\n');
    console.log(`✅ Visual analysis complete (${frameAnalyses.length} frames analyzed)`);

    return visualContext;
}

/**
 * Cleanup extracted frames
 */
export function cleanupFrames(videoPath: string): void {
    const framesDir = videoPath.replace(path.extname(videoPath), '_frames');

    try {
        if (fs.existsSync(framesDir)) {
            fs.rmSync(framesDir, { recursive: true, force: true });
            console.log(`🗑️  Deleted frames directory: ${framesDir}`);
        }
    } catch (error) {
        console.error(`Failed to delete frames directory:`, error);
    }
}
