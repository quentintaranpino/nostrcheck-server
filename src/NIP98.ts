import { Application, Request, Response } from "express";
import { logger } from "./logger";
import {
    Event,
    getEventHash,
    validateEvent,
    verifySignature
  } from 'nostr-tools'

//https://github.com/v0l/nips/blob/nip98/98.md


interface AuthEventResult {
       result: boolean;
       description: string;
  }

  const ParseAuthEvent =  (req: Request): AuthEventResult => {

    //Check if request has authorization header
    if (req.headers.authorization == undefined) {
        logger.warn(
            "RES -> 400 Bad request - Authorization header not found",
            "|",
            req.socket.remoteAddress
        );
        let result : AuthEventResult = {result: false, description: "Authorization header not found"}
        return result;
    }
        
    try {
        const authevent = JSON.parse(Buffer.from(req.headers.authorization?.substring(6, req.headers.authorization.length), 'base64').toString('utf8'));

        //Check if event authorization content is valid
        let IsAuthEventValid = VerifyAuthEvent(authevent)
        if(IsAuthEventValid.result == false){
            logger.warn(
                "RES -> 400 Bad request - " + IsAuthEventValid.description,
                "|",
                req.socket.remoteAddress
            );
            let result : AuthEventResult = {result: false, description: "Authorization header invalid"}
            return result;
        }

        let result : AuthEventResult = {result: true, description: "Authorization header valid"}
        return result;
        
    } catch (error) {
            logger.warn(
                "RES -> 400 Bad request - " + error,
                "|",
                req.socket.remoteAddress
            );
            let result : AuthEventResult = {result: false, description: "Malformed authorization header"}
            return result;
        }

}

export { ParseAuthEvent }

const VerifyAuthEvent =  (req: Request): AuthEventResult => {

//Check if event authorization kind is valid (Must be 27235)
const kind = req.body.kind
if (kind == null || kind == undefined || kind != "27235") {
    logger.warn(
        "RES -> 400 Bad request - Auth header event kind is not 27235",
        "|",
        req.socket.remoteAddress
    );
    let result : AuthEventResult = {result: false, description: "Auth header event kind is not 27235"}
    return result;
}

//Check if event authorization tags are valid
const endpoint = req.body.tags[0][1]
const servername = req.hostname;
if (endpoint == null || endpoint == undefined || endpoint != servername) {
    logger.warn(
        "RES -> 400 Bad request - Auth header event endpoint is not valid",
        "|",
        req.socket.remoteAddress
    );
    let result : AuthEventResult = {result: false, description: "Auth header event endpoint is valid"}
    return result;
}

const method = req.body.tags[1][1]
const receivedmethod = req.method;
if (method == null || method == undefined || method != receivedmethod) {
    logger.warn(
        "RES -> 400 Bad request - Auth header event method is not valid",
        "|",
        req.socket.remoteAddress
    );
    let result : AuthEventResult = {result: false, description: "Auth header event method is not valid"}
    return result;
}

return {result: true, description: "Auth header event is valid"}

}