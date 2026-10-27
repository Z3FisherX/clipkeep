import { contextBridge, ipcRenderer } from 'electron';
import type { AccessWindowApi } from '../../shared/access';
const api: AccessWindowApi = {
  state: () => ipcRenderer.invoke('clip:access-window:state'),
  authorize: () => ipcRenderer.invoke('clip:access-window:authorize'),
  login: () => ipcRenderer.invoke('clip:access-window:login'),
  reloadVideo: () => ipcRenderer.invoke('clip:access-window:reload'),
  close: () => ipcRenderer.invoke('clip:access-window:close'),
};
contextBridge.exposeInMainWorld('accessWindow', api);
