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
 * BloomFilter instances for detection.
 *****************************************************************************/

var bfPositives = null;
var bfNegatives = null;

/*****************************************************************************
 * Preferences (key/value pairs of options)
 *****************************************************************************/

// Get the PhishDetect preferences branch
var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                    .getService(Components.interfaces.nsIPrefService)
                    .getBranch("extensions.phishdetect.");

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
	}
	if (req !== null) {
		prop.body = req;
		prop.headers = { "Content-Type": "application/json" };
	}
	var url = getPrefString("node_url") + uri;
	fetch(url, prop)
		.then((response) => response.json())
		.then(handler)
		.catch(error => { console.log(error); })
}

/*****************************************************************************
 * Service methods provided
 *****************************************************************************/

// fetch latest indicators
function fetchIndicators() {
	sendRequest(
		"/api/indicators/fetch/",
		"GET",
		null,
		function(response) {
			// store indicators in preferences
			prefs.setCharPref("indicators", JSON.stringify(response));
			// add indicators to bloomfilter
			var indList = []
			if (response.domains !== null) {
				for (var i = 0; i < response.domains.length; i++) {
					indList.push(response.domains[i]);
				}
			}
			if (response.emails !== null) {
				for (i = 0; i < response.emails.length; i++) {
					indList.push(response.emails[i]);
				}
			}
			var numIndicators = indList.length;
			if (numIndicators > 0) {
				bfPositives = NewBloomFilter().init(numIndicators, 0.000001);
				if (!bfPositives.valid) {
					console.error("Can't create bloomfilter instance");
					bfPositives = null;
				} else {
					for (i = 0; i < numIndicators; i++) {
						bfPositives.add(indList[i]);
					}
				}
			}
		}
	);
}

// send a notification about found indicator
function sendEvent(eventType, indicator, hashed) {
	sendRequest(
		"/api/events/add/",
		"POST",
		JSON.stringify({
			"type": eventType,
			"indicator": indicator,
			"hashed": hashed,
			"target_contact": getPrefString("contact")
		}),
		function(response) {}
	);
}

// check if a string is contained in the list of indicators 
function checkForIndicator(s) {
	// console.log("==> checkForIndicator(" + s + ")");
	// create entry for lookup
	var hash = sha256.create();
	hash.update(s);
	var indicator = hash.array();
	
	// check for entry in BloomFilter
	if (bfPositives !== null && bfPositives.contains(indicator)) {
		if (bfNegatives === null || !bfNegatives.contains(indicator)) {
			return true;
		}
	}
	return false;
}

/*****************************************************************************
 * Dissect and analyze email message (MIME format with headers)
 *****************************************************************************/

// check domain
function checkDomain(name) {
	// console.log("checkDomain(" + name + ")");
	// check full hostname (subdomain+.domain)
	if (checkForIndicator(name)) {
		return true
	}
	// check effective top-level domain
	var tld = getDomainName(name);
	if (tld == name) {
		return false;
	}
	return checkForIndicator(tld);
}

// check email address
function checkEmailAddress(addr) {
	// check if addr is a list of addresses
	if (Array.isArray(addr)) {
		for (var i = 0; i < addr.length; i++) {
			checkEmailAddress(addr[i]);
		}
		return;
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
	if (checkForIndicator(addr)) {
		return true;
	}
	// check email domain
	var domain;
	try {
		domain = addr.split("@")[1];
	} catch(error) {
		console.error("addr=" + addr);
	}
	return checkDomain(domain);
}

// check mail hops
function checkMailHop(hop) {
	// console.log("checkMailHop(" + hop + ")");
	return false;
}

// check link
function checkLink(link) {
	// console.log("checkLink(" + link + ")");
	// check for email link
	if (link.startsWith("mailto:")) {
		return {
			status: checkEmailAddress(link.substring(7)),
			mode: "email"
		}
	}	
	// check domain
	var url = new URL(link);
	return {
		status: checkDomain(url.hostname),
		mode: "link"
	}
}

// check MIME part of the email
function checkMIMEPart(part, rc, skip) {
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
				checkMIMEPart(part.parts[i], rc, true);
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
		var res = checkLink(link);
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
			processLink(link,rc);
		}
	} else if (bodyType == "text/plain") {
		// scan plain text
		reg = new RegExp("\\s?((http|https|ftp)://[^\\s<]+[^\\s<\.)])", "gim");
		while ((result = reg.exec(usePart.body)) !== null) {
			processLink(result[1],rc);
		}
	}
}

/*****************************************************************************
 * Dissect and analyze email message (MIME format with headers)
 *****************************************************************************/

// process a MIME message object
function inspectEMail(email) {
	console.log("inspectEMail(): " + email.headers.from);
	var list = [];

	// check sender(s) of email
	// console.log(JSON.stringify(email.headers));
	var count = 0;
	var total = 1;
	if (checkEmailAddress(email.headers.from)) {
		count++;
	}
	if (email.headers.sender !== undefined) {
		total += email.headers.sender.length; 
		email.headers.sender.forEach(sender => {
			if (checkEmailAddress(sender)) {
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
		if (checkEmailAddress(email.headers["reply-to"])) {
			count++;
		}
	}
	if (email.headers["return-path"] !== undefined) {
		total += email.headers["return-path"].length;
		email.headers["return-path"].forEach(replyTo => {
			if (checkEmailAddress(replyTo)) {
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
			if (checkMailHop(hop)) {
				count++;
			}
		});
	}
	if (email.headers["x-received"] !== undefined) {
		total += email.headers["x-received"].length;
		email.headers["x-received"].forEach(hop => {
			if (checkMailHop(hop)) {
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
		checkMIMEPart(part, rc, false);
	});
	if (rc.countLinks > 0) {
		list.push("Links (" + rc.countLinks + "/" + rc.totalLinks + ")");
	}
	if (rc.countEmail > 0) {
		list.push("Email addresses (" + rc.countEmail + "/" + rc.totalEmail + ")");
	}
	
	// DEMO mode:
	if (getPrefBool("demo") && list.length == 0) {
		if (Math.random() < 0.2) {
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
