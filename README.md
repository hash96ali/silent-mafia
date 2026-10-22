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
