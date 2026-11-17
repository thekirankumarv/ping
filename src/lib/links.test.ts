import assert from 'node:assert/strict';
import { embed, firstUrl, parseOg } from './links';

assert.equal(firstUrl('see https://example.com/a?b=1, nice'), 'https://example.com/a?b=1');
assert.equal(firstUrl('no links here'), undefined);

assert.deepEqual(embed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), { type: 'youtube', id: 'dQw4w9WgXcQ', tall: false });
assert.deepEqual(embed('https://youtube.com/shorts/abcdefghijk?si=x'), { type: 'youtube', id: 'abcdefghijk', tall: true });
assert.deepEqual(embed('https://youtu.be/dQw4w9WgXcQ'), { type: 'youtube', id: 'dQw4w9WgXcQ', tall: false });
assert.deepEqual(embed('https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ'), { type: 'youtube', id: 'dQw4w9WgXcQ', tall: false });
assert.deepEqual(embed('https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=x'), { type: 'instagram', id: 'C1a2B3c4D5e', kind: 'reel' });
assert.deepEqual(embed('https://instagram.com/reels/C1a2B3c4D5e'), { type: 'instagram', id: 'C1a2B3c4D5e', kind: 'reel' });
assert.equal(embed('https://example.com/watch?v=dQw4w9WgXcQ'), null);

const og = parseOg(`<html><head><title>Fallback</title>
<meta property="og:title" content="Tom &amp; Jerry">
<meta content="A cat &#39;n mouse" name="description">
<meta property="og:image" content="/img.png"></head>`);
assert.deepEqual(og, { title: 'Tom & Jerry', desc: "A cat 'n mouse", site: undefined, image: '/img.png' });
assert.equal(parseOg('<title>Only title</title>').title, 'Only title');
assert.equal(parseOg(`<meta property="og:title" content="It's here">`).title, "It's here");

console.log('links ok');
