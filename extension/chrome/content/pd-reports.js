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

// dialog is loaded
function onload() {

	// set date of last reporting
	var v = getPrefInt('reports_sync_last');
	var msg = "---";
	if (v > 0) msg = new Date(v*1000).toString();
	document.getElementById("pd-dlg-reports-last").value = msg; 

	// get unreported incidents
	pdDatabase.init();
	pending = pdDatabase.getUnreported();
	msg = "No";
	if (pending !== undefined && pending.length > 0) {
		msg = "" + pending.length;
	} else {
		pending = null;
	}
	document.getElementById("pd-dlg-reports-pending").value = msg + " unreported incidents";
	
	// create tree view
	if (pending !== null) {
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

// send a report
// TODO: implement bulk reports on back-end
function sendReport() {
	// get report settings
	let user = getPrefString('reports_contact');
	let withContext = document.getElementById("pd-dlg-reports-context").checked;
	let asHashed = document.getElementById("pd-dlg-reports-hashed").checked;
	let withTest = getPrefBool('test') && getPrefBool('test_report');
	
	// send all incidents and flag them reported in database
	let count = 0;
	let failed = false;
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
		// TODO: no context passing
		sendEvent(
			incidentType[incident.kind], indicator, asHashed, user,
			rc => {
				if (rc.error !== undefined) {
					if (!failed) {
						failed = true;
						console.error('Report on incident #' + incident.id + ' failed.');
						dlgPrompt.alert(null, "Incident Report",
							"Sending an incident report to the back-end node failed:\n\n" +
							rc.error + "\n\n" +
							"Make sure you are connected to the internet. If the problem "+
							"persists, contact your node operator.");
					}
					return;
				}
				// flag incident as reported in database
				console.log("Incident #" + incident.id + " reported.");
				pdDatabase.setReported(incident.id);
			});
		count++;
	}
	// record last report date
	if (count > 0) {
		prefs.setIntPref('reports_sync_last', Math.floor(Date.now() / 1000));
	}
	
	// close dialog.
	var wnd = Services.wm.getMostRecentWindow('phishdetect:reports');
	if (wnd !== null) {
		wnd.close();
	}
}
