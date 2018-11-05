
/*****************************************************************************
 * PhishDetect client library.
 *****************************************************************************/

//----------------------------------------------------------------------
// Preferences (key/value pairs of options)
//----------------------------------------------------------------------

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

//----------------------------------------------------------------------
// Node message exchange
//----------------------------------------------------------------------

// Send JSON-encoded request and expect JSON-encoded response.
function sendRequest(uri, method, req, handler) {
	var prop = {
		method: method
	}
	if (req != null) {
		prop.body = req;
		prop.headers = { "Content-Type": "application/json" };
	}
	var url = getPrefString("node_url") + uri;
	fetch(url, prop)
		.then((response) => response.json())
		.then(handler)
		.catch(error => { console.log(error); })
}

//----------------------------------------------------------------------
// Service methods provided
//----------------------------------------------------------------------

// fetch latest indicators
function fetchIndicators() {
	sendRequest(
		"/api/indicators/fetch/",
		"GET",
		null,
		function(response) {
			prefs.setCharPref("indicators", JSON.stringify(response));
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

//----------------------------------------------------------------------
// Dissect and analyze email message (MIME format with headers)
//----------------------------------------------------------------------

function inspectEMail(email) {
	if (Math.random() > 0.5) {
		return {
			phish: true,
			date: Date.now(),
			indications: [
				"Sender", "ReplyTo", "Sender domain", "Mail hops (1/2)",
				"Links (3/15)", "Mail addresses (3/3)"
			]
		}
	}
	return {
		phish: false,
		date: Date.now(),
		indications: []
	}
}
