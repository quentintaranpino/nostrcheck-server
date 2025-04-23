import { Application} from "express";
import { getRelayStatus, handleWebSocketMessage } from "../controllers/relay.js";
import { WebSocketServer, RawData } from "ws";
import { IncomingMessage } from "http";
import crypto from "crypto";
import { logger } from "../lib/logger.js";
import { removeAllSubscriptions } from "../lib/relay/core.js";
import { Server } from "http";
import { limiter } from "../lib/security/core.js";
import { NIP11Data } from "../controllers/nostr.js";
import { ExtendedWebSocket } from "../interfaces/relay.js";
import { loadRelayPage } from "../controllers/frontend.js";
import { getClientInfo, isIpAllowed } from "../lib/security/ips.js";
import { getConfig } from "../lib/config/core.js";

export let wss: WebSocketServer;

export function getWSS(): WebSocketServer {
  if (!wss) {
    wss = new WebSocketServer({
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
  }
  return wss;
}

export const loadRelayRoutes = (app: Application, version:string, httpServer : Server): void => {

  if (version != "v2")  return;

  function heartbeat(this: ExtendedWebSocket) {
    this.isAlive = true;
  }

  wss = getWSS();

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url === "/api/v2/relay") {
      wss.handleUpgrade(req, socket, head, ws =>
        wss.emit("connection", ws, req)
      );
    } else {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
    }
  });

  wss.on("connection", async (socket: ExtendedWebSocket, req: IncomingMessage) => {

    socket.isAlive = true;
    socket.on("pong", heartbeat.bind(socket));

    const clientInfo = getClientInfo(req);
    logger.info("New WebSocket connection | IP:", clientInfo.ip, "| User-Agent:", req.headers["user-agent"]);
    socket.reqInfo = await isIpAllowed(req, getConfig(clientInfo.host || "", ["security", "relay", "maxMessageMinute"]));

    if (socket.reqInfo.banned) {
      removeAllSubscriptions(socket, 1008); 
      socket.send(JSON.stringify(["NOTICE", socket.reqInfo.comments]));
      socket.close(1008, "ip banned");
      return;
    }

    socket.on("message", async (data: RawData) => {
      try {
        await handleWebSocketMessage(socket, data, req);
      } catch (error) {
        logger.error("Error handling message:", error);
      }
    });
  
    socket.on("close", (code, reason) => {
      logger.debug(`Socket closed | Code: ${code} | Reason: ${reason.toString()}`);
      removeAllSubscriptions(socket, 1000);
    });
  
    socket.on("error", (code: number, reason: Error) => {
      logger.warn("Socket error | Code:", code, "| Reason:", reason);
      removeAllSubscriptions(socket, 1011);
    });

    
  });

  // Relay & NIP 11 info
  app.get("/api/v2/relay", limiter(), (req, res) => {
    const acceptHeader = req.headers['accept'] || '';
    if (!acceptHeader.includes('application/nostr+json'))  return loadRelayPage(req,res,version);
    return NIP11Data(req, res);
  });


  // Get Relay status
  app.get("/api/v2/relay/status", limiter(), (req, res) => getRelayStatus(req, res, wss));

  // Close dead connections
  setInterval(() => {
    wss.clients.forEach((ws) => {
      const extendedWs = ws as ExtendedWebSocket;
      if (!extendedWs.isAlive) {
        extendedWs.terminate();
      } else {
        extendedWs.isAlive = false;
        extendedWs.ping();
      }
    });
  }, 60 * 1000); // 1 minute

};

