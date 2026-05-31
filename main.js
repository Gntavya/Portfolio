const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const express = require("express");
const http = require("http");
const fs = require("fs");

// Data file path — stores contact messages as JSON on disk (Exp 8)
const DATA_FILE = path.join(__dirname, "data.json");

// Must be set before app is ready — unlocks mic in Electron's Chromium
app.commandLine.appendSwitch('enable-speech-dispatcher');
app.commandLine.appendSwitch('auto-select-desktop-capture-source', 'Screen 1');
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', 'http://localhost:3131');
app.commandLine.appendSwitch('enable-features', 'WebRtcHideLocalIpsWithMdns');

let server;
const PORT = 3131;

function startServer() {
    const expressApp = express();
    expressApp.use(express.static(__dirname));
    server = http.createServer(expressApp);
    server.listen(PORT);
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false
        }
    });

    win.loadURL(`http://localhost:${PORT}/index.html`);
    win.setMenuBarVisibility(false);
    win.maximize();
}

function openModuleWindow(fileName) {
    const moduleWin = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false
        }
    });
    moduleWin.loadURL(`http://localhost:${PORT}/${fileName}`);
    moduleWin.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
    startServer();

    // Both handlers required — must explicitly check for 'media' type
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        const allowed = ['media', 'microphone', 'camera', 'audioCapture', 'desktopCapture'];
        if (allowed.includes(permission)) {
            callback(true);
        } else {
            callback(true); // allow everything
        }
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        return true; // allow all permission checks
    });

    session.defaultSession.setDevicePermissionHandler((details) => {
        return true; // allow all device access including mic
    });

    createWindow();

    ipcMain.on("open-module", (_event, fileName) => {
        openModuleWindow(fileName);
    });

    // Exp 8 — Node.js fs: write JSON data to disk
    ipcMain.on("write-data", (_event, payload) => {
        try {
            let existing = {};
            if (fs.existsSync(DATA_FILE)) {
                existing = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
            }
            const key = payload.key || "data";
            existing[key] = payload.value;
            fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2), "utf-8");
        } catch (e) {
            console.error("write-data error:", e.message);
        }
    });

    // Exp 8 — Node.js fs: read JSON data from disk
    ipcMain.handle("read-data", (_event, key) => {
        try {
            if (!fs.existsSync(DATA_FILE)) return null;
            const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
            return key ? (data[key] || null) : data;
        } catch (e) {
            return null;
        }
    });
});

app.on("window-all-closed", () => {
    if (server) server.close();
    if (process.platform !== "darwin") app.quit();
});
