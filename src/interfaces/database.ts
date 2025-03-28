import { RowDataPacket } from "mysql2";

interface DomainsTableStructure extends RowDataPacket{
	id: string;
	domain: string;
	active: string;
	checked: string;
	requireinvite: string;
	requirepayment: string;
	maxsatoshi: string;
	comments: string;
}

const domainsTableFields : DomainsTableStructure = {
	"id" : "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	"domain" : "varchar(50) NOT NULL",
	"active" : "boolean NOT NULL DEFAULT 0",
	"checked" : "boolean NOT NULL DEFAULT 0",
	"requireinvite" : "boolean NOT NULL DEFAULT 0",
	"requirepayment" : "boolean NOT NULL DEFAULT 0",
	"maxsatoshi" : "int(11) NOT NULL DEFAULT 0",
	"comments" : "varchar(150)",
	constructor: {
		name: 'RowDataPacket',
	},
} 

interface LightningTableStructure extends RowDataPacket {
	id: string;
	active : string;
	checked: string;
	pubkey: string;
	lightningaddress: string;
	comments: string;
}

const lightningTableFields: LightningTableStructure = {
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

interface MediafilesTableStructure extends RowDataPacket {
	id: string;
	pubkey: string;
	filename: string;
	mimetype: string;
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
	banid: string;
	type: string;
}

const mediafilesTableFields: MediafilesTableStructure = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	pubkey: "varchar(64) NOT NULL",
	filename: "varchar(128) NOT NULL",
	mimetype: "varchar(64) NOT NULL",
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
	banid: "int(11)",
	type: "varchar(15)",
	_indexes: [
		"INDEX idx_filename_hash_pubkey (filename, original_hash, pubkey)",
		"INDEX idx_filename (filename)",
		"INDEX idx_original_hash (original_hash)",
		"INDEX idx_filename_original_hash (filename, original_hash)",
		"INDEX idx_localpath (localpath)"
	],
	constructor: {
		name: 'RowDataPacket',
	},
};

interface MediatagsTableStructure extends RowDataPacket {
	id: string;
	fileid: string;
	tag: string;
}

const mediatagsTableFields: MediatagsTableStructure = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	fileid: "int(11) NOT NULL",
	tag: "varchar(64) NOT NULL",
	constructor: {
		name: 'RowDataPacket',
	},
};

interface RegisteredTableStructure extends RowDataPacket{
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
	banid: string;
	pendingotc: string;
}

const registeredTableFields: RegisteredTableStructure = {
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
	banid: "int(11)",
	pendingotc: "boolean NOT NULL DEFAULT 0",
	_indexes: [
		"UNIQUE INDEX idx_pubkey_domain (pubkey, hex, domain)" 
	],
	constructor: {
		name: 'RowDataPacket',
	},
};

interface TransactionsTableStructure extends RowDataPacket {
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

const transactionsTableFields: TransactionsTableStructure = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	type: "varchar(10) NOT NULL",
	accountid: "varchar(12) NOT NULL",
	paymentrequest: "varchar(1637)",
	paymenthash: "varchar(64)",
	satoshi: "int(11) NOT NULL",
	paid: "boolean NOT NULL DEFAULT 0",
	preimage: "varchar(64)",
	createddate: "datetime NOT NULL",
	expirydate: "datetime NOT NULL",
	paiddate: "datetime",
	comments: "varchar(150)",
	constructor: {
		name: 'RowDataPacket',
	},
};

interface LedgerTableStructure extends RowDataPacket {
	id: string;
	accountid: string;
	transactionid : string;
	debit: string;
	credit: string;
	createddate: string;
	comments: string;
}

