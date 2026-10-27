import { useState } from 'react';
import type { Controller } from '../../useDownloader';

interface FileIssue { message: string; canOpenFolder: boolean }

export function useTaskFiles(id: string, c: Controller) {
  const [fileIssue, setFileIssue] = useState<FileIssue>();
  const file = (output?: number, source?: boolean) => c.act<void>(async () => {
    setFileIssue(undefined);
    const result = await window.desktop.taskFile({ id, output, source });
    if (!result.ok) {
      setFileIssue({ message: result.error.message, canOpenFolder: !source && output !== undefined });
      return { ok: true, value: undefined };
    }
    return result;
  });
  return { file, fileIssue };
}

export function TaskFileRecovery({ issue, openFolder }: { issue?: FileIssue; openFolder(): void }) {
  if (!issue) return null;
  return <div className="task-warning" role="alert"><p>{issue.message}</p>
    {issue.canOpenFolder && <button onClick={openFolder}>打开任务文件夹</button>}
  </div>;
}
