const { app, BrowserWindow, screen } = require('electron');
const path = require('node:path');

let mainWindow;

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1100, workArea.width),
    height: Math.min(850, workArea.height),
    minWidth: Math.min(800, workArea.width),
    minHeight: Math.min(600, workArea.height),
    backgroundColor: '#f6f0df',
    autoHideMenuBar: true,
    show: false,
    title: '暖影同行 · Sunlit Echoes',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // F11 toggles fullscreen without stealing Escape from the game's pause menu.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
