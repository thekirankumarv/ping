// Two simulated phones talking through an in-memory relay.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as core from './core';
import { b64, keygen } from './crypto';

type Phone = { id: string; key: ReturnType<typeof keygen>; sql: core.Sql };
function phone(id: string): Phone {
  const d = new DatabaseSync(':memory:');
  const sql: core.Sql = {
    exec: (s) => d.exec(s),
    run: (s, ...a) => void d.prepare(s).run(...a),
    all: (s, ...a) => d.prepare(s).all(...a) as never,
    get: (s, ...a) => d.prepare(s).get(...a) as never,
  };
  return { id, key: keygen(), sql };
}
const A = phone('alice');
const B = phone('bob');
const pubs: Record<string, string> = { alice: b64(A.key.pub), bob: b64(B.key.pub) };

let queue: { id: number; sender: string; recipient: string; box: string }[] = [];
let seq = 0;
let current: Phone = A;
const as = <T>(p: Phone, f: () => T): T => {
  current = p;
  core.init(p.sql, { id: p.id, secret: p.key.secret });
  return f();
};
const tr: core.Transport = {
  put: async (rows) => void rows.forEach((r) => queue.push({ id: ++seq, sender: current.id, ...r })),
  pubOf: async (id) => pubs[id],
};
let now = 1_000_000;
core.setClock(() => now);
// One sync round: flush my outbox, then download what is mine.
async function sync(p: Phone) {
  current = p;
  core.init(p.sql, { id: p.id, secret: p.key.secret });
  await core.flush(tr);
  const mine = queue.filter((r) => r.recipient === p.id);
  queue = queue.filter((r) => r.recipient !== p.id);
  await core.receive(mine, tr);
  await core.flush(tr);
}
const both = async () => {
  await sync(A);
  await sync(B);
  await sync(A);
};

