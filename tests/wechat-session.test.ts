import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from 'electron';
import { boundedJson, safeAuthHeaders, WechatSession } from '../electron/wechat/session';
import { CHANNELS_ORIGIN, PARSE_ENDPOINT, PREVIEW_ROOT, YUANBAO_ORIGIN } from '../electron/wechat/urls';
function fixture() {
  const calls: { url: string; options: RequestInit }[] = [];
  const control = { loggedIn: false, status: 200 };
  const fake = { webRequest: { onBeforeSendHeaders: () => {} }, cookies: { get: async ({ url }: { url: string }) => {
    assert.equal(url, PARSE_ENDPOINT);
    return control.loggedIn ? [{ name: 'hy_user', value: 'fixture-user' }, { name: 'hy_token', value: 'fixture-auth' }] : [];
  } }, fetch: async (url: string, options: RequestInit) => {
    calls.push({ url, options }); return new Response('{"code":0}', { status: control.status });
  } };
  return { calls, control, value: new WechatSession(fake as unknown as Session) };
}
test('元宝授权验证已登录状态，解析与预览使用独立请求策略', async () => {
  const { calls, control, value } = fixture();
  await assert.rejects(value.authorize(), { code: 'SESSION_LOGIN_REQUIRED' });
  control.loggedIn = true; await value.authorize();
  await value.transport({ url: PARSE_ENDPOINT, authenticated: true, body: {}, referer: `${YUANBAO_ORIGIN}/` });
  await value.transport({ url: `${PREVIEW_ROOT}/api/feed/get_feed_info`, authenticated: false, body: {}, referer: `${PREVIEW_ROOT}/pages/feed` });
  assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[1].options.credentials, 'omit');
  assert.ok(calls.every(call => call.options.redirect === 'error'));
  assert.equal(new Headers(calls[1].options.headers).get('Origin'), CHANNELS_ORIGIN);
  assert.equal(new Headers(calls[1].options.headers).get('authorization'), null);
  await assert.rejects(value.transport({ url: 'https://attacker.example/', authenticated: true, body: {}, referer: `${YUANBAO_ORIGIN}/` }), { code: 'AUTH_SCOPE' });
  control.status = 401;
  await assert.rejects(value.transport({ url: PARSE_ENDPOINT, authenticated: true, body: {}, referer: `${YUANBAO_ORIGIN}/` }), { code: 'SESSION_LOGIN_REQUIRED' });
});
test('鉴权请求头限定到元宝 API，过大响应与网页响应直接终止', async () => {
  assert.deepEqual(safeAuthHeaders(`${YUANBAO_ORIGIN}/api/user`, { Authorization: 'fixture', Cookie: 'private', 'x-hy92': 'fixture-proof' }),
    { authorization: 'fixture', 'x-hy92': 'fixture-proof' });
  assert.deepEqual(safeAuthHeaders('https://attacker.example/api/user', { authorization: 'fixture' }), {});
  assert.deepEqual(safeAuthHeaders(`${YUANBAO_ORIGIN}/`, { authorization: 'fixture' }), {});
  assert.deepEqual(safeAuthHeaders(PARSE_ENDPOINT, { authorization: 'bad\r\nheader' }), {});
  await assert.rejects(boundedJson(new Response('x'.repeat(2 * 1024 * 1024 + 1))), { code: 'WECHAT_RESPONSE' });
  await assert.rejects(boundedJson(new Response('<html>login</html>')), { code: 'WECHAT_RESPONSE' });
});
