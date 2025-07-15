import { Client, GatewayIntentBits, ActivityType, PresenceUpdateStatus } from "discord.js";
import dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

dotenv.config();

const TRACKED_USER_ID = process.env.USER_ID!;
const BACKEND_URL = process.env.BACKEND_URL;
const DB_PATH = path.resolve(__dirname, "../elysia/db");

// Ensure DB directory exists
if (!existsSync(DB_PATH)) {
    mkdirSync(DB_PATH, { recursive: true });
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMembers],
});

let isBackendAvailable = false;
let backendCheckInterval: NodeJS.Timeout | null = null;
let sendInterval: NodeJS.Timeout | null = null;
let lastTrackId = "";
let lastStartTimestamp = 0;

// Configuration constants
const BACKEND_CHECK_INTERVAL = 60 * 1000; // 1 minute
const SEND_INTERVAL = 5 * 1000; // 5 seconds
const REQUEST_TIMEOUT = 5000; // 5 seconds

interface TrackInfo {
    trackName: string;
    artist: string;
    album: string;
    albumImage: string | null;
    smallImage: string | null;
    rawAssets: any;
}

interface TrackData extends TrackInfo {
    listenCount: number;
    listeningTime: number;
}

// Backend connection management
async function checkBackendConnection(): Promise<boolean> {
    if (!BACKEND_URL) {
        console.error("❌ BACKEND_URL is not set!");
        return false;
    }

    try {
        const response = await fetch(BACKEND_URL, { 
            method: "HEAD",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT)
        });
        
        if (response.ok) {
            if (!isBackendAvailable) {
                console.log("✅ Backend connection restored!");
                isBackendAvailable = true;
            }
            return true;
        } else {
            throw new Error(`Backend responded with status: ${response.status}`);
        }
    } catch (err) {
        if (isBackendAvailable) {
            console.error("❌ Lost connection to backend:", err);
            isBackendAvailable = false;
        }
        return false;
    }
}

function startBackendHealthCheck(): void {
    if (backendCheckInterval) clearInterval(backendCheckInterval);
    
    checkBackendConnection();
    
    backendCheckInterval = setInterval(async () => {
        await checkBackendConnection();
    }, BACKEND_CHECK_INTERVAL);
}

// File operations with error handling
function readJsonFile<T>(filePath: string, defaultValue: T): T {
    if (!existsSync(filePath)) {
        return defaultValue;
    }
    
    try {
        const content = readFileSync(filePath, "utf-8");
        return JSON.parse(content);
    } catch (err) {
        console.error(`❌ Error reading ${filePath}:`, err);
        return defaultValue;
    }
}

function writeJsonFile<T>(filePath: string, data: T): boolean {
    try {
        writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`❌ Error writing ${filePath}:`, err);
        return false;
    }
}

// Extract track information from Discord activity
function getTrackInfoFromActivity(activity: any): TrackInfo {
    // console.log("🔍 DEBUG - Full activity:", JSON.stringify(activity, null, 2));
    
    const trackName = activity.details || "Unknown Track";
    const artist = activity.state || "Unknown Artist"; 
    const album = activity.assets?.large_text || "Unknown Album";
    
    let albumImage: string | null = null;
    let smallImage: string | null = null;
    
    if (activity.assets) {
        // console.log("🖼️ Assets found:", activity.assets);
        
        // Parse large image
        if (activity.assets.large_image) {
            const largeImg = activity.assets.large_image;
            if (largeImg.startsWith('spotify:')) {
                albumImage = `https://i.scdn.co/image/${largeImg.replace('spotify:', '')}`;
            } else if (largeImg.startsWith('mp:external/')) {
                albumImage = `https://media.discordapp.net/external/${largeImg.replace('mp:external/', '')}`;
            } else {
                albumImage = largeImg;
            }
            console.log("🖼️ Album image URL:", albumImage);
        }
        
        // Parse small image
        if (activity.assets.small_image) {
            const smallImg = activity.assets.small_image;
            if (smallImg.startsWith('spotify:')) {
                smallImage = `https://i.scdn.co/image/${smallImg.replace('spotify:', '')}`;
            } else if (smallImg.startsWith('mp:external/')) {
                smallImage = `https://media.discordapp.net/external/${smallImg.replace('mp:external/', '')}`;
            } else {
                smallImage = smallImg;
            }
            // console.log("🖼️ Small image URL:", smallImage);
        }
    } else {
        console.log("❌ No assets found in activity");
    }
    
    return {
        trackName,
        artist,
        album,
        albumImage,
        smallImage,
        rawAssets: activity.assets || null
    };
}

// Update track information and listening statistics
function updateTrackInfo(trackId: string, trackInfo: TrackInfo): void {
    const infoPath = path.join(DB_PATH, "trackinfo.json");
    const trackData = readJsonFile<Record<string, TrackData>>(infoPath, {});

    if (!trackData[trackId]) {
        trackData[trackId] = {
            ...trackInfo,
            listenCount: 0,
            listeningTime: 0
        };
        console.log("📝 Added new track to trackinfo.json:", trackInfo.trackName);
    }

    // Update track info and increment listen count
    trackData[trackId] = {
        ...trackData[trackId],
        ...trackInfo,
        listenCount: (trackData[trackId].listenCount || 0) + 1
    };
    
    writeJsonFile(infoPath, trackData);
}

