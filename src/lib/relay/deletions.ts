import { eventStore, MetadataEvent } from "../../interfaces/relay.js";
import { getDeletionTargets, getEventAddress } from "../nostr/NIP09.js";

// NIP-09 deletions accepted but maybe not in the DB yet (the flush runs every minute), keyed
// by "pubkey:target". Older ones are found in the DB, so this map stays small.
interface RecentDeletion {
  created_at: number;
  deletionId: string;
  tenantid: number;
  seen: number;
}
const recentDeletions: Map<string, RecentDeletion[]> = new Map();
const FLUSH_GRACE_MS = 3 * 60 * 1000;
let lastPrune = 0;

// Ids already found deleted in the DB, so a client re-sending them doesn't cost a query each time.
const deletedCache: Map<string, number> = new Map();
const DELETED_CACHE_TTL_MS = 10 * 60 * 1000;
const DELETED_CACHE_MAX = 10000;

const pruneRecentDeletions = (now: number) => {
  if (now - lastPrune < 60 * 1000) return;
  lastPrune = now;
  for (const [key, list] of recentDeletions) {
    const kept = list.filter(d => now - d.seen < FLUSH_GRACE_MS || eventStore.pending.has(d.deletionId) || eventStore.pendingArchive.has(d.deletionId));
    if (kept.length === 0) recentDeletions.delete(key);
    else if (kept.length !== list.length) recentDeletions.set(key, kept);
  }
};

/**
 * Remembers the targets of a kind 5 just accepted, until it has reached the DB.
 * @param event - The kind 5 event.
 */
const rememberDeletion = (event: MetadataEvent, now: number = Date.now()) => {
  pruneRecentDeletions(now);
  const { ids, addresses } = getDeletionTargets(event);
  const targets = [...ids, ...addresses.map(a => `${a.kind}:${a.pubkey}:${a.d}`)];
  for (const target of targets) {
    const key = `${event.pubkey}:${target}`;
    const list = recentDeletions.get(key) ?? [];
    list.push({ created_at: event.created_at, deletionId: event.id, tenantid: event.tenantid, seen: now });
    recentDeletions.set(key, list);
  }
};

/**
 * Whether a kind 5 still waiting for the flush deletes this event: one from the same pubkey
 * with its id, or with its address and a created_at not older than the event's.
 * @param event - The incoming event.
 * @param tenantid - Only deletions received on this tenant count (isolated mode).
 */
const isDeletedRecently = (event: MetadataEvent, tenantid?: number, now: number = Date.now()): boolean => {
  if (recentDeletions.size === 0) return false;
  pruneRecentDeletions(now);
  const sameTenant = (d: RecentDeletion) => tenantid === undefined || d.tenantid === tenantid;
  if (recentDeletions.get(`${event.pubkey}:${event.id}`)?.some(sameTenant)) return true;
  const address = getEventAddress(event);
  if (address === null) return false;
  return recentDeletions.get(`${event.pubkey}:${address}`)?.some(d => sameTenant(d) && d.created_at >= event.created_at) ?? false;
};

const deletedCacheKey = (id: string, tenantid?: number): string => tenantid === undefined ? id : `${tenantid}:${id}`;

const isDeletedCached = (id: string, tenantid?: number, now: number = Date.now()): boolean => {
  const key = deletedCacheKey(id, tenantid);
  const expires = deletedCache.get(key);
  if (expires === undefined) return false;
  if (expires > now) return true;
  deletedCache.delete(key);
  return false;
};

const cacheDeleted = (id: string, tenantid?: number, now: number = Date.now()) => {
  if (deletedCache.size >= DELETED_CACHE_MAX) {
    for (const [key, expires] of deletedCache) {
      if (expires <= now) deletedCache.delete(key);
    }
    // Map keeps insertion order: drop the oldest tenth if nothing had expired.
    if (deletedCache.size >= DELETED_CACHE_MAX) {
      let toDrop = DELETED_CACHE_MAX / 10;
      for (const key of deletedCache.keys()) {
        if (toDrop-- <= 0) break;
        deletedCache.delete(key);
      }
    }
  }
  deletedCache.set(deletedCacheKey(id, tenantid), now + DELETED_CACHE_TTL_MS);
};

export { rememberDeletion, isDeletedRecently, isDeletedCached, cacheDeleted };
