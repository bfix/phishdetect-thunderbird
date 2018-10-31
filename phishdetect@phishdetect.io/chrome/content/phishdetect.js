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

async function check(aMsgHdr, aCallback) {
	await new Promise(
		function(resolve) {
			// get message in MIME format
			MsgHdrToMimeMessage (
				aMsgHdr,
				null,
				function (aMsgHdr, aMimeMsg) {

					//--------------------------------------------------
					// evaluate body by PhishDetect engine.
					//--------------------------------------------------
					let rc = (Math.random() > 0.5 ? "true" : "false");
					
					// callback to invoker
					aCallback(aMsgHdr, rc);
					// fulfill promise
					resolve();
				},
				true,
				{
					partsOnDemand: false,
					examineEncryptedParts:true
				}
			);
			return;
		}
	);
}

/*****************************************************************************
 * Scan email(s) for phishing content from context menu
 *****************************************************************************/

function scanEmail() {
	statusMsg('Evaluating email...');
	var hdr = gFolderDisplay.selectedMessage;
	check(hdr, function(aMsgHdr, aRC) {
		aMsgHdr.setStringProperty("X-Custom-PhishDetect", aRC);
		statusMsg(aRC == 'true' ? "Suspicious email content!" : "Email looks clean");
	});
}

function scanFolder() {
	// get selected folder (no-multi-select!)
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
		check(msgHdr, function(aMsgHdr, aRC) {
			aMsgHdr.setStringProperty("X-Custom-PhishDetect", aRC);
			if (aRC == 'true')
				flagged++;
		});
		pos++;
	}
	// status feedback
	statusMsg('Evaluated ' + count + ' emails in folder: ' + flagged + ' suspicious.');
}

/*****************************************************************************
 * Filter incoming emails
 *****************************************************************************/

var newMailListener = {
	msgAdded: function(aMsgHdr) {
		if (!aMsgHdr.isRead) {
			check(aMsgHdr, function(aMsgHdr, aRC) {
				aMsgHdr.setStringProperty("X-Custom-PhishDetect", aRC);
			});
		}
	}
};

/*****************************************************************************
 * Sanitize message
 *****************************************************************************/

function sanitize(node) {
	// modify DOM on the fly
	switch (node.nodeName) {
		case 'A':
			// save and reset link target
			let oldHref = node.getAttribute('href');
			node.setAttribute('href_old', oldHref);
			node.setAttribute('href',' ');
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

function showSanitizedMsg(aMsgHdr, aEvent) {
	// get the URL of the message to be displayed
	let uri = aMsgHdr.folder.getUriForMsg(aMsgHdr);
	let neckoURL = {};
	let msgService = gMessenger.messageServiceFromURI(uri);
	msgService.GetUrlForUri(uri, neckoURL, null);
	let url = neckoURL.value;

	// go through the message body and sanitize it
	let browser = window.document.getElementById('messagepane');
	let doc = browser.contentDocument;
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

var columnHandler = {
	getCellText: function(row, col) {
		return null;
	},
	getSortStringForRow: function(row) {
		let hdr = gDBView.getMsgHdrAt(row);
		return hdr.getStringProperty("X-Custom-PhishDetect");
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
		let status = hdr.getStringProperty("X-Custom-PhishDetect");
		if (status == 'true')
			return "chrome://phishdetect/content/icon16.png";
		return null;
	},
	getSortLongForRow: function(hdr) {
		return 0;
	}
};

var createDbObserver = {
	observe: function(aMsgFolder, aTopic, aData) {  
		gDBView.addColumnHandler("pd-column-item", columnHandler);
	}
};

/*****************************************************************************
 * Handle status messages
 *****************************************************************************/

function statusMsg(msg) {
	document.getElementById("statusText").label = "PhishDetect: " + msg;
}

/*****************************************************************************
 * Initialize the PhishDetect extension.
 *****************************************************************************/

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
	observerService.addObserver(createDbObserver, "MsgCreateDBView", false);

	// handle message display
	let messagePane = GetMessagePane();
	if (messagePane) {
		// register PhishDetect callbacks:
		
		// (1) message pane is loaded
		messagePane.addEventListener("load", function(event) {
			gMessageListeners.push({
				onStartHeaders: function() {
					// default is no PhishDetect notification bar
					document.getElementById('pd-deck').setAttribute('collapsed', 'true');
				},
				onEndHeaders: function() {
					// check if email is tagged by PhishDetect
					let hdr = gFolderDisplay.selectedMessage;
					if (hdr.getStringProperty("X-Custom-PhishDetect") == "true") {
						// show PhishDetect notification bar
						document.getElementById('pd-deck').setAttribute('collapsed', 'false');
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
			document.getElementById('pd-deck').setAttribute('collapsed', 'true');
		}, true);

		// (3) when DOM content of the email is loaded
		messagePane.addEventListener("DOMContentLoaded", function(event) {
			// check if email is tagged by PhishDetect
			let hdr = gFolderDisplay.selectedMessage;
			if (hdr.getStringProperty("X-Custom-PhishDetect") == "true") {
				// display sanitized message
				showSanitizedMsg(hdr, event);
			}
		}, true);
    }
	
	// notify user
	statusMsg("Started.");
}, false);
