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

function NewBloomFilter(obj) {
	return {
		numBits:	(obj == undefined ? 0 : obj.numBits),						// number of bits in filter
		numIdx:		(obj == undefined ? 0 : obj.numIdx),						// number of indices
		numIdxBits: (obj == undefined ? 0 : obj.numIdxBits),					// number of bits per index
		bits:		(obj == undefined ? null : base64js.toByteArray(obj.bits)),	// bit storage
		valid:		(obj == undefined ? false : true),
		debug: false,
		
		init: function(numEntries, fpRate) {
			let numIdx = Math.ceil(-Math.log2(falsePositiveRate));
			let numBits = Math.ceil((numIdx*numExpected) / math.Ln2);
			this.initDirect(numBits, numIdx);
		},
		
		initDirect: function(numBits, numIdx) {
			let numIdxBits = Math.ceil(Math.log2(numBits));
			this.numBits = numBits;
			this.numIdx = numIdx;
			this.numIdxBits = numIdxBits;
			this.bits = new Uint8Array((numBits+7)/8);
			this.valid = (numIdxBits * numIdx <= 512);				
		},
		
		add: function(entry) {
			let list = this.indexList(entry);
			for (var i = 0; i < list.length; i++) {
				let r = this.resolve(list[i]);
				this.bits[r.pos] |= r.mask;
			}
		},

		contains: function(entry) {
			let list = this.indexList(entry);
			for (var i = 0; i < list.length; i++) {
				let r = this.resolve(list[i]);
				if ((this.bits[r.pos] & r.mask) == 0) {
					return false;
				}
			}
			return true;
		},
		
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
			var x = hash.array();
			for (var j = 0; j < 32; j++) {
				totalIdx[32+j] = x[j];
			}
			var totalSize = totalIdx.length;
			
			var list = new Array();
			let mask = (1 << this.numIdxBits) - 1;
			for (var i = 0; i < this.numIdx; i++) {
				let offset = i * this.numIdxBits
				let pos = offset >> 3;
				var v = 0;
				for (var j = 0; j < 4; j++) {
					let k = totalSize-4-pos+j;
					let x = (k < 0 ? 0 : totalIdx[k]);
					v = 256*v + x;
				}
				let idx = ((v >> (offset & 7)) & mask) % this.numBits;
				list.push(idx);
			}
			return list
		},

		resolve: function(idx) {
			return { pos: idx >> 3, mask: 1 << (idx & 7) };
		},
	}
}
