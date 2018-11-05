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

Components.utils.import("resource:///modules/gloda/mimemsg.js");

// nsIMessenger instance for access to messages
var gMessenger = Components.classes["@mozilla.org/messenger;1"]
	.createInstance(Components.interfaces.nsIMessenger);


/*****************************************************************************
 * Scan email content for phishing using the PhishDetect engine
 *****************************************************************************/

// Evaluate body by PhishDetect engine.
function evaluateMessage(msg) {
	return (Math.random() > 0.5 ? "true" : "false");
}

// Check PhishDetect status for a message.
async function checkMessage(aMsgHdr, aCallback) {
	await new Promise(
		function(resolve) {
			// get message in MIME format
			MsgHdrToMimeMessage (
				aMsgHdr,
				null,
				function (aMsgHdr, aMimeMsg) {
					// evaluate body by PhishDetect engine.
					let rc = inspectEMail(aMimeMsg);
					// callback to invoker
					aCallback(aMsgHdr, rc);
					// fulfill promise
					resolve();
				},
				true,
				{ partsOnDemand: false, examineEncryptedParts:true }
			);
			return;
		}
	);
}

/*****************************************************************************
 * Scan email(s) for phishing content from context menu
 *****************************************************************************/

// Scan single email message.
function scanEmail() {
	statusMsg('Evaluating email...');
	var hdr = gFolderDisplay.selectedMessage;
	checkMessage(hdr, function(aMsgHdr, aRC) {
		aMsgHdr.setStringProperty("X-Custom-PhishDetect", JSON.stringify(aRC));
		statusMsg(aRC.phish ? "Suspicious email content!" : "Email looks clean");
	});
}

// Scan all emails in a folder (no-multi-select, no recursion!)
function scanFolder() {
	// get selected folder
	let selFolders = gFolderTreeView.getSelectedFolders();
	if (selFolders.length != 1) {
		alert("None or multiple folders selected - PhishDetect not run");
		return;
	}
	let folder = selFolders[0];	
	
	// check all emails in folder (not recursive!)
	// and count suspicious emails detected
	let msgArray = folder.messages;
	let count = folder.getTotalMessages(false);
	let pos = 1;
	let flagged = 0;
	while (msgArray.hasMoreElements()) {
		statusMsg('Evaluating emails in folder: ' + pos + "/" + count);
		// evaluate email content
		let msgHdr = msgArray.getNext().QueryInterface(Components.interfaces.nsIMsgDBHdr);
		checkMessage(msgHdr, function(aMsgHdr, aRC) {
			aMsgHdr.setStringProperty("X-Custom-PhishDetect", JSON.stringify(aRC));
			if (aRC.phish)
				flagged++;
		});
		pos++;
	}
	// status feedback
	statusMsg('Evaluated ' + count + ' emails in folder: ' + flagged + ' suspicious.');
}

// get PhishDetect header object
function getPhishDetectStatus(aMsgHdr) {
	let field = aMsgHdr.getStringProperty("X-Custom-PhishDetect");
	if (field == null || field.length == 0) {
		return null;
	}
	return JSON.parse(field);
}

// check if a header is flagged for 'phishing'
function checkForPhish(aMsgHdr) {
	let rc = getPhishDetectStatus(aMsgHdr);
	if (rc == null) {
		return false;
	}
	return rc.phish;
}

/*****************************************************************************
 * Filter incoming emails
 *****************************************************************************/

// Callback for incoming emails: Evaluate message body and add a new header
// attribute 'X-Custom-PhishDetect' to record email status.
var newMailListener = {
	msgAdded: function(aMsgHdr) {
		if (!aMsgHdr.isRead) {
			checkMessage(aMsgHdr, function(aMsgHdr, aRC) {
				aMsgHdr.setStringProperty("X-Custom-PhishDetect", JSON.stringify(aRC));
			});
		}
	}
};

/*****************************************************************************
 * Sanitize message
 *****************************************************************************/

// Sanitize (remove/modify possible suspicious content) from a HTML node
// (and its successors) in a message display.
function sanitize(node) {
	// modify DOM on the fly
	switch (node.nodeName) {
		case 'A':
			// save and reset link target
			node.oldHref = node.href;
			node.href = ' ';
			// visually tag blocked links
			let text = node.innerHTML;
			node.innerHTML = "[<span style='color: #f00; font-weight: bold;'>BLOCKED</span>:"+text+"]";
			break;
	}
	// recursively iterate over child nodes
	let nodes = node.childNodes;
	for (var i = 0; i < nodes.length; i++) {
        sanitize(nodes[i]);
	}
}

