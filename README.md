
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
in `extension/chrome/content/lib/tld.js` (at line `var tldTrie = `)
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
