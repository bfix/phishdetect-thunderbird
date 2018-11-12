/*
 * ============================================================================
 * PhishDetect JavaScript client library
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
 * Simplified access to components and services
 *****************************************************************************/

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

var dlgPrompt = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);


/*****************************************************************************
 * Preferences (key/value pairs of options)
 *****************************************************************************/

// Get the PhishDetect preferences branch
var prefs = Services.prefs.getBranch("extensions.phishdetect.");

// Get a preference value for a given key.
// Setter methods are not provided; changes are made by the
// user in the "Preferences" dialog.
function getPrefString(key) { return prefs.getCharPref(key); }
function getPrefInt(key)    { return prefs.getIntPref(key); }
function getPrefBool(key)   { return prefs.getBoolPref(key); }

/*****************************************************************************
 * Node message exchange
 *****************************************************************************/

// Send JSON-encoded request and expect JSON-encoded response.
function sendRequest(uri, method, req, handler) {
	var prop = {
		method: method
	};
	if (req !== null) {
		prop.body = req;
		prop.headers = { "Content-Type": "application/json" };
	}
	var url = getPrefString("node_url") + uri;
	fetch(url, prop)
		.then(response => response.json())
		.then(response => {
			handler({ response: response })
		})
		.catch(error => {
			handler({ error: error });
		});
}

/*****************************************************************************
 * Service methods provided
 *****************************************************************************/
	
// initialize database
function initDatabase() {
	pdDatabase.init();
}

// fetch latest indicators
function fetchIndicators(callback) {
	sendRequest(
		"/api/indicators/fetch/", "GET", null,
		rc => {
			// check for error case.
			if (rc.error !== undefined) {
				dlgPrompt.alert(null, "Node Synchronization",
					"Fetching new indicators from the back-end node failed:\n\n" +
					rc.error + "\n\n" +
					"Make sure you are connected to the internet. If the problem "+
					"persists, contact your node operator.");
				return;
			}

			// TODO: until there is a mechanism to fetch only indicators we
			// haven't seen yet, we have to drop the 'indicators' table every
			// time we start-up. This is wasting bandwidth and time!
			// this keeps test indicators (kind == 0)
			pdDatabase.executeSimpleSQL("DELETE FROM indicators WHERE kind <> 0");
			
			// add indicators to database
			pdDatabase.addIndicators(rc.response.domains, 1, callback);
			pdDatabase.addIndicators(rc.response.emails, 2, callback);
			
			// update timestamp in preferences
			prefs.setIntPref('node_sync_last', Math.floor(Date.now() / 1000));
		}
	);
}

// check if a string is contained in the list of indicators.
// provide a context (string, max 255 chars) to identify where
// the indicator was detected (URL, MessageID,...)
function checkForIndicator(raw, type, context) {
	// console.log("==> checkForIndicator(" + s + ")");
	// create entry for lookup
	var hash = sha256.create();
	hash.update(raw);
	var indicator = bin2hex(hash.array());
	
	// TESTING: log indicator
	// console.log('("' + indicator + '"),|' + raw);

	// check if the indicator is listed.
	var result = pdDatabase.hasIndicator(indicator);
	for (var i = 0; i < result.length; i++) {
		// record the incident
		pdDatabase.recordIncident(raw, result[i].id, type, context);
		return true;
	}
	// console.log(indicator);
	return false;
}

// open reporting dialog (if reports is enabled)
function manageReport() {
	if (getPrefBool('reports')) {
		toOpenWindowByType('phishdetect:reports', 'chrome://phishdetect/content/pd-reports.xul');
	} else {
		alert("Reporting disabled in preferences");
	}
}

// send a notification about a detected indicator
function sendEvent(kind, type, indicator, hashed, user, callback) {
	// assemble report
	let report = JSON.stringify({
		"kind": kind,
		"type": type,
		"indicator": indicator,
		"hashed": hashed,
		"target_contact": user
	});
	console.log("Report: " + report);

	// send to PhishDetect node
	sendRequest("/api/events/add/", "POST", report, callback);
}

