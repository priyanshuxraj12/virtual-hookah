const socket = io();

const $ = (id) => document.getElementById(id);
const home = $("home");
const room = $("room");
const localVideo = $("localVideo");
const remoteVideo = $("remoteVideo");
const waiting = $("waiting");
const connectionBadge = $("connectionBadge");
const roomCodeEl = $("roomCode");
const roomMessage = $("roomMessage");
const smoke = $("smoke");
const meterFill = $("meterFill");
const smokeLevel = $("smokeLevel");

let roomId = null;
let userName = null;
let localStream = null;
let peerConnection = null;
let audioContext = null;
let analyser = null;
let micData = null;
let breathLoop = null;
let smokeValue = 0;
let soundEnabled = true;

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ]
};

socket.on("connect", () => {
  connectionBadge.textContent = "● Signaling online";
  connectionBadge.className = "badge online";
});
socket.on("disconnect", () => {
  connectionBadge.textContent = "● Offline";
  connectionBadge.className = "badge offline";
});

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function startRoom(code, name) {
  roomId = code;
  userName = name || "Guest";

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (err) {
    alert("Camera/microphone permission is required. Please allow access and try again.");
    throw err;
  }

  localVideo.srcObject = localStream;
  $("localName").textContent = userName;
  roomCodeEl.textContent = roomId;
  home.classList.add("hidden");
  room.classList.remove("hidden");
  roomMessage.textContent = "Share the invite link with one friend.";
  socket.emit("join-room", { roomId, name: userName });
  setupBreathDetection();
}

$("createBtn").addEventListener("click", async () => {
  const name = $("createName").value.trim() || "Host";
  await startRoom(makeRoomCode(), name);
});

$("joinBtn").addEventListener("click", async () => {
  const code = $("roomInput").value.trim().toUpperCase();
  const name = $("joinName").value.trim() || "Guest";
  if (!code) return alert("Enter a room code.");
  await startRoom(code, name);
});

socket.on("room-error", (msg) => {
  alert(msg);
  leaveRoom(false);
});

socket.on("room-joined", ({ isInitiator, peerCount }) => {
  roomMessage.textContent = peerCount === 1
    ? "Room created. Waiting for your friend…"
    : "Connected. Enjoy the lounge.";
  if (peerCount === 2) waiting.classList.add("hidden");

  if (isInitiator) {
    // Host waits for peer-joined before creating an offer.
  }
});

socket.on("peer-joined", async ({ name }) => {
  $("remoteName").textContent = name || "Friend";
  waiting.classList.add("hidden");
  roomMessage.textContent = "Friend joined. Connecting camera and microphone…";
  await createPeerConnection(true);
});

socket.on("signal", async (data) => {
  try {
    if (!peerConnection) await createPeerConnection(false);

    if (data.description) {
      await peerConnection.setRemoteDescription(data.description);
      if (data.description.type === "offer") {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendSignal({ description: peerConnection.localDescription });
      }
    } else if (data.candidate) {
      try {
        await peerConnection.addIceCandidate(data.candidate);
      } catch (e) {
        console.warn("ICE candidate could not be added yet", e);
      }
    }
  } catch (err) {
    console.error("WebRTC signaling error", err);
  }
});

async function createPeerConnection(initiator) {
  if (peerConnection) return peerConnection;

  peerConnection = new RTCPeerConnection(rtcConfig);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    waiting.classList.add("hidden");
    roomMessage.textContent = "You're live together. Take a puff!";
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) sendSignal({ candidate: event.candidate });
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === "connected") {
      roomMessage.textContent = "Connected. Take a puff or blow into your microphone.";
      $("remoteStatusDot").style.background = "#72e28c";
    } else if (["failed", "disconnected", "closed"].includes(state)) {
      $("remoteStatusDot").style.background = "#777";
    }
  };

  if (initiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendSignal({ description: peerConnection.localDescription });
  }

  return peerConnection;
}

function sendSignal(data) {
  socket.emit("signal", { roomId, data });
}

