import { Application, Request, Response } from "express";
import { connect } from "../database";
import { logger } from "../logger";
import { ParseAuthEvent } from "../NIP98";
var validation = require("validator");

import {
    Event,
    getEventHash,
    validateEvent,
    verifySignature,
    nip19
  } from 'nostr-tools'

interface ResultMessage {

        username: string;
        hex: string;
        domain : string;
        result: boolean;
        description: string;
}

const AcceptedDomains = [
    "nostrcheck.me",
    "nostr-check.me",
    "nostriches.club",
    "plebchain.club"
]

export const LoadRegisterEndpoint = (app: Application): void => {

    app.post("/api/register", async (req: Request, res: Response): Promise<Response> => {
        
        logger.info("POST /api/register", "|", req.socket.remoteAddress);

        //Check if event authorization header is valid
        let EventHeader = ParseAuthEvent(req)
        if(EventHeader.result == false){
            logger.warn(
                "RES -> 400 Bad request - " + EventHeader.description,
                "|",
                req.socket.remoteAddress
            );
            let result : ResultMessage = {username: "", hex: "", domain: "", result: false, description: EventHeader.description}
            return res.status(400).send(result);          
        }

        //Check all necessary fields
        if (req.body.id == null || req.body.pubkey == null || req.body.created_at == null || req.body.kind == null || req.body.tags == null || req.body.content == null || req.body.sig == null) {
            logger.warn(
                "RES -> 400 Bad request - malformed JSON"
            );
            let result : ResultMessage = {username: "", hex: "", domain: "", result: false, description: "Malformed JSON"}
            return res.status(400).send(result);          
        }

        //Check if username is null (tag or tag value)
        try{
        if (req.body.tags[0][0] != "username" || req.body.tags[0][1] == null || req.body.tags[0][1] == undefined) {
            logger.warn(
                "RES -> 400 Bad request - malformed or non-existent username tag",
                "|",
                req.headers["x-forwarded-for"] || req.socket.remoteAddress
            );
            let result : ResultMessage = {username: "", hex: "", domain: "", result: false, description: "Malformed or non-existent username tag"}
            return res.status(400).send(result);   
        }
        } catch (error) {
            logger.warn(
                "RES -> 400 Bad request - malformed or non-existent username tag",
                "|",
                req.socket.remoteAddress
            );
            let result : ResultMessage = {username: "", hex: "", domain: "", result: false, description: "Malformed or non-existent username tag"}
            return res.status(400).send(result);
        }

        //Check if domain is null (tag or tag value)
        try{
        if (req.body.tags[1][0] != "domain" || req.body.tags[1][1] == null || req.body.tags[1][1] == undefined) {
            logger.warn(
                "RES -> 400 Bad request - malformed or non-existent domain tag",
                "|",
                req.headers["x-forwarded-for"] || req.socket.remoteAddress
            );
            let result : ResultMessage = {username: "", hex: "", domain: "", result: false, description: "Malformed or non-existent domain tag"}
            return res.status(400).send(result);   
        }
        } catch (error) {
            logger.warn(
                "RES -> 400 Bad request - malformed or non-existent domain tag",
                "|",
                req.socket.remoteAddress
            );
            let result : ResultMessage = {username: "", hex: "", domain: "", result: false, description: "Malformed or non-existent domain tag"}
            return res.status(400).send(result);
        }

        //Check if domain is valid
        let IsValidDomain = AcceptedDomains.indexOf(req.body.tags[1][1]) > -1;
        if (IsValidDomain == false) {
            logger.warn(
                "RES -> 406 Bad request - domain not accepted",
                "|",
                req.socket.remoteAddress
            );
            let result : ResultMessage = {username: "", hex: "", domain: "", result: false, description: "Domain not accepted"}
            return res.status(406).send(result);
        }

        //Create event object
        const event : Event= {
            kind: req.body.kind,
            created_at: req.body.created_at,
            tags: req.body.tags,
            content: req.body.content,
            pubkey: req.body.pubkey,
            id: req.body.id,
            sig: req.body.sig
        }

        // Check if event is valid
        try{
        let IsEventHashValid = getEventHash(event);
        if(IsEventHashValid != event.id){
            let result : ResultMessage = {username: "", hex: "", domain: "",  result: false, description: "Event hash is not valid"}
            return res.status(400).send(result);
        }

        let IsEventValid = validateEvent(event);
        let IsEventSignatureValid = verifySignature(event);
        if (IsEventValid == false || IsEventSignatureValid == false) {
        let result : ResultMessage = {username: "", hex: "", domain: "",  result: false, description: "Event signature is not valid"}
        return res.status(400).send(result);   
        }
        } catch (error) {
            logger.warn(
                "RES -> 400 Bad request - " + error,
                "|",
                req.socket.remoteAddress
            );
            let result : ResultMessage = {username: "", hex: "", domain: "",  result: false, description: "Malformed event"}
            return res.status(400).send(result);
        }

        //Check if username is valid
        let IsValidUsernameCharacters = validation.matches(req.body.tags[0][1], /^[a-zA-Z0-9]+$/)
        let IsValidUsernamelenght = validation.isLength(req.body.tags[0][1], {min: 3, max: 50})

        if (IsValidUsernameCharacters == false || IsValidUsernamelenght == false) {
            logger.warn(
                "RES -> 422 Bad request - Username not allowed",
                "|",
                req.socket.remoteAddress
            );
            let result : ResultMessage = {username: req.body.tags[0][1], hex: "", domain: req.body.tags[1][1], result: false, description: "Username not allowed"}
            return res.status(422).send(result);
        }

        const username = req.body.tags[0][1];
        const hex = event.pubkey;
        const pubkey = nip19.npubEncode(hex)
        const domain = req.body.tags[1][1];
        const createdate = "23-05-05 00:00:00";

   

        //Check if username alredy exist
        const conn = await connect();
        const [dbResult] = await conn.execute("SELECT * FROM registered where (username = ? and domain = ?) OR (hex = ? and domain = ?)", [username, domain, hex, domain]);
        const rowstemp = JSON.parse(JSON.stringify(dbResult));


        if (rowstemp[0] != undefined) {
            logger.warn("RES ->", username, "|", "Username alredy registered");
            conn.end();

            let result : ResultMessage = {username: req.body.tags[0][1], hex: "", domain: req.body.tags[1][1], result: false, description: "Username alredy registered"}
            return res.status(406).send(result);
        }
        

        //Insert user into database
        const [dbInsert] = await conn.execute("INSERT INTO registered (id, pubkey, hex, username, password, domain, email, active, date, apikey, comments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
         ["0", pubkey, hex, username, "", domain, "", 1, createdate, "", ""]);
        conn.end();

        let result : ResultMessage = {username: req.body.tags[0][1], hex: event.pubkey, domain: req.body.tags[1][1], result: true, description: "Success"}
        return res.status(200).send(result);


        //HAY QUE REFACTORIZAR TODOS LOS METODOS DE CHECKS PARA QUE FORMEN PARTE DE UN TS A PARTE Y ESTE TODO MAS LIMPIO

    });

}


