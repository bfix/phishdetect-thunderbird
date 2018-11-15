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

// list of pending (unreported) incidents
var pdReportsPending = null;

// flag if reports are currently processed
var pdReportsSending = false;

// dialog is loaded
function pdReportsOnLoad() {

	// set date of last reporting
	var v = pdGetPrefInt('reports_sync_last');
	var msg = "---";
	if (v > 0) msg = new Date(v*1000).toString();
	document.getElementById("pd-dlg-reports-last").value = msg; 

	// get unreported incidents
	pdDatabase.init();
	pdReportsPending = pdDatabase.getIncidents(true);
	msg = "No";
	if (pdReportsPending !== undefined && pdReportsPending.length > 0) {
		msg = "" + pdReportsPending.length;
	} else {
		pdReportsPending = null;
	}
	document.getElementById("pd-dlg-reports-pending").value = msg + " unreported incidents";
	
	// create tree view
	if (pdReportsPending !== null && pdReportsPending.length > 0) {
		document.getElementById('pd-reports-tree').view = {
			rowCount : pdReportsPending.length,
			getCellText : function(row,column) {
				switch(column.id) {
					case 'timestamp': {
						let ts = new Date(pdReportsPending[row].timestamp);
						return ts.toLocaleDateString() + " " + ts.toLocaleTimeString();
					}
					case 'indicator': return pdReportsPending[row].raw;
					case 'context': return pdReportsPending[row].context;
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
	document.getElementById("pd-dlg-reports-user").value = pdGetPrefString('reports_contact'); 
	document.getElementById("pd-dlg-reports-hashed").checked = pdGetPrefBool('reports_hashed'); 
	document.getElementById("pd-dlg-reports-context").checked = pdGetPrefBool('reports_context'); 
}

// dialog is closed
function pdReportsOnClose(event) {
	// prevent close in case we are still sending...
	if (pdReportsSending) {
		event.preventDefault();
	}
}

// send a report
// TODO: implement bulk reports on back-end
function pdReportsDlgSend() {
	// block "dialog close" and "send button" until all reports have been sent
	pdReportsSending = true;
	document.getElementById('pd-dlg-send').disabled = true;

	// send report
	pdSendReport(
		pdReportsPending,
		document.getElementById("pd-dlg-reports-context").checked,
		document.getElementById("pd-dlg-reports-hashed").checked,
		() => {
			// close dialog.
			pdReportsSending = false;
			let wnd = Services.wm.getMostRecentWindow('phishdetect:reports');
			if (wnd !== null) {
				wnd.close();
			}
		}
	);
}


/*****************************************************************************
 * report dialog handlers
 *****************************************************************************/

//list of incident types in reports
const pdIncidentType = [ "Test", "Domain", "Email" ];

// send a report of pending incidents
function pdSendReport(pending, withContext, asHashed, final) {
	// get pending incidents if not an argument
	if (pending === null) {
		pending = pdDatabase.getIncidents(true);
	}
	// get report settings
	var user = getPrefString('reports_contact');
	var withTest = getPrefBool('test') && getPrefBool('test_report');
	
	// send all incidents and flag them reported in database
	var tasks = [];
	for (let i = 0; i < pending.length; i++) {
		let incident = pending[i];
		// flag incident as "in transit"
		pdDatabase.setReported(pending[i].id, -1);
		
		// filter test incidents.
		if (incident.kind == 0 && !withTest) {
			continue;
		}
		// prepare report
		let indicator = incident.raw;
		if (asHashed) {
			indicator = incident.indicator;
		}
		// send incident report
		// TODO: missing context passing
		tasks.push(
			pdSendEvent(
				incidentType[incident.kind], incident.type, indicator,
				asHashed, user, incident.id
			)
		);
	}
	// record last report date
	if (tasks.length > 0) {
		pdPrefs.setIntPref('reports_sync_last', Math.floor(Date.now() / 1000));
	}
	// wait for all requests to finish.
	var failed = false;
	Promise.all(tasks)
		.then(responses => Promise.all(responses.map(r => r.json())))
		.then(values => {
			for (let i = 0; i < values.length; i++) {
				// convert response to JSON
				var rc = values[i];
				
				// check for errors
				if (rc.error !== undefined) {
					pdLogger.error('Report on incident #' + pending[i].id + ' failed.');
					if (!failed) {
						failed = true;
						pdDlgPrompt.alert(null, "Incident Report",
							"Sending an incident report to the back-end node failed:\n\n" +
							rc.error + "\n\n" +
							"Make sure you are connected to the internet. If the problem "+
							"persists, contact your node operator.");
					}
					// flag incident as "pending"
					pdDatabase.setReported(pending[i].id, 0);
					continue;
				}
				// flag incident as reported in database
				pdLogger.log("Incident #" + pending[i].id + " reported.");
				pdDatabase.setReported(pending[i].id, 1);
			}
		}, error => {
			// error occurred
			pdLogger.error("sendReport(): " + error);
		})
		.then(() => {
			// callback on completion
			if (final !== null) {
				final();
			}
		});
}

// send a notification about a detected indicator
// @returns {Promise}
function pdSendEvent(kind, type, indicator, hashed, user, id) {
	// assemble report
	var report = JSON.stringify({
		// "kind": kind,
		"type": type,
		"indicator": indicator,
		"hashed": ""+hashed,
		"target_contact": user
	});
	pdLogger.debug("Report: " + report);

	// send to PhishDetect node
	return pdSendRequest("/api/events/add/", "POST", report);
}
