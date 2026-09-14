const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();

const server =
  http.createServer(app);


/* =========================================================
   SETTINGS
   ========================================================= */

const PORT =
  process.env.PORT || 3000;

const FRONTEND_ORIGIN =
  "https://jakariya11-netjon.github.io";


/* =========================================================
   MIDDLEWARE
   ========================================================= */

app.use(
  express.json()
);


/* =========================================================
   CORS
   ========================================================= */

app.use(
  (req, res, next) => {

    res.header(
      "Access-Control-Allow-Origin",
      FRONTEND_ORIGIN
    );

    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,OPTIONS"
    );

    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    if (
      req.method === "OPTIONS"
    ) {

      return res.sendStatus(204);

    }

    next();

  }
);


/* =========================================================
   SOCKET.IO
   ========================================================= */

const io =
  new Server(server, {

    cors: {

      origin:
        FRONTEND_ORIGIN,

      methods: [
        "GET",
        "POST"
      ]

    }

  });


/* =========================================================
   SHARE STORAGE
   ========================================================= */

const shares =
  new Map();


/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.json({

      ok: true,

      service:
        "Private Share Backend"

    });

  }
);


/* =========================================================
   CREATE SHARE
   ========================================================= */

app.post(
  "/api/shares",
  (req, res) => {

    const originalUrl =
      String(
        req.body?.originalUrl || ""
      ).trim();


    if (!originalUrl) {

      return res
        .status(400)
        .json({
          error:
            "originalUrl is required"
        });

    }


    try {

      new URL(originalUrl);

    } catch {

      return res
        .status(400)
        .json({
          error:
            "Invalid URL"
        });

    }


    let id;

    do {

      id =
        crypto
          .randomBytes(6)
          .toString("hex");

    } while (
      shares.has(id)
    );


    shares.set(
      id,
      {

        id,

        originalUrl,

        creatorSocket:
          null,

        receiverSocket:
          null,

        createdAt:
          Date.now()

      }
    );


    res.json({

      id

    });

  }
);


/* =========================================================
   RECEIVER PAGE
   ========================================================= */

app.get(
  "/s/:id",
  (req, res) => {

    const file =
      path.join(
        __dirname,
        "receiver.html"
      );


    res.sendFile(
      file
    );

  }
);


/* =========================================================
   SOCKET CONNECTION
   ========================================================= */

io.on(
  "connection",
  socket => {

    console.log(
      "Connected:",
      socket.id
    );


    /* =====================================================
       CREATOR REGISTER
       ===================================================== */

    socket.on(
      "creator-register",
      ({ shareId }) => {

        const share =
          shares.get(shareId);


        if (!share) {
          return;
        }


        share.creatorSocket =
          socket.id;


        socket.join(
          "share-" + shareId
        );


        console.log(
          "Creator registered:",
          shareId
        );

      }
    );


    /* =====================================================
       RECEIVER JOIN
       ===================================================== */

    socket.on(
      "receiver-join",
      ({ shareId }) => {

        const share =
          shares.get(shareId);


        if (!share) {

          socket.emit(
            "share-not-found"
          );

          return;

        }


        share.receiverSocket =
          socket.id;


        socket.join(
          "share-" + shareId
        );


        socket.emit(
          "share-found",
          {

            originalUrl:
              share.originalUrl

          }
        );


        if (
          share.creatorSocket
        ) {

          io.to(
            share.creatorSocket
          ).emit(
            "friend-connected"
          );

        }

      }
    );


    /* =====================================================
       RECEIVER MIC READY
       ===================================================== */

    socket.on(
      "receiver-ready",
      ({ shareId }) => {

        const share =
          shares.get(shareId);


        if (
          !share ||
          !share.creatorSocket
        ) {
          return;
        }


        io.to(
          share.creatorSocket
        ).emit(
          "receiver-ready"
        );

      }
    );


    /* =====================================================
       CALL ACCEPTED
       ===================================================== */

    socket.on(
      "call-accepted",
      ({ shareId }) => {

        const share =
          shares.get(shareId);


        if (!share) {
          return;
        }


        io.to(
          "share-" + shareId
        ).emit(
          "call-started"
        );

      }
    );


    /* =====================================================
       CALL REJECTED
       ===================================================== */

    socket.on(
      "call-rejected",
      ({ shareId }) => {

        const share =
          shares.get(shareId);


        if (
          share?.receiverSocket
        ) {

          io.to(
            share.receiverSocket
          ).emit(
            "call-rejected"
          );

        }

      }
    );


    /* =====================================================
       WEBRTC OFFER
       ===================================================== */

    socket.on(
      "webrtc-offer",
      ({ shareId, offer }) => {

        const share =
          shares.get(shareId);


        if (
          share?.receiverSocket
        ) {

          io.to(
            share.receiverSocket
          ).emit(
            "webrtc-offer",
            offer
          );

        }

      }
    );


    /* =====================================================
       WEBRTC ANSWER
       ===================================================== */

    socket.on(
      "webrtc-answer",
      ({ shareId, answer }) => {

        const share =
          shares.get(shareId);


        if (
          share?.creatorSocket
        ) {

          io.to(
            share.creatorSocket
          ).emit(
            "webrtc-answer",
            answer
          );

        }

      }
    );


    /* =====================================================
       ICE CANDIDATE
       ===================================================== */

    socket.on(
      "webrtc-ice-candidate",
      ({ shareId, candidate }) => {

        const share =
          shares.get(shareId);


        if (!share) {
          return;
        }


        if (
          socket.id ===
          share.creatorSocket
        ) {

          if (
            share.receiverSocket
          ) {

            io.to(
              share.receiverSocket
            ).emit(
              "webrtc-ice-candidate",
              candidate
            );

          }

        } else {

          if (
            share.creatorSocket
          ) {

            io.to(
              share.creatorSocket
            ).emit(
              "webrtc-ice-candidate",
              candidate
            );

          }

        }

      }
    );


    /* =====================================================
       CALL ENDED
       ===================================================== */

    socket.on(
      "call-ended",
      ({ shareId }) => {

        io.to(
          "share-" + shareId
        ).emit(
          "call-ended"
        );

      }
    );


    /* =====================================================
       DISCONNECT
       ===================================================== */

    socket.on(
      "disconnect",
      () => {

        console.log(
          "Disconnected:",
          socket.id
        );


        for (
          const [id, share]
          of shares.entries()
        ) {

          if (
            share.creatorSocket ===
            socket.id
          ) {

            share.creatorSocket =
              null;

          }


          if (
            share.receiverSocket ===
            socket.id
          ) {

            share.receiverSocket =
              null;


            if (
              share.creatorSocket
            ) {

              io.to(
                share.creatorSocket
              ).emit(
                "call-ended"
              );

            }

          }

        }

      }
    );

  }
);


/* =========================================================
   DELETE OLD LINKS
   ========================================================= */

setInterval(
  () => {

    const now =
      Date.now();


    for (
      const [id, share]
      of shares.entries()
    ) {

      /*
        24 hours
      */

      if (
        now -
        share.createdAt
        >
        24 * 60 * 60 * 1000
      ) {

        shares.delete(
          id
        );

      }

    }

  },
  60 * 60 * 1000
);


/* =========================================================
   START SERVER
   ========================================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Server running on port ${PORT}`
    );

  }
);
