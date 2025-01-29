// https://github.com/nostr-protocol/nips/blob/master/11.md
import { Application } from "express"
import { NIP11File, supported_nips } from "../../interfaces/nostr.js";

const getNIP11file = (app: Application, hostname: string): NIP11File => {
  const nip11file: NIP11File = {
    name: `${app.get("config.server")["host"]} nostr relay` ,
    description: app.get("config.relay")["description"] || `${app.get("config.server")["host"]} nostr relay` ,
    icon: `https://${hostname}/static/resources/relay-icon.png`,
    pubkey: app.get("config.server")["pubkey"],
    contact: app.get("config.relay")["contact"],
    supported_nips: supported_nips,
    software: "https://github.com/quentintaranpino/nostrcheck-server",
    version: app.get("version"),
    limitation: {
      max_message_length: app.get("config.relay")["limitation"]["max_message_length"],
      max_subscriptions: app.get("config.relay")["limitation"]["max_subscriptions"],
      max_filters: app.get("config.relay")["limitation"]["max_filters"],
      max_limit: app.get("config.relay")["limitation"]["max_limit"],
      max_subid_length: app.get("config.relay")["limitation"]["max_subid_length"],
      max_event_tags: app.get("config.relay")["limitation"]["max_event_tags"],
      max_content_length: app.get("config.relay")["limitation"]["max_content_length"],
      min_pow_difficulty: app.get("config.relay")["limitation"]["min_pow_difficulty"],
      auth_required: app.get("config.relay")["limitation"]["auth_required"],
      restricted_writes: app.get("config.relay")["limitation"]["min_pow_difficulty"] > 0 || app.get("config.server")["availableModules"]["plugins"]["enabled"] == true ? true : false,
      created_at_lower_limit: app.get("config.relay")["limitation"]["created_at_lower_limit"],
      created_at_upper_limit: app.get("config.relay")["limitation"]["created_at_upper_limit"]
    },
    language_tags: app.get("config.relay")["language_tags"],
    tags: app.get("config.relay")["tags"],
    posting_policy: `https://${hostname}/api/v2/tos/`,
  };

  return nip11file;
};

export { getNIP11file };