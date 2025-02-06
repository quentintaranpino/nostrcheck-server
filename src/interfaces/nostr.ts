import { ResultMessagev2 } from "./server.js";
import { z } from "zod";

enum NIPKinds {
	NIP98 = 27235,
	NIP94 = 1063,
	NIP96 = 10096,
}

interface NIP96file {
    api_url: string,
    download_url: string,
    supported_nips: number[],
    tos_url: string,
    content_types: string[],
    plans: {
        free: {
            name: string,
            is_nip98_required: boolean,
            url: string,
            max_byte_size: number,
            file_expiration: number[],
            media_transformations: {
                "image": string[],
                "video": string[],
            }
        }
    }
}

interface NIP94_base {
    id : string,
    pubkey: string,
    kind: NIPKinds.NIP94,
    sig : string,
}

interface NIP94_data {
    tags: [
            ["url", string],
            ["m", string],
            ["x", string],
            ["ox", string],
            ["size", string],
            ["dim",string],
            ["magnet", string],
            ["i", string],
            ["blurhash", string],
            ["no_transform", string],
            ["payment_request", string],
            ["visibility", string],
    ],
    content: string,
    created_at: number,

}
interface NIP94_event extends NIP94_base, NIP94_data {}

interface NIP96_event extends ResultMessagev2{

    processing_url: string,
    payment_request: string,
	nip94_event : NIP94_event

}


interface NIP04_event{
    kind: number,
    created_at: number,
    tags: [["p", string]],
    content: string,
}

interface NIP96_processing extends ResultMessagev2{
    percentage : number,
}

interface nostrProfileData {
    name: string,
    about: string,
    picture: string,
    nip05?: string,
    lud16?: string,
    website?: string,
    display_name?: string,
    banner?: string,
}

const emptyNostrProfileData: nostrProfileData = {
    name: "",
    about: "",
    picture: "",
    nip05: "",
    lud16: "",
    website: "",
    display_name: "",
    banner: "",
}

const NIP01_event = z.union([
  z.tuple([
    z.literal("EVENT"),
    z.object({
      id: z.string(),
      kind: z.number(),
      pubkey: z.string(),
      content: z.string(),
      tags: z.array(z.array(z.string())),
      created_at: z.number(),
      sig: z.string(),
    }),
  ]),
  z.tuple([
    z.literal("REQ"),
    z.string(),
  ]).rest(z.object({}).passthrough()), 
  z.tuple([
    z.literal("CLOSE"),
    z.string(),
  ]),
  z.tuple([
    z.literal("AUTH"),
    z.union([
      z.string(),
      z.object({  
        id: z.string(),
        kind: z.literal(22242),
        pubkey: z.string(),
        content: z.string(),
        tags: z.array(z.array(z.string())),
        created_at: z.number(),
        sig: z.string(),
      }),
    ])
  ]),
  z.tuple([
    z.literal("COUNT"),
    z.string(),
  ]).rest(z.object({}).passthrough())
]);

interface NIP11Limitation {
  max_message_length?: number;
  max_subscriptions?: number;
  max_filters?: number;
  max_limit?: number;
  max_subid_length?: number;
  max_event_tags?: number;
  max_content_length?: number;
  min_pow_difficulty?: number;
  auth_required?: boolean;
  payment_required?: boolean;
  restricted_writes?: boolean;
  created_at_lower_limit?: number;
  created_at_upper_limit?: number;
}

interface NIP11RetentionPolicy {
  kinds?: (number | [number, number])[];
  time?: number | null;
  count?: number;
}

interface NIP11Fee {
  amount: number;
  unit: string;
  period?: number;
  kinds?: number[];
}

interface NIP11Fees {
  admission?: NIP11Fee[];
  subscription?: NIP11Fee[];
  publication?: NIP11Fee[];
}

interface NIP11File {
  name: string;
  description: string;
  banner?: string;
  icon?: string;
  pubkey?: string;
  contact?: string;
  supported_nips: number[];
  software?: string;
  version?: string;
  limitation?: NIP11Limitation;
  retention?: NIP11RetentionPolicy[];
  relay_countries?: string[];
  language_tags?: string[];
  tags?: string[];
  posting_policy?: string;
  payments_url?: string;
  fees?: NIP11Fees;
}

interface AuthEvent {
  id: string;
  kind: 22242;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
  sig: string;
}

const supported_nips = [1, 2, 3, 4, 5, 7, 9, 11, 13, 14, 19, 40, 44, 47, 48, 78, 94, 96, 98];

export {
          supported_nips,
          NIPKinds,
          NIP96file,
          NIP11File,
          NIP01_event,
          NIP94_event,
          NIP94_data,
          NIP96_event,
          NIP96_processing,
          NIP04_event,
          nostrProfileData,
          emptyNostrProfileData,
          AuthEvent,
}