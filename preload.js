const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    openModule: (fileName) => ipcRenderer.send("open-module", fileName),

    // Exp 8 — Node.js fs read/write via IPC
    writeData: (key, value) => ipcRenderer.send("write-data", { key, value }),
    readData:  (key)        => ipcRenderer.invoke("read-data", key),
});
