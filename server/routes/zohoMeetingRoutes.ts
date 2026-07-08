import { Router, Request } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import ffmpegCmd from 'fluent-ffmpeg';
import { transcribeVideo, transcribeAudio } from '../utils/audioTranscription';
import { generateMeetingMoM } from '../agents/meetingMoM';
import { saveMoM } from '../utils/storage';
import { getJob } from '../utils/jobStore';

try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpegCmd.setFfmpegPath(ffmpegInstaller.path);
} catch (e) { /* bundled binary unavailable */ }

export const zohoMeetingRouter = Router();

const ACCOUNTS_BASE = 'https://accounts.zoho.in/oauth/v2';
const MEETING_API_BASE = 'https://meeting.zoho.in/api/v2';
const MEETING_RECORDINGS_BASE = 'https://meeting.zoho.in/meeting/api/v2';
// Dynamic URIs constructed inside routes instead of globally using env constants

// In-memory token store — seeded from .env
const store: { accessToken: string; refreshToken: string; userKey: string } = {
    accessToken: process.env.ZOHO_MEETING_ACCESS_TOKEN || '',
    refreshToken: process.env.ZOHO_MEETING_REFRESH_TOKEN || '',
    userKey: process.env.ZOHO_MEETING_USER_KEY || '',
};

async function refreshAccessToken(): Promise<void> {
    const { ZOHO_MEETING_CLIENT_ID, ZOHO_MEETING_CLIENT_SECRET } = process.env;
    if (!store.refreshToken || !ZOHO_MEETING_CLIENT_ID || !ZOHO_MEETING_CLIENT_SECRET) {
        throw new Error(
            'Cannot refresh: ZOHO_MEETING_REFRESH_TOKEN, ZOHO_MEETING_CLIENT_ID, or ZOHO_MEETING_CLIENT_SECRET missing in .env'
        );
    }

    console.log('🔄 Refreshing Zoho Meeting access token...');
    const res = await fetch(`${ACCOUNTS_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: store.refreshToken,
            client_id: ZOHO_MEETING_CLIENT_ID,
            client_secret: ZOHO_MEETING_CLIENT_SECRET,
        }),
    });

    const data = await res.json() as any;
    if (!data.access_token) {
        throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
    }

    store.accessToken = data.access_token;
    process.env.ZOHO_MEETING_ACCESS_TOKEN = store.accessToken;
    console.log('✅ Zoho Meeting access token refreshed');
}

async function meetingFetch(url: string, options: RequestInit = {}, tokenOverride?: string): Promise<Response> {
    const tok = tokenOverride || store.accessToken;
    if (!tok) {
        throw new Error('Not connected to Zoho Meeting. Please sign in or connect your Zoho Meeting account.');
    }

    const makeReq = (t: string) =>
        fetch(url, {
            ...options,
            headers: {
                ...((options.headers as Record<string, string>) || {}),
                Authorization: `Zoho-oauthtoken ${t}`,
            },
        });

    let res = await makeReq(tok);

    // Only auto-refresh for the shared store token (not per-user session tokens)
    if (res.status === 401 && !tokenOverride) {
        await refreshAccessToken();
        res = await makeReq(store.accessToken);
    }

    return res;
}

async function resolveUserKey(token?: string): Promise<string> {
    // For per-user tokens, always fetch dynamically (no caching across users)
    if (!token && store.userKey) return store.userKey;

    const res = await meetingFetch(`${MEETING_API_BASE}/user.json`, {}, token);
    const data = await res.json() as any;
    const key = data.userKey || data.key || data.uid || '';

    if (!token) {
        store.userKey = key;
        if (key) process.env.ZOHO_MEETING_USER_KEY = key;
    }

    return key;
}

// Helper: get the best available token
// Priority: Meeting-specific session token > Desk session token (also has ZohoMeeting scopes)
// No .env fallback — we never want to show one user's data to another
function resolveToken(req: any): string {
    return req.session?.zohoMeeting?.accessToken
        || req.session?.zoho?.accessToken   // Desk login includes ZohoMeeting.meeting.READ + ZohoMeeting.recording.READ
        || '';
}

// ─── GET /api/zoho-meeting/status ───────────────────────────────────────────
zohoMeetingRouter.get('/status', (req, res) => {
    const token = (req as any).session?.zohoMeeting?.accessToken
        || (req as any).session?.zoho?.accessToken;
    res.json({ connected: !!token });
});

// ─── GET /api/zoho-meeting/auth ─────────────────────────────────────────────
zohoMeetingRouter.get('/auth', (req, res) => {
    const clientId = process.env.ZOHO_MEETING_CLIENT_ID
        || process.env.ZOHO_CLIENT_ID
        || process.env.ZOHO_DESK_CLIENT_ID;

    if (!clientId) {
        return res.status(500).json({ error: 'No Zoho OAuth client ID found. Set ZOHO_CLIENT_ID in .env.' });
    }

    // Reuse the main auth redirect URI
    // state=meeting tells the callback to store this as a Meeting token
    const host = req.get('host') || 'localhost:5001';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const prefix = req.originalUrl?.startsWith('/server/')
        ? '/' + req.originalUrl.split('/')[1] + '/' + req.originalUrl.split('/')[2]
        : '';
    const mainRedirectUri = `${protocol}://${host}${prefix}/api/auth/callback`;

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'ZohoMeeting.meeting.READ,ZohoMeeting.recording.READ,ZohoMeeting.meetinguds.READ,ZohoFiles.files.READ,ZohoMeeting.meeting.ALL,ZohoMeeting.recording.ALL',
        redirect_uri: mainRedirectUri,
        access_type: 'offline',
        prompt: 'consent',
        state: 'meeting',
    });

    res.redirect(`${ACCOUNTS_BASE}/auth?${params.toString()}`);
});

