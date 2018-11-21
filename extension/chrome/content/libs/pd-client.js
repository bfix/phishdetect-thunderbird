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

// import modules
Cu.import("resource://gre/modules/Services.jsm");

// initialize common services
var pdDlgPrompt = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);


/*****************************************************************************
 * Preferences (key/value pairs of settings):
 *   All default/user settings for extension preferences are stored as
 *   attributes in this instance.
 *****************************************************************************/

var pdPrefs = {
	// access to extension preferences
	srvc: null,
	// preference names
	keys: null,
	// preferences are added as attributes
	// :

	// observer for changes in preferences branch
	observe: function(subj, topic, key) {
		this._setKey(key);
	},
	
	// initialize preferences services and get values
	init: function() {
		this.srvc = Services.prefs.getBranch("extensions.phishdetect.");
		var rc = { value: 0 };
		this.keys = this.srvc.getChildList("", rc);
		this.keys.forEach(key => {
			this._setKey(key);
		});
		this.srvc.addObserver("", this, false);
	},
	
	// set an integer preference
	setInt: function(key,value) {
		this[key] = value;
		this.srvc.setIntPref(key, value);
	},

	// set/update a preference.
	_setKey: function(key) {
		switch (this.srvc.getPrefType(key)) {
		case 32: // PREF_STRING
			this[key] = this.srvc.getCharPref(key);
			break;
		case 64: // PREF_INT
			this[key] = this.srvc.getIntPref(key);
			break;
		case 128: // PREF_BOOL
			this[key] = this.srvc.getBoolPref(key);
			break;
		default:
		}
	}
}


/*****************************************************************************
 * Logger:
 *   Logs mesage to the console (with corresponding type) if the
 *   appropriate log_level is set:
 *   0 = debug, 1 = log, 2 = info, 3 = warning, 4 = error
 *****************************************************************************/

// log a message to the console depending on its type and depending on the
// currently set "log level" in the preferences. it does not rely on the
// built-in message filtering to avoid polluting the internal message store.
// TODO: contemplate the possibility to log into a separate database, so that
// logs could be store persistently and processed by external applications.
var pdLogger = {
	// log a typed message
	debug: function(msg) { if (pdPrefs.log_level < 1) console.debug("PhishDetect: " + msg); },
	log: function(msg) { if (pdPrefs.log_level < 2) console.log("PhishDetect: " + msg); },
	info: function(msg) { if (pdPrefs.log_level < 3) console.info("PhishDetect: " + msg); },
	warn: function(msg) { if (pdPrefs.log_level < 4) console.warn("PhishDetect: " + msg); },
	error: function(msg) { console.error("PhishDetect: " + msg); },
	
	// initialize logger
	init: function(){}
}


/*****************************************************************************
 * Initialize extension
 *   N.B.: The sequence of init() calls should be done in respect to
 *   the dependencies of the initialized objects / services.
 *****************************************************************************/

// @returns void
function pdInit() {
	// initialize preferences
	pdPrefs.init();
	// initialize database
	pdDatabase.init();
	// initialize logger
	pdLogger.init();
}

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
		pdLogger.debug("sendRequest(): " + req);
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
	var url = pdPrefs.node_url + uri;
	return fetch(url, prop);
}


/*****************************************************************************
 * Indicator-related functions
 *****************************************************************************/
	
// fetch latest indicators
function pdFetchIndicators(callback) {
	var now = Math.floor(Date.now() / 1000);
	pdPrefs.setInt('node_sync_last_try', now);
	pdSendRequest("/api/indicators/fetch/?last=" + pdPrefs.node_sync_last, "GET", null)
		.then(response => response.json())
		.then(rc => {
			// check for internal errors
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
			// add indicators to database
			pdDatabase.addIndicators(rc.domains, 1, callback);
			pdDatabase.addIndicators(rc.emails, 2, callback);
			
			// update timestamp in preferences
			pdPrefs.setInt('node_sync_last', now);
		})
		// external failure
		.catch(error => {
			pdDlgPrompt.alert(null, "Node Synchronization",
				"Fetching new indicators from the back-end node failed:\n\n" +
				error + "\n\n" +
				"Make sure you are connected to the internet. If the problem "+
				"persists, contact your node operator.");
		});
}

// check if a string is contained in the list of indicators.
// @returns the hash of the string and the database id
function pdCheckForIndicator(raw) {
	pdLogger.debug("==> checkForIndicator(" + raw + ")");
	// create entry for lookup
	var hash = sha256.create();
	hash.update(raw);
	var indicator = bin2hex(hash.array());
	
	// TESTING: log indicator
	// pdLogger.log('("' + indicator + '"),|' + raw);

	// check if the indicator is listed.
	var id = pdDatabase.hasIndicator(indicator);
	return { indicator: indicator, id: id };
}

/*****************************************************************************
 * Incident report related functions
 *****************************************************************************/

//list of incident types in reports
const pdIncidentType = [ "Test", "Domain", "Email" ];