/*****************************************************************************
 * Dissect and analyze email message (MIME format with headers)
 *****************************************************************************/

// check domain
function checkDomain(name, type, context) {
	// console.log("checkDomain(" + name + ")");
	// check full hostname (subdomain+.domain)
	if (checkForIndicator(name, type + "_hostname", context)) {
		return true
	}
	// check effective top-level domain
	var tld = getDomainName(name);
	if (tld == name) {
		return false;
	}
	return checkForIndicator(tld, type + "_domain", context);
}

// check email address
function checkEmailAddress(addr, type, context) {
	// check if addr is a list of addresses
	if (Array.isArray(addr)) {
		let rc = false;
		for (var i = 0; i < addr.length; i++) {
			rc |= checkEmailAddress(addr[i], type, context);
		}
		return rc;
	}
	// console.log("checkEmailAddress(" + addr + ")");
	// normalize email address
	var reg = new RegExp("<([^>]*)", "gim");
	var result;
	while ((result = reg.exec(addr)) !== null) {
		addr = result[1];
	}
	// console.log("=> " + addr);

	// check if email address is an indicator.
	if (checkForIndicator(addr, type, context)) {
		return true;
	}
	// check email domain
	var domain;
	try {
		domain = addr.split("@")[1];
	} catch(error) {
		console.error("addr=" + addr);
	}
	return checkDomain(domain, type, context);
}

// check mail hops
function checkMailHop(hop, context) {
	// console.log("checkMailHop(" + hop + ")");
	return false;
}

// check link
function checkLink(link, type, context) {
	// console.log("checkLink(" + link + ")");
	// check for email link
	if (link.startsWith("mailto:")) {
		return {
			status: checkEmailAddress(link.substring(7), type + "_mailto", context),
			mode: "email"
		}
	}	
	// check domain
	var url = new URL(link);
	return {
		status: checkDomain(url.hostname, type, context),
		mode: "link"
	}
}

