import test from 'node:test';
import assert from 'node:assert/strict';

const pad64 = v => v.padStart(64,'0');
const strip0x = v => v.toLowerCase().replace(/^0x/,'');
const revoke20 = spender => `0x095ea7b3${pad64(strip0x(spender))}${pad64('0')}`;
const revoke721all = op => `0xa22cb465${pad64(strip0x(op))}${pad64('0')}`;

test('ERC20 revoke calldata uses approve(spender,0)', () => {
  const spender='0x1111111111111111111111111111111111111111';
  const data=revoke20(spender);
  assert.equal(data.slice(0,10),'0x095ea7b3');
  assert.equal(data.length,138);
  assert.ok(data.endsWith('0'.repeat(64)));
});

test('ERC721 operator revoke calldata uses setApprovalForAll(operator,false)', () => {
  const op='0x2222222222222222222222222222222222222222';
  const data=revoke721all(op);
  assert.equal(data.slice(0,10),'0xa22cb465');
  assert.equal(data.length,138);
  assert.ok(data.endsWith('0'.repeat(64)));
});