// send a report of pending incidents
// @returns {int} number of reports sent
function pdSendReport(pending, withContext, final) {
	// get pending incidents if not an argument
	if (pending === null) {
		pending = pdDatabase.getIncidents(true);
	}
	// get report settings
	var user = pdPrefs.reports_contact;
	var withTest = pdPrefs.test && pdPrefs.test_report;
	
	// send all incidents and flag them reported in database
	var tasks = [];
	var count = 0;
	for (let i = 0; i < pending.length; i++) {
		let incident = pending[i];
		// flag incident as "in transit"
		pdDatabase.setReported(pending[i].id, -1);
		
		// filter test incidents.
		if (incident.kind == 0 && !withTest) {
			continue;
		}
		// send incident report
		// TODO: missing context passing
		tasks.push(
			pdSendEvent(
				pdIncidentType[incident.kind], incident.type, incident.raw,
				incident.indicator, user, incident.id
			)
		);
		count++;
	}
	// record last report date
	var now = Math.floor(Date.now() / 1000);
	if (tasks.length > 0) {
		pdPrefs.setInt('reports_last', now);
	}
	pdPrefs.setInt('reports_last_try', now);

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
				pdLogger.info("Incident #" + pending[i].id + " reported.");
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
	// return number of reported incidents
	return count;
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

// flag the message as scanned by PhishDetect (and store scan result)
function pdSetMsgFlag(aMsgHdr, aRC) {
	return pdDatabase.setEmailStatus(aMsgHdr.messageId, aRC);
}

// get the PhishDetect flag for a message
function pdGetMsgFlag(aMsgHdr) {
	return pdDatabase.getEmailStatus(aMsgHdr.messageId);
}

// list of tags (possible indicators) in an email
var pdTagList = function() {
	this.data = [];
	this.insert = function(full, raw, type) {
		var check = null;
		try {
			check = pdCheckForIndicator(raw);
		} catch(e) {
			pdLogger.error("check indicator('" + full + "','" + raw + "'," + type + ")");
			return false;
		}
		this.data.push({
			full: full,
			raw: raw,
			hash: check.indicator,
			indicator: check.id,
			type: type
		});
		pdLogger.debug(
			"pdTagList.insert(): pdCheckForIndicator() => " +
			JSON.stringify(check) +	" [" + this.data.length + "]"
		);
		return check.id != 0;
	}
};

// check domain
function pdCheckDomain(list, full, name, type) {
	pdLogger.debug("checkDomain(" + name + ")");
	// full hostname (subdomain+.domain)
	list.insert(full, name, type);

	// check effective top-level domain
	var tld = pdGetDomainName(name);
	if (tld == name) {
		return false;
	}
	return list.insert(full, tld, type + "_domain");
}

// check email address
function pdCheckEmailAddress(list, addr, type) {
	// check if addr is a list of addresses
	if (Array.isArray(addr)) {
		let rc = false;
		for (let i = 0; i < addr.length; i++) {
			rc |= pdCheckEmailAddress(list, addr[i], type);
		}
		return rc;
	}
	// check for empty string
	if (addr.length == 0) {
		return false;
	}
	pdLogger.debug("checkEmailAddress(" + addr + ")");
	// normalize email address
	var reg = new RegExp("<([^>]*)", "gim");
	var result;
	if ((result = reg.exec(addr)) !== null) {
		addr = result[1];
	}
	pdLogger.debug("=> " + addr);

	// check if email address is an indicator.
	if (list.insert(addr, addr, type)) {
		return true;
	}
	// check email domain
	var domain;
	try {
		domain = addr.split("@")[1];
	} catch(error) {
		pdLogger.error("email addr failed: " + addr);
	}
	return pdCheckDomain(list, addr, domain, type);
}

// check mail hops
function pdCheckMailHop(list, hop) {
	pdLogger.debug("checkMailHop(" + hop + ")");
	return false;
}

// check link
function pdCheckLink(list, link, type) {
	// check for empty links
	if (link === undefined || link === null || link.length == 0 || link.startsWith("#")) {
		return null;
	}
	pdLogger.debug("checkLink(" + link + ")");
	// check for email link
	if (link.startsWith("mailto:")) {
		return {
			status: pdCheckEmailAddress(list, link.substring(7), type + "_mailto"),
			mode: "email"
		}
	}
	// check for javascript attempts
	else if (link.startsWith("javascript:")) {
		pdLogger.info("JavaScript link: " + link);
		return null;
	}
	// check domain
	try {
		// make sure there is a protocol defined (defaults to 'http://')
		if (link.indexOf('://') == -1) {
			link = 'http://' + link;
		}
		// check link and its full domain
		let url = new URL(link);
		return {
			status: pdCheckDomain(list, link, url.hostname, type),
			mode: "link"
		}
	}
	catch(e) {
		pdLogger.info("checkLink('" + link + "') => " + e);
	}
	return null;
}

// check MIME part of the email
function pdCheckMIMEPart(list, part, rc, skip) {
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
				pdCheckMIMEPart(list, part.parts[i], rc, true);
			}
			return;
		default:
			pdLogger.debug("Skipped MIME type: " + part.contentType);
			for (let i = 0; i < part.parts.length; i++) {
				pdLogger.debug("==> " + part.parts[i].contentType);
			}
			break;
	}
	if (usePart === null || usePart.body === null || bodyType === null) {
		if (!skip) {
			pdLogger.info("checkMIMEPart(): no usable body content found for scanning: " + part.contentType);
		}
		return;
	}
	
	// shared code to process links
	var processLink = function(link,rc) {
		var res = pdCheckLink(list, link, "email_link");
		if (res === null) {
			return;
		}
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
			processLink(link, rc, "email_link");
		}
	} else if (bodyType == "text/plain") {
		// scan plain text
		reg = new RegExp("\\s?((http|https|ftp)://[^\\s<]+[^\\s<\.)])", "gim");
		while ((result = reg.exec(usePart.body)) !== null) {
			processLink(result[1], rc, "email_link");
		}
	}
}

