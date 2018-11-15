/*
 * ============================================================================
 * PhishDetect for Thunderbird: Handle context menus
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
 * Handle context menu in a message view ("messagepane" instance)
 *****************************************************************************/

// reference to view object (context for menu)
var pdContextNode = null;

// handle context menu popup
function pdMailViewContext(event) {
	// assemble context menu depending on the object
	pdContextNode = event.target;
	document.getElementById("pd-context-link").collapsed = true;
	switch (event.target.localName.toUpperCase()) {
	case 'A':
		pdLogger.log("Context on link in email: " + pdContextNode);
		document.getElementById("pd-context-link").collapsed = false;
		break;
	default:
	    // event.preventDefault();
	}
}

// "check link" selected from context menu
function pdContextCheckLink(event) {
	// check for existing context object
	if (pdContextNode === null) {
		return;
	}
	// show check dialog
	toOpenWindowByType('phishdetect:check', 'chrome://phishdetect/content/pd-check.xul');
	pdStatusMsg("Checking URL...");
}

//open reporting dialog (if reports is enabled)
function pdManageReport() {
	if (pdGetPrefBool('reports')) {
		toOpenWindowByType('phishdetect:reports', 'chrome://phishdetect/content/pd-reports.xul');
	} else {
		alert("Reporting disabled in preferences");
	}
}

