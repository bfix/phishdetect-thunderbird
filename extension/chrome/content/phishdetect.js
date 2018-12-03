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

	
/*****************************************************************************
 * Scan email content for phishing using the PhishDetect engine
 *****************************************************************************/

// Check PhishDetect status for a message.
function pdCheckMessage(aMsgHdr, aCallback) {
	// callback for MIME reader
	var cb = function (aMsgHdr, aMimeMsg) {
		// evaluate body by PhishDetect engine.
		let rc = pdInspectEMail(aMsgHdr, aMimeMsg);
		// callback to invoker
		if (rc !== null) {
			aCallback(aMsgHdr, rc);
		}
	};
	// get message in MIME format
	MsgHdrToMimeMessage (aMsgHdr, null, cb, true, {
		partsOnDemand: false, examineEncryptedParts: false
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
		// set message flag to reflect detection status
		pdSetMsgFlag(aMsgHdr, aRC);
		pdStatusMsg(aRC.status !== 1 ? "Suspicious email content!" : "Email looks clean");
		// TODO: update rendering of message
	});
}

// Scan all emails in a folder (no-multi-select, no recursion!)
function pdScanFolder() {
	// get selected folder
	var selFolders = gFolderTreeView.getSelectedFolders();
	if (selFolders.length !== 1) {
		alert("None or multiple folders selected - PhishDetect not run");
		return;
	}
	var folder = selFolders[0];
	
	// disable "scan folder" until done
	document.getElementById('pd-context-folder').disabled = true;

	// check all emails in folder (not recursive!)
	// and count suspicious emails detected
	var msgArray = folder.messages;
	var count = folder.getTotalMessages(false);
	var pos = 1;
	var flagged = 0;
	
	// callback for check function
	var cb = function(aMsgHdr, aRC) {
		// set message header to reflect detection status
		pdSetMsgFlag(aMsgHdr, aRC);
		if (aRC.status === -1) {
			flagged++;
		}
		// status feedback
		pdStatusMsg('Inspected ' + pos + ' of ' + count + ' emails in folder: ' + flagged + ' suspicious.');
		pos++;
		// TODO: update rendering of message 
	}

	// process all message headers
	var loop = setInterval(function(){
		if (msgArray.hasMoreElements()) {
			let hdr = msgArray.getNext().QueryInterface(Ci.nsIMsgDBHdr);
			pdCheckMessage(hdr, cb);
		} else {
			// stop looping
			clearInterval(loop);
			// enable "scan folder" again
			document.getElementById('pd-context-folder').disabled = false;
			pdStatusMsg('Folder scan complete: ' + flagged + ' suspicious emails found.');
		}
	}, pdPrefs.node_scan_delay);
}

// check if a header is flagged for 'phishing'
function pdCheckForPhish(aMsgHdr) {
	var rc = pdGetMsgFlag(aMsgHdr);
	if (rc === null) {
		return false;
	}
	return rc.status === -1;
}

/*****************************************************************************
 * handle email state changes (new incoming, permanently deleted)
 *****************************************************************************/

