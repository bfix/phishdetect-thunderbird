
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
