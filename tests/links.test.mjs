import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEntryLink, readEntryLink} from '../gathering/static/gathering/links.js';

test('invitation links round-trip Chinese names and reserved characters in fragments', () => {
  const values = {name: '张 三 & 李', claim_code: 'claim+&=#/%', view_code: '  查看+#密码  '};
  const link = buildEntryLink('https://class.example/c/one/?old=1#stale', values);
  assert.equal(new URL(link).search, '');
  assert.equal(new URL(link).pathname, '/c/one/');
  assert.deepEqual(readEntryLink(link).values, {...values, student_code: ''});
  assert.equal(readEntryLink(link).cleanUrl, '/c/one/');
});

test('query parameters work, fragment wins, and both copies of codes are removed', () => {
  const link = readEntryLink('https://class.example/c/one/?view_code=old&claim_code=secret&at=2020#view_code=new&other=kept');
  assert.equal(link.values.view_code, 'new');
  assert.equal(link.values.claim_code, 'secret');
  assert.equal(link.cleanUrl, '/c/one/?at=2020#other=kept');
  assert.equal(link.consumed, true);
});

test('ordinary anchors are preserved and oversized prefill values are discarded and scrubbed', () => {
  assert.equal(readEntryLink('https://class.example/c/one/#footprints').cleanUrl, '/c/one/#footprints');
  assert.equal(readEntryLink('https://class.example/c/one/#footprints').consumed, false);
  const result = readEntryLink('https://class.example/c/one/#claim_code=' + 'x'.repeat(201));
  assert.equal(result.values.claim_code, '');
  assert.equal(result.cleanUrl, '/c/one/');
});