// ─── GET /api/zoho-meeting/callback ──────────────────────────────────────────
zohoMeetingRouter.get('/callback', async (req, res) => {
    const { code, error } = req.query as Record<string, string>;

    const host = req.get('host') || 'localhost:5001';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const prefix = req.originalUrl?.startsWith('/server/')
        ? '/' + req.originalUrl.split('/')[1] + '/' + req.originalUrl.split('/')[2]
        : '';

    // Fallback frontend url for local dev, dynamic host for prod
    let frontendUrl = `${protocol}://${host}${prefix}`;
    if (host.includes('localhost:') && protocol === 'http') {
        frontendUrl = 'http://localhost:5173'; // fallback for local dev
    }

    if (error) {
        console.error('❌ Zoho Meeting OAuth error:', error);
        return res.redirect(`${frontendUrl}?zoho_meeting_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
        return res.status(400).send('No authorization code received from Zoho.');
    }

    const clientId = process.env.ZOHO_MEETING_CLIENT_ID
        || process.env.ZOHO_CLIENT_ID
        || process.env.ZOHO_DESK_CLIENT_ID || '';
    const clientSecret = process.env.ZOHO_MEETING_CLIENT_SECRET
        || process.env.ZOHO_CLIENT_SECRET
        || process.env.ZOHO_DESK_CLIENT_SECRET || '';

    if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Client credentials not configured in .env' });
    }

    try {
        const tokenRes = await fetch(`${ACCOUNTS_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: `${protocol}://${host}${prefix}/api/zoho-meeting/callback`,
            }),
        });

        const tokenData = await tokenRes.json() as any;
        if (!tokenData.access_token) {
            throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
        }

        // Store Meeting token in session (survives server restarts with cookie-session)
        (req as any).session.zohoMeeting = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
        };

        // Also keep in-memory as backup
        store.accessToken = tokenData.access_token;
        store.refreshToken = tokenData.refresh_token || store.refreshToken;

        console.log('✅ Zoho Meeting connected successfully');
        res.redirect(`${frontendUrl}?zoho_meeting_connected=1`);
    } catch (err) {
        console.error('❌ Zoho Meeting callback error:', err);
        res.redirect(`${frontendUrl}?zoho_meeting_error=auth_failed`);
    }
});

// ─── GET /api/zoho-meeting/debug ─────────────────────────────────────────────
// Diagnostic endpoint: tests all known domains + endpoints to find what works
zohoMeetingRouter.get('/debug', async (req, res) => {
    const token = resolveToken(req);
    if (!token) {
        return res.status(401).json({ error: 'No token. Please sign in first.' });
    }

    const result: any = { token_present: true, userJsonResults: [], endpointResults: [] };

    // Step 1: Try user.json on ALL known Zoho Meeting domains
    const domains = [
        'https://meeting.zoho.in/api/v2',
        'https://meeting.zoho.com/api/v2',
        'https://meeting.zohocorp.com/api/v2',
    ];

    let zsoid = '';
    let userKey = '';

    for (const base of domains) {
        try {
            const r = await fetch(`${base}/user.json`, {
                headers: { Authorization: `Zoho-oauthtoken ${token}` },
            });
            const body = await r.json() as any;
            result.userJsonResults.push({ domain: base, status: r.status, body });
            if (r.ok) {
                zsoid = body.zsoid || body.organizationId || body.orgId || body.companyId || '';
                userKey = body.userKey || body.key || body.uid || body.id || body.userId || '';
            }
        } catch (e) {
            result.userJsonResults.push({ domain: base, error: String(e) });
        }
    }

    // Use Desk org ID as fallback if user.json didn't give zsoid
    if (!zsoid) zsoid = process.env.ZOHO_DESK_ORG_ID || '';
    result.parsed = { zsoid, userKey };

    // Step 2: Try recordings on all known domain+path combos
    const recordingBases = [
        'https://meeting.zoho.in/meeting/api/v2',
        'https://meeting.zoho.com/meeting/api/v2',
        'https://meeting.zohocorp.com/meeting/api/v2',
    ];

    const urlsToTry: string[] = [];
    for (const base of recordingBases) {
        if (zsoid) urlsToTry.push(`${base}/${zsoid}/recordings.json`);
        if (userKey) urlsToTry.push(`${base}/${userKey}/recordings.json`);
    }

    for (const url of urlsToTry) {
        try {
            const r = await fetch(url, {
                headers: { Authorization: `Zoho-oauthtoken ${token}` },
            });
            const body = await r.text();
            result.endpointResults.push({ url, status: r.status, body: body.slice(0, 300) });
        } catch (e) {
            result.endpointResults.push({ url, error: String(e) });
        }
    }

    res.json(result);
});

