import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, isPublicHost, resolvePublicAddress } from '../electron/network/public-address';
import { compatibleLookup } from '../electron/network/public-dns';
test('public address policy covers private, special, mapped and globally routable addresses', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '100.100.100.200', '127.0.0.1', '169.254.169.254', '172.16.0.1',
    '192.168.1.1', '192.0.2.10', '198.19.0.1', '198.51.100.2', '203.0.113.2', '224.0.0.1', '255.255.255.255',
    '168.63.129.16', '::', '::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', 'fc00::1', 'fe80::1', 'ff00::1', '2001:db8::1', '2002:7f00:1::'])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888'])
    assert.equal(isPublicAddress(address), true, address);
});
test('synthetic proxy DNS uses a verified public resolver while private and mixed answers retain their policy', async () => {
  let calls = 0;
  const encrypted = async (host: string) => { calls++; assert.equal(host, 'media.example.com'); return [{ address: '8.8.8.8', family: 4 }]; };
  assert.deepEqual(await compatibleLookup('media.example.com', async () => [{ address: '198.18.0.83', family: 4 }], encrypted), [{ address: '8.8.8.8', family: 4 }]);
  const local = [{ address: '10.0.0.1', family: 4 }];
  assert.deepEqual(await compatibleLookup('media.example.com', async () => local, encrypted), local);
  const mixed = [{ address: '198.18.0.83', family: 4 }, { address: '10.0.0.1', family: 4 }];
  assert.deepEqual(await compatibleLookup('media.example.com', async () => mixed, encrypted), mixed);
  assert.equal(calls, 1);
});
test('host policy normalizes literal addresses and excludes local or reserved hostnames', () => {
  for (const host of ['localhost', 'router.local', 'metadata.internal', 'host.home.arpa', 'host.lan', 'host.invalid',
    'host.example', 'one-label', '[::1]', '127.0.0.1', 'host.example.com.', '-bad.example.com']) assert.equal(isPublicHost(host), false, host);
  for (const host of ['media.example.com', 'sub.domain.com', '8.8.8.8', '[2606:4700:4700::1111]']) assert.equal(isPublicHost(host), true, host);
});
test('every DNS result is validated and the selected connection address is a pinned public IP', async () => {
  const host = 'media.example.com';
  const chosen = await resolvePublicAddress(host, async () => [
    { address: '2606:4700:4700::1111', family: 6 }, { address: '93.184.216.34', family: 4 },
  ]);
  assert.deepEqual(chosen, { address: '93.184.216.34', family: 4 });
  for (const records of [[], [{ address: '127.0.0.1', family: 4 }],
    [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 6 }]])
    await assert.rejects(resolvePublicAddress(host, async () => records), { code: 'PUBLIC_ADDRESS' });
});
