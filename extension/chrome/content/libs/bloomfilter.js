/*
 * ============================================================================
 * BloomFilter: space/time efficient lookup map for objects.
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

//----------------------------------------------------------------------
// A BloomFilter is a space/time efficient set of unique entries. It can
// not enumerate its elements, but can check if an entry is contained in
// the set. The check always succeeds for a contained entry, but can
// create "false-positives" (entries not contained in the map give a
// positive result). By adjusting the number of bits in the BloomFilter
// and the number of indices generated for an entry, a BloomFilter can
// handle a given number of entries with a desired upper-bound for the
// false-positive rate.
//----------------------------------------------------------------------

function NewBloomFilter(obj) {
	return {
		//--------------------------------------------------------------
		// Implementation
		//--------------------------------------------------------------

		// initialize attributes
		numBits:	(obj === undefined ? 0 : obj.numBits),                          // number of bits in filter
		numIdx:     (obj === undefined ? 0 : obj.numIdx),                           // number of indices
		numIdxBits: (obj === undefined ? 0 : obj.numIdxBits),                       // number of bits per index
		bits:		(obj === undefined ? null : base64js.toByteArray(obj.bits)),    // bit storage
		valid:		(obj === undefined ? false : true),
		debug: false,
		
		// initialize BloomFilter from number of entries and upper-bound
		// of the "false-positive" rate.
		init: function(numEntries, fpRate) {
			console.log("BloomFilter.init(" + numEntries + "," + fpRate + ")");
			let numIdx = Math.ceil(-Math.log2(fpRate));
			let numBits = Math.ceil((numIdx*numEntries) / Math.LN2);
			this.initDirect(numBits, numIdx);
			return this;
		},
		
		// initialize BloomFilter from a give number of filter bits and
		// indices. N.B.: This implementation can only handle a maximum
		// of 512 index bits = numIdx * ceil(log2(numBits))!!!
		initDirect: function(numBits, numIdx) {
			console.log("BloomFilter.initDirect(" + numBits + "," + numIdx + ")");
			let numIdxBits = Math.ceil(Math.log2(numBits));
			this.numBits = numBits;
			this.numIdx = numIdx;
			this.numIdxBits = numIdxBits;
			this.bits = new Uint8Array((numBits+7) >> 3);
			this.valid = (numIdxBits * numIdx <= 512);
			return this;
		},
		
		// add an entry to the BloomFilter
		add: function(entry) {
			let list = this.indexList(entry);
			for (var i = 0; i < list.length; i++) {
				let r = this.resolve(list[i]);
				this.bits[r.pos] |= r.mask;
			}
			return this;
		},

		// check if the BloomFilter contains an entry
		contains: function(entry) {
			let list = this.indexList(entry);
			for (var i = 0; i < list.length; i++) {
				let r = this.resolve(list[i]);
				if ((this.bits[r.pos] & r.mask) === 0) {
					return false;
				}
			}
			return true;
		},
		
		//--------------------------------------------------------------
		// Helper functions
		//--------------------------------------------------------------
		
		// return the list of indices of an entry
		indexList: function(entry) {
			var totalIdx = new Uint8Array(64);
			var hash = sha256.create();
			hash.update(entry);
			var x = hash.array();
			for (var j = 0; j < 32; j++) {
				totalIdx[j] = x[j];
			}
			hash = sha256.create();
			hash.update(entry);
			hash.update(entry);
			x = hash.array();
			for (j = 0; j < 32; j++) {
				totalIdx[32+j] = x[j];
			}
			var totalSize = totalIdx.length;
			
			var list = [];
			let mask = (1 << this.numIdxBits) - 1;
			for (var i = 0; i < this.numIdx; i++) {
				let offset = i * this.numIdxBits
				let pos = offset >> 3;
				var v = 0;
				for (j = 0; j < 4; j++) {
					let k = totalSize-4-pos+j;
					let m = (k < 0 ? 0 : totalIdx[k]);
					v = 256*v + m;
				}
				let idx = ((v >> (offset & 7)) & mask) % this.numBits;
				list.push(idx);
			}
			return list
		},

		// convert an index into byte/bit positions
		resolve: function(idx) {
			return { pos: idx >> 3, mask: 1 << (idx & 7) };
		},
	}
}
