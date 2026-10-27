import type { Session } from 'electron';
import { outboundFromRule } from './outbound';
import { startPublicProxy } from './public-proxy';
import type { ProxyFactory } from './runner';
export function systemProxyFactory(value: Pick<Session, 'resolveProxy'>): ProxyFactory {
  return async (url = 'https://vimeo.com/') => startPublicProxy({ outbound: outboundFromRule(await value.resolveProxy(url)) });
}
