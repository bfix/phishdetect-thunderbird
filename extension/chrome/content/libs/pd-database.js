/*
 * ============================================================================
 * PhishDetect database handling
 * ============================================================================
 * (c) 2018 Bernd Fix   >Y<
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public
 * License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var pdDatabase = {

	/*******************************************************************
	 * PhishDetect database abstraction
	 *******************************************************************/
		
	// add a list of (or a single) indicator to the database
	// @returns nothing
	addIndicators: function(indicators, kind, callback) {
		var stmt = this.dbConn.createStatement(
			"INSERT OR IGNORE INTO indicators(indicator,kind) VALUES(:indicator,:kind)"
		);
		if (Array.isArray(indicators)) {
			// process list of indicators
			let params = stmt.newBindingParamsArray();
			for (let i = 0; i < indicators.length; i++) {
				let bp = params.newBindingParams();
				bp.bindByName("indicator", indicators[i]);
				bp.bindByName("kind", kind);
				params.addParams(bp);
			}
			stmt.bindParameters(params);
		} else {
			// process single indicator
			logger.debug("addIndicators(): " + indicators);
			stmt.params.list = indicators;
		}
		stmt.executeAsync({
			handleError: function(aError) {
				callback(-1, aError.message);
			},
			handleCompletion: function(aReason) {
				let msg = "DONE";
				if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED)
					msg = "CANCELED";
				callback(1, msg);
			}
		});
	},
	
	// check if an indicator exists in the database:
	// @returns {int} database id (or 0 if not found)
	hasIndicator: function(indicator) {
		var stmt = this.dbConn.createStatement(
			"SELECT id,kind FROM indicators WHERE indicator = :indicator"
		);
		stmt.params.indicator = indicator;
		if (stmt.step()) {
			return stmt.row.id;
		}
		return 0;
	},
	
	// get the PhishDetect status of an email
	// @returns {Object} or null if not in database
	getEmailStatus: function(msgId) {
		// check for valid message id
		if (msgId === null || msgId.length == 0) {
			return null;
		}
		var stmt = this.dbConn.createStatement(
			"SELECT timestamp,status FROM emails WHERE message_id = :msgid"
		);
		stmt.params.msgid = msgId;
		if (!stmt.step()) {
			// no record found
			pdLogger.debug("getEmailStatus(" + msgId + "): null");
			return null;
		}
		pdLogger.debug("getEmailStatus(" + msgId + "): " + stmt.row.status);
		return {
			status: stmt.row.status,
			date: stmt.row.timestamp,
		}
	},
	
	// set the PhishDetect status of an email
	// @returns {bool} success?
	setEmailStatus: function(msgId, rc) {
		// check for valid message id
		if (msgId === null || msgId.length == 0) {
			return false;
		}
		var stmt = null;
		if (this.getEmailStatus(msgId) === null) {
			pdLogger.debug("setEmailStatus(" + msgId + ") -- insert: " + rc);
			stmt = this.dbConn.createStatement(
				"INSERT INTO emails (message_id,status,timestamp) " +
				"VALUES(:msgid,:status,:ts)"
			);
		} else {
			pdLogger.debug("setEmailStatus(" + msgId + ") -- update: " + rc);
			stmt = this.dbConn.createStatement(
				"UPDATE emails SET status = :status, timestamp = :ts " +
				"WHERE message_id = :msgid"
			);
		}
		stmt.params.msgid = msgId;
		stmt.params.ts = rc.date;
		stmt.params.status = rc.status;
		return stmt.execute();
	},

	// returns the database identifier for an email
	// @returns {int} database id (or 0 on error)
	getEmailId: function(msgId, isRetry) {
		try {
			// check if the email record exists. if so, return the id
			var stmt = this.dbConn.createStatement(
				"SELECT id FROM emails WHERE message_id = :msgid"
			);
			stmt.params.msgid = msgId;
			if (stmt.step()) {
				return stmt.row.id;
			}
			// sanity check
			if (isRetry !== undefined) {
				pdLogger.error("getEmailId() recursion");
				return 0;
			}
			// insert new record into the table
			stmt = this.dbConn.createStatement(
				"INSERT INTO emails(message_id) VALUES(:msgid)"
			);
			stmt.params.msgid = msgId;
			stmt.execute();
			return this.getEmailId(msgId, true);
		}
		catch(e) {
			pdLogger.error("getEmailId() failed: " + e);
			return 0;
		}
	},
	
	// get the identifier of an tag
	// @returns {int} database id (or 0 on error)
	getTagId: function(raw, type, hash, indicator, isRetry) {
		// check if the tag record exists. if so, return the id
		var stmt = this.dbConn.createStatement(
			"SELECT id FROM tags WHERE raw = :raw AND type = :type"
		);
		stmt.params.raw = raw;
		stmt.params.type = type;
		if (stmt.step()) {
			return stmt.row.id;
		}
		// sanity check
		if (isRetry !== undefined) {
			pdLogger.error("getTagId() recursion");
			return 0;
		}
		// insert new record into the table
		stmt = this.dbConn.createStatement(
			"INSERT INTO tags(raw,type,hash,indicator) "+
			"VALUES(:raw,:type,:hash,:indicator)"
		);
		stmt.params.raw = raw;
		stmt.params.type = type;
		stmt.params.hash = hash;
		stmt.params.indicator = indicator;
		stmt.execute();
		return this.getTagId(raw, type, hash, indicator, true);
	},
	
	// get a list of tags that are not resolved to indicators yet
	// @returns {[]tag} list of pending tags
	getPendingTags: function() {
		var stmt = null;
		var result = [];
		try {
			stmt = this.dbConn.createStatement(
				"SELECT id, hash FROM tags WHERE indicator = 0"
			);
			while (stmt.executeStep()) {
				result.push({
					id: stmt.row.id,
					hash: stmt.row.hash
				});
			}
		}
		catch(e) {
			pdLogger.error("getPendingTags(): " + e);
		}
		finally {
			if (stmt !== null) {
				stmt.reset();
			}
		}
		return result;
	},
	
	// set the associated indicator reference for a tag
	resolveTagIndicator: function(tagId, indicatorId) {
		stmt = this.dbConn.createStatement(
			'UPDATE tags SET indicator = :indId WHERE id = :tagId'
		);
		stmt.params.tagId = tagId;
		stmt.params.indId = indicatorId;
		return stmt.execute();
	},
	
	// get all emails with a given tag
	getEmailsWithTag: function(tagId) {
		var stmt = null;
		var result = [];
		try {
			stmt = this.dbConn.createStatement(
				"SELECT id, message_id FROM v_email_tags WHERE tag_id = :tag_id"
			);
			stmt.params.tag_id = tagId;
			while (stmt.executeStep()) {
				result.push({
					id: stmt.row.id,
					message_id: stmt.row.message_id
				});
			}
		}
		catch(e) {
			pdLogger.error("getEmailsWithTag(): " + e);
		}
		finally {
			if (stmt !== null) {
				stmt.reset();
			}
		}
		return result;
	},

	// get the identifier of an email tag
	// @returns {int} database id (or 0 on error)
	getEmailTagId: function(emailId, tagId, isRetry) {
		// check if the email_tag record exists. if so, return the id
		var stmt = this.dbConn.createStatement(
			"SELECT id FROM email_tags WHERE email = :email AND tag = :tag"
		);
		stmt.params.email = emailId;
		stmt.params.tag = tagId;
		if (stmt.step()) {
			return stmt.row.id;
		}
		// sanity check
		if (isRetry !== undefined) {
			pdLogger.error("getEmailTagId() recursion");
			return 0;
		}
		// insert new record into the table
		stmt = this.dbConn.createStatement(
			"INSERT INTO email_tags(email,tag) VALUES(:email,:tag)"
		);
		stmt.params.email = emailId;
		stmt.params.tag = tagId;
		stmt.execute();
		return this.getEmailTagId(emailId, tagId, true);
	},
	
	// record incident:
	// an incident is the occurrence of an indicator in a context (like a
	// specific webpage or email).
	// @returns nothing
	recordIncident: function(emailTagId) {
		var stmt = null;
		try {
			stmt = this.dbConn.createStatement(
				"INSERT OR IGNORE INTO incidents(timestamp,email_tag) " +
				"VALUES(:ts,:email_tag)"
			);
			stmt.params.ts = Date.now();
			stmt.params.email_tag = emailTagId;
			stmt.execute();
		}
		catch(e) {
			pdLogger.error("recordIncident(): " + e);
		}
		finally {
			if (stmt !== null) {
				pdLogger.debug("recordIncident(" + emailTagId + ")");
				stmt.reset();
			}
		}
	},
	
	// get incidents from database
	// @returns {[]Object} list of incidents
	getIncidents: function(unreported) {
		// combine tables to retrieve records
		var sql =
			"SELECT "+
				"id, timestamp, raw, type, indicator, kind, context, reported " +
			"FROM v_incidents";
		// restrict search for unreported incidents
		if (unreported) {
			sql += " WHERE reported = 0";
		}
		var stmt = this.dbConn.createStatement(sql);
		// get records
		var result = [];
		try {
			while (stmt.executeStep()) {
				result.push({
					id: stmt.row.id,
					timestamp: stmt.row.timestamp,
					raw: stmt.row.raw,
					indicator: stmt.row.indicator,
					type: stmt.row.type,
					kind: stmt.row.kind,
					context: stmt.row.context,
				});
			}
		}
		finally {
			stmt.reset();
		}
		return result;
	},
	
	// get indications for a given email
	// @returns {[]Object} list of indications
	getIndications: function(msgId) {
		// combine tables to retrieve records
		var stmt = this.dbConn.createStatement(
			"SELECT id,reported,raw,type FROM v_indications WHERE message_id = :msgid"
		);
		stmt.params.msgid = msgId;
		// get records
		var result = [];
		try {
			while (stmt.executeStep()) {
				result.push({
					id: stmt.row.id,
					reported: stmt.row.reported,
					raw: stmt.row.raw,
					type: stmt.row.type,
				});
			}
		}
		finally {
			stmt.reset();
		}
		return result;
	},
	
	// flag incident as reported
	// @returns nothing
	setReported: function(id, val) {
		stmt = this.dbConn.createStatement(
			'UPDATE incidents SET reported = :flag WHERE id = :id'
		);
		stmt.params.id = id;
		stmt.params.flag = val;
		return stmt.execute();
	},

	/*******************************************************************
	 * PhishDetect database core functions
	 *******************************************************************/

	dbConn:			null,	// database connection
	dbSchema:		null,	// database schema
	initialized:	false,	// initialized instance?

	// initialize the database
	init: function() {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		this.dbSchema = {
			tables: {
				// TABLE indicators
				indicators:
					"id            INTEGER PRIMARY KEY," +
					"indicator     VARCHAR(64) NOT NULL," +
					"kind          INTEGER DEFAULT 0," +
					"CONSTRAINT indicator_unique UNIQUE(indicator)",
					
				// TABLE emails
				emails:
					"id            INTEGER PRIMARY KEY," +
					"message_id    VARCHAR(255) NOT NULL," +
					"timestamp     INTEGER DEFAULT 0," +
					"status        INTEGER DEFAULT 0," +
					"CONSTRAINT email_unique UNIQUE(message_id)",

				// TABLE tags
				tags:
					"id            INTEGER PRIMARY KEY," +
					"raw           VARCHAR(1024) NOT NULL," +
					"hash          VARCHAR(64)," +
					"indicator     INTEGER DEFAULT NULL," +
					"type          VARCHAR(32) NOT NULL," +
					"CONSTRAINT tag_unique UNIQUE(raw,type)," +
					"FOREIGN KEY(indicator) REFERENCES indicators(id)",
					
				// TABLE email_tags
				email_tags:
					"id            INTEGER PRIMARY KEY," +
					"email         INTEGER NOT NULL," +
					"tag           INTEGER NOT NULL," +
					"CONSTRAINT email_tag_unique UNIQUE(email,tag)," +
					"FOREIGN KEY(email) REFERENCES emails(id)," +
					"FOREIGN KEY(tag) REFERENCES tags(id)",
					
				// TABLE incidents
				incidents:
					"id            INTEGER PRIMARY KEY," +
					"timestamp     INTEGER NOT NULL,"  +
					"email_tag     INTEGER NOT NULL," +
					"reported      INTEGER DEFAULT 0," +
					"FOREIGN KEY(email_tag) REFERENCES email_tags(id)," +
					"CONSTRAINT incident_unique UNIQUE(email_tag)",
			},
			views: {
				v_incidents:
					"CREATE VIEW v_incidents AS SELECT " +
						"inc.id AS id," +
						"inc.timestamp AS timestamp," +
						"tag.raw AS raw," +
						"tag.type AS type," +
						"ind.indicator AS indicator," +
						"ind.kind AS kind," +
						"email.message_id AS context," +
						"inc.reported AS reported " +
					"FROM " +
						"incidents inc, indicators ind, tags tag, "+
						"emails email, email_tags et " +
					"WHERE " +
						"inc.email_tag = et.id AND " +
						"et.email = email.id AND " +
						"et.tag = tag.id AND " +
						"tag.indicator = ind.id;",
						
				v_indications:
					"CREATE VIEW v_indications AS SELECT " +
						"inc.id AS id," +
						"inc.reported AS reported," +
						"email.message_id AS message_id," +
						"tag.raw AS raw," +
						"tag.type AS type " +
					"FROM " +
						"tags tag, emails email, " +
						"email_tags et, incidents inc " +
					"WHERE " +
						"et.id = inc.email_tag AND " +
						"et.email = email.id AND "+
						"et.tag = tag.id;",
					
				v_email_tags:
					"CREATE VIEW v_email_tags AS SELECT " +
						"et.id AS id," +
						"t.id AS tag_id," +
						"e.message_id AS message_id " +
					"FROM " +
						"email_tags et," +
						"emails e," +
						"tags t " +
					"WHERE " +
						"et.tag = t.id AND " +
						"et.email = e.id;"	
			}
		};

		// get handle to database file (in profile folder)
		var dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
		var dbFile = dirService.get("ProfD", Ci.nsIFile);
		dbFile.append("phishdetect.sqlite");

		// create or open the database
		var dbService = Cc["@mozilla.org/storage/service;1"].getService(Ci.mozIStorageService);
		var doCreate = !dbFile.exists(); 
		this.dbConn = dbService.openDatabase(dbFile);
		if (doCreate) {
			let name = "";
			// create tables
			for (name in this.dbSchema.tables) {
				this.dbConn.createTable(name, this.dbSchema.tables[name]);
			}
			// create views
			for (name in this.dbSchema.views) {
				this.dbConn.executeSimpleSQL(this.dbSchema.views[name]);
			}
		}
	}
};
