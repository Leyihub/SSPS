import test from 'node:test';
import assert from 'node:assert/strict';
import { isInternalCall } from '../common/internal-token';

test('内部令牌：没配置环境变量一律不放行；长度或内容不同不放行；完全相同才放行', () => {
  const old = process.env.INTERNAL_JOB_TOKEN;
  try {
    delete process.env.INTERNAL_JOB_TOKEN; assert.equal(isInternalCall('anything'), false); assert.equal(isInternalCall(undefined), false);
    process.env.INTERNAL_JOB_TOKEN = 'secret-abc';
    assert.equal(isInternalCall(undefined), false); assert.equal(isInternalCall(''), false); assert.equal(isInternalCall('secret-ab'), false); assert.equal(isInternalCall('secret-abd'), false);
    assert.equal(isInternalCall('secret-abc'), true);
  } finally { if (old === undefined) delete process.env.INTERNAL_JOB_TOKEN; else process.env.INTERNAL_JOB_TOKEN = old; }
});