const ledgerTableFields: LedgerTableStructure = {
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

interface AccountsTableStructure extends RowDataPacket {
	id: string;
	accountid: string;
	active: string;
	accountname: string;
	accounttype: string;
	createddate: string;
	comments: string;
}

const accountsTableFields: AccountsTableStructure = {
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


interface BannedTableStructure extends RowDataPacket{
	id: string;
	active: string;
	originid: string;
	origintable: string
	createddate: string;
	reason: string;
}

const bannedTableFields: BannedTableStructure = {
	"id" : "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	"active" : "boolean NOT NULL DEFAULT 1",
	"originid" : "varchar(11) NOT NULL",
	"origintable" : "varchar(50) NOT NULL",
	"createddate" : "bigint NOT NULL",
	"reason" : "varchar(150)",
	_indexes: [
		"INDEX idx_origin (originid, origintable, active)"
	],
	constructor: {
		name: 'RowDataPacket',
	},
}

interface IpsTableStructure extends RowDataPacket {
	id: string;
	active: string;
	checked: string;
	ip: string;
	firstseen: string;
	lastseen: string;
	reqcount: string;
	infractions: string;
	comments: string;
}

const ipsTableFields: IpsTableStructure = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	active: "boolean NOT NULL DEFAULT 1",
	checked: "boolean NOT NULL DEFAULT 0",
	ip: "varchar(64) NOT NULL UNIQUE",
	firstseen: "BIGINT NOT NULL",
	lastseen: "BIGINT NOT NULL",
	reqcount: "int(11) NOT NULL DEFAULT 0",
	infractions: "int(11) NOT NULL DEFAULT 0",
	comments: "varchar(150)",
	constructor: {
		name: 'RowDataPacket',
	},
};

interface InvitationsTableStructure extends RowDataPacket {
	id: string;
	active: string;
	code: string;
	originid: string;
	inviteeid: string;
	createdate: string;
	inviteedate: string;
	comments: string;
}

const invitationsTableFields: InvitationsTableStructure = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	active: "boolean NOT NULL DEFAULT 1",
	code: "varchar(32) NOT NULL",
	originid: "int(11) NOT NULL",
	inviteeid: "int(11)",
	createdate: "datetime NOT NULL",
	inviteedate: "datetime",
	comments: "varchar(150)",
	constructor: {
		name: 'RowDataPacket',
	},
};

interface EventsTableStructure extends RowDataPacket {
	id: string;
	active: string;
	checked: string;
	event_id: string;
	pubkey: string;
	kind: string;
	created_at: string;
	content: string;
	sig: string;
	received_at: string;
	comments: string;
}

const eventsTableFields: EventsTableStructure = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	active: "boolean NOT NULL DEFAULT 1",
	checked: "boolean NOT NULL DEFAULT 0",
	event_id: "varchar(64) NOT NULL UNIQUE",
	pubkey: "varchar(64) NOT NULL",
	kind: "int(11) NOT NULL",
	created_at: "BIGINT NOT NULL",
	content: "TEXT",
	sig: "varchar(128) NOT NULL",
	received_at: "BIGINT NOT NULL",
	comments: "varchar(150)",
	_indexes: [
		"INDEX idx_pubkey (pubkey)",
		"INDEX idx_kind_created_at (kind, created_at)",
		"INDEX idx_active_id (active, id)",
		"INDEX idx_created_at (created_at)",
		"INDEX idx_active (active)",
	],
	constructor: {
		name: 'RowDataPacket',
	},
};

interface EventTagsTableStructure extends RowDataPacket {
	id: string;
	event_id: string;
	tag_name: string;
	tag_value: string;
	position: string;
	extra_values: string;
}

const eventTagsTableFields: EventTagsTableStructure = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	event_id: "varchar(64) NOT NULL",
	tag_name: "varchar(64) NOT NULL",
	tag_value: "varchar(512) NOT NULL",
	position: "int(11) NOT NULL DEFAULT 0",
	extra_values: "TEXT",
	_indexes: [
		"INDEX idx_event_id (event_id)",
		"INDEX idx_tag_name_value (tag_name, tag_value(100))",
		"INDEX idx_eventtags_event_id (event_id)"

	],
	constructor: {
		name: 'RowDataPacket',
	},
};

interface EventMetadataTableStructure extends RowDataPacket {
    id: string;
    event_id: string;
    metadata_type: string;  
    metadata_value: string;
    position: string;
    extra_data: string; 
    created_at: string;
}

const eventMetadataTableFields: EventMetadataTableStructure = {
    id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
    event_id: "varchar(64) NOT NULL",
    metadata_type: "varchar(32) NOT NULL",
    metadata_value: "varchar(512) NOT NULL",
    position: "int(11) NOT NULL DEFAULT 0",
    extra_data: "JSON",
    created_at: "BIGINT NOT NULL",
    _indexes: [
        "INDEX idx_event_id (event_id)",
        "INDEX idx_metadata_type_value (metadata_type, metadata_value(100))",
        "INDEX idx_metadata_created (created_at)",
        "INDEX idx_compound (event_id, metadata_type, metadata_value(100))"
    ],
    constructor: {
        name: 'RowDataPacket',
    },
};

interface UserPrefsTableStructure extends RowDataPacket {
	id: string;
	registered_id: string;
	preferences: string;
	updated_at: string;
  }
  
const userPreferencesTableFields: UserPrefsTableStructure = {
id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
registered_id: "int(11) NOT NULL UNIQUE",
preferences: "JSON NOT NULL DEFAULT '{}'",
updated_at: "timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
_indexes: [
	"INDEX idx_registered_id (registered_id)"
],
constructor: {
	name: 'RowDataPacket',
},
};

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
	{"banned": bannedTableFields},
	{"invitations": invitationsTableFields},
	{"ips": ipsTableFields},
	{"events": eventsTableFields},
	{"eventtags": eventTagsTableFields},
	{"userprefs": userPreferencesTableFields},
	{"eventmetadata": eventMetadataTableFields},
];

