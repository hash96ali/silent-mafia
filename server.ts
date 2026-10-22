import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import next from "next";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./src/server/socketHandlers";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./src/shared/types";

// One process serves the Next.js app and the Socket.io game server, which
// holds all game state in memory. Run as a single instance.

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    // Phones lock their screens a lot; give them time before declaring a disconnect.
    pingInterval: 10_000,
    pingTimeout: 20_000,
  });
  registerSocketHandlers(io);

  httpServer.listen(port, hostname, () => {
    const lan = Object.values(networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
    console.log(`> Silent Mafia ready on http://localhost:${port}`);
    if (lan) console.log(`> On your Wi-Fi (open this on the host's phone so the QR code works): http://${lan}:${port}`);
  });
});
