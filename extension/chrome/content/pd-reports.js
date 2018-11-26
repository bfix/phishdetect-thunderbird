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
	// we are in a new environment, so initialize...
	pdInit();
	
	// set date of last reporting
	var v = pdPrefs.reports_last;
	var msg = pdGetElapsedTime(v);
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
	document.getElementById("pd-dlg-reports-user").value = pdPrefs.reports_contact;
	document.getElementById("pd-dlg-reports-context").checked = pdPrefs.reports_context; 
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
		() => {
			// close dialog.
			pdReportsSending = false;
			let wnd = Services.wm.getMostRecentWindow('pd-dlg-reporting');
			if (wnd !== null) {
				wnd.close();
			}
		}
	);
}
