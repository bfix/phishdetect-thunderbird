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

var pdDlgPrompt = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);


/*****************************************************************************
 * Logger
 *****************************************************************************/

var pdLogger = {
	log: function(msg) { console.log("PhishDetect: " + msg); },
	error: function(msg) { console.log("PhishDetect: " + msg); },
	warn: function(msg) { console.warn("PhishDetect: " + msg); },
	info: function(msg) { console.info("PhishDetect: " + msg); },
	debug: function(msg) {
		if (pdGetPrefBool('debug')) {
			console.debug("PhishDetect: " + msg);
		}
	}
}

/*****************************************************************************
 * Database handling
 *****************************************************************************/

//initialize database
function pdInitDatabase() {
	pdDatabase.init();
}

/*****************************************************************************
 * Preferences (key/value pairs of options)
 *****************************************************************************/

// Get the PhishDetect preferences branch
var pdPrefs = Services.prefs.getBranch("extensions.phishdetect.");

// Get a preference value for a given key.
// Setter methods are not provided; changes are made by the
// user in the "Preferences" dialog.
function pdGetPrefString(key) { return pdPrefs.getCharPref(key); }
function pdGetPrefInt(key)    { return pdPrefs.getIntPref(key); }
function pdGetPrefBool(key)   { return pdPrefs.getBoolPref(key); }


/*****************************************************************************
 * Node message exchange
 *****************************************************************************/

// Send JSON-encoded request and expect JSON-encoded response.
// @returns {Promise}
function pdSendRequest(uri, method, req) {
	var prop = {
		method: method
	};
	if (req !== null) {
		prop.body = req;
		pdLogger.debug("sendRequest(): request type = " + (typeof req));
		switch (typeof req) {
		case 'FormData':
			// prop.headers = { "Content-Type": "multipart/form-data" };
			if (method != "POST") {
				prop.method = "POST";
				pdLogger.warn("Request type changed to POST");
			}
			break;
		default:
			prop.headers = { "Content-Type": "application/json" };
		}
	}
	var url = pdGetPrefString("node_url") + uri;
	return fetch(url, prop);
}


/*****************************************************************************
 * Indicator-related functions
 *****************************************************************************/
	
// fetch latest indicators
function pdFetchIndicators(callback) {
	pdSendRequest("/api/indicators/fetch/", "GET", null)
		.then(response => response.json())
		.then(rc => {
			// check for errors
			if (rc.error !== undefined) {
				logger.error('Fetch failed: ' + rc.error);
				dlgPrompt.alert(null, "Fetch Indicators",
					"Fetching indicators from the back-end node failed:\n\n" +
					rc.error + "\n\n" +
					"Make sure you are connected to the internet and that the "+
					"preferences for the back-end node are set correctly.\n\n "+
					"If the problem persists, contact your node operator.");
				return;
			}
			// TODO: until there is a mechanism to fetch only indicators we
			// haven't seen yet, we have to drop the 'indicators' table every
			// time we start-up. This is wasting bandwidth and time!
			// this keeps test indicators (kind == 0)
			pdDatabase.executeSimpleSQL("DELETE FROM indicators WHERE kind <> 0");
			
			// add indicators to database
			pdDatabase.addIndicators(rc.domains, 1, callback);
			pdDatabase.addIndicators(rc.emails, 2, callback);
			
			// update timestamp in preferences
			pdPrefs.setIntPref('node_sync_last', Math.floor(Date.now() / 1000));
		})
		.catch(error => {
			pdDlgPrompt.alert(null, "Node Synchronization",
				"Fetching new indicators from the back-end node failed:\n\n" +
				error + "\n\n" +
				"Make sure you are connected to the internet. If the problem "+
				"persists, contact your node operator.");
		});
}

// check if a string is contained in the list of indicators.
// provide a context (string, max 255 chars) to identify where
// the indicator was detected (URL, MessageID,...)
function pdCheckForIndicator(raw, type, context) {
	pdLogger.debug("==> checkForIndicator(" + raw + ")");
	// create entry for lookup
	var hash = sha256.create();
	hash.update(raw);
	var indicator = bin2hex(hash.array());
	
	// TESTING: log indicator
	// console.log('("' + indicator + '"),|' + raw);

	// check if the indicator is listed.
	var result = pdDatabase.hasIndicator(indicator);
	for (let i = 0; i < result.length; i++) {
		// record the incident
		pdDatabase.recordIncident(raw, result[i].id, type, context);
		return true;
	}
	return false;
}


