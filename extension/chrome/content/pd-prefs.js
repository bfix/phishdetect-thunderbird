/*
 * ============================================================================
 * PhishDetect for Thunderbird -- Preferences dialog
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

var pdPrefsPane = {
	
	// Initialize values (displayed dates) in the dialog.
	// this function needs to be called whenever the timestamps change.
	init: function() {
		// set time of last node sync
		var v = document.getElementById('pd-pref-node-sync-last-value').value;
		var msg = pdGetElapsedTime(v);
		document.getElementById('pd-pref-node-sync-last').value = msg;

		// set time of last report sync
		v = document.getElementById('pd-pref-reports-last-value').value;
		msg = pdGetElapsedTime(v);
		document.getElementById('pd-pref-reports-last').value = msg;
		
		// run updaters
		this.update_reports();
		this.update_test();
	},

	// validate all fields and block exit if invalid fields are encountered
	validate: function() {
		if (!this.changed('node-url')) return false;
		if (!this.changed('node-sync')) return false;
		if (!this.changed('test-rate')) return false;
		return true;
	},
	
	// update reporting status
	update_reports: function() {
		var disabled = !document.getElementById("pd-pref-reports").checked;
		document.getElementById("pd-pref-reports-context").disabled = disabled;		
		document.getElementById("pd-pref-reports-contact").disabled = disabled;		
	},
	
	// update test status
	update_test: function() {
		var disabled = !document.getElementById("pd-pref-test").checked;
		document.getElementById("pd-pref-test-rate").disabled = disabled;		
		document.getElementById("pd-pref-test-report").disabled = disabled;		
	},
	
	// check changed fields
	changed: function(field) {
		var f = document.getElementById('pd-pref-' + field);
		var v = f.value;
		var t = 0;
		switch (field) {
		
			// check node URL entry
			case "node-url":
				try {
					pdLogger.debug("changed(node-url): " + v);
					let url = new URL(v);
					pdLogger.debug("=> URL: " + url);
					if (url.protocol !== "http:" && url.protocol !== "https:") {
						f.value = "https://" + v;
						return this.changed(field);
					}
					if (url.pathname !== "/") {
						f.value = url.protocol + "//" + url.host;
						return this.changed(field);
					}
				}
				catch(e) {
					document.getElementById('pd-pref-' + field).value = "https://node.phishdetect.io";
					return false;
				}
				return true;
				
			// check node sync interval
			case "node-sync":
				try {
					t = parseInt(v);
					if (t < 0) {
						t = 0;
					} else if (t > 44640) {
						t = 44640
					}
				}
				catch(e) {
					t = 240;
				}
				document.getElementById('pd-pref-' + field).value = t;
				return true;
				
			// check test rate
			case "node-reports-contact":
				return true;
				
			// check node sync interval
			case "test-rate":
				try {
					t = parseInt(v);
					if (t < 0) {
						t = 0;
					} else if (t > 100) {
						t = 100;
					}
				}
				catch(e) {
					t = 20;
				}
				document.getElementById('pd-pref-' + field).value = t;
				return true;
		}
	}
}
