# Branch Bot + Spotify Backend

A full-stack solution combining **Branch Bot** (a Discord bot) and a **Spotify Backend service**.  
The bot uses [Discord.js](https://discord.js.org) and communicates with a backend built using [Elysia](https://elysiajs.com/) on [Bun](https://bun.sh) for Spotify API integration.

---

## 📦 Features

### ✅ Branch Bot (Discord Bot)
- Modern **Discord.js v14** API support
- Secure environment configuration with **dotenv**

### ✅ Spotify Backend
- Built with **Elysia**, a fast Bun-based framework
- Designed to integrate seamlessly with Branch Bot

---

## 📂 Project Structure
```
branch-bot/
├── discord.ts # Main bot logic
├── .env # Environment variables
├── package.json
└── bun.lock

spotify-backend/
├── db/
├── routes/
├── index.ts # Backend entry point
├── package.json
└── bun.lock
```


---

## ✅ Requirements
- **Bun** (recommended) or **Node.js**
- **Discord Bot Token** (from [Discord Developer Portal](https://discord.com/developers/applications))
- **Discord BOT** for Branch Bot:
  - DISCORD_TOKEN
  - CLIENT_ID
  - CLIENT_SECRET
  - USER_ID
  - BACKEND_URL

---

## ⚙️ Installation

### Branch Bot
Using Bun:
```bash
bun install
bun discord.ts

# add .env file in root folder and change values in file .env
```

### Branch Backend
Using Bun:
```bash
bun install
bun index.ts

# recieve api to use http://localhost:3000
```

```bash
GET /tracks
GET /tracks/:userId
PATCH /track/:userId/:trackId
GET /nowplaying
GET /trackinfo/:trackId
GET /user/:userId/stats
GET /track/:userId/:trackId
POST /sync/trackinfo
```