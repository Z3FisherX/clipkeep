import { createHash } from 'node:crypto';
import type { Snapshot } from '../../shared/contracts';
import type { TaskRecord } from '../../shared/tasks';
export function diagnosticReport(state: Snapshot, tasks: TaskRecord[], applicationVersion: string) {
  return { format: 1, exportedAt: new Date().toISOString(), applicationVersion, platform: process.platform, architecture: process.arch,
    tools: state.tools.map(tool => ({ name: tool.name, version: tool.version, ready: tool.ready })),
    queue: { paused: state.queue?.paused, count: tasks.length },
    tasks: tasks.map(task => ({ reference: createHash('sha256').update(task.id).digest('hex').slice(0, 12),
      platform: task.info.platform, status: task.status, phase: task.phase, mode: task.mode, encoding: task.encoding ?? 'compatible',
      attempt: task.attempt, outputs: task.outputs.length, fault: task.error?.code })),
  };
}
