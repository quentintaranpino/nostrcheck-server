
const allowedTableNames = ["registered", "mediafiles", "lightning", "domains", "banned", "invitations", "ips", "events"];
const allowedFieldNames = [ "allowed", 
                            "active", 
                            "banned",
                            "visibility", 
                            "comments", 
                            "username", 
                            "pubkey", 
                            "hex", 
                            "domain", 
                            "checked", 
                            "lightningaddress", 
                            "paid", 
                            "originid", 
                            "origintable", 
                            "reason",
                            "createdate",
                            "requireinvite",
                            "requirepayment",
                            "maxsatoshi",
                            "infractions",
                            "pendingotc", 
                        ]; 

const allowedFieldNamesAndValues = [
    {field: "allowed", values: [0, 1]},
    {field: "active", values: [0, 1]},
    {field: "banned", values: [0, 1]},
    {field: "visibility", values: [0, 1]},
    {field: "checked", values: [0, 1]},
    {field: "comments", values: ["string"]},
    {field: "username", values: ["string"]},
    {field: "pubkey", values: ["string"]},
    {field: "hex", values: ["string"]},
    {field: "domain", values: ["string"]},
    {field: "id", values: ["number"]},
    {field: "date", values: ["string"]},
    {field: "lightningaddress", values: ["string"]},
    {field: "paid", values: [0, 1]},
    {field: "originid", values: ["number"]},
    {field: "origintable", values: ["string"]},
    {field: "original_hash", values: ["string"]},
    {field: "reason", values: ["string"]},
    {field: "createdate", values: ["string"]},
    {field: "requireinvite", values: [0, 1]},
    {field: "requirepayment", values: [0, 1]},
    {field: "maxsatoshi", values: ["number"]},
    {field: "infractions", values: ["number"]},
    {field: "pendingotc", values: [0, 1]},
];

interface moduleDataReturnMessage {
    total: number;
    totalNotFiltered: number;
    rows: any;
}

const ModuleDataTables: { [key: string]: string } = {
    "nostraddress": "vregistered",
    "media": "vfiles",
    "lightning": "lightning",
    "domains": "domains",
    "payments": "transactions",
    "banned": "vbanned",
    "register": "invitations",
    "ips": "vips",
    "relay": "vevents"
};

const moduleDataKeys: { [key: string]: string } = {
    "registeredData": "registered",
    "filesData": "mediafiles",
    "lightningData": "lightning",
    "domainsData": "domains",
    "paymentsData": "transactions",
    "bannedData": "banned",
    "invitesData": "invitations",
    "ipsData": "ips",
    "eventsData": "events"
};

const moduleDataWhereFields: { [key: string]: [string] } = {
    "nostraddress":     ["vregistered.id, " + 
                        "vregistered.username, " + 
                        "vregistered.pubkey, " +
                        "vregistered.hex, " +
                        "vregistered.domain, " +
                        "vregistered.date, " +
                        "vregistered.comments, " +
                        "vregistered.pendingotc"],
    "media":            ["vfiles.id, " +
                        "vfiles.pubkey, " +
                        "vfiles.filename, " +
                        "vfiles.original_hash, " +
                        "vfiles.hash, " +
                        "vfiles.status, " +
                        "vfiles.dimensions, " +
                        "vfiles.filesize, " +
                        "vfiles.date, " +
                        "vfiles.comments, " +
                        "vfiles.username, " +
                        "vfiles.satoshi" ],
    "lightning":        ["lightning.id, " +
                        "lightning.pubkey, " +
                        "lightning.lightningaddress, " +
                        "lightning.comments"],
    "domains":          ["domains.id, " +
                        "domains.domain, " +
                        "domains.active, " +
                        "domains.checked, " +
                        "domains.requireinvite, " +
                        "domains.requirepayment, " +
                        "domains.comments"],
    "payments":         ["transactions.id, " +
                        "transactions.paymenthash, " +
                        "transactions.paymentrequest, " +
                        "transactions.satoshi, " +
                        "transactions.paid, " +
                        "transactions.createddate, " +
                        "transactions.expirydate, " +
                        "transactions.paiddate, " +
                        "transactions.comments"],
    "banned":           ["vbanned.id, " +
                        "vbanned.active, " +
                        "vbanned.originid, " +
                        "vbanned.origintable, " +
                        "vbanned.originkey, " +
                        "vbanned.reason, " +
                        "vbanned.createddate, " +
                        "vbanned.reason"],
    "invites":          ["invitations.id, " +
                        "invitations.originid, " +
                        "invitations.inviteeid, " +
                        "invitations.createdate, " +
                        "invitations.inviteedate, " +
                        "invitations.comments"],
    "ips":              ["vips.id, " +
                        "vips.active, " +
                        "vips.checked, " +
                        "vips.ip, " +
                        "vips.firstseen, " +
                        "vips.lastseen, " +
                        "vips.reqcount, " +
                        "vips.infractions, " +
                        "vips.comments"],
    "relay": [
                        "vevents.id, " +   
                        "vevents.active, " +
                        "vevents.checked, " +
                        "vevents.event_id, " +
                        "vevents.pubkey, " +
                        "vevents.kind, " +
                        "vevents.tags, " +
                        "vevents.content, " +
                        "vevents.created_at, " +
                        "vevents.received_at"
                        ]
};