/*****************************************************************************
 * Dissect and analyze email message (MIME format with headers)
 *****************************************************************************/

// process a MIME message object
function pdInspectEMail(email) {
	pdLogger.debug("inspectEMail(): " + email.headers.from);
	
	// check for "real" email (and not a draft)
	if (email.headers["message-id"] === undefined) {
		pdLogger.log("Skipping unsent email (no message id)");
		return null;
	}
	
	// compile a list of incidents
	var tagList = new pdTagList();
	pdLogger.debug("tagList = " + tagList);
	var list = [];

	// check sender(s) of email
	pdLogger.debug(JSON.stringify(email.headers));
	var count = 0;
	var total = 1;
	if (pdCheckEmailAddress(tagList, email.headers.from, "email_from")) {
		count++;
	}
	if (email.headers.sender !== undefined) {
		total += email.headers.sender.length; 
		email.headers.sender.forEach(sender => {
			if (pdCheckEmailAddress(tagList, sender, "email_sender")) {
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
		if (pdCheckEmailAddress(tagList, email.headers["reply-to"], "email_replyto")) {
			count++;
		}
	}
	if (email.headers["return-path"] !== undefined) {
		total += email.headers["return-path"].length;
		email.headers["return-path"].forEach(replyTo => {
			if (pdCheckEmailAddress(tagList, replyTo, "email_return")) {
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
			if (pdCheckMailHop(tagList, hop)) {
				count++;
			}
		});
	}
	if (email.headers["x-received"] !== undefined) {
		total += email.headers["x-received"].length;
		email.headers["x-received"].forEach(hop => {
			if (pdCheckMailHop(tagList, hop)) {
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
		pdCheckMIMEPart(tagList, part, rc, false);
	});
	if (rc.countLinks > 0) {
		list.push("Links (" + rc.countLinks + "/" + rc.totalLinks + ")");
	}
	if (rc.countEmail > 0) {
		list.push("Email addresses (" + rc.countEmail + "/" + rc.totalEmail + ")");
	}

	// get the email identifier in the database
	var label = "From " + email.headers.from + " (" + email.headers.date + ")";
	var emailId = pdDatabase.getEmailId(email.headers["message-id"][0], label);
	pdLogger.debug("email id: " + emailId);
	if (emailId == 0) {
		return null;
	}

	// insert tags into the database.
	for (let i = 0; i < tagList.data.length; i++) {
		let tag = tagList.data[i];
		pdLogger.debug("Adding tag: " + tag);
		// get the database id of the tag
		let tagId = pdDatabase.getTagId(tag.raw, tag.type, tag.hash, tag.indicator);
		// get the database of the email_tag record
		let emailTagId = pdDatabase.getEmailTagId(emailId, tagId);
		// record incident if indicator found
		if (tag.indicator != 0) {
			pdDatabase.recordIncident(emailTagId);
		}
	}
	
	// TEST mode: The demo incidents are not recorded and reported.
	if (pdPrefs.test && list.length == 0) {
		let rate = pdPrefs.test_rate / 100;
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
 * Utilities
 *****************************************************************************/

// stringify elapsed time since 'v'
function pdGetElapsedTime(v) {
	const ELAPSED_TIME = [
		{ label: "month", v: 2592000 },
		{ label: "days", v: 86400 },
		{ label: "hours", v: 3600 },
		{ label: "mins", v: 60 }
	];
	var msg = "---";
	if (v > 0) {
		let ts = new Date(v*1000);
		let elapsed = Math.floor((Date.now() - ts.getTime()) / 1000);
		let elapsedMsg = elapsed + " secs";
		for (let i = 0; i < ELAPSED_TIME.length; i++) {
			let c = Math.floor(elapsed / ELAPSED_TIME[i].v);
			if (c > 0) {
				elapsedMsg = c + " " + ELAPSED_TIME[i].label;
				break;
			}
		}
		msg = "More than " + elapsedMsg + " ago (" +
			ts.toLocaleDateString() + " " +
			ts.toLocaleTimeString() + ")";
	}
	return msg;
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
