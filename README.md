# Silent Mafia

A silent moderator for Mafia / Werewolf. Everyone plays from their own phone, so nobody has to open their eyes or move at night.

## Run

```bash
npm install
npm run dev        # http://localhost:3000, plus your Wi-Fi URL printed in the console
npm test           # game-rule unit tests
npm run build && npm start
```

Open the **Wi-Fi URL** (not `localhost`) on the host's device so the share link and QR code work for other phones.

## Roles

Host toggles each role in the lobby. Mafia, Citizen and (optionally) Doctor / Detective, plus:

- **Sheik of Citizens (شيخ المواطنين)** — The first time the town votes him out he reveals his card and survives. From then on his vote counts as 3. A second conviction kills him. The Mafia can kill him at night as normal.
- **Sniper (القناص)** — One bullet per game, and he can hold fire on any night. Shooting Mafia kills only the target; shooting anyone else kills the target *and* the Sniper. The shot lands at dawn along with the Mafia kill, and the Doctor can't block it. Enabling the Sniper turns off the Detective.
- **Upright Citizen (المواطن الصالح)** — If voted out, their card is revealed and they get 30s (`REVENGE` phase) to drag one alive player down with them. Being killed at night gives no revenge.

## Deploy

`render.yaml` deploys to [Render](https://render.com) as a single Node web service: push the repo to GitHub, then in Render choose **New → Blueprint** and pick the repo. Any host that runs a long-lived Node process with WebSockets works the same way (`npm ci --include=dev && npm run build`, then `npm start`). Serverless hosts such as Vercel won't work, because the game server must stay running.

## Night order

The night runs one role at a time: **Mafia → Doctor → Detective → Sniper** (only roles the host enabled). One night countdown is shown to everyone; each turn gets an equal share of the time left, so a quick turn leaves more for the next. Every screen switches with the server's stage (`NIGHT_MAFIA_TURN`, `NIGHT_DOCTOR_TURN`, `NIGHT_SPECIAL_TURN`, `DAY_ANNOUNCEMENT`, `DISCUSSION`, `VOTING`, ...), and the projector shows whose turn it is.

- **Godfather (كبير المافيا):** one Mafia member, chosen at random when roles are dealt, makes the kill. The other Mafia see his highlighted pick live but can't choose. If the Godfather dies (vote, Sniper, drag-down), a random living Mafia member takes over immediately. If his turn times out, his highlighted pick still counts.
- **Dead or spent roles still get a turn.** It shows the same countdown and ends by itself after a random 6–14s, so nobody can tell that role is gone.

## Night screen, Detective result, End Game

- At night every phone turns into a full-screen night sky with a large countdown and whose turn it is. A player's menu appears, openly, only when their own turn comes.
- The Detective's result fills their screen: red **مافيا (Mafia)** or calm **سليم (Innocent / Safe)**. Their turn ends when they tap **فهمت** (or after 10s, or when the turn's time runs out).
- The storyteller (الراوي) device shows only the current phase, whose turn it is at night, and a large countdown (plus the host buttons if they host); the full results appear at game over.
- The host has **إنهاء اللعبة** during play. After a confirmation, the server resets roles, votes, deaths and night state, returns everyone (players, spectators, projector) to the lobby with their seats kept, and every phone shows who ended it and vibrates.

## Vibration

Room setting **الاهتزاز**: *حسب الدور* (default: Godfather `[400,120,400]`, other Mafia `[200,100,200]`, Doctor `[300]`, Detective/Sniper `[100,60,100,60,100]`, everyone alive `[120,60,120]` at the morning announcement and when voting opens), *للجميع* (every living phone buzzes the same on every turn, so a buzz reveals nothing), or *صامت*. Uses `navigator.vibrate` via `triggerHaptic()` in `src/client/haptics.ts`; it fails quietly where unsupported (iPhone) and shows a "tap to enable" hint until the browser allows vibration.

## Phase changes

Every phase change raises a full-screen card on all phones and the projector (icon, phase name, what just happened) and vibrates every phone together. Phases have their own colour: night red, day gold, voting violet. After the vote, a **result screen** (10s, host can skip) shows who was eliminated, the vote count per player, abstentions and how many didn't vote in time, before the game moves on. Individual votes stay secret.

## Architecture

One Node process (`server.ts`) serves Next.js and Socket.io. The game state lives in server memory and is authoritative.

| Path | Role |
| --- | --- |
| `src/shared/types.ts` | Phases, roles, `Room` (server-only), `PlayerView` (what a client sees), socket event contracts |
| `src/server/gameMachine.ts` | Pure `reduce(room, action, ctx)` state machine: `LOBBY → ROLE_REVEAL → NIGHT → DAY → VOTING → … → GAME_OVER` |
| `src/server/resolve.ts` | Night kill/save, vote tally, win check |
| `src/server/view.ts` | Builds each player's redacted view. This is the only way state leaves the server |
| `src/server/socketHandlers.ts` | Socket events → actions, per-player broadcast, phase timers, reconnection, host hand-off |
| `src/client/useRoom.ts` | Connects, resumes the stored session on every reconnect, exposes the live view |

Secrets: clients never receive another player's role (except Mafia teammates, dead players when "reveal on death" is on, the GM, and everyone at game over) or anyone's session token.

Reconnection: the seat token is kept in `localStorage`. A refreshed or re-woken phone reclaims its seat automatically. If the host is offline for 30s, host passes to another connected player.

Limits: a single server instance; restarting it ends all games.
