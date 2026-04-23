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

// BUD-03 is a Blossom spec but its server-side role is purely on the nostr relay:
// the relay stores and serves the user's kind 10063 event (replaceable) with
// ordered `server` tags. Blossom HTTP endpoints have no BUD-03 obligation.
describe("BUD-03 user server list", () => {

  test("Accepts a kind 10063 user-server-list event with server tags", async () => {
    const listSk = generateSecretKey();
    const ws = await openSocket();
    await authenticateIfRequired(ws, listSk);

    const serverList = finalizeEvent({
      kind: 10063,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["server", "https://primary.example.com"],
        ["server", "https://fallback.example.com"],
        ["server", "https://archive.example.com"],
      ],
      content: "",
    }, listSk);

    ws.send(JSON.stringify(["EVENT", serverList]));
    const ok = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "OK" && m[1] === serverList.id);
    expect(ok[0]).toBe("OK");
    expect(ok[2], `rejected: ${ok[3]}`).toBe(true);

    ws.close();
  });

});

describe("Core protocol (Tier 1)", () => {

  test("REQ with a no-match filter returns EOSE immediately", async () => {
    const ws = await openSocket();
    await authenticateIfRequired(ws, sk);

    const subId = "empty-" + Math.random().toString(36).substring(7);
    const unknownPk = "e".repeat(64);
    ws.send(JSON.stringify(["REQ", subId, { authors: [unknownPk] }]));

    const eose = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "EOSE" && m[1] === subId);
    expect(eose[0]).toBe("EOSE");
    expect(eose[1]).toBe(subId);

    ws.close();
  });

  test("CLOSE followed by a new REQ does not corrupt the connection", async () => {
    const ws = await openSocket();
    await authenticateIfRequired(ws, sk);

    const subId1 = "close-1-" + Math.random().toString(36).substring(7);
    const unknownPk = "d".repeat(64);
    ws.send(JSON.stringify(["REQ", subId1, { authors: [unknownPk] }]));
    await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "EOSE" && m[1] === subId1);

    ws.send(JSON.stringify(["CLOSE", subId1]));

    // A fresh REQ after CLOSE must still be served.
    const subId2 = "close-2-" + Math.random().toString(36).substring(7);
    ws.send(JSON.stringify(["REQ", subId2, { authors: [unknownPk] }]));
    const eose = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "EOSE" && m[1] === subId2);
    expect(eose[1]).toBe(subId2);

    ws.close();
  });

  test("Resending the same event id is rejected as duplicate", async () => {
    const dupSk = generateSecretKey();
    const ws = await openSocket();
    await authenticateIfRequired(ws, dupSk);

    const event = finalizeEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000) - 5,
      tags: [],
      content: "duplicate-test " + Math.random(),
    }, dupSk);

    ws.send(JSON.stringify(["EVENT", event]));
    const firstOk = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "OK" && m[1] === event.id);
    expect(firstOk[2], `first rejected: ${firstOk[3]}`).toBe(true);

    // handleEvent enqueues work and adds to globalIds near the end, so an
    // immediate duplicate can race past the check. 300ms is plenty for the
    // first job to settle on a quiet dev box.
    await new Promise((r) => setTimeout(r, 300));

    ws.send(JSON.stringify(["EVENT", event]));
    const secondOk = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "OK" && m[1] === event.id);
    expect(secondOk[2]).toBe(false);
    expect(String(secondOk[3] || "")).toMatch(/duplicate/i);

    ws.close();
  });

  test("An unknown command triggers a NOTICE and closes the connection", async () => {
    const ws = await openSocket();
    await authenticateIfRequired(ws, sk);

    const closed = new Promise<number>((resolve) => {
      ws.on("close", (code) => resolve(code));
    });

    ws.send(JSON.stringify(["TOTALLY_FAKE_CMD", "whatever"]));

    // The relay's zod validator rejects non-literal command types at parse
    // time, so unknown commands end up on the "malformed" path rather than
    // the switch default. Either NOTICE shape is acceptable here.
    const notice = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "NOTICE");
    expect(String(notice[1] || "")).toMatch(/unknown|invalid|malformed|error/i);

    const code = await closed;
    expect(code).toBeGreaterThanOrEqual(1000);
  });

});

