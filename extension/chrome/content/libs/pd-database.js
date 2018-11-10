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
		let stmt = this.dbConn.createStatement("INSERT INTO indicators(indicator,kind) VALUES(:indicator,:kind)");
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
		let stmt = this.dbConn.createStatement("SELECT id,kind FROM indicators WHERE indicator = :indicator");
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
	},
	
	// record incident:
	// an incident is the occurrence of an indicator in a context (like a
	// specific webpage or email).
	recordIncident: function(raw, id, context) {
		let stmt = null;
		try {
			stmt = this.dbConn.createStatement("INSERT OR IGNORE INTO incidents(timestamp,raw,indicator,context) VALUES(:ts,:raw,:indicator,:context)");
			stmt.params.raw = raw;
			stmt.params.ts = Date.now();
			stmt.params.indicator = id;
			stmt.params.context = context;
			stmt.executeStep();
		}
		catch(e) {
			console.error(e);
		}
		finally {
			if (stmt !== null) {
				console.log("recordIncident(" + id + ",'" + context + "')");
				stmt.reset();
			}
		}
	},
	
	// get unreported incidents
	getUnreported: function() {
		let stmt = this.dbConn.createStatement("SELECT id,timestamp,raw,indicator,context FROM incidents WHERE reported = 0");
		let result = [];
		try {
			while (stmt.executeStep()) {
				result.push({
					id: stmt.row.id,
					timestamp: stmt.row.timestamp,
					raw: stmt.row.raw,
					indicator: stmt.row.indicator,
					context: stmt.row.context
				});
			}
		}
		finally {
			stmt.reset();
		}
		return result;
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
					"CONSTRAINT indicator_unique UNIQUE(indicator,kind)",
					
				// TABLE incidents
				incidents:
					"id         INTEGER PRIMARY KEY,"+
					"timestamp  INTEGER NOT NULL," +
					"raw        VARCHAR(1024) NOT NULL," +
					"indicator  INTEGER NOT NULL,"+
					"context    VARCHAR(255) NOT NULL,"+
					"reported   INTEGER DEFAULT 0,"+
					"FOREIGN KEY(indicator) REFERENCES indicators(id),"+
					"CONSTRAINT incident_unique UNIQUE(indicator,context)",
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
	for (var name in this.dbSchema.tables)
		adbConn.createTable(name, this.dbSchema.tables[name]);
	},
};
