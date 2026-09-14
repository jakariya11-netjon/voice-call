// ======================================
// LIVE VOICE CALL
// WebRTC + PeerJS
// ======================================


// ---------- ELEMENTS ----------

const statusEl =
    document.getElementById("status");

const home =
    document.getElementById("home");

const roomSection =
    document.getElementById("roomSection");

const roomInput =
    document.getElementById("roomInput");

const roomIdEl =
    document.getElementById("roomId");

const waitingText =
    document.getElementById("waitingText");

const callInfo =
    document.getElementById("callInfo");

const callState =
    document.getElementById("callState");

const remoteAudio =
    document.getElementById("remoteAudio");

const createBtn =
    document.getElementById("createBtn");

const joinBtn =
    document.getElementById("joinBtn");

const muteBtn =
    document.getElementById("muteBtn");

const endBtn =
    document.getElementById("endBtn");

const copyBtn =
    document.getElementById("copyBtn");

const shareBtn =
    document.getElementById("shareBtn");


// ---------- VARIABLES ----------

let peer = null;

let localStream = null;

let currentCall = null;

let currentRoom = null;

let muted = false;


// ======================================
// STATUS
// ======================================

function setStatus(message) {

    statusEl.textContent = message;

}


// ======================================
// ROOM ID GENERATOR
// ======================================

function generateRoomId() {

    const characters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let result = "";

    for (
        let i = 0;
        i < 6;
        i++
    ) {

        const index =
            Math.floor(
                Math.random() *
                characters.length
            );

        result +=
            characters[index];
    }

    return result;
}


// ======================================
// URL ROOM
// ======================================

function getRoomFromUrl() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return (
        params.get("room") || ""
    )
        .toUpperCase()
        .replace(
            /[^A-Z0-9]/g,
            ""
        );
}


// ======================================
// SHARE URL
// ======================================

function getShareUrl(room) {

    const url =
        new URL(
            window.location.href
        );

    url.search = "";

    url.searchParams.set(
        "room",
        room
    );

    return url.toString();
}


// ======================================
// MICROPHONE
// ======================================

async function requestMicrophone() {

    if (localStream) {

        return localStream;

    }


    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        throw new Error(
            "Your browser does not support microphone access."
        );

    }


    try {

        localStream =
            await navigator.mediaDevices
                .getUserMedia({

                    audio: {

                        echoCancellation: true,

                        noiseSuppression: true,

                        autoGainControl: true

                    },

                    video: false

                });


        return localStream;

    }

    catch (error) {

        console.error(error);

        throw new Error(
            "Please allow microphone permission."
        );

    }

}


// ======================================
// SHOW ROOM
// ======================================

function showRoom(room) {

    currentRoom = room;

    roomIdEl.textContent =
        room;

    home.classList.add(
        "hidden"
    );

    roomSection.classList.remove(
        "hidden"
    );

}


// ======================================
// CREATE PEER
// ======================================

function createPeer(peerId) {

    return new Promise(
        (resolve, reject) => {

            peer =
                new Peer(
                    peerId
                );


            // ---------- OPEN ----------

            peer.on(
                "open",
                (id) => {

                    console.log(
                        "Peer connected:",
                        id
                    );

                    resolve(id);

                }
            );


            // ---------- INCOMING CALL ----------

            peer.on(
                "call",
                async (call) => {

                    console.log(
                        "Incoming call"
                    );


                    try {

                        const stream =
                            await requestMicrophone();


                        // Answer caller
                        call.answer(
                            stream
                        );


                        setupCall(
                            call
                        );


                        callInfo.classList.remove(
                            "hidden"
                        );


                        callState.textContent =
                            "Connecting...";


                        setStatus(
                            "Connecting..."
                        );

                    }

                    catch (error) {

                        console.error(
                            error
                        );

                        setStatus(
                            error.message
                        );

                    }

                }
            );


            // ---------- ERROR ----------

            peer.on(
                "error",
                (error) => {

                    console.error(
                        "PeerJS error:",
                        error
                    );


                    if (
                        error.type ===
                        "peer-unavailable"
                    ) {

                        setStatus(
                            "Room not found. Ask the other person to create the room first."
                        );

                    }

                    else if (
                        error.type ===
                        "unavailable-id"
                    ) {

                        setStatus(
                            "Room already exists. Try again."
                        );

                    }

                    else {

                        setStatus(
                            "Connection error: " +
                            error.type
                        );

                    }


                    reject(
                        error
                    );

                }
            );


            // ---------- DISCONNECTED ----------

            peer.on(
                "disconnected",
                () => {

                    setStatus(
                        "Disconnected from server"
                    );

                }
            );

        }
    );

}


// ======================================
// SETUP CALL
// ======================================

function setupCall(call) {

    currentCall =
        call;


    // ---------- REMOTE STREAM ----------

    call.on(
        "stream",
        async (remoteStream) => {

            console.log(
                "Remote audio received"
            );


            remoteAudio.srcObject =
                remoteStream;


            try {

                await remoteAudio.play();

            }

            catch (error) {

                console.log(
                    "Audio playback waiting for user interaction."
                );

            }


            callInfo.classList.remove(
                "hidden"
            );


            callState.textContent =
                "🟢 Connected — Live Voice";


            waitingText.textContent =
                "Connected. You can talk now.";

            setStatus(
                "Connected"
            );

        }
    );


    // ---------- CLOSE ----------

    call.on(
        "close",
        () => {

            currentCall =
                null;

            callState.textContent =
                "Call ended";

            setStatus(
                "Call ended"
            );

        }
    );


    // ---------- ERROR ----------

    call.on(
        "error",
        (error) => {

            console.error(
                error
            );

            setStatus(
                "Voice connection error"
            );

        }
    );

}


