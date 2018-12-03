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

	// scan element (and parents) for an anchor node.
	var scan = function(node) {
		while (node !== null) {
			// check node for anchor element.
			pdLogger.debug("Scanning '" + node + " (" + node.localName + ")' for anchor node");
			if (node.localName !== undefined && node.localName.toUpperCase() === 'A') {
				pdLogger.debug("Found context node: " + node);
				return node;
			}
			// walk up the HTML hierarchy
			node = node.parentElement;
		}
		return null;
	}
	// assemble context menu depending on the object
	document.getElementById("pd-context-link").disabled = true;
	pdContextNode = scan(event.target);
	if (pdContextNode != null) {
		document.getElementById("pd-context-link").disabled = false;
	}
}

// "check link" selected from context menu
function pdContextCheckLink(event) {
	// check for existing context object
	if (pdContextNode === null) {
		return;
	}
	// show check dialog
	window.openDialog(
		'chrome://phishdetect/content/pd-check.xhtml',
		'pd-dlg-checkurl',
		'chrome,centerscreen,titlebar,width=800,height=500',
		pdContextNode.getAttribute('href'),
		pdPrefs.node_url
	); 
	pdStatusMsg(pdGetString('pdContext.check_url', 'pdContextStringBundle'));
}

//open reporting dialog (if reports is enabled)
function pdManageReport() {
	if (pdPrefs.reports) {
		window.openDialog(
			'chrome://phishdetect/content/pd-reports.xul',
			'pd-dlg-reporting',
			'chrome,centerscreen,titlebar,width=800,height=500',
			pdPrefs,
			pdDatabase
		);
	} else {
		alert(pdGetString('pdContext.reports_off', 'pdContextStringBundle'));
	}
}

// show preferences dialog
function pdShowPreferences() {
	var features = "chrome,titlebar,toolbar,centerscreen,modal";
	window.openDialog("chrome://phishdetect/content/pd-prefs.xul", "Preferences", features);
}

// show folder context menu
function pdOnFolderContextShowing() {
	var entry = document.getElementById('pd-context-folder');
	if (!entry.disabled) {
		entry.disabled = !pdIsMailFolder();
	}
}

//check if the selected entry in the folder pane is a (non-empty) mail folder
function pdIsMailFolder() {
	var selFolders = gFolderTreeView.getSelectedFolders();
	if (selFolders.length !== 1) {
		return false;
	}
	var folder = selFolders[0];	
	if (folder.getTotalMessages(false) === 0) {
		return false;
	}
	return true;
}
