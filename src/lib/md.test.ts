import assert from 'node:assert/strict';
import { inline, parse, plain, toggleTask } from './md';

assert.deepEqual(inline('a **b** c'), [
  { t: 'text', v: 'a ' },
  { t: 'b', c: [{ t: 'text', v: 'b' }] },
  { t: 'text', v: ' c' },
]);
assert.deepEqual(inline('**bold _it_**'), [
  {
    t: 'b',
    c: [
      { t: 'text', v: 'bold ' },
      { t: 'i', c: [{ t: 'text', v: 'it' }] },
    ],
  },
]);
assert.deepEqual(inline('`a*b*`'), [{ t: 'code', v: 'a*b*' }]);
assert.deepEqual(inline('snake_case_name'), [{ t: 'text', v: 'snake_case_name' }], 'underscores inside words stay');
assert.deepEqual(inline('2 * 3 * 4'), [{ t: 'text', v: '2 * 3 * 4' }], 'spaced stars are not italic');
assert.deepEqual(inline('\\*not\\*'), [{ t: 'text', v: '*not*' }]);
assert.deepEqual(inline('see https://x.dev/a?b=1.'), [
  { t: 'text', v: 'see ' },
  { t: 'link', v: 'https://x.dev/a?b=1' },
  { t: 'text', v: '.' },
]);
assert.deepEqual(inline('||secret||'), [{ t: 'spoiler', c: [{ t: 'text', v: 'secret' }] }]);
assert.deepEqual(inline('unclosed **bold'), [{ t: 'text', v: 'unclosed **bold' }]);

const src = '# Title\nhello\nworld\n\n```ts\nconst a = 1;\n\n**x**\n```\n- [ ] milk\n- [x] eggs\n- item\n  - nested\n1. one\n> quote\n> more';
const b = parse(src);
assert.deepEqual(
  b.map((x) => x.t),
  ['h', 'p', 'gap', 'code', 'task', 'task', 'li', 'li', 'li', 'quote'],
);
assert.deepEqual(b[3], { t: 'code', lang: 'ts', v: 'const a = 1;\n\n**x**' });
assert.equal(b[4].t === 'task' && b[4].line, 9);
assert.equal(b[5].t === 'task' && b[5].done, true);
assert.equal(b[7].t === 'li' && b[7].depth, 1);
assert.equal(b[8].t === 'li' && b[8].n, 1);
assert.deepEqual(parse('```\nopen fence'), [{ t: 'code', lang: '', v: 'open fence' }], 'unclosed fence keeps the rest as code');

const ticked = toggleTask(src, 9, true);
assert.ok(ticked.includes('- [x] milk'));
assert.ok(toggleTask(ticked, 10, false).includes('- [ ] eggs'));

assert.equal(plain('**Hi** ||x|| `y`\n- [ ] a'), 'Hi ▒▒▒▒ y ☐ a');

console.log('md ok');
