import assert from 'node:assert/strict';
import { utf8ToBytes } from '@noble/ciphers/utils.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { isCode, keygen, lock, unlock, newCode, open, openBytes, randomBytes, safetyNumber, seal, sealBytes, sharedKey } from './crypto';

const a = keygen();
const b = keygen();
const kab = sharedKey(a.secret, b.pub);
assert.deepEqual(kab, sharedKey(b.secret, a.pub), 'both sides derive the same key');

const box = seal(kab, { t: 'm', body: 'hello ✓ 🙂' });
assert.deepEqual(open(kab, box), { t: 'm', body: 'hello ✓ 🙂' });
assert.notEqual(seal(kab, 1), seal(kab, 1), 'fresh nonce each time');

const eve = keygen();
assert.throws(() => open(sharedKey(eve.secret, a.pub), box), 'other keys cannot open');
const tampered = box.slice(0, 40) + (box[40] === 'A' ? 'B' : 'A') + box.slice(41);
assert.throws(() => open(kab, tampered), 'tampering is detected');

const file = new Uint8Array(300_000).map((_, i) => i * 7);
const fk = randomBytes(32);
assert.deepEqual(openBytes(fk, sealBytes(fk, file)), file, 'file round trip');
const t0 = Date.now();
openBytes(fk, sealBytes(fk, new Uint8Array(5_000_000)));
assert.ok(Date.now() - t0 < 5000, '5 MB under 5 s');

for (let i = 0; i < 200; i++) assert.ok(isCode(newCode()));
assert.ok(!isCode('ABCDEFG0') && !isCode('abcdefgh') && !isCode('ABCDEFG'));

assert.equal(safetyNumber(a.pub, b.pub), safetyNumber(b.pub, a.pub));
assert.match(safetyNumber(a.pub, b.pub), /^(\d{5} ){11}\d{5}$/);

(async () => {
  const k = await pbkdf2Async(sha256, utf8ToBytes('password'), utf8ToBytes('salt'), { c: 1, dkLen: 32 });
  assert.equal(Buffer.from(k).toString('hex'), '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b', 'RFC 7914 vector');
  const t1 = Date.now();
  const blob = await lock('correct horse', { a: [1, 2] });
  assert.deepEqual(await unlock('correct horse', blob), { a: [1, 2] });
  await assert.rejects(unlock('wrong', blob));
  await assert.rejects(unlock('x', '{"nope":1}'));
  assert.ok(Date.now() - t1 < 3000);
  console.log('crypto ok');
})();
