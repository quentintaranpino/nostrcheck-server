import { Application, Request, Response } from "express";
import { logger } from "./logger";
import {
    Event,
    Kind,
    getEventHash,
    validateEvent,
    verifySignature
  } from 'nostr-tools'
import { kill } from "process";

//https://github.com/v0l/nips/blob/nip98/98.md

declare enum NIP98Kind {
    Authorization = 27235
}


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

    //Create authevent object from authorization header
    let authevent : Event 
    try {
        authevent = JSON.parse(Buffer.from(req.headers.authorization?.substring(6, req.headers.authorization.length), 'base64').toString('utf8'));      
    } catch (error) {
            logger.warn(
                "RES -> 400 Bad request - " + error,
                "|",
                req.socket.remoteAddress
            );
            let result : AuthEventResult = {result: false, description: "Malformed authorization header"}
            return result;
    }

     //Check if event authorization content is valid
     const IsAuthEventValid = CheckAuthEvent(authevent, req)
     if(IsAuthEventValid.result == false){
         logger.warn(
             "RES -> 400 Bad request - " + IsAuthEventValid.description,
             "|",
             req.socket.remoteAddress
         );
         let result : AuthEventResult = {result: false, description: "Authorization header is invalid"}
         return result;
     }

     let result : AuthEventResult = {result: true, description: "Authorization header is valid"}
     return result;

}

export { ParseAuthEvent }

const CheckAuthEvent =  (authevent : Event, req : Request): AuthEventResult => {

//Check if event authorization kind is valid (Must be 27235)
try {
const eventkind : NIP98Kind = +authevent.kind
if (eventkind == null || eventkind == undefined || eventkind != 27235) {
    logger.warn(
        "RES -> 400 Bad request - Auth header event kind is not 27235",
        "|",
        req.socket.remoteAddress
    );
    let result : AuthEventResult = {result: false, description: "Auth header event kind is not 27235 "}
    return result;
}
}catch (error) {
    logger.error(
        "RES -> 400 Bad request - " + error,
        "|",
        req.socket.remoteAddress
    );
    let result : AuthEventResult = {result: false, description: "Auth header event kind is not 27235"}
    return result;}
    
//Check if created_at is within a reasonable time window (60 seconds)
try{
    const created_at = authevent.created_at
    const now = Math.floor(Date.now() / 1000);
    const diff = now - created_at;
    if (diff > 600000000000000000000000000000) {
        logger.warn(
            "RES -> 400 Bad request - Auth header event created_at is not within a reasonable time window",
            "|",
            req.socket.remoteAddress
        );
        let result : AuthEventResult = {result: false, description: "Auth header event created_at is not within a reasonable time window " + created_at + "<>" + now}
        return result;
    }
}catch (error) {
    logger.error(
        "RES -> 400 Bad request - " + error,
        "|",
        req.socket.remoteAddress
    );
    let result : AuthEventResult = {result: false, description: "Auth header event created_at is not within a reasonable time window"}
    return result;}


//Check if event authorization u Tag (URL) is valid (Must be the same as the server endpoint)
try {
const AuthEventEndpoint = authevent.tags[0][1]
const ServerEndpoint = req.protocol + '://' + req.headers.host + req.url
if (AuthEventEndpoint == null || AuthEventEndpoint == undefined || AuthEventEndpoint != ServerEndpoint) {
    logger.warn(
        "RES -> 400 Bad request - Auth header event endpoint is not valid",
        "|",
        req.socket.remoteAddress
    );
    let result : AuthEventResult = {result: false, description: "Auth header event endpoint is not valid: " + AuthEventEndpoint + " <> " + ServerEndpoint}
    return result;
}
}catch (error) {
    logger.error(
        "RES -> 400 Bad request - " + error,
        "|",
        req.socket.remoteAddress
    );
    let result : AuthEventResult = {result: false, description: "Auth header event endpoint is not valid"}
    return result;
}
    
//Check if authorization event method tag is valid (Must be the same as the request method)
try{
const method = authevent.tags[1][1]
const receivedmethod = req.method;
if (method == null || method == undefined || method != receivedmethod) {
    logger.warn(
        "RES -> 400 Bad request - Auth header event method is not valid",
        "|",
        req.socket.remoteAddress
    );
    let result : AuthEventResult = {result: false, description: "Auth header event method is not valid: " + receivedmethod + " <> " + method}
    return result;
}
}catch (error) {
    logger.error(
        "RES -> 400 Bad request - " + error,
        "|",
        req.socket.remoteAddress
        );
        let result : AuthEventResult = {result: false, description: "Auth header event method is not valid"}
        return result;
}

return {result: true, description: "Auth header event is valid"}

}