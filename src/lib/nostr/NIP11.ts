// https://github.com/nostr-protocol/nips/blob/master/11.md

import { NIP11File, supported_nips } from "../../interfaces/nostr.js";
import { getConfig } from "../config/core.js";
import { getHostInfo } from "../utils.js";

const getNIP11file = (hostname: string): NIP11File => {
  const nip11file: NIP11File = {
    name: `${getConfig(hostname, ["server", "host"])}`,
    description: getConfig(hostname, ["relay", "description"]) || `${getConfig(hostname, ["server", "host"])} nostr relay`,
    icon: `${getHostInfo(hostname).url}/static/resources/relay-icon.png`,
    pubkey: getConfig(hostname, ["server", "pubkey"]),
    contact: getConfig(hostname, ["relay", "contact"]),
    supported_nips: supported_nips,
    software: "https://github.com/quentintaranpino/nostrcheck-server",
    version: getConfig(null, ["version"]),
    limitation: {
      max_message_length: Number(getConfig(hostname, ["relay", "limitation", "max_message_length"])),
      max_subscriptions: Number(getConfig(hostname, ["relay", "limitation", "max_subscriptions"])),
      max_filters: Number(getConfig(hostname, ["relay", "limitation", "max_filters"])),
      max_limit: Number(getConfig(hostname, ["relay", "limitation", "max_limit"])),
      max_subid_length: Number(getConfig(hostname, ["relay", "limitation", "max_subid_length"])),
      max_event_tags: Number(getConfig(hostname, ["relay", "limitation", "max_event_tags"])),
      max_content_length: Number(getConfig(hostname, ["relay", "limitation", "max_content_length"])),
      min_pow_difficulty: Number(getConfig(hostname, ["relay", "limitation", "min_pow_difficulty"])),
      auth_required: getConfig(hostname, ["relay", "limitation", "auth_required"]),
      restricted_writes: getConfig(hostname, ["relay", "limitation", "restricted_writes"]),
      created_at_lower_limit: Number(getConfig(hostname, ["relay", "limitation", "created_at_lower_limit"])),
      created_at_upper_limit: Number(getConfig(hostname, ["relay", "limitation", "created_at_upper_limit"]))

    },
    language_tags: getConfig(hostname, ["relay", "language_tags"]),
    tags: getConfig(hostname, ["relay", "tags"]),
    terms_of_service: `${getHostInfo(hostname).url}/tos/`,
    privacy_policy: `${getHostInfo(hostname).url}/privacy/`,
  };

  console.log("NIP11 file generated:", nip11file);
  console.log("HOSTINFO:", getHostInfo(hostname));
  console.log("HOSTNAME:", hostname);

  return nip11file;
};

export { getNIP11file };