// Sanitize (remove/modify possible suspicious content) from the HTML document
// used to render/display the message content.
function showSanitizedMsg(aMsgHdr, aEvent) {
	// go through the message body and sanitize it
	let browser = window.document.getElementById('messagepane');
	let doc = browser.contentDocument;
	// TODO: check obsolence of getAttribute
	if (doc.body.getAttribute('phishdetect') != 'true') {
		// only process once...
		doc.body.setAttribute('phishdetect','true');
		// process email body
		sanitize(doc.body);
	}
}

/*****************************************************************************
 * Handle PhishDetect column in message list
 *****************************************************************************/

// Handler for the PhishDetect column in the message list.
var pdColumnHandler = {
	getCellText: function(row, col) {
		return null;
	},
	getSortStringForRow: function(row) {
		let hdr = gDBView.getMsgHdrAt(row);
		return ""+checkForPhish(hdr);
	},
	isString: function() {
		return true;
	},
	getCellProperties: function(row, col, props){
	},
	getRowProperties: function(row, props){
	},
	getImageSrc: function(row, col) {
		let hdr = gDBView.getMsgHdrAt(row);
		if (checkForPhish(hdr))
			return "chrome://phishdetect/content/icon16.png";
		return null;
	},
	getSortLongForRow: function(hdr) {
		return 0;
	}
};

// Register observer for PhishDetect column.
var pdObserver = {
	observe: function(aMsgFolder, aTopic, aData) {  
		gDBView.addColumnHandler("pd-column-item", pdColumnHandler);
	}
};

/*****************************************************************************
 * Handle status messages
 *****************************************************************************/

// Display message on Thunderbird status bar.
function statusMsg(msg) {
	document.getElementById("statusText").label = "PhishDetect: " + msg;
}

/*****************************************************************************
 * Handle notification bar functionality:
 * - expand/hide of details
 * - unblock links
 *****************************************************************************/

// toggle show/hide details
function showDetails(reset) {
	let btn = document.getElementById("pd-details");
	let details = document.getElementById("pd-indications");
	if (reset || btn.getAttribute('data-state') == "1") {
		btn.setAttribute("data-state", "0");
		btn.label = "Show Details";
		details.collapsed = true;
	} else {
		btn.setAttribute("data-state", "1");
		btn.label = "Hide Details";
		details.collapsed = false;
	}
}

// unblock links
function unblockLinks() {
	let btn = document.getElementById("pd-block");
	alert("Unblocking links... (can only run once!)");
	btn.collapsed = true;
}

/*****************************************************************************
 * Initialize the PhishDetect extension.
 *****************************************************************************/

// Start PhishDetect extension when Thunderbird has loaded its main window.
window.addEventListener("load", function load() {
	// run only once...
    window.removeEventListener("load", load, false);
	
	// add filter for incoming mails
	let notificationService = Components.classes["@mozilla.org/messenger/msgnotificationservice;1"]
		.getService(Components.interfaces.nsIMsgFolderNotificationService);
	notificationService.addListener(newMailListener, notificationService.msgAdded);

	// add custom column for PhishDetect in message list view
	let observerService = Components.classes["@mozilla.org/observer-service;1"]
		.getService(Components.interfaces.nsIObserverService);
	observerService.addObserver(pdObserver, "MsgCreateDBView", false);

	// handle message display
	let messagePane = GetMessagePane();
	if (messagePane) {
		// register PhishDetect callbacks:
		
		// (1) message pane is loaded
		messagePane.addEventListener("load", function(event) {
			gMessageListeners.push({
				onStartHeaders: function() {
					// default is no PhishDetect notification bar
					document.getElementById('pd-deck').collapsed = true;
					showDetails(true)
					document.getElementById("pd-block").collapsed = false;
					for (var i = 0; i < 6; i++) {
						document.getElementById('pd-reason-'+i).collapsed = true;
					}
				},
				onEndHeaders: function() {
					// check if email is tagged by PhishDetect
					let hdr = gFolderDisplay.selectedMessage;
					let rc = getPhishDetectStatus(hdr);
					if (rc.phish) {
						// set notification bar content
						let ts = new Date(rc.date);
						document.getElementById('pd-scan-date').innerHTML = "Indications (found on " + ts + "):";
						for (var i = 0; i < rc.indications.length; i++) {
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
			let hdr = gFolderDisplay.selectedMessage;
			if (hdr != null && checkForPhish(hdr)) {
				// display sanitized message
				showSanitizedMsg(hdr, event);
			}
		}, true);
    }
	
	// get latest indicators
	statusMsg("Fetching indicators...");
	fetchIndicators();
	
	// notify user
	statusMsg("Started.");
}, false);
