
const allowedTableNames = ["registered", "mediafiles", "lightning", "domains", "banned"];
const allowedFieldNames = ["allowed", "active", "visibility", "comments", "username", "pubkey", "hex", "domain", "checked", "lightningaddress", "paid", "originid", "origintable", "reason"]; 

const allowedFieldNamesAndValues = [
    {field: "allowed", values: [0, 1]},
    {field: "active", values: [0, 1]},
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
];

interface moduleDataReturnMessage {
    total: number;
    totalNotFiltered: number;
    rows: any;
    authkey: string;
}


const ModuleDataTables: { [key: string]: string } = {
    "nostraddress": "registered",
    "media": "mediafiles",
    "lightning": "lightning",
    "domains": "domains",
    "payments": "transactions",
    "banned": "banned",
};

const moduleDataWhereFields: { [key: string]: [string] } = {
    "nostraddress":     ["registered.id, " + 
                        "registered.username, " + 
                        "registered.pubkey, " +
                        "registered.hex, " +
                        "registered.domain, " +
                        "registered.date, " +
                        "registered.comments"],
    "media":            ["mediafiles.id, " +
                        "mediafiles.pubkey, " +
                        "mediafiles.filename, " +
                        "mediafiles.original_hash, " +
                        "mediafiles.hash, " +
                        "mediafiles.status, " +
                        "mediafiles.dimensions, " +
                        "mediafiles.filesize, " +
                        "mediafiles.date, " +
                        "mediafiles.comments, " +
                        "username, " +
                        "satoshi" ],
    "lightning":        ["lightning.id, " +
                        "lightning.pubkey, " +
                        "lightning.lightningaddress, " +
                        "lightning.comments"],
    "domains":          ["domains.id, " +
                        "domains.domain, " +
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
};

const moduleDataSelectFields: { [key: string]: string } = {
    "nostraddress":     "registered.id, " + 
                        "CASE WHEN EXISTS (SELECT 1 FROM banned WHERE banned.originid = registered.id AND banned.origintable = 'registered' and banned.active = '1') THEN 1 ELSE 0 END as banned, " +
                        "registered.checked, " + 
                        "registered.active, " +
                        "registered.allowed, " +
                        "registered.username, " +
                        "registered.balance, " +
                        "registered.transactionid, " +
                        "registered.pubkey, " +
                        "registered.hex, " +
                        "registered.domain, " +
                        "DATE_FORMAT(registered.date, '%Y-%m-%d %H:%i') as date," + 
                        "registered.comments",
    "media":            "mediafiles.id, " +
    "CASE WHEN EXISTS (SELECT 1 FROM banned WHERE banned.originid = mediafiles.id AND banned.origintable = 'mediafiles' and banned.active = '1') THEN 1 ELSE 0 END as banned, " +
                        "mediafiles.checked, " +
                        "mediafiles.active, " +
                        "mediafiles.visibility, " +
                        "(SELECT transactions.paid FROM transactions WHERE mediafiles.transactionid = transactions.id LIMIT 1) as paid, " +
                        "(SELECT transactions.satoshi FROM transactions WHERE mediafiles.transactionid = transactions.id LIMIT 1) as satoshi, " +
                        "mediafiles.transactionid, " +
                        "(SELECT registered.username FROM registered WHERE mediafiles.pubkey = registered.hex LIMIT 1) as username, " +
                        "(SELECT registered.pubkey FROM registered WHERE mediafiles.pubkey = registered.hex LIMIT 1) as npub, " +
                        "mediafiles.pubkey, " +
                        "mediafiles.filename, " +
                        "mediafiles.original_hash, " +
                        "mediafiles.hash, " +
                        "mediafiles.status, " +
                        "mediafiles.dimensions, " +
                        "ROUND(mediafiles.filesize / 1024 / 1024, 2) as 'filesize', " +
                        "DATE_FORMAT(mediafiles.date, '%Y-%m-%d %H:%i') as date, " +
                        "mediafiles.comments",
    "lightning":        "lightning.id, " +
                        "lightning.active, " +
                        "lightning.pubkey, " +
                        "lightning.lightningaddress, " +
                        "lightning.comments",
    "domains":          "domains.id, " +
                        "domains.active, " +
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
    "banned":           "banned.id, " +
                        "banned.active, " +
                        "banned.originid, " +
                        "banned.origintable, " +
                        "COALESCE(  (SELECT mediafiles.filename FROM mediafiles WHERE mediafiles.id = banned.originid and banned.origintable = 'mediafiles' LIMIT 1), " +
                        "           (SELECT registered.hex FROM registered WHERE registered.id = banned.originid and banned.origintable = 'registered' LIMIT 1)" +
                        "         ) as originkey, " +
                        "banned.reason "
};

export { allowedTableNames, allowedFieldNames, allowedFieldNamesAndValues, moduleDataReturnMessage, ModuleDataTables, moduleDataSelectFields, moduleDataWhereFields };