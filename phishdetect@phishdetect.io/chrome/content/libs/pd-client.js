
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
function sendRequest(req, uri) {
	var resp = null;
	var url = getPrefString("node_url") + uri;
	fetch(url)
		.then(function(raw) {
			return raw.json();
		})
		.then(function(response) {
			resp = response;
		});
	return resp;
}

//----------------------------------------------------------------------
// Service methods provided
//----------------------------------------------------------------------

// fetch latest indicators (bloomfilters)
function fetchIndicators() {
	var uri = "/api/indicators/fetch";
	var indicators = sendRequest('', uri);
	prefs.setCharPref("indicators", indicators);
}