(async () => {
  // Pairing: Alice adds Bob's code, Bob accepts.
  as(A, () => assert.equal(core.addContact('bob', pubs.bob, 'Bob'), 'sent'));
  await sync(A);
  await sync(B);
  as(B, () => assert.equal(core.contact('alice')?.state, 'in'));
  as(B, () => assert.equal(core.sendText('alice', 'too early'), undefined, 'no messages before accept'));
  as(B, () => core.accept('alice', 'Alice'));
  await both();
  as(A, () => assert.equal(core.contact('bob')?.state, 'ok'));

  // Message, delivered, read.
  const id = as(A, () => core.sendText('bob', 'hi **bob**'))!;
  as(A, () => assert.equal(core.message(id)?.status, 0));
  await sync(A);
  as(A, () => assert.equal(core.message(id)?.status, 1));
  await sync(B);
  as(B, () => {
    assert.equal(core.message(id)?.body, 'hi **bob**');
    assert.equal(core.unread('alice'), 1);
  });
  await sync(A);
  as(A, () => assert.equal(core.message(id)?.status, 2));
  as(B, () => core.markRead('alice'));
  await both();
  as(A, () => assert.equal(core.message(id)?.status, 3));

  // Edit, react, delete for everyone.
  as(A, () => core.edit(id, 'hi bob (edited)'));
  as(B, () => core.react(id, '🔥'));
  await both();
  as(B, () => {
    assert.equal(core.message(id)?.body, 'hi bob (edited)');
    assert.ok(core.message(id)?.edited);
  });
  as(A, () => assert.deepEqual(JSON.parse(core.message(id)!.reacts), { bob: '🔥' }));
  as(B, () => core.edit(id, 'bob cannot edit alice'));
  await both();
  as(A, () => assert.equal(core.message(id)?.body, 'hi bob (edited)'));
  as(A, () => core.deleteForEveryone(id));
  await both();
  as(B, () => assert.equal(core.message(id)?.gone, 1));
  as(B, () => assert.equal(core.message(id)?.body, ''));

  // Shared checklist ticked from the other side.
  const list = as(A, () => core.sendText('bob', 'Shopping\n- [ ] milk\n- [ ] eggs'))!;
  await both();
  as(B, () => core.toggleCheck(list, 2, true));
  await both();
  as(A, () => assert.equal(core.message(list)?.body, 'Shopping\n- [ ] milk\n- [x] eggs'));

  // Disappearing: 24 h timer starts when read, on both phones.
  as(A, () => core.setTtl('bob', 86_400));
  await both();
  as(B, () => assert.equal(core.contact('alice')?.ttl, 86_400));
  const temp = as(A, () => core.sendText('bob', 'gone tomorrow'))!;
  await both();
  as(B, () => core.markRead('alice'));
  await both();
  now += 86_400_000 + 1;
  as(A, () => core.sweep());
  as(B, () => core.sweep());
  as(A, () => assert.equal(core.message(temp), undefined));
  as(B, () => assert.equal(core.message(temp), undefined));

  // After seen: gone for the reader on leaving, gone for the sender on the read receipt.
  const once = as(A, () => core.sendText('bob', 'read once', { ttl: -1 }))!;
  await both();
  as(B, () => core.markRead('alice'));
  as(B, () => assert.ok(core.message(once)));
  as(B, () => core.leave('alice'));
  as(B, () => assert.equal(core.message(once), undefined));
  await both();
  as(A, () => assert.equal(core.message(once), undefined));

  // Media: local first, sent after upload, fetched by the recipient.
  const pic = as(A, () => core.addMedia('bob', 'image', { local: 'file:///a.jpg', w: 4, h: 3, size: 10 }, { body: 'look', ttl: 0 }))!;
  await both();
  as(B, () => assert.equal(core.message(pic), undefined, 'not sent before upload'));
  as(A, () => core.shipMedia(pic, { path: 'bob/x', key: 'k' }));
  await both();
  as(B, () => {
    const m = core.message(pic)!;
    assert.equal(m.kind, 'image');
    assert.deepEqual(core.metaOf(m), { w: 4, h: 3, size: 10, path: 'bob/x', key: 'k' });
    assert.equal(core.toFetch().length, 1);
    core.setLocal(pic, 'file:///b.jpg');
    assert.equal(core.toFetch().length, 0);
    assert.ok(core.localFiles().has('file:///b.jpg'));
  });
  as(A, () => core.deleteForEveryone(pic));
  await both();
  as(B, () => assert.equal(core.localFiles().size, 0, 'deleted media frees the file'));

  // View once: opened once, sender is told, nothing left to reopen.
  const vo = as(A, () => core.addMedia('bob', 'image', { local: 'file:///c.jpg' }, { once: 1, ttl: 0 }))!;
  as(A, () => core.shipMedia(vo, { path: 'bob/y', key: 'k' }));
  as(A, () => assert.equal(core.localFiles().size, 0, 'sender keeps no copy'));
  await both();
  as(B, () => {
    core.setLocal(vo, 'file:///d.jpg');
    core.openOnce(vo);
    assert.equal(core.metaOf(core.message(vo)!).opened, true);
    assert.equal(core.localFiles().size, 0);
  });
  await both();
  as(A, () => assert.equal(core.metaOf(core.message(vo)!).opened, true));

  // View twice: first open keeps the photo, second removes it.
  const vt = as(A, () => core.addMedia('bob', 'image', { local: 'file:///e.jpg' }, { once: 2, ttl: 0 }))!;
  as(A, () => core.shipMedia(vt, { path: 'bob/z', key: 'k' }));
  await both();
  as(B, () => {
    core.setLocal(vt, 'file:///f.jpg');
    core.openOnce(vt);
    assert.equal(core.metaOf(core.message(vt)!).local, 'file:///f.jpg', 'still there after one view');
    core.openOnce(vt);
    assert.equal(core.metaOf(core.message(vt)!).opened, true);
  });

  // Pins sync; scheduled messages wait for their time; silent ones skip push.
  as(B, () => core.pin(list));
  await both();
  as(A, () => assert.equal(core.pinned('bob').length, 1));
  const later = as(A, () => core.sendText('bob', 'later', { at: now + 60_000 }))!;
  await both();
  as(B, () => assert.equal(core.message(later), undefined));
  now += 61_000;
  await both();
  as(B, () => assert.equal(core.message(later)?.body, 'later'));
  as(A, () => core.sendText('bob', 'shh', { quiet: true }));
  assert.deepEqual(await as(A, () => core.flush(tr)), []);
  as(A, () => core.sendText('bob', 'hey'));
  assert.deepEqual(await as(A, () => core.flush(tr)), ['bob']);

  // Stories: shared with contacts, viewers reported back, gone after 24 hours.
  const story = as(A, () => core.addStory('text', 'Beach day 🌊', { bg: 'volt' }))!;
  await both();
  as(B, () => {
    assert.equal(core.storyRing('alice'), 'new');
    core.viewStory(story);
    assert.equal(core.storyRing('alice'), 'seen');
  });
  await both();
  as(A, () =>
    assert.deepEqual(
      core.viewers(story).map((v) => v.viewer),
      ['bob'],
    ),
  );
  const pic2 = as(A, () => core.addStory('image', 'sunset', { local: 'file:///s.jpg', w: 9, h: 16 }))!;
  as(A, () => core.shipStory(pic2, 'bob', { path: 'bob/s', key: 'k' }));
  await both();
  as(B, () => {
    assert.equal(core.storiesToFetch().length, 1);
    core.setStoryLocal(pic2, 'file:///t.jpg');
    assert.ok(core.localFiles().has('file:///t.jpg'));
  });
  as(A, () => core.deleteStory(pic2));
  await both();
  as(B, () => assert.equal(core.storiesOf('alice').length, 1));
  // Hidden contacts don't get new stories.
  as(A, () => core.setStoryHidden('bob', true));
  as(A, () => core.addStory('text', 'not for bob', {}));
  await both();
  as(B, () => assert.equal(core.storiesOf('alice').length, 1, 'hidden contact gets nothing'));
  as(A, () => core.setStoryHidden('bob', false));
  now += 86_400_001;
  as(B, () => core.sweep());
  as(B, () => assert.equal(core.storyRing('alice'), null));

  // Notes to self never reach the relay.
  as(A, () => core.ensureSelf(pubs.alice));
  const before = queue.length;
  const note = as(A, () => core.sendText('alice', 'remember milk'))!;
  await sync(A);
  assert.equal(queue.length, before);
  as(A, () => assert.equal(core.message(note)?.status, 3));
  as(A, () => assert.ok(!core.connected().includes('alice')));

  // Blocked contacts are ignored.
  as(B, () => core.block('alice'));
  const ignored = as(A, () => core.sendText('bob', 'hello?'))!;
  await both();
  as(B, () => assert.equal(core.message(ignored), undefined));

  // A stranger with a forged sender pub cannot inject messages.
  const eve = keygen();
  queue.push({ id: ++seq, sender: 'alice', recipient: 'bob', box: 'AAAA' + b64(eve.pub) });
  as(B, () => core.unblock('alice'));
  await sync(B);
  as(B, () => assert.ok(core.chats().length === 1));

  console.log('core ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
