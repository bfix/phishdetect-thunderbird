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
	recordIncident: function(id,context) {
		let stmt = null;
		try {
			stmt = this.dbConn.createStatement("INSERT OR IGNORE INTO incidents(indicator,context) VALUES(:indicator,:context)");
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

	/*******************************************************************
	 * PhishDetect database core functions
	 *******************************************************************/

	dbConn:			null,
	dbSchema:		null,
	initialized:	false,

	init: function(schema) {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		this.dbSchema = schema;
		
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
