/*
 * ============================================================================
 * PhishDetect for Thunderbird
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

/* N.B.: You need to include "pd-client.js" before this file! */

Cu.import("resource:///modules/gloda/mimemsg.js");

// nsIMessenger instance for access to messages
var pdMessenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

	
/*****************************************************************************
 * Scan email content for phishing using the PhishDetect engine
 *****************************************************************************/

// Check PhishDetect status for a message.
function pdCheckMessage(aMsgHdr, aCallback) {
	// callback for MIME reader
	var cb = function (aMsgHdr, aMimeMsg) {
		// evaluate body by PhishDetect engine.
		let rc = pdInspectEMail(aMimeMsg);
		// callback to invoker
		aCallback(aMsgHdr, rc);
	};
	// get message in MIME format
	MsgHdrToMimeMessage (aMsgHdr, null, cb, true, {
		partsOnDemand: false, examineEncryptedParts: true
	});
}

/*****************************************************************************
 * Scan email(s) for phishing content from context menu
 *****************************************************************************/

// Scan single email message.
function pdScanEmail() {
	pdStatusMsg('Evaluating email...');
	var hdr = gFolderDisplay.selectedMessage;
	pdCheckMessage(hdr, function(aMsgHdr, aRC) {
		// set message header to reflect detection status
		aMsgHdr.setStringProperty("X-Custom-PhishDetect", JSON.stringify(aRC));
		pdStatusMsg(aRC.phish ? "Suspicious email content!" : "Email looks clean");
		// check for auto-send report
		if (pdGetPrefInt('reports_sync') == -1) {
			pdSendReport(null, pdGetPrefBool('reports_context'), pdGetPrefBool('reports_hashed'), null);
		}
		// TODO: update rendering of message
	});
}

// Scan all emails in a folder (no-multi-select, no recursion!)
function pdScanFolder() {
	// get selected folder
	var selFolders = gFolderTreeView.getSelectedFolders();
	if (selFolders.length != 1) {
		alert("None or multiple folders selected - PhishDetect not run");
		return;
	}
	var folder = selFolders[0];	
	
	// check all emails in folder (not recursive!)
	// and count suspicious emails detected
	var msgArray = folder.messages;
	var count = folder.getTotalMessages(false);
	var pos = 1;
	var flagged = 0;

	// callback for check function
	var cb = function(aMsgHdr, aRC) {
		// set message header to reflect detection status
		aMsgHdr.setStringProperty("X-Custom-PhishDetect", JSON.stringify(aRC));
		if (aRC.phish) {
			flagged++;
			// check for auto-send report
			if (pdGetPrefInt('reports_sync') == -1) {
				pdSendReport(null, pdGetPrefBool('reports_context'), pdGetPrefBool('reports_hashed'), null);
			}
		}
		// status feedback
		pdStatusMsg('Evaluated ' + pos + ' of ' + count + ' emails in folder: ' + flagged + ' suspicious.');
		pos++;
		// TODO: update rendering of message 
	}
	// process all messages
	while (msgArray.hasMoreElements()) {
		// evaluate email content
		let msgHdr = msgArray.getNext().QueryInterface(Components.interfaces.nsIMsgDBHdr);
		pdCheckMessage(msgHdr, cb);
	}
}

// get PhishDetect header object
function pdGetPhishDetectStatus(aMsgHdr) {
	var field = aMsgHdr.getStringProperty("X-Custom-PhishDetect");
	if (field === null || field.length === 0) {
		return null;
	}
	return JSON.parse(field);
}

// check if a header is flagged for 'phishing'
function pdCheckForPhish(aMsgHdr) {
	var rc = pdGetPhishDetectStatus(aMsgHdr);
	if (rc === null) {
		return false;
	}
	return rc.phish;
}

/*****************************************************************************
 * Filter incoming emails
 *****************************************************************************/

// Callback for incoming emails: Evaluate message body and add a new header
// attribute 'X-Custom-PhishDetect' to record email status.
var pdNewMailListener = {
	msgAdded: function(aMsgHdr) {
		if (!aMsgHdr.isRead) {
			pdCheckMessage(aMsgHdr, function(aMsgHdr, aRC) {
				aMsgHdr.setStringProperty("X-Custom-PhishDetect", JSON.stringify(aRC));
				// check for auto-send report
				if (aRC.phish && pdGetPrefInt('reports_sync') == -1) {
					pdSendReport(null, pdGetPrefBool('reports_context'), pdGetPrefBool('reports_hashed'), null);
				}
			});
		}
	}
};

/*****************************************************************************
 * Sanitize message
 *****************************************************************************/

// Sanitize (remove/modify possible suspicious content) from a HTML node
// (and its successors) in a message display.
function pdSanitize(node, mode) {
	// modify DOM on the fly
	switch (node.nodeName) {
		case 'A':
			if (mode) {
				// mode = true: save and reset link target
				node.oldHref = node.href;
				node.href = ' ';
				// visually tag blocked links
				let text = node.innerHTML;
				node.innerHTML = "[<span style='color: #f00; font-weight: bold;'>BLOCKED</span>:"+text+"]";
			} else {
				// mode = false: unblock links
				node.href = node.oldHref;
				// visually untag blocked links
				let text = node.innerHTML;
				text = text.replace(
						'[<span style="color: #f00; font-weight: bold;">BLOCKED</span>:',
						"[<span style='color: #f80; font-weight: bold;'>DANGER</span>:"
				);
				node.innerHTML = text;
			}
			break;
	}
	// recursively iterate over child nodes
	var nodes = node.childNodes;
	for (let i = 0; i < nodes.length; i++) {
        pdSanitize(nodes[i], mode);
	}
}

