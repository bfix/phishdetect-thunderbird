
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

**This software is part of the PhishDetect project.**

The **PhishDetect** [project](https://phishdetect.io) and its
[repositories](https://github.com/phishdetect) are developed and
maintained by Claudio Guarnieri. For more information about the
project and its objectives see the referenced websites.

## A Thunderbird extension for PhishDetect 

This repository contains the Thunderbird extension for PhishDetect that
detects and blocks links in emails based on the analysis of suspicious
links, email addresses, domain names, mail hops and web pages. 

**This is experimental software! Do not use in a production environment!**

### Preparing for installation

Change into the `phishdetect@phishdetect.io` folder and create a ZIP archive
of all files and folders in that directory. On Linux you can run:

```bash
cd phishdetect\@phishdetect.io
zip -r ../phishdetect.xpi .
```
This creates an installer file for Thunderbird in the base directory of this
repository.