/*****************************************************************************
 * Incident report related functions
 *****************************************************************************/

//list of incident types in reports
const pdIncidentType = [ "Test", "Domain", "Email" ];

// send a report of pending incidents
function pdSendReport(pending, withContext, asHashed, final) {
	// get pending incidents if not an argument
	if (pending === null) {
		pending = pdDatabase.getIncidents(true);
	}
	// get report settings
	var user = pdGetPrefString('reports_contact');
	var withTest = pdGetPrefBool('test') && pdGetPrefBool('test_report');
	
	// send all incidents and flag them reported in database
	var tasks = [];
	for (let i = 0; i < pending.length; i++) {
		let incident = pending[i];
		// flag incident as "in transit"
		pdDatabase.setReported(pending[i].id, -1);
		
		// filter test incidents.
		if (incident.kind == 0 && !withTest) {
			continue;
		}
		// prepare report
		let indicator = incident.raw;
		if (asHashed) {
			indicator = incident.indicator;
		}
		// send incident report
		// TODO: missing context passing
		tasks.push(
			pdSendEvent(
				incidentType[incident.kind], incident.type, indicator,
				asHashed, user, incident.id
			)
		);
	}
	// record last report date
	if (tasks.length > 0) {
		pdPrefs.setIntPref('reports_sync_last', Math.floor(Date.now() / 1000));
	}
	// wait for all requests to finish.
	var failed = false;
	Promise.all(tasks)
		.then(responses => Promise.all(responses.map(r => r.json())))
		.then(values => {
			for (let i = 0; i < values.length; i++) {
				// convert response to JSON
				var rc = values[i];
				
				// check for errors
				if (rc.error !== undefined) {
					pdLogger.error('Report on incident #' + pending[i].id + ' failed.');
					if (!failed) {
						failed = true;
						pdDlgPrompt.alert(null, "Incident Report",
							"Sending an incident report to the back-end node failed:\n\n" +
							rc.error + "\n\n" +
							"Make sure you are connected to the internet. If the problem "+
							"persists, contact your node operator.");
					}
					// flag incident as "pending"
					pdDatabase.setReported(pending[i].id, 0);
					continue;
				}
				// flag incident as reported in database
				pdLogger.log("Incident #" + pending[i].id + " reported.");
				pdDatabase.setReported(pending[i].id, 1);
			}
		}, error => {
			// error occurred
			pdLogger.error("sendReport(): " + error);
		})
		.then(() => {
			// callback on completion
			if (final !== null) {
				final();
			}
		});
}

// send a notification about a detected indicator
// @returns {Promise}
function pdSendEvent(kind, type, indicator, hashed, user, id) {
	// assemble report
	var report = JSON.stringify({
		// "kind": kind,
		"type": type,
		"indicator": indicator,
		"hashed": ""+hashed,
		"target_contact": user
	});
	pdLogger.debug("Report: " + report);

	// send to PhishDetect node
	return pdSendRequest("/api/events/add/", "POST", report);
}


/*****************************************************************************
 * Dissect and analyze email message (MIME format with headers)
 *****************************************************************************/

// check domain
function pdCheckDomain(name, type, context) {
	pdLogger.debug("checkDomain(" + name + ")");
	// check full hostname (subdomain+.domain)
	if (pdCheckForIndicator(name, type + "_hostname", context)) {
		return true
	}
	// check effective top-level domain
	var tld = getDomainName(name);
	if (tld == name) {
		return false;
	}
	return pdCheckForIndicator(tld, type + "_domain", context);
}

// check email address
function pdCheckEmailAddress(addr, type, context) {
	// check if addr is a list of addresses
	if (Array.isArray(addr)) {
		let rc = false;
		for (let i = 0; i < addr.length; i++) {
			rc |= pdCheckEmailAddress(addr[i], type, context);
		}
		return rc;
	}
	pdLogger.debug("checkEmailAddress(" + addr + ")");
	// normalize email address
	var reg = new RegExp("<([^>]*)", "gim");
	var result;
	while ((result = reg.exec(addr)) !== null) {
		addr = result[1];
	}
	pdLogger.debug("=> " + addr);

	// check if email address is an indicator.
	if (pdCheckForIndicator(addr, type, context)) {
		return true;
	}
	// check email domain
	var domain;
	try {
		domain = addr.split("@")[1];
	} catch(error) {
		pdLogger.error("email addr failed: " + addr);
	}
	return pdCheckDomain(domain, type, context);
}

