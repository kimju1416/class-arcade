# NEXUS ISLES · 넥서스 아일즈

2026-09-19. Original block-character 3D adventure added to Class Arcade at `/nexus/`.

## Play

- Explore four floating islands. Collect 12 crystals and return to the hub portal.
- Sky Run: pass nine numbered rings in order; checkpoints and a personal best time are included.
- Maker's Garden: four materials, up to 150 blocks / eight levels. Place and remove blocks; builds persist in this browser.
- Double jump, hold after the second jump to glide, and dash on a 1.5-second cooldown.
- Invite friends into an isolated room by sharing the Invite link. Up to 16 players per room can see each other's avatars. There are no simulated online-player counts.

PC: WASD/arrows, Space (jump/glide), Shift (dash), mouse drag (camera), wheel (zoom), E/Q (place/remove), R (checkpoint). Touch: independent left joystick, camera drag, jump and dash buttons; tap a build location before Place/Remove.

Collection, best time and construction are local to each player's browser. Construction is not synchronized to peers. A server restart reconnects presence; it does not clear local progress. Browser storage clearing removes local progress. No login, payment or external API key is needed to play.

## Runtime

Three.js is served from the existing `/fps/three.module.js` and `/fps/three.core.js`, retaining their MIT license. Node/ws social presence is in `nexus-server.js`, isolated from existing Class Arcade and FPS WebSockets. No build step and no additional production dependency. The existing Render service runs `npm install` and `node server.js`.

Ten original images were generated with the built-in Codex image tool: world key art; three mode illustrations; explorer and guardian portraits; stone and grass textures; sky panorama; relic reward. Runtime WebP files total under 1 MB. Stone, grass and sky are used in the actual 3D world, and the remaining images are used in the launch and reward interfaces. Original PNGs and exact prompts are delivered separately.

Graphics use shared beveled geometry, instanced scenery and bounded particle pools. Default pixel ratio is capped at 1.35 on touch devices and 1.8 on desktop; sustained low frame rate selects lighter settings. Graphics can also be toggled from the menu. Device performance varies; mobile viewport emulation is not a physical phone benchmark.

## Verify

`npm run test:nexus` tests movement, double jump, glide, all nine reachable parkour platforms, building restrictions and WebSocket room isolation/validation/disconnects. `npm test` checks existing Class Arcade games. Browser validation additionally exercises real keyboard input, simultaneous CDP touch input, persistence, room presence and layout at 390×844 and 844×390.

This is a focused original browser game, not a user-generated-game platform or a claim to exceed Roblox as an entire ecosystem.
