import WebSocket from "ws";
import { NIP01_event } from "../../interfaces/nostr.js";

const parseRelayMessage = (data: WebSocket.RawData): any | null => {
  try {
    const message = JSON.parse(data.toString());
    const result = NIP01_event.safeParse(message);
    return result.success ? result.data : null;
  } catch {
    return null; 
  }
};

const subscriptions: Map<string, { socket: WebSocket; listener: (event: any) => void }> = new Map();

const addSubscription = (subId: string, socket: WebSocket, listener: (event: any) => void) => {
  subscriptions.set(subId, { socket, listener });
};

const removeSubscription = (subId?: string, socket?: WebSocket) => {
  if (subId) {
    subscriptions.delete(subId);
  } else if (socket) {
    subscriptions.forEach((value, subId) => {
      if (value.socket === socket) {
        subscriptions.delete(subId);
      }
    });
  }
};

export {subscriptions, parseRelayMessage, addSubscription, removeSubscription};