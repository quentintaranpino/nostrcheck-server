import { Application } from "express";
import { handleWebSocketMessage } from "../controllers/relay.js";
import { WebSocketServer } from "ws";
import { IncomingMessage } from "http"; 
import { Socket } from "net";

let server: any = null;

export const loadRelayRoutes = (app: Application): void => {

  // Create WebSocket server
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

  // Handle WebSocket connections
  wss.on("connection", (socket) => {//

    socket.on("message", (data) => {
      try {
        handleWebSocketMessage(socket, data);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });
  
    socket.on("close", () => {
      console.log("WebSocket connection closed");
    });
  
    socket.on("error", (error) => {
      console.error("WebSocket error:", error.message);
    });

  });
  
};
