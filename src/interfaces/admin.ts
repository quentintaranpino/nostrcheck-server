    // Define a list of allowed table names and field names
    const allowedTableNames = ["registered", "mediafiles", "lightning", "domains"];
    const allowedFieldNames = ["allowed", "active", "visibility", "comments", "username", "pubkey", "hex", "domain", "checked"]; 

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
        {field: "date", values: ["string"]}
    ];

    export { allowedTableNames, allowedFieldNames, allowedFieldNamesAndValues };