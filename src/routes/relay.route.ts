import { Application, Request } from "express";
import { handleWebSocketMessage } from "../controllers/relay.js";
import { WebSocketServer, RawData, WebSocket } from "ws";
import { IncomingMessage } from "http"; 
import { Socket } from "net";
import { logger } from "../lib/logger.js";
import { removeSubscription } from "../lib/relay/core.js";
import { Server } from "http";

let server: Server | null = null;

export const loadRelayRoutes = (app: Application): void => {

  const wss = new WebSocketServer({ noServer: true });
  app.set("wss", wss);

  if (server == null){
    server = app.get("server");
    server?.on("upgrade", (req: IncomingMessage, socket:Socket, head:Buffer) => {
      if (req.url === "/relay") {
        wss.handleUpgrade(req, socket as any, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      } else {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy(); 
      }
    });
  }

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    socket.on("message", async (data: RawData) => {
      try {
        await handleWebSocketMessage(socket, data, req as Request);
      } catch (error) {
        logger.error("Error handling message:", error);
      }
    });
  
    socket.on("close", () => {
      removeSubscription("", socket);
    });
  
    socket.on("error", () => {
      removeSubscription("", socket);
    });
  });
  
};
