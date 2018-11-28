/*
 * ============================================================================
 * PhishDetect for Thunderbird -- Rescan dialog
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
 * Handle re-scan information...
 *****************************************************************************/

// import modules
Components.utils.import("resource:///modules/gloda/public.js");
Components.utils.import("resource://gre/modules/Services.jsm");

// unique list of message identifiers (passed in as window.arguments[0])
var pdMsgIds = [];

//----------------------------------------------------------------------
//----------------------------------------------------------------------

//on dialog loaded: fill in list
function pdRescanOnLoad() {

	// get list of message ids to display
	if (window.arguments && window.arguments[0]) {
		// get the msgId list from the window arguments
		pdMsgIds = window.arguments[0];
		
		// TODO: remove TEST case
		pdMsgIds.push('anynvs54jkvxr2yd-ipxh2a6100xa1lqd-287c@contrletytri1.bid');
		
		// run query
		try {
			let query = Gloda.newQuery(Gloda.NOUN_MESSAGE, {
				noDbQueryValidityConstraints: true
		    });
			query.headerMessageID.apply(query, pdMsgIds);
			query.frozen = true;
			let listener = {
				onItemsAdded: function myListener_onItemsAdded(aItems, aCollection) {},
			    onItemsModified: function myListener_onItemsModified(aItems, aCollection) {},
			    onItemsRemoved: function myListener_onItemsRemoved(aItems, aCollection) {},
			    onQueryCompleted: function myListener_onQueryCompleted(aCollection) {
					// helper function to add list entries
			    	let list = document.getElementById("pd-rescan-result");
					let addEntry = function(from,subj,date) {
						let row = document.createElement('listitem');
					    let cell = document.createElement('listcell');
					    cell.setAttribute('label', from);
					    row.appendChild(cell);
					    cell = document.createElement('listcell');
					    cell.setAttribute('label', subj);
					    row.appendChild(cell);
					    cell = document.createElement('listcell');
					    cell.setAttribute('label', date);
					    row.appendChild(cell);
					    list.appendChild(row);				
					}
					// add all returned search results
					if (aCollection.items.length > 0) {
						for (let i = 0; i < aCollection.items.length; i++) {
							let hdr = aCollection.items[i].folderMessage;
							let ts = new Date(Math.floor(hdr.date / 1000));
							let date = ts.toLocaleDateString() + " " + ts.toLocaleTimeString();
							addEntry(hdr.author, hdr.subject, date);
						}
					}
					// switch deck
					document.getElementById("pd-rescan-deck").selectedIndex = 1;
			    }
			};
			query.getCollection(listener, null, { becomeNull: true });
		} catch(err) {
			console.error("re-scan dialog (gloda search) failed: " + err);
		}
	}
}

// dialog is closed
function pdRescanOnClose() {
}
