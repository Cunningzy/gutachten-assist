import { contextBridge } from 'electron';

const electronAPI = {
  test: () => 'Electron API functional',
  version: () => process.versions.electron
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}