// ======================================
// CREATE CALL ROOM
// ======================================

createBtn.addEventListener(
    "click",
    async () => {

        createBtn.disabled =
            true;


        setStatus(
            "Allow microphone..."
        );


        try {

            // Microphone
            await requestMicrophone();


            // Generate room ID
            const room =
                generateRoomId();


            // Show room
            showRoom(
                room
            );


            setStatus(
                "Creating room..."
            );


            // Create Peer
            await createPeer(
                room
            );


            // Update URL
            history.replaceState(
                {},
                "",
                getShareUrl(
                    room
                )
            );


            waitingText.textContent =
                "Share the link with the other person. Keep this page open.";


            setStatus(
                "Room ready"
            );

        }

        catch (error) {

            console.error(
                error
            );

            createBtn.disabled =
                false;


            setStatus(
                error.message ||
                "Could not create room."
            );

        }

    }
);


// ======================================
// JOIN ROOM
// ======================================

joinBtn.addEventListener(
    "click",
    async () => {

        const room =
            roomInput
                .value
                .trim()
                .toUpperCase();


        if (
            room.length !== 6
        ) {

            setStatus(
                "Enter a 6-character Room ID."
            );

            return;

        }


        joinBtn.disabled =
            true;


        setStatus(
            "Allow microphone..."
        );


        try {

            // Microphone
            const stream =
                await requestMicrophone();


            // Guest peer ID
            const guestId =
                "guest-" +
                generateRoomId() +
                "-" +
                Date.now();


            // Create guest Peer
            await createPeer(
                guestId
            );


            showRoom(
                room
            );


            roomIdEl.textContent =
                room;


            waitingText.textContent =
                "Calling the room owner...";


            callInfo.classList.remove(
                "hidden"
            );


            callState.textContent =
                "Calling...";


            setStatus(
                "Calling..."
            );


            // Start call
            const call =
                peer.call(
                    room,
                    stream
                );


            if (!call) {

                throw new Error(
                    "Could not start call."
                );

            }


            setupCall(
                call
            );

        }

        catch (error) {

            console.error(
                error
            );

            joinBtn.disabled =
                false;


            setStatus(
                error.message ||
                "Could not join room."
            );

        }

    }
);


// ======================================
// COPY LINK
// ======================================

copyBtn.addEventListener(
    "click",
    async () => {

        if (!currentRoom) {

            return;

        }


        const link =
            getShareUrl(
                currentRoom
            );


        try {

            await navigator.clipboard.writeText(
                link
            );


            setStatus(
                "Share link copied!"
            );

        }

        catch (error) {

            window.prompt(
                "Copy this link:",
                link
            );

        }

    }
);


// ======================================
// SHARE LINK
// ======================================

shareBtn.addEventListener(
    "click",
    async () => {

        if (!currentRoom) {

            return;

        }


        const link =
            getShareUrl(
                currentRoom
            );


        if (
            navigator.share
        ) {

            try {

                await navigator.share({

                    title:
                        "Live Voice Call",

                    text:
                        "Join my live voice call",

                    url:
                        link

                });

            }

            catch (error) {

                console.log(
                    "Share cancelled."
                );

            }

        }

        else {

            try {

                await navigator.clipboard.writeText(
                    link
                );

                setStatus(
                    "Share link copied!"
                );

            }

            catch (error) {

                window.prompt(
                    "Copy this link:",
                    link
                );

            }

        }

    }
);


// ======================================
// MUTE
// ======================================

muteBtn.addEventListener(
    "click",
    () => {

        if (!localStream) {

            return;

        }


        const audioTrack =
            localStream
                .getAudioTracks()[0];


        if (!audioTrack) {

            return;

        }


        muted =
            !muted;


        audioTrack.enabled =
            !muted;


        if (muted) {

            muteBtn.textContent =
                "🔇 Unmute";

            setStatus(
                "Microphone muted"
            );

        }

        else {

            muteBtn.textContent =
                "🎤 Mute";

            setStatus(
                "Microphone on"
            );

        }

    }
);


// ======================================
// END CALL
// ======================================

endBtn.addEventListener(
    "click",
    () => {

        // Close call
        if (
            currentCall
        ) {

            currentCall.close();

            currentCall =
                null;

        }


        // Stop microphone
        if (
            localStream
        ) {

            localStream
                .getTracks()
                .forEach(
                    (track) => {

                        track.stop();

                    }
                );


            localStream =
                null;

        }


        // Destroy Peer
        if (
            peer
        ) {

            peer.destroy();

            peer =
                null;

        }


        // Stop remote audio
        remoteAudio.srcObject =
            null;


        callInfo.classList.add(
            "hidden"
        );


        muteBtn.textContent =
            "🎤 Mute";


        muted =
            false;


        setStatus(
            "Call ended"
        );

    }
);


// ======================================
// AUTO JOIN FROM SHARE LINK
// ======================================

window.addEventListener(
    "DOMContentLoaded",
    () => {

        const room =
            getRoomFromUrl();


        if (room) {

            roomInput.value =
                room;


            setStatus(
                "Room detected — tap Join"
            );

        }

    }
);