const moduleDataSelectFields: { [key: string]: string } = {
    "nostraddress":     "vregistered.id, " + 
                        "vregistered.banned, " +
                        "vregistered.checked, " + 
                        "vregistered.active, " +
                        "vregistered.allowed, " +
                        "vregistered.pendingotc, " +
                        "vregistered.username, " +
                        "vregistered.balance, " +
                        "vregistered.paid, " +
                        "vregistered.satoshi, " +
                        "vregistered.transactionid, " +
                        "vregistered.pubkey, " +
                        "vregistered.hex, " +
                        "vregistered.domain, " +
                        "vregistered.date," + 
                        "vregistered.comments",
    "media":            "vfiles.id, " +
                        "vfiles.banned, " +
                        "vfiles.checked, " +
                        "vfiles.active, " +
                        "vfiles.visibility, " +
                        "vfiles.paid, " +
                        "vfiles.satoshi, " +
                        "vfiles.transactionid, " +
                        "vfiles.username, " +
                        "vfiles.npub, " +
                        "vfiles.pubkey, " +
                        "vfiles.filename, " +
                        "vfiles.mimetype, " +
                        "vfiles.original_hash, " +
                        "vfiles.hash, " +
                        "vfiles.status, " +
                        "vfiles.dimensions, " +
                        "vfiles.filesize, " +
                        "vfiles.date, " +
                        "vfiles.comments",
    "lightning":        "lightning.id, " +
                        "lightning.active, " +
                        "lightning.checked, " +
                        "lightning.pubkey, " +
                        "lightning.lightningaddress, " +
                        "lightning.comments",
    "domains":          "domains.id, " +
                        "domains.active, " +
                        "domains.checked, " +
                        "domains.requireinvite, " +
                        "domains.requirepayment, " +
                        "domains.maxsatoshi, " +
                        "domains.domain, " +
                        "domains.comments",
    "payments":         "transactions.id, " +
                        "transactions.type, " +
                        "transactions.accountid, " +
                        "transactions.paymentrequest, " +
                        "transactions.paymenthash, " +
                        "transactions.satoshi, " +
                        "transactions.paid, " +
                        "DATE_FORMAT(transactions.createddate, '%Y-%m-%d %H:%i') as createddate, " +
                        " DATE_FORMAT(expirydate, '%Y-%m-%d %H:%i') as expirydate, " +
                        "DATE_FORMAT(transactions.paiddate, '%Y-%m-%d %H:%i') as paiddate, " +
                        "transactions.comments",
    "banned":           "vbanned.id, " +
                        "vbanned.active, " +
                        "vbanned.originid, " +
                        "vbanned.origintable, " +
                        "vbanned.originkey, " +
                        "vbanned.createddate, " +
                        "vbanned.reason ",
    "register":         "invitations.id, " +
                        "invitations.active, " +
                        "invitations.code, " +
                        "invitations.originid, " +
                        "invitations.inviteeid, " +
                        "DATE_FORMAT(invitations.createdate, '%Y-%m-%d %H:%i') as createdate, " +
                        "DATE_FORMAT(invitations.inviteedate, '%Y-%m-%d %H:%i') as inviteedate, " +
                        "invitations.comments",
    "ips":              "vips.id, " +
                        "vips.banned, " +
                        "vips.active, " +
                        "vips.checked, " +
                        "vips.ip, " +
                        "vips.firstseen, " +
                        "vips.lastseen, " +
                        "vips.reqcount, " +
                        "vips.infractions, " +
                        "vips.comments",
    "relay":            "vevents.id, " +
                        "vevents.active, " +
                        "vevents.checked, " +
                        "vevents.banned, " +
                        "vevents.event_id, " +
                        "vevents.pubkey, " +
                        "vevents.kind, " +
                        "vevents.tags, " +
                        "vevents.content, " +
                        "vevents.created_at, " +
                        "vevents.received_at, " + 
                        "vevents.comments"
};

export { allowedTableNames, allowedFieldNames, allowedFieldNamesAndValues, moduleDataReturnMessage, ModuleDataTables, moduleDataSelectFields, moduleDataWhereFields, moduleDataKeys };