
const allowedTableNames = ["registered", "mediafiles", "lightning", "domains", "banned", "invitations", "ips", "events", "filetypes", "plugins"];
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
                            "original_mime",
                            "original_extension",
                            "converted_mime",
                            "converted_extension",
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
    {field: "original_mime", values: ["string"]},
    {field: "original_extension", values: ["string"]},
    {field: "converted_mime", values: ["string"]},
    {field: "converted_extension", values: ["string"]},
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
    "ips": "ips",
    "relay": "events", 
    "filetypes": "filetypes",
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
    "eventsData": "events",
    "filetypesData": "filetypes",
    "pluginsData": "plugins",
};

const moduleDataIndex: { [key: string]: string } = {
    "registeredData": "hex",
    "filesData": "filename",
    "lightningData": "lightningaddress",
    "domainsData": "domain",
    "paymentsData": "paymenthash",
    "invitesData": "inviteeid",
};

const moduleDataWhereFields: { [key: string]: [string] } = {
    "nostraddress":     ["registered.id, " + 
                        "registered.username, " + 
                        "registered.pubkey, " +
                        "registered.hex, " +
                        "registered.domain, " +
                        "registered.date, " +
                        "registered.comments, " +
                        "registered.pendingotc"],
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
                        "banned.active, " +
                        "banned.originid, " +
                        "banned.origintable, " +
                        "banned.reason, " +
                        "banned.createddate"],
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
                        "ips.comments"],
    "relay": [
                        "events.id, " +   
                        "events.active, " +
                        "events.checked, " +
                        "events.event_id, " +
                        "events.pubkey, " +
                        "events.kind, " +
                        "events.content, " +
                        "events.created_at, " +
                        "events.received_at"
                        ],
    "filetypes": [
                        "filetypes.id, " +
                        "filetypes.active, " +
                        "filetypes.original_mime, " +
                        "filetypes.original_extension, " +
                        "filetypes.converted_mime, " +
                        "filetypes.converted_extension, " +
                        "filetypes.comments "
                        ]
};

const moduleDataSelectFields: { [key: string]: string } = {
    "nostraddress":     "registered.id, " + 
                        "CASE WHEN EXISTS (SELECT 1 FROM banned WHERE banned.originid = registered.id AND banned.origintable = 'registered' and banned.active = '1') THEN 1 ELSE 0 END as banned, " +
                        "registered.checked, " + 
                        "registered.active, " +
                        "registered.allowed, " +
                        "registered.pendingotc, " +
                        "registered.username, " +
                        "registered.balance, " +
                        "CASE WHEN EXISTS (SELECT transactions.paid FROM transactions WHERE registered.transactionid = transactions.id LIMIT 1) THEN 1 ELSE 0 END as paid, " +
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
    "banned":           "banned.id, " +
                        "banned.active, " +
                        "banned.originid, " +
                        "banned.origintable, " +
                        "COALESCE(  (SELECT mediafiles.filename FROM mediafiles WHERE mediafiles.id = banned.originid and banned.origintable = 'mediafiles' LIMIT 1), " +
                        "           (SELECT registered.hex FROM registered WHERE registered.id = banned.originid and banned.origintable = 'registered' LIMIT 1)," +
                        "           (SELECT ips.ip FROM ips WHERE ips.id = banned.originid and banned.origintable = 'ips' LIMIT 1) " +
                        "         ) as originkey, " +
                        "banned.createddate, " +
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
                        "DATE_FORMAT(FROM_UNIXTIME(ips.firstseen /1000), '%Y-%m-%d %H:%i') as firstseen, " +
                        "DATE_FORMAT(FROM_UNIXTIME(ips.lastseen /1000), '%Y-%m-%d %H:%i') as lastseen, " +
                        "ips.reqcount, " +
                        "ips.infractions, " +
                        "ips.comments",
    "relay":            "events.id, " +
                        "events.active, " +
                        "events.checked, " +
                        "CASE WHEN EXISTS (SELECT 1 FROM banned WHERE banned.originid = events.id AND banned.origintable = 'events' and banned.active = '1') THEN 1 ELSE 0 END as banned, " +
                        "events.event_id, " +
                        "events.pubkey, " +
                        "events.kind, " +
                        "(SELECT COALESCE(GROUP_CONCAT(CONCAT(eventtags.tag_name, ' : ', eventtags.tag_value) SEPARATOR ', '), '') FROM eventtags WHERE eventtags.event_id = events.event_id) as tags, " +
                        "events.content, " +
                        "events.created_at, " +
                        "events.received_at, " + 
                        "events.comments",
    "filetypes":        "filetypes.id, " +
                        "filetypes.active, " +
                        "filetypes.original_mime, " +
                        "filetypes.original_extension, " +
                        "filetypes.converted_mime, " +
                        "filetypes.converted_extension, " +
                        "filetypes.comments"
};

export { allowedTableNames, 
         allowedFieldNames, 
         allowedFieldNamesAndValues, 
         moduleDataReturnMessage, 
         ModuleDataTables, 
         moduleDataSelectFields, 
         moduleDataWhereFields, 
         moduleDataKeys,
         moduleDataIndex };