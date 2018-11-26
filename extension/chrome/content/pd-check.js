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

// flag for running check: only one check is allowed at a time and the
// dialog can't be closed until the check finished.
var pdCheckRunning = false;
var pdCheckButton = null;

// check dialog loaded: set content and request scan
function pdCheckOnLoad(event) {
	pdLogger.debug("check flag: " + pdCheckRunning);
	pdCheckRunning = true;

	// get arguments
	var url = window.arguments[0].url;
	var srv = window.arguments[0].srv;
	
	// set URL to check
	var dispUrl = url
	if (dispUrl.length > 60) {
		dispUrl = dispUrl.substr(0,60) + "...";
	}
	document.getElementById('pd-check-url').innerHTML = dispUrl;
	//document.getElementById('pd-check-url-tt').innerHTML = url;
	
	// get cards in deck
	var vCheck = document.getElementById('pd-check-running');
	var vError = document.getElementById('pd-check-error');
	var vOk = document.getElementById('pd-check-ok');
	var vWarning = document.getElementById('pd-check-warning');
	var vDanger = document.getElementById('pd-check-danger');

	// send request to PhishDetect node
	// assemble new form data instance
	var prop = {
		method: "POST",
		body: request = JSON.stringify({ url: url, html: '' }),
		headers: { "Content-Type": "application/json" }
	}
	//document.getElementById('pd-check-test').innerHTML = srv;
	fetch(srv + "/api/analyze/link/", prop)
		.then(response => response.json())
		.then(result => {
			// evaluate result
			var list = null;
			if (result.whitelisted || result.score == 0  || result.warnings === null || result.warnings.length == 0) {
				// switch to "All good" card
				vCheck.classList.add('hidden');
				vOk.classList.remove('hidden');
				if (result.whitelisted) {
					document.getElementById("pd-check-brand-name2").innerHTML =
						(result.brand.length > 0 ? result.brand : "the correct entity.");
					document.getElementById("pd-check-whitelisted").classList.remove('hidden');
				}
			} else if (result.score > 50) {
				// switch to danger
				vCheck.classList.add('hidden');
				vDanger.classList.remove('hidden');
				// check for brand impersonation
				if (result.brand !== null && result.brand.length > 0) {
					document.getElementById("pd-check-brand-name").innerHTML = result.brand;
					document.getElementById("pd-check-brand").classList.remove('hidden');
				}
			} else {
				// switch to warning
				vCheck.classList.add('hidden');
				vWarning.classList.remove('hidden');
			}
			if (result.warnings !== null && result.warnings.length > 0) {
				let list = "";
				for (let i = 0; i < result.warnings.length; i++) {
					list += "<li>" + result.warnings[i] + "</li>";
				}
				document.getElementById('pd-check-results-list').innerHTML = list;
				document.getElementById('pd-check-results').classList.remove('hidden');
			}
			pdCheckRunning = false;
		}, error => {
			// error occurred
			vCheck.classList.add('hidden');
			document.getElementById('pd-check-error-msg').innerHTML = error;
			vError.classList.remove('hidden');
			pdLogger.error("urlCheck(): " + error);
		});
}

function pdCheckDetails() {
	var b = document.getElementById('pd-check-error-button');
	var e = document.getElementById('pd-check-error-details');
    if (e.style.display === "block") {
        e.style.display = "none";
        b.innerHTML="Show details";
    } else {
        e.style.display = "block";
        b.innerHTML="Hide details";
    }
}

function pdCheckClose() {
	return !pdCheckRunning;
}
