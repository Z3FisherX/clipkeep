export function extractLinks(text: string): string[] {
  if (new TextEncoder().encode(text).length > 65536) throw new Error('每次分享文案请控制在 64 KiB 以内');
  const links = [...new Set((text.replace(/\[[^\]]*\]\((https?:\/\/[^()\s]+)\)/g, '$1')
    .match(/https?:\/\/[^\s<>"'，。；！？、（）【】《》]+/gi) ?? []).map(value => value.replace(/[),.;!]+$/g, '')))];
  if (!links.length) throw new Error('请粘贴包含视频链接的分享文案');
  if (links.length > 50) throw new Error('每批最多添加 50 个链接');
  if (links.some(link => link.length > 8192)) throw new Error('单条链接请控制在 8192 字符以内');
  return links;
}
