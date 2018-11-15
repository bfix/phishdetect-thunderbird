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
	document.getElementById("pd-check-spinner").collapsed = false;
	document.getElementById("pd-check-result").collapsed = true;

	// send request to PhishDetect node
	// assemble new form data instance
	var request = JSON.stringify({
		url: url,
		html: ''
	});
	pdSendRequest("/api/analyze/link/", "POST", request)
		.then(response => response.json())
		.then(result => {
			// switch visible elements.
			document.getElementById("pd-check-spinner").collapsed = true;
			document.getElementById("pd-check-result").collapsed = false;
			
			// show results
			document.getElementById("pd-check-result-white").checked = result.whitelisted;
			document.getElementById("pd-check-result-brand").value = result.brand;
			document.getElementById("pd-check-result-score").value = result.score;
			
			let list = document.getElementById("pd-check-result-warnings");
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
		});
}


function pdCheckOnClose() {
	
}