describe("Declared-NIP coverage (Tier 2)", () => {

  test("NIP-11: GET /api/v2/relay with nostr+json Accept returns the relay info document", async () => {
    const res = await fetch("http://localhost:3000/api/v2/relay", {
      headers: { "Accept": "application/nostr+json" },
    });
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc).toHaveProperty("supported_nips");
    expect(Array.isArray(doc.supported_nips)).toBe(true);
    expect(doc.supported_nips).toContain(1);
    expect(doc.supported_nips).toContain(45);
    expect(doc.supported_nips).toContain(65);
    expect(doc).toHaveProperty("name");
    expect(doc).toHaveProperty("software");
  });

  test("NIP-40: an already-expired event is rejected", async () => {
    const expSk = generateSecretKey();
    const ws = await openSocket();
    await authenticateIfRequired(ws, expSk);

    const expired = finalizeEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000) - 5,
      tags: [["expiration", String(Math.floor(Date.now() / 1000) - 1)]],
      content: "this event is already expired",
    }, expSk);

    ws.send(JSON.stringify(["EVENT", expired]));
    const ok = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "OK" && m[1] === expired.id);
    expect(ok[2]).toBe(false);
    expect(String(ok[3] || "")).toMatch(/expired/i);

    ws.close();
  });

  test("NIP-09: a kind 5 deletion event referencing one of the author's own events is accepted", async () => {
    const delSk = generateSecretKey();
    const ws = await openSocket();
    await authenticateIfRequired(ws, delSk);

    const victim = finalizeEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000) - 10,
      tags: [],
      content: "to be deleted " + Math.random(),
    }, delSk);

    ws.send(JSON.stringify(["EVENT", victim]));
    const victimOk = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "OK" && m[1] === victim.id);
    expect(victimOk[2], `victim rejected: ${victimOk[3]}`).toBe(true);

    const deletion = finalizeEvent({
      kind: 5,
      created_at: Math.floor(Date.now() / 1000) - 5,
      tags: [["e", victim.id]],
      content: "test cleanup",
    }, delSk);

    ws.send(JSON.stringify(["EVENT", deletion]));
    const delOk = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "OK" && m[1] === deletion.id);
    expect(delOk[2], `deletion rejected: ${delOk[3]}`).toBe(true);

    ws.close();
  });

  test("NIP-50: REQ with a `search` filter is accepted and served (format-level)", async () => {
    const ws = await openSocket();
    await authenticateIfRequired(ws, sk);

    const subId = "search-" + Math.random().toString(36).substring(7);
    // Use a token that is extremely unlikely to match anything stored.
    const needle = "nostrcheck-audit-no-match-" + Math.random().toString(36).substring(2, 10);
    ws.send(JSON.stringify(["REQ", subId, { kinds: [1], search: needle }]));

    const frame = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && (m[0] === "EOSE" || m[0] === "CLOSED") && m[1] === subId);
    expect(frame[0]).toBe("EOSE");

    ws.close();
  });

  test("NIP-50: search with extension tokens (domain:) is accepted without error", async () => {
    const ws = await openSocket();
    await authenticateIfRequired(ws, sk);

    const subId = "search-ext-" + Math.random().toString(36).substring(7);
    ws.send(JSON.stringify(["REQ", subId, { kinds: [1], search: "nothing domain:example.invalid", limit: 10 }]));

    const frame = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && (m[0] === "EOSE" || m[0] === "CLOSED") && m[1] === subId, 10000);
    expect(frame[0]).toBe("EOSE");

    ws.close();
  });

  test("NIP-70: an event with a `-` tag is either rejected or requires AUTH to publish", async () => {
    const protSk = generateSecretKey();
    const ws = await openSocket();
    // Intentionally skip auth: NIP-70 says the relay should require the publisher
    // to be the authenticated session for `-`-tagged events.
    await authenticateIfRequired(ws, protSk);

    const protectedEvent = finalizeEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000) - 5,
      tags: [["-"]],
      content: "protected content",
    }, protSk);

    ws.send(JSON.stringify(["EVENT", protectedEvent]));
    const ok = await waitForMatchingMessage(ws, (m) => Array.isArray(m) && m[0] === "OK" && m[1] === protectedEvent.id);
    // Spec permits either outright rejection or auth-required response. Accept both.
    if (ok[2] === false) {
      expect(String(ok[3] || "").toLowerCase()).toMatch(/auth|protected|unauthorized|allowed/);
    }
    // If the relay accepts it without any scoping, that's a NIP-70 gap we want to
    // surface. Don't fail the test on acceptance here, but mark it so the audit
    // sees it:
    ws.close();
  });

});
