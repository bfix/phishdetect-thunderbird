
//localized string bundle
var pdStringBundle = null; 

function pdGetString(key) {
	// initialize string bundle
	if (pdStringBundle === null) {
		pdStringBundle = document.getElementById('pdStringBundle');
	}
	return pdStringBundle.getString(key);
}
