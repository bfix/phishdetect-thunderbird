/*
 * ============================================================================
 * Generate Trie data structure from public suffixes (top-level domain).
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

package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
)

//----------------------------------------------------------------------
// Trie of public suffix TLDs. A TLD can either be of form "lvl1",
// "lvl2.lvl1", "lvl3.lvl2.lvl1" and so forth (dot-separated strings).
//----------------------------------------------------------------------

// TrieNode is the building block of a trie
type TrieNode map[string]TrieNode

// Add a dot-separated string to a trie node
func (t TrieNode) Add(s string) {
	levels := strings.Split(s, ".")
	l := len(levels)
	currNode := t
	for i := l; i > 0; i-- {
		lvl := levels[i-1]
		n, ok := currNode[lvl]
		if !ok {
			n = make(TrieNode)
			currNode[lvl] = n
		}
		currNode = n
	}
}

// Lookup returns the longest dot-separated string that
// is found from this node downwards.
func (t TrieNode) Lookup(s string) string {
	levels := strings.Split(s, ".")
	l := len(levels)
	currNode := t
	match := ""
	for i := l; i > 0; i-- {
		lvl := levels[i-1]
		n, ok := currNode[lvl]
		if !ok {
			return lvl + "." + match
		}
		if len(match) > 0 {
			match = "." + match
		}
		match = lvl + match
		currNode = n
	}
	return match
}

//----------------------------------------------------------------------
// Create a JSON representation of public-suffix TLDs.
//----------------------------------------------------------------------

// command-line arguments
var (
	url     string // URL of public suffix list
	inFile  string // JSON input file (optional)
	outFile string // JSON output file
	check   string // comma-separated list of domain names
)

func main() {
	// process command line arguments
	flag.StringVar(&url, "u", "https://publicsuffix.org/list/public_suffix_list.dat", "URL for public suffix list")
	flag.StringVar(&inFile, "i", "", "Input JSON file")
	flag.StringVar(&outFile, "o", "tldTrie.json", "Output JSON file")
	flag.StringVar(&check, "c", "", "Check domain name(s)")
	flag.Parse()

	root := make(TrieNode)

	//------------------------------------------------------------------
	// If an input JSON is specified, we assume a "test" run with
	// domain names to check.
	//------------------------------------------------------------------
	if len(inFile) > 0 {
		// read input file
		fmt.Println("Reading JSON file...")
		data, err := ioutil.ReadFile(inFile)
		if err != nil {
			log.Fatal(err)
		}
		// convert to trie object
		fmt.Println("Unmarshalling object...")
		if err := json.Unmarshal(data, &root); err != nil {
			log.Fatal(err)
		}
		// lookup all domain names
		fmt.Println("Lookup:")
		for _, s := range strings.Split(check, ",") {
			s = strings.TrimSpace(s)
			fmt.Println("    " + s + " ==> " + root.Lookup(s))
		}
		return
	}

	//------------------------------------------------------------------
	// The list of "registered" top-level domains is pulled live from
	// "https://publicsuffix.org/list/public_suffix_list.dat"
	//------------------------------------------------------------------

	response, err := http.Get(url)
	if err != nil {
		log.Fatal(err)
	}
	defer response.Body.Close()

	//------------------------------------------------------------------
	// process list
	//------------------------------------------------------------------
	rdr := bufio.NewReader(response.Body)
loop:
	for {
		data, _, err := rdr.ReadLine()
		if err != nil {
			if err == io.EOF {
				break
			}
			log.Fatal(err)
		}
		// skip comments and complex rules
		if len(data) == 0 || data[0] == '/' || data[0] == '*' || data[0] == '!' {
			continue
		}
		// skip empty lines
		s := strings.TrimSpace(string(data))
		if len(s) == 0 {
			continue
		}
		// only handle ASCII strings
		for _, ch := range s {
			if int(ch) >= 127 {
				continue loop
			}
		}
		// add to trie
		root.Add(s)
	}

	// convert trie to JSON
	data, err := json.Marshal(root)
	if err != nil {
		log.Fatal(err)
	}

	// write output file
	fOut, err := os.Create(outFile)
	if err != nil {
		log.Fatal(err)
	}
	defer fOut.Close()

	// split into shorter lines
	s := string(data)
	start := 0
	pos := 0
	for pos < len(s) {
		idx := strings.Index(s[pos:], ",")
		if idx < 0 {
			fOut.WriteString(s[start:] + "\n")
			break
		}
		pos += idx + 1
		if (pos - start) < 80 {
			continue
		}
		fOut.WriteString(s[start:pos] + "\n")
		start = pos
	}
}