function createSmoke(intensity = 0.8, count = 12) {
  smokeValue = Math.max(smokeValue, intensity * 100);
  updateMeter();

  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "smoke-particle";
    p.style.setProperty("--x", `${(Math.random() - .5) * 180}px`);
    p.style.animationDuration = `${2.4 + Math.random() * 2.2}s`;
    p.style.animationDelay = `${Math.random() * .35}s`;
    p.style.width = `${12 + Math.random() * 24}px`;
    p.style.height = p.style.width;
    smoke.appendChild(p);
    setTimeout(() => p.remove(), 5000);
  }
}

function puff(intensity = 0.85, broadcast = true) {
  createSmoke(Math.max(.2, Math.min(1, intensity)), Math.round(8 + intensity * 12));
  if (broadcast && roomId) socket.emit("puff", { roomId, intensity });
}

$("puffBtn").addEventListener("click", () => puff(.9, true));

socket.on("remote-puff", ({ intensity, name }) => {
  puff(intensity, false);
  roomMessage.textContent = `${name || "Your friend"} took a puff 💨`;
});

function updateMeter() {
  meterFill.style.width = `${Math.round(smokeValue)}%`;
  smokeLevel.textContent = `${Math.round(smokeValue)}%`;
}

setInterval(() => {
  smokeValue = Math.max(0, smokeValue - 2.5);
  updateMeter();
}, 100);

async function setupBreathDetection() {
  try {
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = .72;
    source.connect(analyser);
    micData = new Uint8Array(analyser.fftSize);

    const detect = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(micData);

      let sum = 0;
      for (let i = 0; i < micData.length; i++) {
        const v = (micData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / micData.length);

      // Voice/blowing threshold. We deliberately keep it conservative
      // so normal room noise does not constantly trigger smoke.
      if (rms > 0.095) {
        const intensity = Math.min(1, (rms - .095) / .22 + .35);
        if (Date.now() - (detect.lastPuff || 0) > 700) {
          detect.lastPuff = Date.now();
          puff(intensity, true);
        }
      }
      breathLoop = requestAnimationFrame(detect);
    };
    detect();
  } catch (e) {
    console.warn("Breath detection unavailable:", e);
  }
}

$("micBtn").addEventListener("click", () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  $("micBtn").textContent = track.enabled ? "🎙️ Mic On" : "🔇 Mic Off";
  $("micBtn").classList.toggle("off", !track.enabled);
});

$("camBtn").addEventListener("click", () => {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  $("camBtn").textContent = track.enabled ? "📷 Camera On" : "🚫 Camera Off";
  $("camBtn").classList.toggle("off", !track.enabled);
});

$("soundBtn").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  remoteVideo.muted = !soundEnabled;
  $("soundBtn").textContent = soundEnabled ? "🔊 Sound On" : "🔇 Sound Off";
  $("soundBtn").classList.toggle("off", !soundEnabled);
});

$("copyBtn").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomId)}`;
  try {
    await navigator.clipboard.writeText(url);
    $("copyBtn").textContent = "Copied ✓";
    setTimeout(() => $("copyBtn").textContent = "Copy Invite", 1600);
  } catch {
    prompt("Copy this invite link:", url);
  }
});

$("leaveBtn").addEventListener("click", () => leaveRoom(true));

function leaveRoom(goHome) {
  if (breathLoop) cancelAnimationFrame(breathLoop);
  breathLoop = null;

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  roomId = null;

  if (goHome) {
    room.classList.add("hidden");
    home.classList.remove("hidden");
    $("roomInput").value = "";
    history.replaceState({}, "", location.pathname);
  }
}

socket.on("peer-left", () => {
  if (!room.classList.contains("hidden")) {
    waiting.classList.remove("hidden");
    $("remoteName").textContent = "Friend";
    $("remoteStatusDot").style.background = "#777";
    roomMessage.textContent = "Your friend left. Waiting for someone else to join…";
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
  }
});

// Auto-join when a ?room=CODE link is opened.
const params = new URLSearchParams(location.search);
const sharedRoom = params.get("room");
if (sharedRoom) {
  $("roomInput").value = sharedRoom.toUpperCase();
  $("joinName").focus();
}

// Resume AudioContext after a user gesture where browsers require it.
document.addEventListener("click", () => {
  if (audioContext && audioContext.state === "suspended") audioContext.resume();
}, { once: false });