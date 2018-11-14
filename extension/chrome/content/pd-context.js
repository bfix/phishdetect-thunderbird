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
var contextNode = null;

// handle context menu popup
function mailViewContext(event) {
	// assemble context menu depending on the object
	contextNode = event.target;
	document.getElementById("pd-context-link").collapsed = true;
	switch (event.target.localName.toUpperCase()) {
	case 'A':
		logger.log("Context on link in email: " + contextNode);
		document.getElementById("pd-context-link").collapsed = false;
		break;
	default:
	    // event.preventDefault();
	}
}

// "check link" selected from context menu
function contextCheckLink(event) {
	// check for existing context object
	if (contextNode === null) {
		return;
	}
	// send link to back-end for checks
	var request = JSON.stringify({
		"url": contextNode.getAttribute('href')
	});
	logger.debug("Check URL: " + request);

	// send to PhishDetect node
	sendRequest("/api/check/", "POST", request)
		.then(response => response.json())
		.then(response => {
			logger.log(JSON.stringify(response));
		});
}
