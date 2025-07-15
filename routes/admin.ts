import { Elysia } from "elysia";
import { readFileSync, writeFileSync, existsSync } from "fs";

export const adminRoutes = new Elysia({ prefix: "/api/admin" })

    // 🔁 Save trackinfo and remove from missing list
    .post("/trackinfo", async ({ body }) => {
        const { trackId, trackName, artist, album, albumImage } = (await body as any);

        if (!trackId) return { error: "trackId is required" };

        const trackinfoPath = "./db/trackinfo.json";
        const missingPath = "./db/missing_tracks.json";

        const trackinfo = existsSync(trackinfoPath)
            ? JSON.parse(readFileSync(trackinfoPath, "utf-8"))
            : {};

        const missing = existsSync(missingPath)
            ? JSON.parse(readFileSync(missingPath, "utf-8"))
            : [];

        // 💾 Save new/updated track info
        trackinfo[trackId] = {
            trackName: trackName || "Unknown Track",
            artist: artist || "Unknown Artist",
            album: album || "Unknown Album",
            albumImage: albumImage || null,
        };
        writeFileSync(trackinfoPath, JSON.stringify(trackinfo, null, 2));

        // ✂️ Remove from missing list
        const updatedMissing = missing.filter((id: string) => id !== trackId);
        writeFileSync(missingPath, JSON.stringify(updatedMissing, null, 2));

        return { status: "ok", saved: trackinfo[trackId] };
    })

    // 📄 Load all missing tracks
    .get("/missing-tracks", () => {
        const data = existsSync("./db/missing_tracks.json")
            ? JSON.parse(readFileSync("./db/missing_tracks.json", "utf-8"))
            : [];
        return data;
    });