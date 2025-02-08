import { Application, Request } from "express";
import { handleWebSocketMessage } from "../controllers/relay.js";
import { WebSocketServer, RawData, WebSocket } from "ws";
import { IncomingMessage } from "http";
import crypto from "crypto";
import { Socket } from "net";
import { logger } from "../lib/logger.js";
import { removeAllSubscriptions } from "../lib/relay/core.js";
import { Server } from "http";
import { limiter } from "../lib/session.js";
import { NIP11Data } from "../controllers/nostr.js";
import { ExtendedWebSocket } from "../interfaces/relay.js";
import { loadRelayPage } from "../controllers/frontend.js";
import { isModuleEnabled } from "../lib/config.js";

let server: Server | null = null;

export const loadRelayRoutes = (app: Application, version:string): void => {

  if (version != "v2")  return;
  if (!isModuleEnabled("relay", app)) return;

  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: {
      zlibDeflateOptions: {
        level: 7 
      },
      zlibInflateOptions: {
        chunkSize: 1024 * 8 
      },
      clientNoContextTakeover: true,
    }
  });
  
  app.set("wss", wss);

  if (server == null){
    server = app.get("server");
    server?.on("upgrade", (req: IncomingMessage, socket:Socket, head:Buffer) => {
      if (req.url === "/api/v2/relay") {
        wss.handleUpgrade(req, socket as any, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      } else {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy(); 
      }
    });
  }

  wss.on("connection", (socket: ExtendedWebSocket, req: IncomingMessage) => {

    if (app.get("config.relay")["limitation"]["auth_required"] == true){
      const challenge = crypto.randomBytes(32).toString('hex');
      socket.challenge = challenge;
      socket.send(JSON.stringify(["AUTH", challenge]));
    }
    socket.on("message", async (data: RawData) => {
      try {
        await handleWebSocketMessage(socket, data, req as Request);
      } catch (error) {
        logger.error("Error handling message:", error);
      }
    });
  
    socket.on("close", (code, reason) => {
      logger.debug(`Socket closed | Code: ${code} | Reason: ${reason.toString()}`);
      removeAllSubscriptions(socket);
    });
  
    socket.on("error", (code: number, reason: any) => {
      logger.warn("Socket error | Code:", code, "| Reason:", reason);
      removeAllSubscriptions(socket);
    });
  });

  // Relay & NIP 11 info
  app.get("/api/v2/relay", limiter(), (req, res) => {
    const acceptHeader = req.headers['accept'] || '';
    if (!acceptHeader.includes('application/nostr+json'))  return loadRelayPage(req,res,version);
    return NIP11Data(req, res);
  });

};