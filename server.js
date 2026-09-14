const path = require("path");
const crypto = require("crypto");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://jakariya11-netjon.github.io";
const BACKEND_URL = process.env.BACKEND_URL || "";
const SHARE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const shares = new Map();

function isAllowedOrigin(origin) {
    if (!origin || origin === ALLOWED_ORIGIN) return true;
    if (BACKEND_URL && origin === BACKEND_URL.replace(/\/$/, "")) return true;
    // Render's receiver page is served by this backend, so deployed Render origins are valid.
    return /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(origin);
}

app.use(express.json({ limit: "8kb" }));
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin) && origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

function getLiveShare(id) {
    const share = shares.get(id);
    if (!share) return null;
    if (Date.now() - share.createdAt > SHARE_LIFETIME_MS) {
        shares.delete(id);
        return null;
    }
    return share;
}

function validHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

app.get("/health", (req, res) => {
    res.json({ ok: true, service: "Private Share Backend" });
});

app.post("/api/shares", (req, res) => {
    const originalUrl = typeof req.body?.originalUrl === "string" ? req.body.originalUrl.trim() : "";
    if (!validHttpUrl(originalUrl)) {
        return res.status(400).json({ error: "Please provide a valid http or https URL." });
    }
    const id = crypto.randomBytes(18).toString("base64url");
    shares.set(id, { id, originalUrl, creatorSocket: null, receiverSocket: null, createdAt: Date.now() });
    res.status(201).json({ id });
});

app.get("/api/shares/:id", (req, res) => {
    const share = getLiveShare(req.params.id);
    if (!share) return res.status(404).json({ error: "This private share is invalid or has expired." });
    res.json({ id: share.id, originalUrl: share.originalUrl });
});

app.get("/s/:id", (req, res) => {
    if (!getLiveShare(req.params.id)) return res.status(404).send("This private share is invalid or has expired.");
    res.sendFile(path.join(__dirname, "receiver.html"));
});

const io = new Server(server, {
    cors: {
        origin(origin, callback) { callback(null, isAllowedOrigin(origin)); },
        methods: ["GET", "POST"]
    }
});

function relay(socket, event, payload) {
    const share = getLiveShare(payload?.shareId);
    if (!share) return socket.emit("call-ended", { shareId: payload?.shareId, reason: "Share expired or is invalid." });
    const recipientId = socket.id === share.creatorSocket ? share.receiverSocket : share.creatorSocket;
    if (recipientId) io.to(recipientId).emit(event, payload);
}

io.on("connection", (socket) => {
    socket.on("creator-register", ({ shareId } = {}) => {
        const share = getLiveShare(shareId);
        if (!share) return socket.emit("call-ended", { shareId, reason: "Share expired or is invalid." });
        share.creatorSocket = socket.id;
        socket.data.shareId = shareId;
        socket.data.role = "creator";
        if (share.receiverSocket) socket.emit("friend-connected", { shareId });
    });

    socket.on("receiver-join", ({ shareId } = {}) => {
        const share = getLiveShare(shareId);
        if (!share) return socket.emit("call-ended", { shareId, reason: "Share expired or is invalid." });
        share.receiverSocket = socket.id;
        socket.data.shareId = shareId;
        socket.data.role = "receiver";
        if (share.creatorSocket) io.to(share.creatorSocket).emit("friend-connected", { shareId });
    });

    socket.on("receiver-ready", ({ shareId } = {}) => {
        const share = getLiveShare(shareId);
        if (!share || socket.id !== share.receiverSocket) return;
        if (share.creatorSocket) io.to(share.creatorSocket).emit("receiver-ready", { shareId });
    });

    socket.on("call-accepted", (payload = {}) => relay(socket, "call-accepted", payload));
    socket.on("call-rejected", (payload = {}) => relay(socket, "call-rejected", payload));
    socket.on("webrtc-offer", (payload = {}) => relay(socket, "webrtc-offer", payload));
    socket.on("webrtc-answer", (payload = {}) => {
        relay(socket, "webrtc-answer", payload);
        const share = getLiveShare(payload.shareId);
        if (share) {
            if (share.creatorSocket) io.to(share.creatorSocket).emit("call-started", { shareId: payload.shareId });
            if (share.receiverSocket) io.to(share.receiverSocket).emit("call-started", { shareId: payload.shareId });
        }
    });
    socket.on("webrtc-ice-candidate", (payload = {}) => relay(socket, "webrtc-ice-candidate", payload));
    socket.on("call-ended", (payload = {}) => relay(socket, "call-ended", payload));

    socket.on("disconnect", () => {
        const share = getLiveShare(socket.data.shareId);
        if (!share) return;
        if (socket.id === share.creatorSocket) share.creatorSocket = null;
        if (socket.id === share.receiverSocket) share.receiverSocket = null;
    });
});

setInterval(() => {
    for (const [id, share] of shares) if (Date.now() - share.createdAt > SHARE_LIFETIME_MS) shares.delete(id);
}, 60 * 60 * 1000).unref();

server.listen(PORT, "0.0.0.0", () => console.log(`Private Share listening on ${PORT}`));
