
//localized string bundle
var pdStringBundle = null; 

function pdGetString(key, namespace) {
	// initialize string bundle
	if (pdStringBundle === null) {
		pdStringBundle = document.getElementById(namespace);
	}
	return pdStringBundle.getString(key);
}