interface DatabaseView {
	viewName: string;
	createStatement: string;
}

const vRegisteredView: DatabaseView =  {
    viewName: "vregistered",
    createStatement: `
		CREATE OR REPLACE VIEW vregistered AS
		SELECT 
		r.id,
		IF(b.id IS NOT NULL, 1, 0) AS banned,
		r.checked,
		r.active,
		r.allowed,
		r.pendingotc,
		r.username,
		r.balance,
		IF(t.paid IS NOT NULL, 1, 0) AS paid,
		t.satoshi,
		r.transactionid,
		r.pubkey,
		r.hex,
		r.domain,
		DATE_FORMAT(r.date, '%Y-%m-%d %H:%i') AS date,
		r.comments
		FROM registered r
		LEFT JOIN banned b ON b.originid = r.id 
							AND b.origintable = 'registered'
							AND b.active = 1
		LEFT JOIN transactions t ON r.transactionid = t.id;
    `
};

const vFilesView: DatabaseView =  {
	viewName: "vfiles",
	createStatement: `
		CREATE OR REPLACE VIEW vfiles AS
		SELECT 
			mf.id,
			IF(b.id IS NOT NULL, 1, 0) AS banned,
			mf.checked,
			mf.active,
			mf.visibility,
			t.paid,
			t.satoshi,
			mf.transactionid,
			r.username,
			r.pubkey AS npub,
			mf.pubkey,
			mf.filename,
			mf.mimetype,
			mf.original_hash,
			mf.hash,
			mf.status,
			mf.dimensions,
			ROUND(mf.filesize / 1024 / 1024, 2) AS filesize,
			DATE_FORMAT(mf.date, '%Y-%m-%d %H:%i') AS date,
			mf.comments
		FROM mediafiles mf
		LEFT JOIN banned b 
			ON b.originid = mf.id 
			AND b.origintable = 'mediafiles'
			AND b.active = 1
		LEFT JOIN transactions t 
			ON mf.transactionid = t.id
		LEFT JOIN registered r 
			ON mf.pubkey = r.hex;
	`
};

const vBannedView: DatabaseView =  {
	viewName: "vbanned",
	createStatement: `
		CREATE OR REPLACE VIEW vbanned AS
		SELECT 
			b.id,
			b.active,
			b.originid,
			b.origintable,
			COALESCE(mf.filename, r.hex, i.ip) AS originkey,
			b.createddate,
			b.reason
		FROM banned b
		LEFT JOIN mediafiles mf 
			ON b.originid = mf.id 
			AND b.origintable = 'mediafiles'
		LEFT JOIN registered r 
			ON b.originid = r.id 
			AND b.origintable = 'registered'
		LEFT JOIN ips i 
			ON b.originid = i.id 
			AND b.origintable = 'ips'`
};


const vIpsView: DatabaseView =  {
	viewName: "vips",
	createStatement: `
		CREATE OR REPLACE VIEW vips AS
		SELECT 
			i.id,
			IF(b.id IS NOT NULL, 1, 0) AS banned,
			i.active,
			i.checked,
			i.ip,
			DATE_FORMAT(FROM_UNIXTIME(i.firstseen / 1000), '%Y-%m-%d %H:%i') AS firstseen,
			DATE_FORMAT(FROM_UNIXTIME(i.lastseen / 1000), '%Y-%m-%d %H:%i') AS lastseen,
			i.reqcount,
			i.infractions,
			i.comments
		FROM ips i
		LEFT JOIN banned b 
			ON b.originid = i.id 
			AND b.origintable = 'ips'
			AND b.active = 1;`
};

const vEventsView: DatabaseView = {
	viewName: "vevents",
	createStatement: `
		CREATE OR REPLACE VIEW vevents AS
		SELECT 
			e.id,
			e.active,
			e.checked,
			IF(b.id IS NOT NULL, 1, 0) AS banned,
			e.event_id,
			e.pubkey,
			e.kind,
			COALESCE(et.tags, '') AS tags,
			e.content,
			e.created_at,
			e.received_at,
			e.comments
		FROM events e
		LEFT JOIN banned b 
			ON b.originid = e.id 
			AND b.origintable = 'events'
			AND b.active = 1
		LEFT JOIN (
			SELECT 
				event_id, 
				GROUP_CONCAT(CONCAT(tag_name, ' : ', tag_value) SEPARATOR ', ') AS tags
			FROM eventtags
			GROUP BY event_id
		) et 
			ON e.event_id = et.event_id;`
};

const databaseViews: DatabaseView[] = [
	vRegisteredView,
	vFilesView,
	vBannedView,
	vIpsView,
	vEventsView
];

export {
	newFieldcompatibility,
	databaseTables,
	databaseViews
};	
	