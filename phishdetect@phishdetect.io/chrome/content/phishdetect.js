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
					// evaluate body by PhishDetect engine.
					var rc = (Math.random() > 0.5 ? "true" : "false");
					aCallback(aMsgHdr, rc);
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
	var selFolders = gFolderTreeView.getSelectedFolders();
	if (selFolders.length != 1) {
		alert("None or multiple folders selected - PhishDetect not run");
		return;
	}
	var folder = selFolders[0];	
	
	var msgArray = folder.messages;
	var count = folder.getTotalMessages(false);
	var pos = 1;
	var flagged = 0;
	while (msgArray.hasMoreElements()) {
		statusMsg('Evaluating emails in folder: ' + pos + "/" + count);
	    let msgHdr = msgArray.getNext().QueryInterface(Components.interfaces.nsIMsgDBHdr);
		check(msgHdr, function(aMsgHdr, aRC) {
			aMsgHdr.setStringProperty("X-Custom-PhishDetect", aRC);
			if (aRC == 'true')
				flagged++;
		});
		pos++;
	}
	statusMsg('Evaluated ' + count + ' emails in folder: ' + flagged + ' suspicious.');
}

/*****************************************************************************
 * Filter incoming emails
 *****************************************************************************/

var newMailListener = {
	msgAdded: function(hdr) {
		if (!hdr.isRead) {
			check(hdr, function(aMsgHdr, aRC) {
				aMsgHdr.setStringProperty("X-Custom-PhishDetect", aRC);
			});
		}
	}
};

/*****************************************************************************
 * Handle PhishDetect column in message list
 *****************************************************************************/

var columnHandler = {
	getCellText: function(row, col) {
		return null;
	},
	getSortStringForRow: function(hdr) {
		var hdr = gDBView.getMsgHdrAt(row);
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
		var hdr = gDBView.getMsgHdrAt(row);
		var status = hdr.getStringProperty("X-Custom-PhishDetect");
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

window.addEventListener("load", function() {
	
	// add filter for incoming mails
	var notificationService = Components.classes["@mozilla.org/messenger/msgnotificationservice;1"]
		.getService(Components.interfaces.nsIMsgFolderNotificationService);
	notificationService.addListener(newMailListener, notificationService.msgAdded);

	// add custom column for PhishDetect in message list view
	var observerService = Components.classes["@mozilla.org/observer-service;1"]
		.getService(Components.interfaces.nsIObserverService);
	observerService.addObserver(createDbObserver, "MsgCreateDBView", false);
	
	// notify user
	statusMsg("Started.");
}, false);
