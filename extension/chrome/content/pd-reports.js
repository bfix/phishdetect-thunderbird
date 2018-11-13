/*
 * ============================================================================
 * PhishDetect for Thunderbird -- Report management
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

/*****************************************************************************
 * Handle reporting...
 *****************************************************************************/

// list of incident types in reports
const incidentType = [ "Test", "Domain", "Email" ];

// list of pending (unreported) incidents
var pending = null;

// flag if reports are currently processed
var sending = false;

// dialog is loaded
function onLoad() {

	// set date of last reporting
	var v = getPrefInt('reports_sync_last');
	var msg = "---";
	if (v > 0) msg = new Date(v*1000).toString();
	document.getElementById("pd-dlg-reports-last").value = msg; 

	// get unreported incidents
	pdDatabase.init();
	pending = pdDatabase.getIncidents(true);
	msg = "No";
	if (pending !== undefined && pending.length > 0) {
		msg = "" + pending.length;
	} else {
		pending = null;
	}
	document.getElementById("pd-dlg-reports-pending").value = msg + " unreported incidents";
	
	// create tree view
	if (pending !== null && pending.length > 0) {
		document.getElementById('pd-reports-tree').view = {
			rowCount : pending.length,
			getCellText : function(row,column) {
				switch(column.id) {
					case 'timestamp': {
						let ts = new Date(pending[row].timestamp);
						return ts.toLocaleDateString() + " " + ts.toLocaleTimeString();
					}
					case 'indicator': return pending[row].raw;
					case 'context': return pending[row].context;
				}
			},
			setTree: function(treebox){ this.treebox = treebox; },
			isContainer: function(row){ return false; },
			isSeparator: function(row){ return false; },
			isSorted: function(){ return false; },
			getLevel: function(row){ return 0; },
			getImageSrc: function(row,col){ return null; },
			getRowProperties: function(row,props){},
			getCellProperties: function(row,col,props){},
			getColumnProperties: function(colid,col,props){}
		}
	} else {
		document.getElementById('pd-dlg-send').disabled = true;
	};
  
	// set reporter (user identifier)
	document.getElementById("pd-dlg-reports-user").value = getPrefString('reports_contact'); 
	document.getElementById("pd-dlg-reports-hashed").checked = getPrefBool('reports_hashed'); 
	document.getElementById("pd-dlg-reports-context").checked = getPrefBool('reports_context'); 
}

// dialog is closed
function onClose(event) {
	// prevent close in case we are still sending...
	if (sending) {
		event.preventDefault();
	}
}

// send a report
// TODO: implement bulk reports on back-end
function sendReport() {
	// block "dialog close" and "send button" until all reports have been sent
	sending = true;
	document.getElementById('pd-dlg-send').disabled = true;

	// get report settings
	let user = getPrefString('reports_contact');
	let withContext = document.getElementById("pd-dlg-reports-context").checked;
	let asHashed = document.getElementById("pd-dlg-reports-hashed").checked;
	let withTest = getPrefBool('test') && getPrefBool('test_report');
	
	// send all incidents and flag them reported in database
	var tasks = [];
	for (var i = 0; i < pending.length; i++) {
		let incident = pending[i];
		
		// filter test incidents.
		if (incident.kind == 0 && !withTest) {
			continue;
		}
		// prepare report
		var indicator = incident.raw;
		if (asHashed) {
			indicator = incident.indicator;
		}
		// send incident report
		// TODO: missing context passing
		tasks.push(
			sendEvent(
				incidentType[incident.kind], incident.type, indicator,
				asHashed, user, incident.id
			)
		);
	}
	// record last report date
	if (tasks.length > 0) {
		prefs.setIntPref('reports_sync_last', Math.floor(Date.now() / 1000));
	}
	
	// wait for all requests to finish.
	let failed = false;
	Promise.all(tasks)
		.then(values => {
			for (var i = 0; i < values.length; i++) {
				// convert response to JSON
				var rc = values[i].json();
				
				// check for errors
				if (rc.error !== undefined) {
					if (!failed) {
						failed = true;
						console.error('Report on incident #' + pending[i].id + ' failed.');
						dlgPrompt.alert(null, "Incident Report",
							"Sending an incident report to the back-end node failed:\n\n" +
							rc.error + "\n\n" +
							"Make sure you are connected to the internet. If the problem "+
							"persists, contact your node operator.");
					}
					return;
				}
				// flag incident as reported in database
				console.log("Incident #" + pending[i].id + " reported.");
				pdDatabase.setReported(pending[i].id);
			}
		}, error => {
			// error occurred
			console.error("sendReport(): " + error);
		})
		.then(() => {
			// close dialog.
			sending = false;
			var wnd = Services.wm.getMostRecentWindow('phishdetect:reports');
			if (wnd !== null) {
				wnd.close();
			}
		});
}
