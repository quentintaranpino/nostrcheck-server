import { Invoice } from "@getalby/lightning-tools";
import { RowDataPacket } from "mysql2";

interface domainsTableStructure extends RowDataPacket{
	id: string;
	domain: string;
	active: string;
	checked: string;
	comments: string;
}

const domainsTableFields : domainsTableStructure = {
	"id" : "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	"domain" : "varchar(50) NOT NULL",
	"active" : "boolean NOT NULL DEFAULT 0",
	"checked" : "boolean NOT NULL DEFAULT 0",
	"comments" : "varchar(150)",
	constructor: {
		name: 'RowDataPacket',
	},
} 

interface lightningTable extends RowDataPacket {
	id: string;
	active : string;
	checked: string;
	pubkey: string;
	lightningaddress: string;
	comments: string;
}

const lightningTableFields: lightningTable = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	active: "boolean NOT NULL DEFAULT 1",
	checked: "boolean NOT NULL DEFAULT 0",
	pubkey: "varchar(64) NOT NULL",
	lightningaddress: "varchar(50) NOT NULL",
	comments: "varchar(150)",
	constructor: {
		name: 'RowDataPacket',
	},

};

interface mediafilesTable extends RowDataPacket {
	id: string;
	pubkey: string;
	filename: string;
	original_hash: string;
	hash: string;
	status: string;
	percentage: string;
	visibility: string;
	active: string;
	date: string;
	ip_address: string;
	magnet: string;
	blurhash: string;
	dimensions: string;
	filesize: string;
	comments: string;
	checked: string;
	transactionid: string;
	localPath: string;
	type: string;
}

const mediafilesTableFields: mediafilesTable = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	pubkey: "varchar(64) NOT NULL",
	filename: "varchar(128) NOT NULL",
	original_hash: "varchar(64)",
	hash: "varchar(64)",
	status: "varchar(10) NOT NULL",
	percentage: "int(3) NOT NULL DEFAULT 0",
	visibility: "boolean NOT NULL DEFAULT 0",
	active: "boolean NOT NULL DEFAULT 0",
	date: "datetime NOT NULL",
	ip_address: "varchar(64) NOT NULL",
	magnet: "varchar(512)",
	blurhash: "varchar(256)",
	dimensions: "varchar(15)",
	filesize: "varchar(15)",
	comments: "varchar(150)",
	checked: "boolean NOT NULL DEFAULT 0",
	transactionid: "int(11)",
	localPath: "varchar(4)",
	type: "varchar(15)",
	constructor: {
		name: 'RowDataPacket',
	},
};

interface mediatagsTable extends RowDataPacket {
	id: string;
	fileid: string;
	tag: string;
}

const mediatagsTableFields: mediatagsTable = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	fileid: "int(11) NOT NULL",
	tag: "varchar(64) NOT NULL",
	constructor: {
		name: 'RowDataPacket',
	},
};

interface registeredTable extends RowDataPacket{
	id: string;
	pubkey: string;
	hex: string;
	username: string;
	password: string;
	domain: string;
	active: string;
	date: string;
	allowed: string;
	authkey: string;
	apikey: string;
	comments: string;
	checked: string;
	balance: string;
	transactionid: string;
}

const registeredTableFields: registeredTable = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	pubkey: "varchar(64) NOT NULL",
	hex: "varchar(64) NOT NULL",
	username: "varchar(64) NOT NULL",
	password: "varchar(100) NOT NULL",
	domain: "varchar(50) NOT NULL",
	active: "boolean NOT NULL DEFAULT 0",
	date: "datetime NOT NULL",
	allowed: "boolean NOT NULL DEFAULT 0",
	authkey: "varchar(64)",
	apikey: "varchar(64)",
	comments: "varchar(150)",
	checked: "boolean NOT NULL DEFAULT 0",
	balance: "int(11) NOT NULL DEFAULT 0",
	transactionid: "int(11)",
	constructor: {
		name: 'RowDataPacket',
	},
};

interface transactionsTable extends RowDataPacket {
	id: string;
	type: string;
	accountid: string;
	paymentrequest: string;
	satoshi: string;
	paid: string;
	createddate: string;
	expirydate: string;
	paiddate: string;
	comments: string;
}

const transactionsTableFields: transactionsTable = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	type: "varchar(10) NOT NULL",
	accountid: "varchar(12) NOT NULL",
	paymentrequest: "varchar(1637)",
	paymenthash: "varchar(64)",
	satoshi: "int(11) NOT NULL",
	paid: "boolean NOT NULL DEFAULT 0",
	createddate: "datetime NOT NULL",
	expirydate: "datetime NOT NULL",
	paiddate: "datetime",
	comments: "varchar(150)",
	constructor: {
		name: 'RowDataPacket',
	},
};

const ledgerTableFields: ledgerTable = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	accountid: "int(12) NOT NULL",
	transactionid: "int(11) NOT NULL",
	debit: "int(11) NOT NULL",
	credit: "int(11) NOT NULL",
	createddate: "datetime NOT NULL",
	comments: "varchar(150)",
	constructor: {
		name: 'RowDataPacket',
	},
};

interface ledgerTable extends RowDataPacket {
	id: string;
	accountid: string;
	transactionid : string;
	debit: string;
	credit: string;
	createddate: string;
	comments: string;
}

const accountsTableFields: accountsTable = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	accountid: "int(12) NOT NULL",
	active: "boolean NOT NULL DEFAULT 0",
	accountname: "varchar(50) NOT NULL",
	accounttype: "varchar(50) NOT NULL",
	createddate: "datetime NOT NULL",
	comments: "varchar(150)",
	constructor: {
		name: 'RowDataPacket',
	},
};

interface accountsTable extends RowDataPacket {
	id: string;
	accountid: string;
	active: string;
	accountname: string;
	accounttype: string;
	createddate: string;
	comments: string;
}

//If you add a new field that is substituting an old one, add it here
const newFieldcompatibility = [
	{ newfield: 'newFieldname', oldField: 'oldFiedName' },
  ];

  const databaseTables = [
	{"domains": domainsTableFields},
	{"lightning": lightningTableFields},
	{"mediafiles": mediafilesTableFields},
	{"mediatags": mediatagsTableFields},
	{"registered": registeredTableFields},
	{"transactions": transactionsTableFields},
	{"ledger": ledgerTableFields},
	{"accounts": accountsTableFields},
];


export {
	newFieldcompatibility,
	databaseTables
};	
	