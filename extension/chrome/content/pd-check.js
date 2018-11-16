/*
 * ============================================================================
 * PhishDetect for Thunderbird: Check URL dialog
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

// check dialog loaded: set content and request scan
function pdCheckOnLoad(event) {
	// set URL to check
	var url = window.arguments[0].url;
	var dispURL = url;
	if (dispURL.length > 80) {
		dispURL = url.substr(0,80) + "...";
	}
	document.getElementById("pd-check-url-value").value = dispURL;
	
	// handle decks
	var deck = document.getElementById("pd-check-canvas");
	deck.selectedIndex = 0;

	// send request to PhishDetect node
	// assemble new form data instance
	var request = JSON.stringify({
		url: url,
		html: ''
	});
	pdSendRequest("/api/analyze/link/", "POST", request)
		.then(response => response.json())
		.then(result => {
			// evaluate result
			var list = null;
			if (result.whitelisted || result.score == 0  || result.warnings === null || result.warnings.length == 0) {
				// switch to "All good" card
				deck.selectedIndex = 1;
				document.getElementById("pd-check-whitelisted").collapsed = !result.whitelisted;
				document.getElementById("pd-check-brand-name2").value =
					(result.brand.length > 0 ? result.brand : "the correct entity.");
			} else if (result.score > 50) {
				// switch to danger
				deck.selectedIndex = 3;
				list = document.getElementById("pd-check-result-danger");
				// check for brand impersonation
				document.getElementById("pd-check-brand").collapsed = true;
				if (result.brand !== null && result,brand.length > 0) {
					document.getElementById("pd-check-brand").collapsed = false;
					document.getElementById("pd-check-brand-name").value = result.brand;
				}
			} else {
				// switch to warning
				deck.selectedIndex = 2;
				list = document.getElementById("pd-check-result-warnings");
			}
			if (list != null) {
				// helper function to add list entries
				let addEntry = function(entry) {
					let row = document.createElement('listitem');
				    let cell = document.createElement('listcell');
				    cell.setAttribute('label', entry);
				    row.appendChild(cell);
				    list.appendChild(row);				
				}
				if (result.warnings !== null && result.warnings.length > 0) {
					for (let i = 0; i < result.warnings.length; i++) {
						addEntry(result.warnings[i]);
					}
				} else {
					addEntry('None');
				}
			}
		});
}


function pdCheckOnClose() {
	
}
