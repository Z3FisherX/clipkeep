import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, Snapshot } from '../shared/contracts';
const api: DesktopApi = {
  storage: () => ipcRenderer.invoke('clip:storage'), cleanRecovery: input => ipcRenderer.invoke('clip:recovery-clean', input),
  deleteOutputs: input => ipcRenderer.invoke('clip:outputs-delete', input), relinkTask: input => ipcRenderer.invoke('clip:task-relink', input),
  openHelp: input => ipcRenderer.invoke('clip:help', input), selectTool: input => ipcRenderer.invoke('clip:tool-select', input),
  copyInstallCommand: () => ipcRenderer.invoke('clip:tool-command'),
  maintenance: input => ipcRenderer.invoke('clip:maintenance', input), exportDiagnostics: () => ipcRenderer.invoke('clip:diagnostics'),
  enqueue: input => ipcRenderer.invoke('clip:enqueue', input),
  taskAction: input => ipcRenderer.invoke('clip:task-action', input),
  preferences: input => ipcRenderer.invoke('clip:preferences', input),
  history: input => ipcRenderer.invoke('clip:history', input),
  taskFile: input => ipcRenderer.invoke('clip:task-file', input),
  cancelInspection: () => ipcRenderer.invoke('clip:cancel-inspection'),
  snapshot: () => ipcRenderer.invoke('clip:snapshot'),
  checkTools: () => ipcRenderer.invoke('clip:tools'),
  chooseDirectory: () => ipcRenderer.invoke('clip:directory'),
  inspect: input => ipcRenderer.invoke('clip:inspect', input),
  start: input => ipcRenderer.invoke('clip:start', input),
  retry: input => ipcRenderer.invoke('clip:retry', input),
  cancel: () => ipcRenderer.invoke('clip:cancel'),
  openFolder: () => ipcRenderer.invoke('clip:folder'),
  openVideo: input => ipcRenderer.invoke('clip:video', input),
  openAccess: input => ipcRenderer.invoke('clip:access', input),
  clearAccess: input => ipcRenderer.invoke('clip:access-clear', input),
  onChange: callback => {
    const handler = (_event: Electron.IpcRendererEvent, state: Snapshot) => callback(state);
    ipcRenderer.on('clip:change', handler);
    return () => ipcRenderer.removeListener('clip:change', handler);
  },
};
contextBridge.exposeInMainWorld('desktop', api);
