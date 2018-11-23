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
	addIndicators: function(indicators, kind, callback) {
		var stmt = this.dbConn.createStatement(
			"INSERT OR IGNORE INTO indicators(indicator,kind) VALUES(:indicator,:kind)"
		);
		if (Array.isArray(indicators)) {
			let params = stmt.newBindingParamsArray();
			for (let i = 0; i < indicators.length; i++) {
				let bp = params.newBindingParams();
				bp.bindByName("indicator", indicators[i]);
				bp.bindByName("kind", kind);
				params.addParams(bp);
			}
			stmt.bindParameters(params);
		} else {
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
	getEmailStatus: function(msgId) {
		var stmt = this.dbConn.createStatement(
			"SELECT status FROM emails WHERE message_id = :msgid"
		);
		stmt.params.msgid = msgId;
		if (!stmt.step()) {
			// no record found
			pdLogger.debug("getEmailStatus(" + msgId + "): null");
			return null;
		}
		// status not set yet
		if (stmt.row.status === null) {
			pdLogger.debug("getEmailStatus(" + msgId + "): {}");
			return {};
		}
		pdLogger.debug("getEmailStatus(" + msgId + "): " + stmt.row.status);
		return JSON.parse(stmt.row.status);
	},
	
	// set the PhishDetect status of an email
	// TODO: make SQL work
	setEmailStatus: function(msgId, stat) {
		var stmt = null;
		if (this.getEmailStatus(msgId) === null) {
			pdLogger.debug("setEmailStatus(" + msgId + ") -- insert: " + status);
			stmt = this.dbConn.createStatement(
				"INSERT INTO emails (message_id,status) VALUES(:msgid,:status)"
			);
		} else {
			pdLogger.debug("setEmailStatus(" + msgId + ") -- update: " + status);
			stmt = this.dbConn.createStatement(
				"UPDATE emails SET status = :status WHERE message_id = :msgid"
			);
		}
		stmt.params.msgid = msgId;
		stmt.params.status = JSON.stringify(stat);
		return stmt.execute();
	},

	// returns the database identifier for an email
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
				"INSERT OR IGNORE INTO emails(message_id) VALUES(:msgid)"
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
			"INSERT OR IGNORE INTO tags(raw,type,hash,indicator) "+
			"VALUES(:raw,:type,:hash,:indicator)"
		);
		stmt.params.raw = raw;
		stmt.params.type = type;
		stmt.params.hash = hash;
		stmt.params.indicator = indicator;
		stmt.execute();
		return this.getTagId(raw, type, hash, indicator, true);
	},

	// get the identifier of an email tag
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
			"INSERT OR IGNORE INTO email_tags(email,tag) VALUES(:email,:tag)"
		);
		stmt.params.email = emailId;
		stmt.params.tag = tagId;
		stmt.execute();
		return this.getEmailTagId(emailId, tagId, true);
	},
	
	// record incident:
	// an incident is the occurrence of an indicator in a context (like a
	// specific webpage or email).
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
				pdLogger.debug("recordIncident(" + tagId + ")");
				stmt.reset();
			}
		}
	},
	
	// get incidents from database
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
	
	// flag incident as reported
	setReported: function(id, val) {
		this.dbConn.executeSimpleSQL('UPDATE incidents SET reported = ' + val + ' WHERE id = ' + id)
	},

	/*******************************************************************
	 * PhishDetect database core functions
	 *******************************************************************/

	dbConn:			null,
	dbSchema:		null,
	initialized:	false,

	init: function() {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		this.dbSchema = {
			tables: {
				// TABLE indicators
				indicators:
					"id         INTEGER PRIMARY KEY,"+
					"indicator  VARCHAR(64) NOT NULL,"+
					"kind       INTEGER DEFAULT 0,"+
					"CONSTRAINT indicator_unique UNIQUE(indicator)",
					
				// TABLE emails
				emails:
					"id         INTEGER PRIMARY KEY,"+
					"message_id VARCHAR(255) NOT NULL,"+
					"status     VARCHAR(1024) DEFAULT NULL,"+
					"CONSTRAINT email_unique UNIQUE(message_id)",

				// TABLE tags
				tags:
					"id         INTEGER PRIMARY KEY,"+
					"raw        VARCHAR(1024) NOT NULL,"+
					"hash       VARCHAR(64),"+
					"indicator  INTEGER DEFAULT NULL,"+
					"type       VARCHAR(32) NOT NULL,"+
					"CONSTRAINT tag_unique UNIQUE(raw,type),"+
					"FOREIGN KEY(indicator) REFERENCES indicators(id)",
					
				// TABLE email_tags
				email_tags:
					"id         INTEGER PRIMARY KEY,"+
					"email      INTEGER NOT NULL,"+
					"tag        INTEGER NOT NULL,"+
					"CONSTRAINT email_tag_unique UNIQUE(email,tag),"+
					"FOREIGN KEY(email) REFERENCES emails(id),"+
					"FOREIGN KEY(tag) REFERENCES tags(id)",
					
				// TABLE incidents
				incidents:
					"id            INTEGER PRIMARY KEY,"+
					"timestamp     INTEGER NOT NULL," +
					"email_tag     INTEGER NOT NULL,"+
					"reported      INTEGER DEFAULT 0,"+
					"FOREIGN KEY(email_tag) REFERENCES email_tags(id),"+
					"CONSTRAINT incident_unique UNIQUE(email_tag)",
			},
			views: {
				n_incidents:
					"CREATE VIEW v_incidents AS SELECT " +
						"inc.id AS id," +
						"inc.timestamp AS timestamp," +
						"tag.raw AS raw," +
						"tag.type AS type," +
						"ind.indicator AS indicator," +
						"ind.kind AS kind," +
						"email.message_id AS context," +
						"inc.reported AS reported " +
					"FROM "+
						"incidents inc, indicators ind, tags tag, "+
						"emails email, email_tags et " +
					"WHERE "+
						"inc.email_tag = et.id AND "+
						"et.email = email.id AND "+
						"et.tag = tag.id AND "+
						"tag.indicator = ind.id"
			}
		};
		
		var dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
		var dbFile = dirService.get("ProfD", Ci.nsIFile);
		dbFile.append("phishdetect.sqlite");

		var dbService = Cc["@mozilla.org/storage/service;1"].getService(Ci.mozIStorageService);
		var dbConn;

		if (!dbFile.exists()) {
			dbConn = this._dbCreate(dbService, dbFile);
		} else {
			dbConn = dbService.openDatabase(dbFile);
		}
		this.dbConn = dbConn;
	},
	
	executeSimpleSQL: function(stmt) {
		this.dbConn.executeSimpleSQL(stmt);
	},

	_dbCreate: function(aDBService, aDBFile) {
		var dbConn = aDBService.openDatabase(aDBFile);
		this._dbCreateTables(dbConn);
		this._dbCreateViews(dbConn);
		return dbConn;
	},

	_dbCreateTables: function(adbConn) {
		for (let name in this.dbSchema.tables) {
			adbConn.createTable(name, this.dbSchema.tables[name]);
		}
	},

	_dbCreateViews: function(adbConn) {
		for (let name in this.dbSchema.views) {
			adbConn.executeSimpleSQL(this.dbSchema.views[name]);
		}
	},
};
