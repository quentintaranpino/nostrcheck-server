import { describe, test, expect } from "vitest";
import WebSocket from "ws";
import { getPublicKey, generateSecretKey, finalizeEvent, Event } from "nostr-tools";

const relayUrl = "ws://localhost:3000/api/v2/relay";
const sk = generateSecretKey();
const pk = getPublicKey(sk); 

/**
 * Wait for a message from the relay, but with a timeout.
 */
const waitForMessage = (ws: WebSocket, timeout = 5000): Promise<any> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for message from relay"));
    }, timeout);

    ws.once("message", (data) => {
      clearTimeout(timer);
      try {
        const msg = JSON.parse(data.toString());
        resolve(msg);
      } catch (err) {
        reject(err);
      }
    });

    ws.once("error", reject);
  });

/**
 * Authenticate the WebSocket connection if required.
 */
const authenticateIfRequired = async (ws: WebSocket): Promise<boolean> => {

  try {
    const response = await waitForMessage(ws, 2000); 

    if (Array.isArray(response) && response[0] === "AUTH" && typeof response[1] === "string") {
      const challenge = response[1];
      
      // Create AUTH event
      const authEvent: Event = finalizeEvent(
        {
          kind: 22242,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["relay", relayUrl],
            ["challenge", challenge],
          ],
          content: "",
        },
        sk
      );

      ws.send(JSON.stringify(["AUTH", authEvent]));

      const authResponse = await waitForMessage(ws);
      expect(Array.isArray(authResponse)).toBe(true);
      expect(authResponse[0]).toBe("OK");
      expect(authResponse[1]).toBe(authEvent.id);
      expect(authResponse[2]).toBe(true);

      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
};

describe("Relay WebSocket Authentication and Event Tests", () => {
  test("Should successfully connect to the relay", async () => {
    const ws = new WebSocket(relayUrl);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        resolve();
        ws.close();
      });
      ws.on("error", reject);
    });
  });

  test("Should authenticate if required before sending events", async () => {
    const ws = new WebSocket(relayUrl);

    ws.on("error", (err) => console.error("WebSocket error:", err));

    await new Promise<void>(async (resolve, reject) => {
      ws.on("open", async () => {

        // If the relay requires authentication, perform it first
        await authenticateIfRequired(ws);

        const signedEvent = finalizeEvent(
          {
            kind: 1,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: "Hello from test",
          },
          sk
        );

        ws.send(JSON.stringify(["EVENT", signedEvent]));

        const msg = await waitForMessage(ws);
        expect(Array.isArray(msg)).toBe(true);
        expect(msg[0]).toBe("OK");
        expect(msg[1]).toBe(signedEvent.id);
        expect(msg[2]).toBe(true);

        ws.close();
        resolve();
      });
      ws.on("error", reject);
    });
  });
});

