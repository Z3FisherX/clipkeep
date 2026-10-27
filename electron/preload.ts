import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, Snapshot } from '../shared/contracts';
const api: DesktopApi = {
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
