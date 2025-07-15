import { Elysia } from "elysia";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { adminRoutes } from "./routes/admin";

const DB_PATH = "./db/tracks.json";
const TRACKINFO_PATH = "./db/trackinfo.json";

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
  lastPlayed: string;
}

interface Database {
  [userId: string]: {
    [trackId: string]: TrackData;
  };
}

function readDB(): Database {
  if (!existsSync(DB_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf-8"));
  } catch (error) {
    console.error("❌ Error reading tracks.json:", error);
    return {};
  }
}

function writeDB(data: Database): void {
  try {
    writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("❌ Error writing tracks.json:", error);
  }
}

function readTrackInfo(): Record<string, TrackInfo> {
  if (!existsSync(TRACKINFO_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(TRACKINFO_PATH, "utf-8"));
  } catch (error) {
    console.error("❌ Error reading trackinfo.json:", error);
    return {};
  }
}

function getTrackInfoById(trackId: string): TrackInfo | null {
  const trackInfo = readTrackInfo();
  return trackInfo[trackId] || null;
}

const app = new Elysia()
  .use(adminRoutes)
  .listen(3000)

  // GET /tracks - ดึงข้อมูลทั้งหมด
  .get("/tracks", () => {
    return readDB();
  })

  // GET /tracks/:userId - ดึงข้อมูลของ user คนนั้น
  .get("/tracks/:userId", ({ params }) => {
    const db = readDB();
    const userData = db[params.userId];
    
    if (!userData) {
      return { error: "User not found", userId: params.userId };
    }
    
    return { userId: params.userId, tracks: userData };
  })

  // PATCH /track/:userId/:trackId - อัปเดตข้อมูลการฟัง
  .patch("/track/:userId/:trackId", async ({ params, body }) => {
    const { userId, trackId } = params;
    const { listeningTime = 5 } = (await body as any);

    const db = readDB();
    
    // ดึงข้อมูลเพลงจาก trackinfo.json
    const trackInfo = getTrackInfoById(trackId);
    
    if (!trackInfo) {
      return { 
        error: "Track info not found", 
        message: "Track must be added to trackinfo.json first",
        trackId 
      };
    }

    // สร้าง user ถ้าไม่มี
    if (!db[userId]) {
      db[userId] = {};
    }

    // สร้าง track ถ้าไม่มี
    if (!db[userId][trackId]) {
      db[userId][trackId] = {
        ...trackInfo,
        listenCount: 1,
        listeningTime,
        lastPlayed: new Date().toISOString()
      };
    } else {
      // อัปเดตข้อมูลเพลง (กรณี trackinfo.json มีการเปลี่ยนแปลง)
      db[userId][trackId] = {
        ...db[userId][trackId],
        ...trackInfo, // อัปเดตข้อมูลเพลงใหม่
      };

      if (listeningTime === 0) {
        // ✅ เพลงเดิม แต่เปิดรอบใหม่ → +1 รอบ
        db[userId][trackId].listenCount += 1;
      } else {
        db[userId][trackId].listeningTime += listeningTime;
      }
      db[userId][trackId].lastPlayed = new Date().toISOString();
    }

    writeDB(db);
    
    return { 
      status: "ok", 
      userId, 
      trackId, 
      ...db[userId][trackId] 
    };
  })

  // GET /nowplaying - ดึงข้อมูลเพลงที่กำลังเล่น
  .get("/nowplaying", () => {
    try {
      const raw = readFileSync("./db/nowplaying.json", "utf-8");
      return JSON.parse(raw);
    } catch (error) {
      return { error: "No current track playing" };
    }
  })

  // GET /trackinfo/:trackId - ดึงข้อมูลเพลงจาก trackinfo.json
  .get("/trackinfo/:trackId", ({ params }) => {
    const trackInfo = getTrackInfoById(params.trackId);
    
    if (!trackInfo) {
      return { error: "Track not found", trackId: params.trackId };
    }
    
    return { trackId: params.trackId, ...trackInfo };
  })

  // GET /user/:userId/stats - สถิติการฟังของ user
  .get("/user/:userId/stats", ({ params }) => {
    const db = readDB();
    const userData = db[params.userId];
    
    if (!userData) {
      return { error: "User not found", userId: params.userId };
    }

    const tracks = Object.values(userData);
    const totalTracks = tracks.length;
    const totalListeningTime = tracks.reduce((sum, track) => sum + track.listeningTime, 0);
    const totalListenCount = tracks.reduce((sum, track) => sum + track.listenCount, 0);
    const mostPlayedTrack = tracks.reduce((max, track) => 
      track.listenCount > max.listenCount ? track : max, tracks[0]
    );

    return {
      userId: params.userId,
      stats: {
        totalTracks,
        totalListeningTime,
        totalListenCount,
        averageListeningTime: Math.round(totalListeningTime / totalTracks),
        mostPlayedTrack: mostPlayedTrack ? {
          trackName: mostPlayedTrack.trackName,
          artist: mostPlayedTrack.artist,
          listenCount: mostPlayedTrack.listenCount,
          listeningTime: mostPlayedTrack.listeningTime
        } : null
      }
    };
  })

  // GET /track/:userId/:trackId - ดึงข้อมูลเพลงเฉพาะ
  .get("/track/:userId/:trackId", ({ params }) => {
    const db = readDB();
    const track = db[params.userId]?.[params.trackId];
    
    if (!track) {
      return { 
        error: "Track not found", 
        userId: params.userId, 
        trackId: params.trackId 
      };
    }
    
    return { 
      userId: params.userId, 
      trackId: params.trackId, 
      ...track 
    };
  })

  // POST /sync/trackinfo - ซิงค์ข้อมูลจาก trackinfo.json เข้า tracks.json
  .post("/sync/trackinfo", () => {
    const db = readDB();
    const trackInfo = readTrackInfo();
    let updatedCount = 0;

    // อัปเดตข้อมูลทุก track ที่มีอยู่ใน tracks.json
    Object.keys(db).forEach(userId => {
      Object.keys(db[userId]).forEach(trackId => {
        if (trackInfo[trackId]) {
          const currentTrack = db[userId][trackId];
          db[userId][trackId] = {
            ...trackInfo[trackId],
            listenCount: currentTrack.listenCount,
            listeningTime: currentTrack.listeningTime,
            lastPlayed: currentTrack.lastPlayed
          };
          updatedCount++;
        }
      });
    });

    writeDB(db);
    
    return { 
      status: "ok", 
      message: `Updated ${updatedCount} tracks with latest info`,
      updatedCount 
    };
  })

  .get("/", () => "🎧 Spotify Tracker Backend Running")

console.log("🚀 Backend running at http://localhost:3000");