// ─── GET /api/zoho-meeting/raw-recording ─────────────────────────────────────
// Shows every field Zoho returns for the first recording — used to find the real download URL
zohoMeetingRouter.get('/raw-recording', async (req, res) => {
    const token = resolveToken(req);
    if (!token) return res.status(401).json({ error: 'Not logged in' });
    const zsoid = process.env.ZOHO_MEETING_ORG_ID || process.env.ZOHO_DESK_ORG_ID || '';
    const r = await fetch(`${MEETING_RECORDINGS_BASE}/${zsoid}/recordings.json`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const data = await r.json() as any;
    const first = (data.recordings || [])[0] || {};
    res.json({ allFields: Object.keys(first), firstRecording: first });
});

// ─── GET /api/zoho-meeting/recordings ────────────────────────────────────────
zohoMeetingRouter.get('/recordings', async (req, res) => {
    try {
        const token = resolveToken(req);
        const sessionMeetingToken = (req as any).session?.zohoMeeting?.accessToken;

        console.log('📥 /recordings called | token present:', !!token,
            '| session.zohoMeeting:', !!sessionMeetingToken,
            '| using session token:', token === sessionMeetingToken);

        // Warn if falling back to the Desk token (which won't have Meeting scopes)
        if (!sessionMeetingToken && token) {
            console.warn('⚠️  No Meeting-specific session token found. Falling back to store token — this may lack ZohoMeeting scopes.');
        }

        // Fetch user info from Zoho Meeting user.json using the Meeting-specific token
        let zsoid = '';
        let userKey = '';
        let userJsonBody: any = null;

        try {
            console.log('🔍 Fetching Zoho Meeting user info...');
            const userRes = await meetingFetch(`${MEETING_API_BASE}/user.json`, {}, token);
            userJsonBody = await userRes.json() as any;
            console.log('👤 user.json status:', userRes.status);
            console.log('👤 user.json response:', JSON.stringify(userJsonBody));

            zsoid = userJsonBody.zsoid || userJsonBody.ZSOID || userJsonBody.organizationId
                || userJsonBody.orgId || userJsonBody.companyId || userJsonBody.accountId || '';
            userKey = userJsonBody.userKey || userJsonBody.key || userJsonBody.uid
                || userJsonBody.id || userJsonBody.userId || '';
        } catch (e) {
            console.warn('⚠️  Could not fetch user.json:', e);
        }

        // Fallback: use Meeting-specific org ID first, then Desk org ID
        if (!zsoid) {
            zsoid = process.env.ZOHO_MEETING_ORG_ID || process.env.ZOHO_DESK_ORG_ID || '';
            if (zsoid) console.log('ℹ️  zsoid not in user.json — using env fallback:', zsoid);
        }

        console.log('🔑 zsoid:', zsoid, '| userKey:', userKey);

        // Build endpoint list in priority order
        // Zoho Meeting API docs: GET /api/v2/{zsoid}/recordings.json
        const endpoints: string[] = [];
        if (zsoid) {
            endpoints.push(`${MEETING_RECORDINGS_BASE}/${zsoid}/recordings.json`);
            if (userKey) {
                endpoints.push(`${MEETING_RECORDINGS_BASE}/${zsoid}/user/${userKey}/recordings.json`);
            }
        }
        if (userKey) {
            endpoints.push(`${MEETING_RECORDINGS_BASE}/${userKey}/recordings.json`);
            endpoints.push(`${MEETING_API_BASE}/${userKey}/recordings.json`);
            endpoints.push(`${MEETING_API_BASE}/${userKey}/sessions.json?type=pastSession`);
        }
        endpoints.push(`${MEETING_API_BASE}/sessions.json?type=pastSession`);
        endpoints.push(`${MEETING_API_BASE}/recordings.json`);

        let data: any = null;
        let lastError = '';
        const triedEndpoints: string[] = [];

        for (const url of endpoints) {
            console.log(`📡 Trying: ${url}`);
            triedEndpoints.push(url);
            try {
                const response = await meetingFetch(url, {}, token);
                if (response.ok) {
                    data = await response.json();
                    console.log(`✅ Success at: ${url}`, JSON.stringify(data).slice(0, 200));
                    break;
                } else {
                    const body = await response.text();
                    lastError = `${url} → HTTP ${response.status}: ${body.slice(0, 200)}`;
                    console.warn(`⚠️  ${lastError}`);
                }
            } catch (e) {
                lastError = `${url} → ${String(e)}`;
                console.warn(`⚠️  Endpoint error: ${lastError}`);
            }
        }

        if (!data) {
            console.error('❌ All recording endpoints failed. Tried:', triedEndpoints);
            return res.status(500).json({
                error: 'Failed to fetch recordings from Zoho Meeting',
                details: `All ${triedEndpoints.length} endpoints failed. Last error: ${lastError}`,
                hint: 'Run GET /api/zoho-meeting/debug to see raw API responses and diagnose the issue.',
            });
        }

        // Normalize whichever shape was returned
        const raw: any[] = data.recordings || data.sessions || data.pastSessions
            || data.sessionList || data.data || [];

        const recordings = raw.map((r: any) => ({
            key: r.erecordingId || r.sessionKey || r.meetingKey || r.key || r.id || '',
            title: r.topic || r.sessionTopic || r.title || r.subject || r.meetingTitle || 'Untitled Meeting',
            startTime: r.datenTime || r.startTime || r.start_time || r.scheduledTime || r.startDateTime || '',
            durationMs: r.duration || 0,
            downloadUrl: r.downloadUrl || r.download_url || r.recordingUrl || r.recordingLink || r.playUrl || '',
            transcriptUrl: r.transcriptionPublicDownloadUrl || r.transcriptUrl || r.transcriptionUrl || '',
            fileSize: r.fileSize || r.file_size || r.size || 0,
            _participantsFromRecord: r.noOfParticipants || r.participantCount || r.attendeeCount
                || r.noOfAttendees || r.participants || null,
            _sessionKey: r.sessionKey || r.meetingKey || r.key || r.id || '',
        }));

        const withParticipants = await Promise.allSettled(
            recordings.map(async (rec) => {
                if (rec._participantsFromRecord !== null) {
                    return { ...rec, participants: rec._participantsFromRecord };
                }
                if (!rec._sessionKey) return { ...rec, participants: null };

                const candidateUrls: string[] = [];
                if (zsoid) candidateUrls.push(`${MEETING_API_BASE}/${zsoid}/sessions/${rec._sessionKey}/attendees.json`);
                if (userKey) candidateUrls.push(`${MEETING_API_BASE}/${userKey}/sessions/${rec._sessionKey}/attendees.json`);
                candidateUrls.push(`${MEETING_API_BASE}/sessions/${rec._sessionKey}/attendees.json`);

                for (const url of candidateUrls) {
                    try {
                        const r2 = await meetingFetch(url, {}, token);
                        if (r2.ok) {
                            const body = await r2.json() as any;
                            const list = body.attendees || body.participants || body.data || [];
                            const count = Array.isArray(list)
                                ? list.length
                                : (body.totalCount || body.count || body.noOfAttendees || null);
                            if (count !== null) return { ...rec, participants: count };
                        }
                    } catch { /* try next */ }
                }
                return { ...rec, participants: null };
            })
        );

        const finalRecordings = withParticipants.map((result, i) => {
            const rec = result.status === 'fulfilled' ? result.value : recordings[i];
            const { _participantsFromRecord, _sessionKey, ...clean } = rec as any;
            return { ...clean, participants: (rec as any).participants ?? null };
        });

        res.json({ recordings: finalRecordings });
    } catch (err) {
        console.error('❌ Error fetching Zoho recordings:', err);
        res.status(500).json({
            error: 'Failed to fetch recordings from Zoho Meeting',
            details: err instanceof Error ? err.message : 'Unknown error',
        });
    }
});

// ─── POST /api/zoho-meeting/process ──────────────────────────────────────────
// Streams SSE progress events so the HTTP connection stays open.
// This prevents Vercel from freezing the CPU between requests.
zohoMeetingRouter.post('/process', async (req, res) => {
    const { recordingKey, downloadUrl, transcriptUrl, meetingTitle, verbosity, meetingLink } = req.body as {
        recordingKey?: string;
        downloadUrl?: string;
        transcriptUrl?: string;
        meetingTitle?: string;
        verbosity?: 'brief' | 'standard' | 'detailed';
        meetingLink?: string;
    };

    if (!downloadUrl && !recordingKey && !meetingLink) {
        return res.status(400).json({ error: 'downloadUrl, recordingKey, or meetingLink is required' });
    }

    // Keep connection alive — Vercel won't freeze CPU while streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Clean up leftover temp files older than 15 mins from previous crashed requests
    // Safe for concurrent users — only touches stale files, not active ones
    try {
        const cutoff = Date.now() - 15 * 60 * 1000;
        const tmpDir = os.tmpdir();
        fs.readdirSync(tmpDir)
            .filter(f => f.startsWith('zoho_rec_'))
            .forEach(f => {
                try {
                    const full = path.join(tmpDir, f);
                    if (fs.statSync(full).mtimeMs < cutoff) {
                        fs.unlinkSync(full);
                        console.log(`🧹 Cleaned stale tmp file: ${f}`);
                    }
                } catch { /* ignore individual file errors */ }
            });
    } catch { /* ignore cleanup errors — never block the request */ }

    const token = resolveToken(req);
    const jobId = uuidv4();
    const tmpFile = path.join(os.tmpdir(), `zoho_rec_${jobId}.mp4`);
    try {
        send({ status: 'processing', progress: 5, message: 'Resolving recording URL...' });

        let finalDownloadUrl = downloadUrl;

        // ── Resolve from meetingLink (public recording URL) ──────────────
        // Flag so the download step knows to try without auth if 401
        let isFromMeetingLink = false;
        let linkRecordingId = '';
        let linkOrg = '';
        let linkDomain = '';

        if (!finalDownloadUrl && !recordingKey && meetingLink) {
            isFromMeetingLink = true;
            console.log(`🔗 Resolving meeting link: ${meetingLink}`);
            send({ status: 'processing', progress: 7, message: 'Parsing meeting link...' });

            // Parse recordingId and org from Zoho Meeting public URLs
            // Supports: meeting.zohocorp.com, meeting.zoho.in, meeting.zoho.com
            try {
                const parsed = new URL(meetingLink);
                linkRecordingId = parsed.searchParams.get('recordingId') || '';
                linkOrg = parsed.searchParams.get('x-meeting-org') || '';
                linkDomain = parsed.hostname; // e.g. meeting.zohocorp.com
            } catch {
                throw new Error('Invalid meeting link URL format.');
            }

            if (!linkRecordingId) {
                throw new Error('Could not extract recordingId from the meeting link. Expected format: ...?recordingId=XXX&x-meeting-org=YYY');
            }

            console.log(`📋 Parsed link — recordingId: ${linkRecordingId.slice(0, 16)}..., org: ${linkOrg}, domain: ${linkDomain}`);

            // Strategy 1: List recordings for the org and find a match by erecordingId
            if (linkOrg && token) {
                send({ status: 'processing', progress: 9, message: 'Looking up recording via API...' });
                const apiDomains = [
                    MEETING_RECORDINGS_BASE,                                    // meeting.zoho.in/meeting/api/v2
                    'https://meeting.zohocorp.com/meeting/api/v2',
                ];
                for (const base of apiDomains) {
                    if (finalDownloadUrl) break;
                    try {
                        const listUrl = `${base}/${linkOrg}/recordings.json`;
                        console.log(`📡 Trying recordings list: ${listUrl}`);
                        const listRes = await meetingFetch(listUrl, {}, token);
                        console.log(`   → HTTP ${listRes.status}`);
                        if (listRes.ok) {
                            const listData = await listRes.json() as any;
                            const recs: any[] = listData.recordings || listData.data || [];
                            console.log(`   → ${recs.length} recordings returned`);
                            const match = recs.find((r: any) =>
                                r.erecordingId === linkRecordingId
                                || r.recordingId === linkRecordingId
                                || r.key === linkRecordingId
                                || r.id === linkRecordingId
                            );
                            if (match) {
                                finalDownloadUrl = match.downloadUrl || match.download_url || match.recordingUrl || match.recordingLink || '';
                                console.log(`✅ Found matching recording: "${match.topic || match.title}" → download: ${finalDownloadUrl?.slice(0, 80)}`);
                            } else {
                                console.log(`ℹ️  None matched recordingId. Sample keys: ${recs.slice(0, 3).map((r: any) => r.erecordingId || r.key || r.id).join(', ')}`);
                            }
                        }
                    } catch (e) {
                        console.warn(`⚠️  API lookup failed:`, e);
                    }
                }
            }

            // Strategy 2: Direct recording lookup by ID
            if (!finalDownloadUrl && linkOrg && token) {
                const lookupBases = [
                    `https://${linkDomain}/meeting/api/v2`,                     // same domain as the link
                    MEETING_RECORDINGS_BASE,
                    MEETING_API_BASE,
                ];
                for (const base of lookupBases) {
                    if (finalDownloadUrl) break;
                    try {
                        const url = `${base}/${linkOrg}/recordings/${linkRecordingId}.json`;
                        console.log(`📡 Trying direct lookup: ${url}`);
                        const r = await meetingFetch(url, {}, token);
                        console.log(`   → HTTP ${r.status}`);
                        if (r.ok) {
                            const d = await r.json() as any;
                            finalDownloadUrl = d.downloadUrl || d.download_url || d.recordingUrl || '';
                            if (finalDownloadUrl) {
                                console.log(`✅ Direct lookup found download URL: ${finalDownloadUrl.slice(0, 80)}`);
                            }
                        }
                    } catch (e) {
                        console.warn(`⚠️  Direct lookup failed:`, e);
                    }
                }
            }

            // Strategy 3: Construct download-accl URLs (try multiple Zoho domains)
            if (!finalDownloadUrl) {
                const downloadPatterns = [
                    `https://download-accl.zoho.in/webdownload?event-id=${linkRecordingId}&x-service=meetinglab&x-cli-msg=`,
                    `https://download-accl.zoho.com/webdownload?event-id=${linkRecordingId}&x-service=meetinglab&x-cli-msg=`,
                ];
                console.log('📡 Trying download-accl fallbacks...');
                finalDownloadUrl = downloadPatterns[0]; // will try zoho.in first; retry logic below handles 401
            }
        }

        // ── Resolve from recordingKey (existing dropdown flow) ───────────
        if (!finalDownloadUrl && recordingKey) {
            try {
                const userKey = await resolveUserKey(token);
                const url = userKey
                    ? `${MEETING_API_BASE}/${userKey}/recordings/${recordingKey}.json`
                    : `${MEETING_API_BASE}/recordings/${recordingKey}.json`;
                const response = await meetingFetch(url, {}, token);
                const data = await response.json() as any;
                finalDownloadUrl = data.downloadUrl || data.download_url || data.recordingUrl || '';
            } catch (err) {
                // try constructed URL
            }
        }
        if (!finalDownloadUrl && recordingKey) {
            finalDownloadUrl = `https://download-accl.zoho.com/webdownload?event-id=${recordingKey}&x-service=meetinglab&x-cli-msg=`;
        }
        if (!finalDownloadUrl) {
            throw new Error('Could not determine download URL for this recording.');
        }

        // SSRF guard for non-meetingLink flow (meetingLink has per-attempt SSRF checks)
        if (!isFromMeetingLink) {
            try {
                const { hostname } = new URL(finalDownloadUrl);
                if (!hostname.endsWith('.zoho.com') && !hostname.endsWith('.zoho.in') && !hostname.endsWith('.zohocorp.com')) {
                    throw new Error(`Blocked download from untrusted host: ${hostname}`);
                }
            } catch (urlErr) {
                if (urlErr instanceof Error && urlErr.message.startsWith('Blocked')) throw urlErr;
                throw new Error('Invalid download URL format.');
            }
        }

        send({ status: 'processing', progress: 15, message: 'Downloading recording...' });
        console.log(`\n📝 [${jobId}] Processing: "${meetingTitle || recordingKey}"`);

        let transcript = '';

        // Build candidate download URLs to try in order
        // For meeting links: try multiple URLs + with/without auth
        const downloadAttempts: { url: string; useAuth: boolean; label: string }[] = [];

        if (isFromMeetingLink) {
            // Try the resolved URL with auth first
            downloadAttempts.push({ url: finalDownloadUrl, useAuth: true, label: 'resolved URL + auth' });
            // Try without auth (public recordings may not need it)
            downloadAttempts.push({ url: finalDownloadUrl, useAuth: false, label: 'resolved URL (no auth)' });
            // Try download-accl on both domains
            if (!finalDownloadUrl.includes('download-accl.zoho.in')) {
                downloadAttempts.push({ url: `https://download-accl.zoho.in/webdownload?event-id=${linkRecordingId}&x-service=meetinglab&x-cli-msg=`, useAuth: true, label: 'download-accl.zoho.in + auth' });
            }
            if (!finalDownloadUrl.includes('download-accl.zoho.com')) {
                downloadAttempts.push({ url: `https://download-accl.zoho.com/webdownload?event-id=${linkRecordingId}&x-service=meetinglab&x-cli-msg=`, useAuth: true, label: 'download-accl.zoho.com + auth' });
            }
            // Try the original public URL directly with auth (may redirect to video)
            downloadAttempts.push({ url: meetingLink!, useAuth: true, label: 'original link + auth' });
            downloadAttempts.push({ url: meetingLink!, useAuth: false, label: 'original link (no auth)' });
        } else {
            downloadAttempts.push({ url: finalDownloadUrl, useAuth: true, label: 'download URL + auth' });
        }

        let dlResponse: Response | null = null;
        let lastDlError = '';

        for (const attempt of downloadAttempts) {
            // SSRF guard for each attempt URL
            try {
                const { hostname } = new URL(attempt.url);
                if (!hostname.endsWith('.zoho.com') && !hostname.endsWith('.zoho.in') && !hostname.endsWith('.zohocorp.com')) {
                    console.log(`⛔ Skipping untrusted host: ${hostname}`);
                    continue;
                }
            } catch { continue; }

            console.log(`📡 Download attempt: ${attempt.label} → ${attempt.url.slice(0, 100)}`);
            try {
                const res = attempt.useAuth
                    ? await meetingFetch(attempt.url, {}, token)
                    : await fetch(attempt.url);
                console.log(`   → HTTP ${res.status}, Content-Type: ${res.headers.get('content-type')}`);

                if (res.ok) {
                    const ct = res.headers.get('content-type') || '';
                    if (ct.includes('text/html')) {
                        console.log(`   → Skipping: returned HTML page, not a video file`);
                        lastDlError = `${attempt.label}: returned HTML page instead of video`;
                        continue;
                    }
                    dlResponse = res;
                    console.log(`✅ Download succeeded via: ${attempt.label}`);
                    break;
                } else {
                    lastDlError = `${attempt.label}: HTTP ${res.status}`;
                    console.log(`   → Failed: HTTP ${res.status}`);
                }
            } catch (e) {
                lastDlError = `${attempt.label}: ${e}`;
                console.warn(`   → Error: ${e}`);
            }
        }

        if (!dlResponse) {
            throw new Error(`All download attempts failed. Last error: ${lastDlError}. Check Vercel logs for details.`);
        }

        const contentType = dlResponse.headers.get('content-type') || '';

        if (!dlResponse.body) throw new Error('Download response has no body');

        // Heartbeat helper — ticks progress so the UI doesn't stall during long operations
        let heartbeatProgress = 45;
        const transcribeMessages = [
            'Transcribing audio with Whisper...',
            'Processing speech to text...',
            'Transcribing audio with Whisper...',
            'Still transcribing — large recordings take a moment...',
            'Processing speech to text...',
            'Almost done transcribing...',
        ];
        let heartbeatTick = 0;
        const heartbeat = setInterval(() => {
            if (heartbeatProgress < 78) {
                heartbeatProgress = Math.min(78, heartbeatProgress + 4);
                send({
                    status: 'processing',
                    progress: heartbeatProgress,
                    message: transcribeMessages[heartbeatTick % transcribeMessages.length],
                });
                heartbeatTick++;
            }
        }, 10000); // every 10s

        try {
        if (isFromMeetingLink) {
            // ── Stream-to-ffmpeg path: pipe download → ffmpeg → mp3 (no video on disk) ──
            // Avoids /tmp space issues on Vercel — large videos never touch the filesystem
            const audioPath = path.join(os.tmpdir(), `zoho_rec_${jobId}.mp3`);

            send({ status: 'processing', progress: 20, message: 'Streaming video to audio extractor (no disk save)...' });
            console.log('🎵 Piping download stream directly to ffmpeg (no video file on disk)...');

            const nodeStream = Readable.fromWeb(dlResponse.body as any);

            await new Promise<void>((resolve, reject) => {
                ffmpegCmd(nodeStream)
                    .inputFormat('mp4')
                    .output(audioPath)
                    .audioCodec('libmp3lame')
                    .audioBitrate('16k')
                    .audioFrequency(16000)
                    .audioChannels(1)
                    .noVideo()
                    .on('stderr', (line: string) => {
                        // Log ffmpeg progress lines
                        if (line.includes('time=')) console.log(`  ffmpeg: ${line.trim()}`);
                    })
                    .on('end', () => {
                        console.log('✅ Audio extraction from stream complete');
                        resolve();
                    })
                    .on('error', (err: Error) => {
                        console.error('❌ ffmpeg stream error:', err.message);
                        reject(new Error(`ffmpeg stream extraction failed: ${err.message}`));
                    })
                    .run();
            });

            const audioStats = fs.statSync(audioPath);
            console.log(`📊 Audio file: ${(audioStats.size / 1024 / 1024).toFixed(2)} MB`);

            send({ status: 'processing', progress: 45, message: 'Transcribing audio with Whisper...' });
            console.log('🎙️  Transcribing with Whisper...');

            transcript = await transcribeAudio(audioPath, token);
            try { fs.unlinkSync(audioPath); } catch { /* ignore */ }

        } else {
            // ── File-based path: download to /tmp, then transcribe (existing flow) ──
            const fileStream = fs.createWriteStream(tmpFile);
            const reader = dlResponse.body.getReader();
            let sizeInBytes = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                    fileStream.write(value);
                    sizeInBytes += value.length;
                }
            }
            fileStream.end();
            await new Promise(resolve => fileStream.on('finish', resolve));

            const sizeMB = (sizeInBytes / 1024 / 1024).toFixed(2);
            console.log(`✅ Downloaded: ${sizeMB} MB`);

            if (sizeInBytes < 10000) {
                throw new Error(`Downloaded file is too small (${sizeMB} MB) — likely not a real video file. The URL may have expired.`);
            }

            send({ status: 'processing', progress: 35, message: `Downloaded (${sizeMB} MB). Extracting audio...` });
            console.log('🎵 Extracting audio with ffmpeg...');

            send({ status: 'processing', progress: 45, message: 'Transcribing audio with Whisper...' });
            console.log('🎙️  Transcribing with Whisper...');

            let result: { transcript: string; audioPath: string };
            result = await transcribeVideo(tmpFile, token);
            transcript = result.transcript;

            try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
            try { if (result.audioPath) fs.unlinkSync(result.audioPath); } catch { /* ignore */ }
        }
        } finally {
            clearInterval(heartbeat);
        }

        // Dots-only transcript = Whisper detected silence — audio track was empty
        const cleanedTranscript = transcript?.replace(/[\s.]+/g, '').trim() ?? '';
        if (cleanedTranscript.length < 10) {
            throw new Error('Audio track appears to be silent (Whisper returned only silence markers). The recording may have no audio, or ffmpeg extracted the wrong track. Check Vercel logs for audio stream details.');
        }
        const transcriptLen = transcript?.trim().length ?? 0;
        console.log(`📝 Transcript length: ${transcriptLen} chars`);
        console.log(`📝 Transcript preview: ${transcript?.slice(0, 300)}`);

        if (!transcript?.trim()) {
            throw new Error('Whisper returned an empty transcript. The audio may be silent or the video has no speech track.');
        }
        if (transcript.trim().length < 100) {
            throw new Error(`Transcript too short (${transcript.trim().length} chars): "${transcript.trim()}" — audio may be silent or corrupted.`);
        }

        send({ status: 'processing', progress: 82, message: `Transcript ready (${transcriptLen} chars). Generating MoM...`, transcriptPreview: transcript.trim().slice(0, 300) });

        // End stream here — frontend will call /generate-mom in a fresh 300s window
        send({ status: 'transcribed', progress: 82, message: `Transcript ready (${transcriptLen} chars). Generating MoM...`, transcript: transcript.trim(), meetingTitle: meetingTitle || 'Zoho Meeting Recording', verbosity: verbosity || 'brief' });
        console.log(`✅ [${jobId}] Transcription done — handing off to /generate-mom`);
    } catch (err) {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ [${jobId}] Error:`, msg);
        send({ status: 'error', message: msg });
    } finally {
        res.end();
    }
});

// ─── POST /api/zoho-meeting/generate-mom ─────────────────────────────────────
// Second step: takes transcript, generates MoM. Runs in its own 300s Vercel window.
zohoMeetingRouter.post('/generate-mom', async (req, res) => {
    const { transcript, meetingTitle, verbosity } = req.body as {
        transcript: string;
        meetingTitle?: string;
        verbosity?: 'brief' | 'standard' | 'detailed';
    };

    if (!transcript?.trim()) {
        return res.status(400).json({ error: 'transcript is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        send({ status: 'processing', progress: 85, message: 'Generating Minutes of Meeting with AI...' });
        console.log('🤖 Generating MoM with PlatformAI...');

        const momData = await generateMeetingMoM({
            transcript,
            meetingTitle: meetingTitle || 'Zoho Meeting Recording',
            verbosity: verbosity || 'brief',
            zohoToken: resolveToken(req),
        });

        send({ status: 'processing', progress: 97, message: 'Saving...' });
        const storedMoM = await saveMoM(momData, transcript);

        send({ status: 'done', progress: 100, message: 'Done!', result: storedMoM });
        console.log('✅ MoM generated successfully');
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('❌ MoM generation error:', msg);
        send({ status: 'error', message: msg });
    } finally {
        res.end();
    }
});

// ─── GET /api/zoho-meeting/job/:jobId ────────────────────────────────────────
zohoMeetingRouter.get('/job/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});