// Update now playing information
function updateNowPlaying(userId: string, trackId: string, trackInfo: TrackInfo): void {
    const nowPlayingPath = path.join(DB_PATH, "nowplaying.json");
    const infoPath = path.join(DB_PATH, "trackinfo.json");
    
    // Get current track data
    const trackData = readJsonFile<Record<string, TrackData>>(infoPath, {});
    const currentTrack = trackData[trackId];
    
    if (!currentTrack) {
        console.error("❌ Track not found in trackinfo.json");
        return;
    }

    const payload = {
        userId,
        trackId,
        trackName: trackInfo.trackName,
        artist: trackInfo.artist,
        album: trackInfo.album,
        albumImage: trackInfo.albumImage,
        smallImage: trackInfo.smallImage,
        rawAssets: trackInfo.rawAssets,
        listenCount: currentTrack.listenCount,
        listeningTime: currentTrack.listeningTime,
        updatedAt: new Date().toISOString()
    };

    writeJsonFile(nowPlayingPath, payload);
    console.log("📡 nowplaying.json updated:", payload.trackName, `(Listen #${payload.listenCount})`);
}

// Send listening data to backend
async function sendToBackend(userId: string, trackId: string, listeningTime: number): Promise<void> {
    // if (!BACKEND_URL || !isBackendAvailable) {
    //     console.log("⚠️ Backend not available, skipping send");
    //     return;
    // }

    try {
        const response = await fetch(`${BACKEND_URL}/track/${userId}/${trackId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listeningTime }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT)
        });

        if (response.ok) {
            const res = await response.json();
            console.log(`🎧 +${listeningTime}s to`, res.trackId, "→", res.listeningTime + "s");
            
            updateListeningTimeInFiles(trackId, res.listeningTime);
        } else {
            throw new Error(`Backend responded with status: ${response.status}`);
        }
    } catch (err) {
        console.error("❌ Failed to send to backend:", err);
        isBackendAvailable = false;
    }
}

// Update listening time in both files
function updateListeningTimeInFiles(trackId: string, totalListeningTime: number): void {
    const infoPath = path.join(DB_PATH, "trackinfo.json");
    const nowPlayingPath = path.join(DB_PATH, "nowplaying.json");
    
    // Update trackinfo.json
    const trackData = readJsonFile<Record<string, TrackData>>(infoPath, {});
    if (trackData[trackId]) {
        trackData[trackId].listeningTime = totalListeningTime;
        writeJsonFile(infoPath, trackData);
    }
    
    // Update nowplaying.json
    const nowPlaying = readJsonFile<any>(nowPlayingPath, {});
    if (nowPlaying.trackId === trackId) {
        nowPlaying.listeningTime = totalListeningTime;
        nowPlaying.updatedAt = new Date().toISOString();
        writeJsonFile(nowPlayingPath, nowPlaying);
    }
}

// Start tracking loop for current track
function startTrackingLoop(userId: string, trackId: string, trackInfo: TrackInfo): void {
    stopTrackingLoop();
    
    updateTrackInfo(trackId, trackInfo);
    updateNowPlaying(userId, trackId, trackInfo);

    // Send initial data
    sendToBackend(userId, trackId, 0);

    // Start periodic updates
    sendInterval = setInterval(() => {
        sendToBackend(userId, trackId, 5);
    }, SEND_INTERVAL);
}

function stopTrackingLoop(): void {
    if (sendInterval) {
        clearInterval(sendInterval);
        sendInterval = null;
        console.log("⏹️ Stopped tracking, user stopped listening");
    }
}

// Discord event handlers
client.on("ready", async () => {
    console.log(`✅ Logged in as ${client.user?.tag}`);
    client.user?.setPresence({ status: PresenceUpdateStatus.Invisible });
    
    startBackendHealthCheck();
});

client.on("presenceUpdate", (_, newPresence) => {
    const userId = newPresence.userId;
    if (userId !== TRACKED_USER_ID) return;

    const spotify = newPresence.activities.find(
        a => a.name === "Spotify" && a.type === ActivityType.Listening
    );

    if (!spotify || !spotify.syncId || !spotify.timestamps?.start) {
        stopTrackingLoop();
        lastTrackId = "";
        return;
    }

    const trackId = spotify.syncId;
    const startTimestamp = spotify.timestamps.start.getTime();
    const trackInfo = getTrackInfoFromActivity(spotify);

    // Check if this is a new track or replay
    const isReplaySameTrack = (trackId === lastTrackId && startTimestamp !== lastStartTimestamp);

    if (trackId !== lastTrackId || isReplaySameTrack) {
        console.log(`🎵 ${isReplaySameTrack ? "▶️ Replaying" : "🎵 New track"}: ${trackInfo.trackName} - ${trackInfo.artist}`);

        lastTrackId = trackId;
        lastStartTimestamp = startTimestamp;

        startTrackingLoop(userId, trackId, trackInfo);
    }
});

// Graceful shutdown
function gracefulShutdown(): void {
    console.log("🛑 Shutting down gracefully...");
    
    if (backendCheckInterval) clearInterval(backendCheckInterval);
    if (sendInterval) clearInterval(sendInterval);
    
    client.destroy();
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start the bot
client.login(process.env.DISCORD_TOKEN);