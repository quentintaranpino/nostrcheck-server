import { Application, Request } from "express";
import { handleWebSocketMessage } from "../controllers/relay.js";
import { WebSocketServer } from "ws";
import { IncomingMessage } from "http"; 
import { Socket } from "net";
import { logger } from "../lib/logger.js";
import { removeSubscription } from "../lib/relay/core.js";

let server: any = null;

export const loadRelayRoutes = (app: Application): void => {

  const wss = new WebSocketServer({ noServer: true });
  app.set("wss", wss);

  // Handle WebSocket upgrade requests
  if (server == null){
    server = app.get("server");
    server.on("upgrade", (req: IncomingMessage, socket:Socket, head:Buffer) => {
      if (req.url === "/relay") {
        wss.handleUpgrade(req, socket as any, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      } else {
        socket.destroy(); 
      }
    });
  }

  wss.on("connection", (socket, req : Request) => {

    socket.on("message", (data) => {
      try {
        handleWebSocketMessage(socket, data, req);
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
