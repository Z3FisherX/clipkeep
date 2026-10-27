import { AppError } from './validation';
import { platformName, type PlatformId } from '../shared/platforms';
export function classifyFailure(message: string, useBrowser = false, platform: PlatformId = 'youtube'): AppError {
  const site = platformName(platform);
  // Match actual ERROR lines first: yt-dlp help text often mentions cookies for unrelated errors.
  const errors = message.split('\n').filter(line => /^ERROR:/i.test(line));
  const reason = (errors.length ? errors.join('\n') : message).split(/\b(?:See\s+https?:|Use --cookies)/i)[0];
  if (useBrowser && /permission denied|operation not permitted|\bEACCES\b|\bEPERM\b/i.test(reason))
    return new AppError('BROWSER_PERMISSION', 'macOS 拒绝读取 Chrome 登录态。请本人在“系统设置 → 隐私与安全 → 文件与文件夹 → 拾片”中允许访问 Google Chrome，然后重试。');
  if (/keychain|decrypt|failed to (?:copy|load|read).*cookie|could not (?:copy|load|read).*cookie|could not find.*cookies database|unable to (?:copy|load|read).*cookie/i.test(reason))
    return new AppError('BROWSER_AUTH_FAILED', '无法读取 Chrome 的本地登录态。请先检查 macOS 中拾片访问 Google Chrome 的权限，再确认 Chrome 默认配置；如出现钥匙串授权，请本人处理。');
  if (/not a bot|confirm you.?re not|confirm you are not/i.test(reason))
    return new AppError(useBrowser ? 'BOT_CHECK_WITH_BROWSER' : 'BOT_CHECK', useBrowser
      ? `已尝试使用 Chrome 登录态，${site}仍要求机器人验证。请先在 Chrome 默认配置中打开此视频，亲自完成验证后再试。`
      : `${site}要求登录以确认不是机器人。本次读取没有使用浏览器登录态。`);
  if (/private video|members.only|not available in your country|copyright|removed|video(?: #\d+)? (?:is )?unavailable|404.*not found/i.test(reason))
    return new AppError('UNAVAILABLE', '视频不可用，或当前账号/地区无权访问。请在浏览器确认视频可播放。');
  if (/HTTP Error 401|401 Unauthorized|sign[ -]?in|log(?:ged)?[ -]?in|confirm your age|age.restricted|fresh cookies|cookies?.*(?:needed|required)|(?:needed|required).*cookies?/i.test(reason))
    return new AppError(useBrowser ? 'LOGIN_REQUIRED_WITH_BROWSER' : 'LOGIN_REQUIRED', useBrowser
      ? 'Chrome 当前登录态未能满足这个视频的访问要求。请在 Chrome 默认配置中确认账号已登录且视频可播放。'
      : `${site}的这个视频需要登录态或访问验证。本次读取没有使用浏览器登录态。`);
  if (/DRM protected|digital rights|copyright protection/i.test(reason))
    return new AppError('DRM', '此播放来源使用版权保护，请使用平台提供的离线功能。');
  if (/requested format.*not available/i.test(reason))
    return new AppError('FORMAT_EXPIRED', '所选清晰度暂不可用。请重新读取链接，选择其他清晰度。');
  if (/no space left|disk full/i.test(reason)) return new AppError('ENOSPC', '磁盘空间不足，请释放空间后重试。');
  if (/403|429|timed out|network|connection|resolve|certificate|http error/i.test(reason))
    return new AppError('NETWORK', `网络连接或${site}访问受限。请检查网络，稍后重试；403 也可能需要重新读取链接。`);
  if (/unable to extract|unsupported url|no video formats|no video found|initial state|extractor error/i.test(reason))
    return new AppError('SITE_CHANGED', `${site}页面解析需要更新，请使用完整视频链接重读，或在设置中检查下载工具版本。`);
  return new AppError('TOOL_FAILED', '工具执行失败。请检查依赖和网络后重试；已下载的部分文件会保留。');
}
