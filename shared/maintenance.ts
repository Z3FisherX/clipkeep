export type ToolName = 'yt-dlp' | 'ffmpeg' | 'ffprobe' | 'node';
export type HelpTopic = ToolName | 'homebrew' | 'application' | 'licenses';
export interface ReleaseInfo { version: string; url: string; notes: string; sha256?: string; assetUrl?: string }
export interface MaintenanceReport {
  applicationVersion: string; platform: string; architecture: string; packaged: boolean;
  application?: ReleaseInfo; parser?: ReleaseInfo; parserManaged: boolean; rollbackAvailable: boolean; message?: string;
}
export const TOOL_HELP: Record<HelpTopic, string> = {
  'yt-dlp': 'https://github.com/yt-dlp/yt-dlp/releases', ffmpeg: 'https://ffmpeg.org/download.html#build-mac',
  ffprobe: 'https://ffmpeg.org/download.html#build-mac', node: 'https://nodejs.org/en/download', homebrew: 'https://brew.sh/',
  application: 'https://github.com/Z3FisherX/clipkeep/releases', licenses: 'https://github.com/Z3FisherX/clipkeep/blob/main/THIRD_PARTY_NOTICES.md',
};