// Sanitize (remove/modify possible suspicious content) from the HTML document
// used to render/display the message content.
function pdShowSanitizedMsg(aMode) {
	// go through the message body and sanitize it
	var browser = window.document.getElementById('messagepane');
	var doc = browser.contentDocument;
	// TODO: check obsolence of getAttribute
	
	if (doc.body.getAttribute('phishdetect') != 'true' || !aMode) {
		// only process once...
		doc.body.setAttribute('phishdetect','true');
		// process email body
		pdSanitize(doc.body, aMode);
	}
}


/*****************************************************************************
 * Handle status messages
 *****************************************************************************/

// Display message on Thunderbird status bar.
function pdStatusMsg(msg) {
	document.getElementById("statusText").label = "PhishDetect: " + msg;
}


/*****************************************************************************
 * Task scheduler
 *****************************************************************************/

// taskScheduler is called periodically to check for pending syncs
function pdTaskScheduler() {
	var now = Date.now() / 1000;
	pdLogger.debug("taskScheduler(" + now + "):");

	// get last sync timestamps and intervals
	var lastNodeSync = pdGetPrefInt('node_sync_last');
	pdLogger.debug("=> last node sync: " + lastNodeSync);
	var nodeSyncInterval = pdGetPrefInt('node_sync') * 60; // minutes
	pdLogger.debug("=> node sync interval: " + nodeSyncInterval);
	var lastReportSync = pdGetPrefInt('reports_sync_last');
	pdLogger.debug("=> last report sync: " + lastReportSync);
	var reportSyncInterval = pdGetPrefInt('reports_sync') * 86400; // days
	pdLogger.debug("=> report sync interval: " + reportSyncInterval);
	
	// check for pending node sync
	if (nodeSyncInterval > 0 && now > (lastNodeSync + nodeSyncInterval)) {
		// get latest indicators
		pdStatusMsg("Fetching indicators...");
		pdFetchIndicators(function(rc, msg){
			var out = "";
			switch (rc) {
				case -1:
					out = "Database error -- " + msg;
					break;
				case 1:
					out = (msg == "DONE" ? "Fetched indicators." : "Fetch cancelled.");
					break;
			}
			if (out.length > 0) {
				pdStatusMsg(out);
				pdLogger.log(out);
			}
		});
	}
	
	// check for pending node sync
	if (reportSyncInterval > 0 && now > (lastReportSync + reportSyncInterval)) {
		// send pending incidents
		pdStatusMsg("Sending pending incident reports...");
		pdSendReport(null, pdGetPrefBool('reports_context'), pdGetPrefBool('reports_hashed'), null);
		let msg = "Pending incident reports sent.";
		pdStatusMsg(msg);
		pdLogger.log(msg);
	}	
}	


/*****************************************************************************
 * Initialize the PhishDetect extension.
 *****************************************************************************/

// Start PhishDetect extension when Thunderbird has loaded its main window.
window.addEventListener("load", function load() {
	// run only once...
    window.removeEventListener("load", load, false);
	
	// add filter for incoming mails
	var notificationService = Cc["@mozilla.org/messenger/msgnotificationservice;1"]
		.getService(Ci.nsIMsgFolderNotificationService);
	notificationService.addListener(pdNewMailListener, notificationService.msgAdded);

	// add custom column for PhishDetect in message list view
	Services.obs.addObserver(pdObserver, "MsgCreateDBView", false);

	// handle message display
	var messagePane = GetMessagePane();
	if (messagePane) {
		// register PhishDetect callbacks:
		
		// (1) message pane is loaded
		messagePane.addEventListener("load", function(event) {
			gMessageListeners.push({
				onStartHeaders: function() {
					// default is no PhishDetect notification bar
					document.getElementById('pd-deck').collapsed = true;
					pdShowDetails(true);
					document.getElementById("pd-block").collapsed = false;
					for (let i = 0; i < 6; i++) {
						document.getElementById('pd-reason-'+i).collapsed = true;
					}
				},
				onEndHeaders: function() {
					// check if email is tagged by PhishDetect
					var hdr = gFolderDisplay.selectedMessage;
					var rc = pdGetPhishDetectStatus(hdr);
					if (rc !== null && rc.phish) {
						// set notification bar content
						let ts = new Date(rc.date);
						document.getElementById('pd-scan-date').innerHTML =
							"Indications (found on " +
							ts.toLocaleDateString() + " " +
							ts.toLocaleTimeString() + "):";
						for (let i = 0; i < rc.indications.length; i++) {
							var txt = document.getElementById('pd-reason-'+i);
							txt.innerHTML = rc.indications[i];
							txt.collapsed = false;
						}
						// show PhishDetect notification bar
						document.getElementById('pd-deck').collapsed = false;
					}
				},
				onStartAttachments: function() {},
				onEndAttachments: function() {
					// display sanitized attachments ?!
				},
				onBeforeShowHeaderPane: function() {}
			});
		}, true);
		
		// (2) close PhishDetect notification bar when message pane is unloaded
		messagePane.addEventListener("unload", function(event) {
			document.getElementById('pd-deck').collapsed = true;
		}, true);

		// (3) when DOM content of the email is loaded
		messagePane.addEventListener("DOMContentLoaded", function(event) {
			// check if email is tagged by PhishDetect
			var hdr = gFolderDisplay.selectedMessage;
			if (hdr !== null && pdCheckForPhish(hdr)) {
				// display sanitized message
				pdShowSanitizedMsg(true);
			}
		}, true);

		// (4) handle context menu events in the message pane
		messagePane.addEventListener("contextmenu", pdMailViewContext, true);
    }
	
    // Connect to (and initialize) database
	pdInitDatabase();

	// setup periodic scheduler for synchronization tasks (every minute)
	setInterval(pdTaskScheduler, 60000);

}, false);