// check MIME part of the email
function checkMIMEPart(part, rc, skip, context) {
	// find MIME part to scan
	var usePart = null;
	var bodyType = null;
	switch (part.contentType) {
		// plain text or HTML email
		case "text/plain":
		case "text/html":
			usePart = part;
			bodyType = part.contentType;
			break;
		// plain text / HTML alternatives
		case "multipart/alternative":
			for (var i = 0; i < part.parts.length; i++) {
				if (part.parts[i].contentType == "text/plain" && usePart === null) {
					usePart = part.parts[i];
					bodyType = usePart.contentType;
				}
				if (part.parts[i].contentType == "text/html") {
					usePart = part.parts[i];
					bodyType = usePart.contentType;
				}
			}			
			break;
		// handle composite parts
		case "multipart/report":
		case "multipart/signed":
		case "multipart/mixed":
			// process all parts
			for (var i = 0; i < part.parts.length; i++) {
				checkMIMEPart(part.parts[i], rc, true, context);
			}
			return;
		default:
			console.log("Skipped MIME type: " + part.contentType);
			for (var i = 0; i < part.parts.length; i++) {
				console.log("==> " + part.parts[i].contentType);
			}
			break;
	}
	if (usePart === null || usePart.body === null || bodyType === null) {
		if (!skip) {
			console.error("checkMIMEPart(): no usable body content found for scanning: " + part.contentType);
		}
		return;
	}
	
	// shared code to process links
	var processLink = function(link,rc) {
		var res = checkLink(link, "email_link", context);
		switch (res.mode) {
		case "email":
			rc.totalEmail++;
			if (res.status) {
				rc.countEmail++;
			}
			break;
		case "link":
			rc.totalLinks++;
			if (res.status) {
				rc.countLinks++;
			}
			break;
		}
	}
	// console.log("checkMIMEPart() body=" + usePart.body);
	var reg, result;
	if (bodyType == "text/html") {
		// scan HTML content for links
		reg = new RegExp("<a\\s*href=([^\\s>]*)", "gim");
		while ((result = reg.exec(usePart.body)) !== null) {
			var link = result[1].replace(/^["']?|["']?$/gm,'');
			processLink(link, rc, "email_link", context);
		}
	} else if (bodyType == "text/plain") {
		// scan plain text
		reg = new RegExp("\\s?((http|https|ftp)://[^\\s<]+[^\\s<\.)])", "gim");
		while ((result = reg.exec(usePart.body)) !== null) {
			processLink(result[1], rc, "email_link", context);
		}
	}
}

/*****************************************************************************
 * Dissect and analyze email message (MIME format with headers)
 *****************************************************************************/

// process a MIME message object
function inspectEMail(email) {
	// console.log("inspectEMail(): " + email.headers.from);
	var context = "From " + email.headers.from + " (" + email.headers.date + ")";
	var list = [];

	// check sender(s) of email
	// console.log(JSON.stringify(email.headers));
	var count = 0;
	var total = 1;
	if (checkEmailAddress(email.headers.from, "email_from", context)) {
		count++;
	}
	if (email.headers.sender !== undefined) {
		total += email.headers.sender.length; 
		email.headers.sender.forEach(sender => {
			if (checkEmailAddress(sender, "email_sender", context)) {
				count++;
			}
		});
	}
	if (count > 0) {
		list.push("Sender (" + count + "/" + total + ")");
		count = 0;
	}
	
	// check reply-to and return path elements
	total = 0;
	if (email.headers["reply-to"] !== undefined) {
		total = 1;
		if (checkEmailAddress(email.headers["reply-to"], "email_replyto", context)) {
			count++;
		}
	}
	if (email.headers["return-path"] !== undefined) {
		total += email.headers["return-path"].length;
		email.headers["return-path"].forEach(replyTo => {
			if (checkEmailAddress(replyTo, "email_return", context)) {
				count++;
			}
		});
	}
	if (count > 0) {
		list.push("ReplyTo (" + count + "/" + total + ")");
		count = 0;
	}
	
	// check mail hops
	total = 0;
	if (email.headers.received !== undefined) {
		total += email.headers.received.length;
		email.headers.received.forEach(hop => {
			if (checkMailHop(hop, context)) {
				count++;
			}
		});
	}
	if (email.headers["x-received"] !== undefined) {
		total += email.headers["x-received"].length;
		email.headers["x-received"].forEach(hop => {
			if (checkMailHop(hop, context)) {
				count++;
			}
		});
	}
	if (count > 0) {
		list.push("Mail hops (" + count + "/" + total + ")");
		count = 0;
	}

	// inspect MIME parts
	var rc = { countLinks: 0, totalLinks: 0, countEmail: 0, totalEmail: 0 }
	email.parts.forEach(part => {
		checkMIMEPart(part, rc, false, context);
	});
	if (rc.countLinks > 0) {
		list.push("Links (" + rc.countLinks + "/" + rc.totalLinks + ")");
	}
	if (rc.countEmail > 0) {
		list.push("Email addresses (" + rc.countEmail + "/" + rc.totalEmail + ")");
	}
	
	// TEST mode:
	if (getPrefBool("test") && list.length == 0) {
		var rate = getPrefInt("test_rate") / 100;
		if (Math.random() < rate) {
			list.push("DEMO modus -- not based on detection!");
		}
	}
	
	// return inspection result
	return {
		phish: (list.length > 0),
		date: Date.now(),
		indications: list
	}
}

/*****************************************************************************
 * Helper functions.
 *****************************************************************************/

function bin2hex(array) {
	var s = "";
	for (var i = 0; i < array.length; i++) {
		s += array[i].toString(16).padStart(2,'0');
	}
	return s;
}
