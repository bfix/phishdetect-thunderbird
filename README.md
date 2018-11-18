
# PhishDetect for Thunderbird

(c) 2018 Bernd Fix <brf@hoi-polloi.org>   >Y<

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or (at
your option) any later version.

This program is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.

This repository contains the Thunderbird extension for **PhishDetect** that
detects and blocks links in emails based on the analysis of the email content
(links, email addresses, domain names, mail hops and more). 

### About the PhishDetect project

**PhishDetect** is a tool to help at-risk users to identify potential phishing
attacks. It is able to automatically analyze suspicious links and web pages
and in few seconds alert of suspect phishing.

The **PhishDetect** [project](https://phishdetect.io) and its
[repositories](https://github.com/phishdetect) are developed and
maintained by Claudio Guarnieri. More information about the
project and its objectives can be found on the referenced websites.

## Installation

### Preparing for installation (optional)

To get the top-level domain name (stripped of all sub-domains), the extension
uses a [trie data structure](https://en.wikipedia.org/wiki/Trie) to keep a
list of all "registered" public suffixes. Since the list changes over time,
you might want to create a newer list:

```bash
cd helpers
go build -o gen-tldTrie gen-tldTrie.go
./gen-tldTrie
```

The created list is stored in `tldTrie.json`. Replace the existing list
in `extension/chrome/content/lib/pd-tld.js` (at line `var pdTldTrie = `)
with the content of the JSON file.

You can test the generated list with some domain names:

```bash
./gen-tldTrie -i tldTrie.json -c mail.google.co.uk,example.blogspot.co.uk,www.sub.test.gov
Reading JSON file...
Unmarshalling object...
Lookup:
    mail.google.co.uk ==> google.co.uk
    example.blogspot.co.uk ==> example.blogspot.co.uk
    www.sub.test.gov ==> test.gov
```

### Packaging the extension

Change into the `extension` folder and create a ZIP archive of all files and
folders in that directory. On Linux you can run:

```bash
cd extension
zip -r ../phishdetect.xpi .
```
This creates an installer file for Thunderbird in the base directory of the
repository.

## Runtime

### Keep an eye on the log files

This extension is highly experimental, so expect failures and misbehavior at
any time. Open the developer toolbox (`Tools > Developer Tools > Developer Toolbox`)
and check the `Console` log for messages from the extension. The source files
of the extension are named `phishdetect.js` and `pd-*.js`, so you can easily
identify problems...

### PhishDetect database

The extension will create and use a SQLite database `pishdetect.sqlite` in the
profile folder. **BEWARE**: The table schemas may change from commit to commit, so
if you are running an older version of the extension, it might be necessary to
remove the old database file before starting Thunderbird with the new version of
the extension. Consult the error log in the debugger console to check for errors.

## Testing

For testing it is necessary to add own indicators to the database, so that the
extension can find and flag suspicious emails in your test account. While Thunderbird
is not running, add test indicators:

```bash
$ cd $profile
$ sqlite phishdetect.sqlite
sqlite> insert or ignore into indicators(indicator) values
('007f1dbe16d6a6d8dcc0bbdde514864a7af68a08823674ebd0cf640cbe2490b9'),
('019e560588abb2fb090bf08dc5f26e5851ad40629de00b3da367ea9453f4e90e'),
:
('fe28444d2c814d22fcf0db77a40c65b51ea3cb862d28b8c475090cf1c6d68d8a'),
('ff8ce94b940557de35c13ad6d385fe0cc3cd68763b9297c6a305699c71283df2');
sqlite> ^D
```
Test indicators (field `kind` is 0) are persistent across node syncs, but
you have to add them every time the database is removed and re-created. So
best keep the SQL insert statement in a file for multiple uses.

To generate a list of test indicators yourself, edit the file
`extension/chrome/content/libs/pd-client.js` and find the comment
`TESTING: log indicator`. Uncomment the following `console.log` statement
and re-package and re-install the modified extension. Go to the email folder
containing your test emails and select `PhishDetect > Scan emails in folder`
in the context menu of the folder.

You can now copy the list of logged indicators from the console and paste them
into an editor. Select unique indicators to be used for testing; don't include
all indicators or all emails will be detected and flagged by PhishDetect!
20% seems to be a reasonable choice...

Don't forget to undo the change in `extension/chrome/content/libs/pd-client.js`
(or the log will be cluttered with indicators). Re-package and re-install the
extension for further testing.

## Using the extension

### Activate features

To make full use of the extension, you need to manually activate two features:

#### Toolbar menu

Click on the Mail tab toolbar and select "Customize...". Drag the PhishDetect
item from the list onto the toolbar at your preferred position. Your toolbar
will now look like this:

![PhishDetect Toolbar screenshot](https://github.com/bfix/phishdetect-thunderbird/tree/raw/master/docs/img/pd-toolbar.png)

#### PhishDetect flag in email list

You can add a PhishDetect column to the email list. Select the "columns
display" icon and activate "PhishDetect". The column will appear and you can
drag it to any position you prefer; the result will look like this:

![PhishDetect column screenshot](https://github.com/bfix/phishdetect-thunderbird/tree/raw/master/docs/img/pd-column.png)

### Scanning email

The extension will automatically check each incoming email, so no manual
intervention is necessary. You can force a (re-)check of emails by opening
the context menu (right-click) for either an email folder or a single email
and selecting the scan/check function.

If you have enabled thePhishDetect column, you will be able to identify
detected emails at first glance.

If you select a detected (phishing) email in the mail view, you will notice
an additional header above the email body to notify you of a problem with
this email:

![PhishDetect notification bar screenshot](https://github.com/bfix/phishdetect-thunderbird/tree/raw/master/docs/img/pd-notification-bar.png)

Click "Hide Details/Show Details" to toggle the display of additional
information. The details include the date of detection by PhishDetect and a
list of problems it found in the email like known phishing sender and many
more.

All links in the email display have been blocked by the extension; blocked
links are visually represented by a prefixed "[BLOCKED:" text. You can unblock
links if you have to (for example to copy the linked address), but only
temporarily. The next time the message is displayed, all links are blocked
again.


### Checking links

If you receive emails that are not flagged by PhishDetect and find some
suspicious links in them you don't know and want to evaluate, you can ask
the PhishDetect node to perform checks on the link and the website behind it.
To do so, you open the context menu over the link in the email body and
select "Check Link..." in the PhishDetect submenu. The result of the check
is displayed in a separate dialog box.
