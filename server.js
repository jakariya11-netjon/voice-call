const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const shares = new Map();

app.use(express.json());

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/receiver.html", (req, res) => {
    res.sendFile(path.join(__dirname, "receiver.html"));
});

app.post("/api/shares", (req, res) => {
    const originalUrl = String(req.body?.originalUrl || "").trim();

    if (!originalUrl) {
        return res.status(400).json({
            error: "Please paste an original URL."
        });
    }

    try {
        const url = new URL(originalUrl);

        if (!["http:", "https:"].includes(url.protocol)) {
            throw new Error();
        }
    } catch {
        return res.status(400).json({
            error: "Please enter a valid http:// or https:// URL."
        });
    }

    let id;

    do {
        id = crypto.randomBytes(6).toString("hex");
    } while (shares.has(id));

    shares.set(id, {
        id,
        originalUrl,
        creatorSocket: null,
        receiverSocket: null,
        createdAt: Date.now()
    });

    const protocol =
        req.headers["x-forwarded-proto"] || req.protocol;

    const shareUrl =
        `${protocol}://${req.get("host")}/s/${id}`;

    res.json({
        success: true,
        id,
        shareUrl
    });
});

app.get("/s/:id", (req, res) => {
    const share = shares.get(req.params.id);

    if (!share) {
        return res.status(404).send(
            "This special link is invalid or expired."
        );
    }

    res.sendFile(
        path.join(__dirname, "receiver.html")
    );
});

io.on("connection", socket => {

    socket.on("creator-register", ({ shareId }) => {
        const share = shares.get(shareId);

        if (!share) return;

        share.creatorSocket = socket.id;

        socket.shareId = shareId;
        socket.role = "creator";

        if (share.receiverSocket) {
            io.to(share.creatorSocket)
                .emit("receiver-ready");
        }
    });

    socket.on("receiver-join", ({ shareId }) => {
        const share = shares.get(shareId);

        if (!share) {
            socket.emit("share-not-found");
            return;
        }

        share.receiverSocket = socket.id;

        socket.shareId = shareId;
        socket.role = "receiver";

        socket.emit("share-found", {
            originalUrl: share.originalUrl
        });
    });

    socket.on("receiver-ready", ({ shareId }) => {
        const share = shares.get(shareId);

        if (!share) return;

        if (share.creatorSocket) {
            io.to(share.creatorSocket)
                .emit("receiver-ready");
        }
    });

    socket.on("call-accepted", ({ shareId }) => {
        const share = shares.get(shareId);

        if (!share) return;

        if (share.receiverSocket) {
            io.to(share.receiverSocket)
                .emit("call-accepted");
        }

        if (share.creatorSocket) {
            io.to(share.creatorSocket)
                .emit("call-started");
        }
    });

    socket.on("call-rejected", ({ shareId }) => {
        const share = shares.get(shareId);

        if (!share) return;

        if (share.receiverSocket) {
            io.to(share.receiverSocket)
                .emit("call-rejected");
        }
    });

    socket.on(
        "webrtc-offer",
        ({ shareId, offer }) => {

            const share = shares.get(shareId);

            if (!share) return;

            if (share.receiverSocket) {
                io.to(share.receiverSocket)
                    .emit("webrtc-offer", {
                        offer
                    });
            }
        }
    );

    socket.on(
        "webrtc-answer",
        ({ shareId, answer }) => {

            const share = shares.get(shareId);

            if (!share) return;

            if (share.creatorSocket) {
                io.to(share.creatorSocket)
                    .emit("webrtc-answer", {
                        answer
                    });
            }
        }
    );

    socket.on(
        "webrtc-ice",
        ({ shareId, candidate }) => {

            const share = shares.get(shareId);

            if (!share) return;

            const target =
                socket.id === share.creatorSocket
                    ? share.receiverSocket
                    : share.creatorSocket;

            if (target) {
                io.to(target)
                    .emit("webrtc-ice", {
                        candidate
                    });
            }
        }
    );

    socket.on("call-ended", ({ shareId }) => {

        const share = shares.get(shareId);

        if (!share) return;

        if (share.creatorSocket) {
            io.to(share.creatorSocket)
                .emit("call-ended");
        }

        if (share.receiverSocket) {
            io.to(share.receiverSocket)
                .emit("call-ended");
        }
    });

    socket.on("disconnect", () => {

        const share = shares.get(socket.shareId);

        if (!share) return;

        if (socket.role === "creator") {

            share.creatorSocket = null;

            if (share.receiverSocket) {
                io.to(share.receiverSocket)
                    .emit("call-ended");
            }
        }

        if (socket.role === "receiver") {

            share.receiverSocket = null;

            if (share.creatorSocket) {
                io.to(share.creatorSocket)
                    .emit("receiver-disconnected");
            }
        }
    });
});

setInterval(() => {

    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;

    for (const [id, share] of shares) {

        if (now - share.createdAt > maxAge) {
            shares.delete(id);
        }
    }

}, 60 * 60 * 1000);

server.listen(PORT, () => {
    console.log(
        `Private Share running at http://localhost:${PORT}`
    );
});