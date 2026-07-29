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
	nsfw: string;
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
	filesize: "bigint unsigned NOT NULL DEFAULT 0",
	comments: "varchar(150)",
	checked: "boolean NOT NULL DEFAULT 0",
	// Reviewed and legal, but not for the shop window. Independent from
	// visibility (which belongs to the uploader): an nsfw file stays out of every
	// public listing even with visibility = 1, and is still served by direct URL.
	nsfw: "boolean NOT NULL DEFAULT 0",
	transactionid: "int(11)",
	localPath: "varchar(4)",
	banid: "int(11)",
	type: "varchar(15)",
	_indexes: [
		"INDEX idx_filename_hash_pubkey (filename, original_hash, pubkey)",
		"INDEX idx_filename (filename)",
		"INDEX idx_original_hash (original_hash)",
		"INDEX idx_filename_original_hash (filename, original_hash)",
		"INDEX idx_localPath (localPath)",
		"INDEX idx_checked (checked)",
		"INDEX idx_checked_active (checked, active)",
		"INDEX idx_public_id (active, visibility, checked, id)",
		// Public listings now carry a fourth flag. New name rather than a change
		// to idx_public_id: checkAndCreateIndexes only ever adds missing indexes,
		// it never redefines one that already exists.
		"INDEX idx_public_nsfw_id (active, visibility, checked, nsfw, id)",
		// Leading nsfw, for the moderation gallery bucket.
		"INDEX idx_nsfw (nsfw)",
		// The moderation gallery filters by uploader and by mimetype, and without
		// these two it scans the whole table for both.
		//
		// Simple and not composite with checked, on purpose. Every gallery query
		// ends in ORDER BY id DESC with an id keyset, and in InnoDB a secondary
		// index already carries the primary key as its row locator, so (pubkey) is
		// physically (pubkey, id) and the optimizer can use that suffix for the
		// ordering. Adding checked instead would help only the checked = 1 bucket:
		// "pending" filters checked <> 1 (an inequality, so nothing after it in the
		// index is usable) and the active / nsfw / banned buckets don't mention
		// checked at all. With three distinct values over ~280k rows its
		// selectivity after a pubkey equality is nil, so it would be a composite
		// that never pays for itself.
		//
		// mimetype is also queried as a prefix range (LIKE 'image/%'), and no
		// column after a range can be used either, which rules out
		// (mimetype, checked) for the filter that gets used most.
		//
		// Neither one overlaps what is already there: no existing index on this
		// table starts with pubkey or mimetype (idx_filename_hash_pubkey has pubkey
		// third, which a lookup cannot use).
		"INDEX idx_pubkey (pubkey)",
		"INDEX idx_mimetype (mimetype)"
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
	comments: "varchar(150)",
	checked: "boolean NOT NULL DEFAULT 0",
	balance: "int(11) NOT NULL DEFAULT 0",
	transactionid: "int(11)",
	banid: "int(11)",
	pendingotc: "boolean NOT NULL DEFAULT 0",
	_indexes: [
		"UNIQUE INDEX idx_pubkey_domain (pubkey, hex, domain)",
		"INDEX idx_hex (hex)"
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
	_indexes: [
		"INDEX idx_transactions_id (id)",
	],
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
	category: string;
	reason: string;
}

const bannedTableFields: BannedTableStructure = {
	"id" : "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	"active" : "boolean NOT NULL DEFAULT 1",
	"originid" : "varchar(11) NOT NULL",
	"origintable" : "varchar(50) NOT NULL",
	"createddate" : "bigint NOT NULL",
	// Why the ban exists, as one of a closed set: CSAM, ILLEGAL, VIOLENCE,
	// QUESTIONABLE, OTHER. Before this column the category lived inside the reason
	// text, which produced 32 spellings for five real categories (typos included)
	// and made grouping impossible.
	"category" : "varchar(20)",
	// Free comment, still optional. It no longer has to carry the category.
	"reason" : "varchar(150)",
	_indexes: [
		"INDEX idx_origin (originid, origintable, active)",
		// No index on category on purpose: the whole table is 488 rows and only
		// grows one moderation decision at a time, so filtering or grouping by it
		// is a scan of a few hundred rows. An index here would be rent paid for
		// nothing.
	],
	constructor: {
		name: 'RowDataPacket',
	},
}

/**
 * Audit trail of the life cycle of a record: one row per state change, saying
 * what happened, when (UTC), to which file or user, who did it (`actor`), where
 * the change came from (`source`) and what the value went from and to.
 *
 * Some of those events also have to reach the operator. Those carry `notified = 1`
 * and the delivery columns (`channel`, `status`, `attempts`, `lasterror`,
 * `sentdate`), which stay NULL on rows that are only audited. Notification is an
 * attribute of an event, not the reason the row exists.
 *
 * `payload` is the structured record of the event; on notifiable rows it holds
 * the exact bytes that were signed and sent, so the HMAC stays verifiable
 * afterwards.
 */
interface AuditlogTableStructure extends RowDataPacket{
	id: string;
	active: string;
	eventtype: string;
	origintable: string;
	originid: string;
	tenant: string;
	actor: string;
	source: string;
	pubkey: string;
	ip: string;
	filehash: string;
	previous_value: string;
	new_value: string;
	reason: string;
	payload: string;
	notified: string;
	channel: string;
	status: string;
	attempts: string;
	lasterror: string;
	createddate: string;
	sentdate: string;
}

const auditlogTableFields: AuditlogTableStructure = {
	"id" : "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	"active" : "boolean NOT NULL DEFAULT 1",
	"eventtype" : "varchar(50) NOT NULL",
	"origintable" : "varchar(50) NOT NULL",
	"originid" : "varchar(64) NOT NULL",
	"tenant" : "varchar(64)",
	"actor" : "varchar(64)",
	"source" : "varchar(20)",
	"pubkey" : "varchar(64)",
	"ip" : "varchar(64)",
	"filehash" : "varchar(64)",
	"previous_value" : "varchar(255)",
	"new_value" : "varchar(255)",
	"reason" : "varchar(255)",
	"payload" : "TEXT",
	"notified" : "boolean NOT NULL DEFAULT 0",
	"channel" : "varchar(20)",
	"status" : "varchar(10)",
	"attempts" : "int(11) NOT NULL DEFAULT 0",
	"lasterror" : "varchar(255)",
	"createddate" : "datetime NOT NULL",
	"sentdate" : "datetime",
	_indexes: [
		// Timeline of one record, and the prefix serves the per-record lookups.
		"INDEX idx_auditlog_origin_created (origintable, originid, createddate)",
		// The notification queue: leading notified keeps the audit-only rows,
		// which are the bulk of the table, out of the sweep entirely.
		"INDEX idx_auditlog_delivery (notified, status, createddate)",
		// "everything this pubkey did", the other half of an audit question.
		"INDEX idx_auditlog_actor_created (actor, createddate)",
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

interface FileTypesTableStructure extends RowDataPacket {
	id: string;
	active: string;
	original_mime : string;
	original_extension : string;
	converted_mime : string;
	converted_extension : string;
	comments: string;
}

const fileTypesTableFields: FileTypesTableStructure = {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	active: "boolean NOT NULL DEFAULT 1",
	original_mime: "varchar(64) NOT NULL",
	original_extension: "varchar(10) NOT NULL",
	converted_mime: "varchar(64) NOT NULL",
	converted_extension: "varchar(10) NOT NULL",
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
	tenantid: string;
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
	tenantid: "int(11) NOT NULL",
	comments: "varchar(150)",
	_indexes: [
		"INDEX idx_pubkey (pubkey)",
		"INDEX idx_kind_created_at (kind, created_at)",
		"INDEX idx_active_id (active, id)",
		"INDEX idx_created_at (created_at)",
		"INDEX idx_active (active)",
		"INDEX idx_active_checked (active, checked)",
		"INDEX idx_received_at (received_at)",
		"INDEX idx_active_created_event (active, created_at, event_id)"
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
		"INDEX idx_eventtags_event_id (event_id)",
		"INDEX idx_event_group (event_id, tag_name, tag_value(100))"

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
	preferences: "JSON NOT NULL",
	updated_at: "timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
	_indexes: [
		"INDEX idx_registered_id (registered_id)",],
	constructor: {
		name: 'RowDataPacket',
	},
};

interface TenantConfigStructure extends RowDataPacket {
	id: string;
	domainid: string;
	config: string;
	updated_at: string;
}

const tenantConfigTableFields : TenantConfigStructure= {
	id: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY",
	domainid: "int(11) NOT NULL UNIQUE",
	config: "JSON NOT NULL",
	updated_at: "timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
	_indexes: [
		"INDEX idx_domainid (domainid)",
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
	{"auditlog": auditlogTableFields},
	{"invitations": invitationsTableFields},
	{"ips": ipsTableFields},
	{"events": eventsTableFields},
	{"eventtags": eventTagsTableFields},
	{"userprefs": userPreferencesTableFields},
	{"eventmetadata": eventMetadataTableFields},
	{"filetypes": fileTypesTableFields},
	{"tenantconfig": tenantConfigTableFields},
	
];

export {
	newFieldcompatibility,
	databaseTables
};	
	