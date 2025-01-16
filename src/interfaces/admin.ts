
const allowedTableNames = ["registered", "mediafiles", "lightning", "domains", "banned", "invitations"];
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
];

interface moduleDataReturnMessage {
    total: number;
    totalNotFiltered: number;
    rows: any;
}


const ModuleDataTables: { [key: string]: string } = {
    "nostraddress": "registered",
    "media": "mediafiles",
    "lightning": "lightning",
    "domains": "domains",
    "payments": "transactions",
    "banned": "banned",
    "register": "invitations",
    "ips": "ips"
};

const moduleDataKeys: { [key: string]: string } = {
    "nostraddressData": "registered",
    "mediaData": "mediafiles",
    "lightningData": "lightning",
    "domainsData": "domains",
    "paymentsData": "transactions",
    "bannedData": "banned",
    "invitesData": "invitations",
    "ipsData": "ips"
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
    "banned":           ["banned.id, " +
                        "banned.originid, " +
                        "banned.origintable, " +
                        "banned.reason, " +
                        "banned.comments"],
    "invites":          ["invitations.id, " +
                        "invitations.originid, " +
                        "invitations.inviteeid, " +
                        "invitations.createdate, " +
                        "invitations.inviteedate, " +
                        "invitations.comments"],
    "ips":              ["ips.id, " +
                        "ips.active, " +
                        "ips.checked, " +
                        "ips.ip, " +
                        "ips.firstseen, " +
                        "ips.lastseen, " +
                        "ips.reqcount, " +
                        "ips.infractions, " +
                        "ips.comments"]
};

const moduleDataSelectFields: { [key: string]: string } = {
    "nostraddress":     "registered.id, " + 
                        "CASE WHEN EXISTS (SELECT 1 FROM banned WHERE banned.originid = registered.id AND banned.origintable = 'registered' and banned.active = '1') THEN 1 ELSE 0 END as banned, " +
                        "registered.checked, " + 
                        "registered.active, " +
                        "registered.allowed, " +
                        "registered.username, " +
                        "registered.balance, " +
                        "(SELECT transactions.paid FROM transactions WHERE registered.transactionid = transactions.id LIMIT 1) as paid, " +
                        "(SELECT transactions.satoshi FROM transactions WHERE registered.transactionid = transactions.id LIMIT 1) as satoshi, " +
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
                        "mediafiles.mimetype, " +
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
    "banned":           "banned.id, " +
                        "banned.active, " +
                        "banned.originid, " +
                        "banned.origintable, " +
                        "COALESCE(  (SELECT mediafiles.filename FROM mediafiles WHERE mediafiles.id = banned.originid and banned.origintable = 'mediafiles' LIMIT 1), " +
                        "           (SELECT registered.hex FROM registered WHERE registered.id = banned.originid and banned.origintable = 'registered' LIMIT 1)," +
                        "           (SELECT ips.ip FROM ips WHERE ips.id = banned.originid and banned.origintable = 'ips' LIMIT 1) " +
                        "         ) as originkey, " +
                        "banned.reason ",
    "register":         "invitations.id, " +
                        "invitations.active, " +
                        "invitations.code, " +
                        "invitations.originid, " +
                        "invitations.inviteeid, " +
                        "DATE_FORMAT(invitations.createdate, '%Y-%m-%d %H:%i') as createdate, " +
                        "DATE_FORMAT(invitations.inviteedate, '%Y-%m-%d %H:%i') as inviteedate, " +
                        "invitations.comments",
    "ips":              "ips.id, " +
                        "CASE WHEN EXISTS (SELECT 1 FROM banned WHERE banned.originid = ips.id AND banned.origintable = 'ips' and banned.active = '1') THEN 1 ELSE 0 END as banned, " +
                        "ips.active, " +
                        "ips.checked, " +
                        "ips.ip, " +
                        "DATE_FORMAT(ips.firstseen, '%Y-%m-%d %H:%i') as firstseen, " +
                        "DATE_FORMAT(ips.lastseen, '%Y-%m-%d %H:%i') as lastseen, " +
                        "ips.reqcount, " +
                        "ips.infractions, " +
                        "ips.comments"
};

export { allowedTableNames, allowedFieldNames, allowedFieldNamesAndValues, moduleDataReturnMessage, ModuleDataTables, moduleDataSelectFields, moduleDataWhereFields, moduleDataKeys };