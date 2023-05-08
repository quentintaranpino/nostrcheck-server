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


    //FALTA PREPARAR LOS METODOS PARA VERIFICAR QUE EFECTIVAMENTE LA FIRMA ES VALIDA Y QUE EL EVENTO ES VALIDO
}

export { ParseAuthEvent }


