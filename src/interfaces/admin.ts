
const allowedTableNames = ["registered", "mediafiles", "lightning", "domains"];
const allowedFieldNames = ["allowed", "active", "visibility", "comments", "username", "pubkey", "hex", "domain", "checked", "lightningaddress", "paid"]; 

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
};

const moduleDataWhereFields: { [key: string]: [string] } = {
    "nostraddress": ["registered.id, registered.username, registered.pubkey, registered.hex, registered.domain, registered.date, registered.comments"],
    "media": ["mediafiles.id, mediafiles.pubkey, mediafiles.filename, mediafiles.original_hash, mediafiles.hash, mediafiles.status, mediafiles.dimensions, mediafiles.filesize, mediafiles.date, mediafiles.comments"],
    "lightning": ["lightning.id, lightning.pubkey, lightning.lightningaddress, lightning.comments"],
    "domains": ["domains.id, domains.domain, domains.comments"],
    "payments": ["transactions.id, transactions.paymenthash, transactions.paymentrequest, transactions.satoshi, transactions.paid, transactions.createddate, transactions.expirydate, transactions.paiddate, transactions.comments"],
};

export { allowedTableNames, allowedFieldNames, allowedFieldNamesAndValues, moduleDataReturnMessage, ModuleDataTables, moduleDataWhereFields };