import {Relay} from "nostr-tools"
import { logger } from "../logger.js"
import 'websocket-polyfill'

const initRelays = async (_url : string) : Promise<Relay> => {
        if (_url == "") {
           return await Relay.connect('wss://relay.damus.io')
        }
        return await Relay.connect(_url)

        // TODO relay pools
}

export {initRelays}
