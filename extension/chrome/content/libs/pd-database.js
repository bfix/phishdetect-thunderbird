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
	// returns a list of occurrences (same indicator for different kinds like
	// domain, emails,...) or an empty list if the indicator is not found.
	hasIndicator: function(indicator) {
		var stmt = this.dbConn.createStatement(
			"SELECT id,kind FROM indicators WHERE indicator = :indicator"
		);
		try {
			stmt.params.indicator = indicator;
			let result = [];
			while (stmt.executeStep()) {
				result.push({ id:stmt.row.id, kind: stmt.row.kind });
			}
			return result;
		}
		finally {
			stmt.reset();
		}
		return null;
	},
	
	// get the PhishDetect status of an email
	// 0 = unchecked, 1 = positive, -1 = negative
	getEmailStatus: function(msgId) {
		var stmt = this.dbConn.createStatement(
			"SELECT count(i.id) AS count FROM incidents i, email_tags t, emails e "+
			"WHERE e.id = t.email AND t.id = i.email_tag AND e.message_id = :msgid"
		);
		stmt.params.msgid = msgId;
		if (!stmt.step()) {
			return 0;
		}
		return (stmt.row.count > 0 ? 1 : -1);
	},

	// returns the database identifier for an email
	getEmailId: function(id, label) {
		// check if the email record exists. if so, return the id
		var stmt = this.dbConn.createStatement(
			"SELECT id FROM emails WHERE message_id = :msgid"
		);
		stmt.params.msgid = id;
		if (stmt.step()) {
			return stmt.row.id;
		}
		// insert new record into the table
		stmt = this.dbConn.createStatement(
			"INSERT OR IGNORE INTO emails(message_id,label) VALUES(:msgid,:label)"
		);
		stmt.params.msgid = id;
		stmt.params.label = label;
		stmt.execute();
		return this.getEmailId(id, label);		
	},
	
	// get the identifier of an email tag
	getTagId: function(emailId, raw, hash, indicator, type) {
		// check if the tag record exists. if so, return the id
		var stmt = this.dbConn.createStatement(
			"SELECT id FROM email_tags WHERE "+
			"email = :email AND raw = :raw AND type = :type"
		);
		stmt.params.email = emailId;
		stmt.params.raw = raw;
		stmt.params.type = type;
		if (stmt.step()) {
			return stmt.row.id;
		}
		// insert new record into the table
		stmt = this.dbConn.createStatement(
			"INSERT OR IGNORE INTO email_tags(email,type,raw,hash,indicator) "+
			"VALUES(:email,:type,:raw,:hash,:indicator)"
		);
		stmt.params.email = emailId;
		stmt.params.type = type;
		stmt.params.raw = raw;
		stmt.params.hash = hash;
		stmt.params.indicator = indicator;
		stmt.execute();
		return this.getTagId(emailId, raw, hash, indicator, type);
	},

	// record incident:
	// an incident is the occurrence of an indicator in a context (like a
	// specific webpage or email).
	recordIncident: function(tagId) {
		var stmt = null;
		try {
			stmt = this.dbConn.createStatement(
				"INSERT OR IGNORE INTO incidents(timestamp,email_tag) VALUES(:ts,:tag)"
			);
			stmt.params.ts = Date.now();
			stmt.params.tag = tagId;
			stmt.execute();
		}
		catch(e) {
			pdLogger.error(e);
			stmt = null;
		}
		finally {
			if (stmt !== null) {
				pdLogger.log("recordIncident(" + tagId + ")");
				stmt.reset();
			}
		}
	},
	
	// get incidents from database
	getIncidents: function(unreported) {
		// combine tables to retrieve records
		var sql = "SELECT " +
			"inc.id AS id," +
			"inc.timestamp AS timestamp," +
			"tag.raw AS raw," +
			"ind.indicator AS indicator," +
			"tag.type AS type," +
			"ind.kind AS kind," +
			"email.message_id AS context_id," +
			"email.label AS context_label," +
			"inc.reported AS reported " +
			"FROM incidents inc, indicators ind, email_tags tag, emails email " +
			"WHERE inc.email_tag = tag.id AND tag.email = email.id AND tag.indicator = ind.id";
		// restrict search for unreported incidents
		if (unreported) {
			sql += " AND inc.reported = 0";
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
					context_id: stmt.row.context_id,
					context_label: stmt.row.context_label
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
				// TABLE emails
				emails:
					"id         INTEGER PRIMARY KEY,"+
					"message_id VARCHAR(255) NOT NULL,"+
					"label      VARCHAR(255) NOT NULL,"+
					"CONSTRAINT email_unique UNIQUE(message_id)",

				// TABLE indicators
				indicators:
					"id         INTEGER PRIMARY KEY,"+
					"indicator  VARCHAR(64) NOT NULL,"+
					"kind       INTEGER DEFAULT 0,"+
					"CONSTRAINT indicator_unique UNIQUE(indicator,kind)",
					
				// TABLE email_tags
				email_tags:
					"id         INTEGER PRIMARY KEY,"+
					"email      INTEGER NOT NULL,"+
					"raw        VARCHAR(1024) NOT NULL,"+
					"hash       VARCHAR(64),"+
					"indicator  INTEGER DEFAULT NULL,"+
					"type       VARCHAR(32) NOT NULL,"+
					"FOREIGN KEY(email) REFERENCES emails(id),"+
					"FOREIGN KEY(indicator) REFERENCES indicators(id)",
					
				// TABLE incidents
				incidents:
					"id            INTEGER PRIMARY KEY,"+
					"timestamp     INTEGER NOT NULL," +
					"email_tag     INTEGER NOT NULL,"+
					"reported      INTEGER DEFAULT 0,"+
					"FOREIGN KEY(email_tag) REFERENCES email_tags(id),"+
					"CONSTRAINT incident_unique UNIQUE(email_tag)",
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
		return dbConn;
	},

	_dbCreateTables: function(adbConn) {
		for (let name in this.dbSchema.tables) {
			adbConn.createTable(name, this.dbSchema.tables[name]);
		}
	},
};
