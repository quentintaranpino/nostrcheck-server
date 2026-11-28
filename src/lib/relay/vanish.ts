// NIP-62: created_at of the newest request to vanish of a pubkey. Events up to it are refused.

// Requests accepted by this process: kept for good, they may not be in the DB yet.
const vanished: Map<string, number> = new Map();

// What the DB said for a pubkey (0 = never vanished), so it is asked once per pubkey and TTL.
const lookups: Map<string, { until: number, expires: number }> = new Map();
const LOOKUP_TTL_MS = 10 * 60 * 1000;
const LOOKUP_MAX = 50000;

const vanishKey = (pubkey: string, tenantid?: number): string => tenantid === undefined ? pubkey : `${tenantid}:${pubkey}`;

/**
 * Remembers a request to vanish just accepted.
 * @param tenantid - Set in isolated mode, where a request only reaches its own tenant.
 */
const rememberVanish = (pubkey: string, until: number, tenantid?: number) => {
  const key = vanishKey(pubkey, tenantid);
  vanished.set(key, Math.max(until, vanished.get(key) ?? 0));
};

/**
 * The vanish created_at known without the DB, for when it can't be reached.
 */
const getLocalVanish = (pubkey: string, tenantid?: number): number => vanished.get(vanishKey(pubkey, tenantid)) ?? 0;

/**
 * The cached answer for a pubkey: its vanish created_at (0 if none), or null when the DB
 * has to be asked.
 */
const getCachedVanish = (pubkey: string, tenantid?: number, now: number = Date.now()): number | null => {
  const lookup = lookups.get(vanishKey(pubkey, tenantid));
  if (!lookup || lookup.expires <= now) return null;
  return Math.max(getLocalVanish(pubkey, tenantid), lookup.until);
};

/**
 * Stores what the DB answered for a pubkey.
 */
const cacheVanishLookup = (pubkey: string, until: number, tenantid?: number, now: number = Date.now()) => {
  if (lookups.size >= LOOKUP_MAX) {
    for (const [key, lookup] of lookups) {
      if (lookup.expires <= now) lookups.delete(key);
    }
    // Map keeps insertion order: drop the oldest tenth if nothing had expired.
    if (lookups.size >= LOOKUP_MAX) {
      let toDrop = LOOKUP_MAX / 10;
      for (const key of lookups.keys()) {
        if (toDrop-- <= 0) break;
        lookups.delete(key);
      }
    }
  }
  const key = vanishKey(pubkey, tenantid);
  lookups.delete(key);
  lookups.set(key, { until, expires: now + LOOKUP_TTL_MS });
};

export { rememberVanish, getCachedVanish, cacheVanishLookup, getLocalVanish };