// callback for email state changes
var pdMailListener = {
	// new incoming email
	msgAdded: function(aMsgHdr) {
		// evaluate message body and record email status
		if (!aMsgHdr.isRead) {
			pdCheckMessage(aMsgHdr, function(aMsgHdr, aRC) {
				pdSetMsgFlag(aMsgHdr, aRC);
			});
		}
	},
	// permanent deletion of email
	msgsDeleted: function(list) {
		var iter = list.enumerate();
		// handle all elements in the list
		while (iter.hasMoreElements()) {
			// get next element (email database header)
			let hdr = iter.getNext().QueryInterface(Ci.nsIMsgDBHdr);
			// remove email from database
			pdDatabase.removeEmail(hdr.messageId);
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
	if (doc.body === null) {
		return;
	}
	if (doc.body.getAttribute('phishdetect') !== 'true' || !aMode) {
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

// sync indicator list with back-end node
function pdSyncWithNode() {
	// get latest indicators
	pdStatusMsg("Fetching indicators...");
	pdFetchIndicators(
		// cbFetch
		function(rc, msg) {
			var out = "";
			switch (rc) {
				case -1:
					out = "Database error -- " + msg;
					break;
				case 1:
					out = (msg === "DONE" ? "Fetched indicators." : "Fetch cancelled.");
					break;
			}
			if (out.length > 0) {
				pdStatusMsg(out);
				pdLogger.info(out);
			}
		},
		// cbRescan
		function(email_keys) {
			// show rescan dialog
			if (email_keys.length > 0) {
				window.openDialog(
					'chrome://phishdetect/content/pd-rescan.xul',
					'pd-dlg-rescan',
					'chrome,centerscreen,titlebar,width=1000,height=500',
					email_keys
				);
			}
		}
	);
}

// get timestamp of last node sync
function pdGetLastSync() {
	var v = pdPrefs.node_sync_last;
	return pdGetElapsedTime(v);
}

//get timestamp of last report
function pdGetLastReport() {
	var v = pdPrefs.reports_last;
	return pdGetElapsedTime(v);
}

// taskScheduler is called periodically to check for pending syncs
function pdTaskScheduler() {
	var now = Date.now() / 1000;
	pdLogger.debug("taskScheduler(" + now + "):");

	// get last sync timestamps and intervals
	var lastNodeSync = pdPrefs.node_sync_last_try;
	pdLogger.debug("=> last node sync: " + lastNodeSync);
	var nodeSyncInterval = pdPrefs.node_sync * 60; // minutes
	pdLogger.debug("=> node sync interval: " + nodeSyncInterval);
	var lastReportSync = pdPrefs.reports_last_try;
	pdLogger.debug("=> last report sync: " + lastReportSync);
	var reportSyncInterval = 3600; // every hour
	
	// check for pending node sync
	if (nodeSyncInterval > 0 && now > (lastNodeSync + nodeSyncInterval)) {
		// get latest indicators
		pdSyncWithNode();
	}
	
	// check for pending node sync
	if (now > (lastReportSync + reportSyncInterval)) {
		// send pending incidents
		pdStatusMsg("Sending pending incident reports...");
		let num = pdSendReport(null, pdPrefs.reports_context, null);
		let msg = (num > 0 ? num + " pending incident reports sent." : "No incidents to be reported.");
		pdStatusMsg(msg);
		pdLogger.info(msg);
	}	
}	


/*****************************************************************************
 * Handle notification bar
 *****************************************************************************/

function pdHandleNotificationBar(msgId, rc) {
	// flagged as suspicious?
	if (rc.status === -1) {
		// yes: set notification bar content
		let ts = new Date(rc.date);
		document.getElementById('pd-scan-date').innerHTML =
			"Indications (found on " +
			ts.toLocaleDateString() + " " +
			ts.toLocaleTimeString() + "):";
		
		// helper function to add list entries
		let list = document.getElementById("pd-indications-list");
		while (list.itemCount > 0) {
			list.removeItemAt(0);
		}
		let addEntry = function(entry) {
			let row = document.createElement('listitem');
			// add content
		    let cell = document.createElement('listcell');
		    cell.setAttribute('label', entry.raw);
		    row.appendChild(cell);
		    // add type label
		    cell = document.createElement('listcell');
		    cell.setAttribute('label', entry.type);
		    row.appendChild(cell);
		    list.appendChild(row);				
		}
		// show indications for this email
		let inds = pdDatabase.getIndications(msgId);
		if (inds.length > 0) {
			for (let i = 0; i < inds.length; i++) {
				addEntry(inds[i]);
			}
			list.rows = Math.min(5, inds.length);
		} else {
			addEntry('None [DEMO-Mode]');
			list.rows = 1;
		}
		// show PhishDetect notification bar
		document.getElementById('pd-deck').collapsed = false;
	}
}


/*****************************************************************************
 * Initialize the PhishDetect extension.
 *****************************************************************************/

// make sure we do all this just once...
if (window.pdExtensionLoaded === undefined) {
	window.pdExtensionLoaded = true;
	window.pdScanning = null;
	console.info("Extension loaded.");

	// Start PhishDetect extension when Thunderbird has loaded its main window.
	window.addEventListener("load", function load() {
		// run only once...
	    window.removeEventListener("load", load, false);
		
		// add filter for incoming mails
		var notificationService = Cc["@mozilla.org/messenger/msgnotificationservice;1"]
			.getService(Ci.nsIMsgFolderNotificationService);
		var flags = notificationService.msgAdded | notificationService.msgsDeleted;
		notificationService.addListener(pdMailListener, flags);
	
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
					},
					onEndHeaders: function() {
						// check if email is tagged by PhishDetect
						var hdr = gFolderDisplay.selectedMessage;
						var msgId = hdr.messageId;
						var rc = pdGetMsgFlag(hdr);

						// unprocessed email?
						if (rc === null) {
							// scan running?
							if (window.pdScanning === null) {
								pdLogger.debug("Starting scan: " + msgId);
								window.pdScanning = msgId;
								// email is unprocessed: check now
								pdCheckMessage(hdr, function(hdr, rc) {
									// scan complete...
									window.pdScanning = null;
									pdLogger.debug("onEndHeaders: checked email: " + msgId + " ==> " + rc);
									pdSetMsgFlag(hdr, rc);
									// show notification bar (if applicable)
									pdHandleNotificationBar(msgId, rc);
								});
							}
						} else {
							// show notification bar (if applicable)
							pdHandleNotificationBar(msgId, rc);
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
		
	    // initialize extension core
		pdInit();
	
		// setup periodic scheduler for synchronization tasks (every minute)
		setInterval(pdTaskScheduler, 60000);
	
	}, false);
}