// check mail hops
function pdCheckMailHop(hop, context) {
	pdLogger.debug("checkMailHop(" + hop + ")");
	return false;
}

// check link
function pdCheckLink(link, type, context) {
	pdLogger.debug("checkLink(" + link + ")");
	// check for email link
	if (link.startsWith("mailto:")) {
		return {
			status: pdCheckEmailAddress(link.substring(7), type + "_mailto", context),
			mode: "email"
		}
	}	
	// check domain
	var url = new URL(link);
	return {
		status: pdCheckDomain(url.hostname, type, context),
		mode: "link"
	}
}

// check MIME part of the email
function pdCheckMIMEPart(part, rc, skip, context) {
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
			for (let i = 0; i < part.parts.length; i++) {
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
			for (let i = 0; i < part.parts.length; i++) {
				pdCheckMIMEPart(part.parts[i], rc, true, context);
			}
			return;
		default:
			pdLogger.log("Skipped MIME type: " + part.contentType);
			for (let i = 0; i < part.parts.length; i++) {
				pdLogger.log("==> " + part.parts[i].contentType);
			}
			break;
	}
	if (usePart === null || usePart.body === null || bodyType === null) {
		if (!skip) {
			pdLogger.error("checkMIMEPart(): no usable body content found for scanning: " + part.contentType);
		}
		return;
	}
	
	// shared code to process links
	var processLink = function(link,rc) {
		var res = pdCheckLink(link, "email_link", context);
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
	pdLogger.debug("checkMIMEPart() body=" + usePart.body);
	var reg, result;
	if (bodyType == "text/html") {
		// scan HTML content for links
		reg = new RegExp("<a\\s*href=([^\\s>]*)", "gim");
		while ((result = reg.exec(usePart.body)) !== null) {
			let link = result[1].replace(/^["']?|["']?$/gm,'');
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
function pdInspectEMail(email) {
	pdLogger.debug("inspectEMail(): " + email.headers.from);
	var context = "From " + email.headers.from + " (" + email.headers.date + ")";
	var list = [];

	// check sender(s) of email
	pdLogger.debug(JSON.stringify(email.headers));
	var count = 0;
	var total = 1;
	if (pdCheckEmailAddress(email.headers.from, "email_from", context)) {
		count++;
	}
	if (email.headers.sender !== undefined) {
		total += email.headers.sender.length; 
		email.headers.sender.forEach(sender => {
			if (pdCheckEmailAddress(sender, "email_sender", context)) {
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
		if (pdCheckEmailAddress(email.headers["reply-to"], "email_replyto", context)) {
			count++;
		}
	}
	if (email.headers["return-path"] !== undefined) {
		total += email.headers["return-path"].length;
		email.headers["return-path"].forEach(replyTo => {
			if (pdCheckEmailAddress(replyTo, "email_return", context)) {
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
			if (pdCheckMailHop(hop, context)) {
				count++;
			}
		});
	}
	if (email.headers["x-received"] !== undefined) {
		total += email.headers["x-received"].length;
		email.headers["x-received"].forEach(hop => {
			if (pdCheckMailHop(hop, context)) {
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
		pdCheckMIMEPart(part, rc, false, context);
	});
	if (rc.countLinks > 0) {
		list.push("Links (" + rc.countLinks + "/" + rc.totalLinks + ")");
	}
	if (rc.countEmail > 0) {
		list.push("Email addresses (" + rc.countEmail + "/" + rc.totalEmail + ")");
	}
	
	// TEST mode:
	if (pdGetPrefBool("test") && list.length == 0) {
		let rate = pdGetPrefInt("test_rate") / 100;
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
 * Encoding helpers
 *****************************************************************************/

//binary => hex string
function bin2hex(array) {
	var s = "";
	for (let i = 0; i < array.length; i++) {
		s += array[i].toString(16).padStart(2,'0');
	}
	return s;
}

//hex string => binary
function hex2bin(s) {
	var b = [];
	try {
		for (let i = 0; i < s.length-1; i += 2) {
			b.push(parseInt(s.substr(i, 2), 16));
		}
	} catch(e) {
		return null;
	}
	return b;
}
