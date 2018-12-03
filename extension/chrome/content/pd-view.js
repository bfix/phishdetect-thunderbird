/*
 * ============================================================================
 * PhishDetect for Thunderbird: Handle message view
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
 * Handle PhishDetect column in message list
 *****************************************************************************/

// Handler for the PhishDetect column in the message list.
var pdColumnHandler = {
	getCellText: function(row, col) {
		return null;
	},
	getSortStringForRow: function(row) {
		let hdr = gDBView.getMsgHdrAt(row);
		return ""+pdCheckForPhish(hdr);
	},
	isString: function() {
		return true;
	},
	getCellProperties: function(row, col, props){
	},
	getRowProperties: function(row, props){
	},
	getImageSrc: function(row, col) {
		let hdr = gDBView.getMsgHdrAt(row);
		if (pdCheckForPhish(hdr))
			return "chrome://phishdetect/content/icon16.png";
		return null;
	},
	getSortLongForRow: function(hdr) {
		return 0;
	}
};

// Register observer for PhishDetect column.
var pdObserver = {
	observe: function(aMsgFolder, aTopic, aData) {  
		gDBView.addColumnHandler("pd-column-item", pdColumnHandler);
	}
};


/*****************************************************************************
 * Handle notification bar functionality:
 * - expand/hide of details
 * - unblock links
 *****************************************************************************/

// toggle show/hide details
function pdShowDetails(reset) {
	var btn = document.getElementById("pd-details");
	var details = document.getElementById("pd-indications");
	if (reset || btn.getAttribute('data-state') === "1") {
		btn.setAttribute("data-state", "0");
		btn.label = btn.getAttribute('data-on');
		details.collapsed = true;
	} else {
		btn.setAttribute("data-state", "1");
		btn.label = btn.getAttribute('data-off');
		details.collapsed = false;
	}
}

// unblock links
function pdUnblockLinks() {
	// remove button (run only once)
	var btn = document.getElementById("pd-block");
	btn.collapsed = true;
	// post-process links
	pdShowSanitizedMsg(false);
}
