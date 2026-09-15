# Virtual Hookah

A working two-person virtual hookah web app built with:

- Node.js
- Express
- Socket.IO
- WebRTC
- Browser camera/microphone APIs
- CSS smoke animation

## Run locally

1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run:

```bash
npm install
npm start
```

4. Open:

http://localhost:3000

For local testing with two people, use two browser tabs/windows. Camera/microphone access works on localhost.

## How it works

- The Node server serves the UI and provides Socket.IO signaling.
- WebRTC carries the live audio/video peer-to-peer.
- The microphone is analysed in the browser. A sufficiently strong sound/blow triggers smoke.
- Puff events are sent through Socket.IO so the other participant sees the smoke too.
- Rooms are limited to two participants.

## Deploy

This app is designed for a Node hosting service that supports a long-running WebSocket server, such as Render, Railway, Fly.io, or a VPS.

### Render

1. Push this folder to GitHub.
2. Create a new Web Service on Render.
3. Build command: `npm install`
4. Start command: `npm start`
5. Deploy.
6. Open the HTTPS URL Render gives you.

HTTPS is important because browsers restrict camera/microphone access on insecure origins.

## Production note

The included STUN servers help peers discover network paths. For some restrictive networks/mobile carriers, production WebRTC should also use a TURN server (for example, a managed TURN provider). The signaling server itself does not carry the video.

## Safety / product note

This is a visual/social demo. It does not provide real tobacco, nicotine, or smoke and should not be presented as a real smoking product.