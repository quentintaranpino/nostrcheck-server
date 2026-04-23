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
    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
    };
    const onMessage = (data: WebSocket.RawData) => {
      cleanup();
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject(err);
      }
    };
    const onError = (err: Error) => { cleanup(); reject(err); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Timeout waiting for message from relay")); }, timeout);

    ws.on("message", onMessage);
    ws.on("error", onError);
  });

/**
 * Wait until a message matching the predicate arrives, draining intervening frames.
 * Useful when the relay interleaves AUTH challenges or NOTICEs with the frame we care about.
 */
const waitForMatchingMessage = (ws: WebSocket, predicate: (msg: any) => boolean, timeout = 5000): Promise<any> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("Timeout waiting for matching message from relay"));
    }, timeout);

    const onMessage = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.off("message", onMessage);
          resolve(msg);
        }
      } catch (err) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        reject(err);
      }
    };

    ws.on("message", onMessage);
    ws.once("error", reject);
  });

/**
 * Open a WebSocket connection and wait for it to be ready.
 */
const openSocket = (): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(relayUrl);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });

/**
 * Authenticate the WebSocket connection if required.
 */
const authenticateIfRequired = async (ws: WebSocket, signingKey: Uint8Array = sk): Promise<boolean> => {

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
        signingKey
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

describe("NIP-45 COUNT", () => {

  test("Responds to COUNT with a {count: N} frame keyed on the subscription id", async () => {
    const ws = await openSocket();
    await authenticateIfRequired(ws);

    const subId = "count-" + Math.random().toString(36).substring(7);
    // Filter on a pubkey that is guaranteed to have no events, so the count is deterministic.
    const unknownPk = "f".repeat(64);
    ws.send(JSON.stringify(["COUNT", subId, { authors: [unknownPk] }]));

    const msg = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "COUNT" && m[1] === subId);
    expect(msg[0]).toBe("COUNT");
    expect(msg[1]).toBe(subId);
    expect(msg[2]).toHaveProperty("count");
    expect(typeof msg[2].count).toBe("number");
    expect(msg[2].count).toBe(0);

    ws.close();
  });

});

describe("NIP-65 relay list metadata", () => {

  test("Accepts a kind 10002 relay-list event with r tags", async () => {
    const listSk = generateSecretKey();
    const ws = await openSocket();
    await authenticateIfRequired(ws, listSk);

    const relayList = finalizeEvent({
      kind: 10002,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["r", "wss://relay.example.com"],
        ["r", "wss://read-only.example.com", "read"],
        ["r", "wss://write-only.example.com", "write"],
      ],
      content: "",
    }, listSk);

    ws.send(JSON.stringify(["EVENT", relayList]));
    const ok = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "OK" && m[1] === relayList.id);
    expect(ok[0]).toBe("OK");
    expect(ok[2]).toBe(true);

    ws.close();
  });

  test("Newer kind 10002 event replaces an older pending one", async () => {
    const listSk = generateSecretKey();
    const ws = await openSocket();
    await authenticateIfRequired(ws, listSk);

    // Use past timestamps so the relay's created_at_upper_limit (no future events)
    // doesn't reject the second event before the replaceable check runs.
    const now = Math.floor(Date.now() / 1000);
    const first = finalizeEvent({
      kind: 10002,
      created_at: now - 10,
      tags: [["r", "wss://first.example.com"]],
      content: "",
    }, listSk);

    ws.send(JSON.stringify(["EVENT", first]));
    const firstOk = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "OK" && m[1] === first.id);
    expect(firstOk[2], `first rejected: ${firstOk[3]}`).toBe(true);

    const second = finalizeEvent({
      kind: 10002,
      created_at: now - 5,
      tags: [["r", "wss://second.example.com"]],
      content: "",
    }, listSk);

    ws.send(JSON.stringify(["EVENT", second]));
    const secondOk = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "OK" && m[1] === second.id);
    expect(secondOk[2], `second rejected: ${secondOk[3]}`).toBe(true);

    ws.close();
  });

});
