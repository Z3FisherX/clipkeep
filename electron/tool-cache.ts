import { stat } from 'node:fs/promises';
import type { ToolInfo } from '../shared/contracts';

/** Version processes run once per tool generation; stat checks catch replacement. */
export class ToolCache {
  private value?: ToolInfo[];
  private signature?: string;
  private pending?: Promise<ToolInfo[]>;
  private expires = 0;
  constructor(private detect: () => Promise<ToolInfo[]>) {}
  invalidate() { this.value = undefined; this.signature = undefined; this.expires = 0; }
  async get(force = false): Promise<ToolInfo[]> {
    if (this.pending) return this.pending;
    if (!force && this.value && Date.now() < this.expires && await this.fingerprint(this.value) === this.signature) return this.value;
    this.pending = this.refresh();
    try { return await this.pending; } finally { this.pending = undefined; }
  }
  private async refresh() {
    const value = await this.detect();
    this.value = value; this.signature = await this.fingerprint(value);
    this.expires = Date.now() + (value.every(tool => tool.ready) ? 300_000 : 5_000);
    return value;
  }
  private async fingerprint(tools: ToolInfo[]) {
    return JSON.stringify(await Promise.all(tools.map(async tool => {
      const entry = tool.path ? await stat(tool.path).catch(() => undefined) : undefined;
      return [tool.path, entry?.size, entry?.mtimeMs, entry?.ino];
    })));
  }
}
