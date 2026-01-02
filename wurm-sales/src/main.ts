import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

interface FileChangeEvent {
  path: string;
  line: string;
  chat_type: string;
}
interface AppSettings {
  watch_dir: string;
}

listen<FileChangeEvent>('file-changed', (event) => {
  console.log(`[${event.payload.chat_type}] File changed: ${event.payload.path}, line: ${event.payload.line}`);
  const app = document.querySelector<HTMLDivElement>('#app')!;

  let logContainer = app.querySelector<HTMLDivElement>('.log-container');
  if (!logContainer) {
    logContainer = document.createElement('div');
    logContainer.className = 'log-container';
    app.appendChild(logContainer);
  }

  const entry = document.createElement('div');
  entry.className = `log-entry chat-${event.payload.chat_type}`;
  entry.textContent = `[${event.payload.chat_type}] ${event.payload.line}`;
  logContainer.appendChild(entry);
})

// Add button to open skills window
const app = document.querySelector<HTMLDivElement>('#app')!
console.log('App element found:', app);

const controls = document.createElement('div');
controls.style.cssText = `
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px;
`;

const buttonStyle = `
  padding: 8px 16px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
`;

const openSkillsButton = document.createElement('button');
openSkillsButton.textContent = 'Open Skills Window';
openSkillsButton.style.cssText = buttonStyle;
console.log('Skills button created:', openSkillsButton);

openSkillsButton.addEventListener('click', async () => {
  console.log('Open Skills Window button clicked');
  try {
    console.log('Invoking open_skills_window command...');
    await invoke('open_skills_window');
    console.log('Skills window command invoked successfully');
  } catch (error) {
    console.error('Failed to open skills window:', error);
  }
});

const openTradeButton = document.createElement('button');
openTradeButton.textContent = 'Open Trade Window';
openTradeButton.style.cssText = buttonStyle;
openTradeButton.style.backgroundColor = '#8E24AA';
console.log('Trade button created:', openTradeButton);

openTradeButton.addEventListener('click', async () => {
  console.log('Open Trade Window button clicked');
  try {
    await invoke('open_trade_window');
    console.log('Trade window command invoked successfully');
  } catch (error) {
    console.error('Failed to open trade window:', error);
  }
});

const openSettingsButton = document.createElement('button');
openSettingsButton.textContent = 'Settings';
openSettingsButton.style.cssText = buttonStyle;
openSettingsButton.style.backgroundColor = '#2196F3';
console.log('Settings button created:', openSettingsButton);

openSettingsButton.addEventListener('click', async () => {
  console.log('Open Settings button clicked');
  try {
    await invoke('open_settings_window');
    console.log('Settings window opened');
  } catch (error) {
    console.error('Failed to open settings window:', error);
  }
});

const watchDirInfo = document.createElement('div');
watchDirInfo.style.cssText = `
  font-size: 12px;
  color: #333;
`;

function updateWatchDirDisplay(value: string) {
  const displayValue = value ? value : 'Not configured';
  watchDirInfo.textContent = `Watching: ${displayValue}`;
}

controls.appendChild(openSkillsButton);
controls.appendChild(openTradeButton);
controls.appendChild(openSettingsButton);
controls.appendChild(watchDirInfo);

app.insertBefore(controls, app.firstChild);
console.log('Controls inserted into DOM. Total children:', app.children.length);

listen<AppSettings>('settings-updated', (event) => {
  console.log('Settings updated:', event.payload);
  updateWatchDirDisplay(event.payload.watch_dir);
});

void (async () => {
  try {
    const settings = await invoke<AppSettings>('get_settings');
    console.log('Loaded settings:', settings);
    updateWatchDirDisplay(settings.watch_dir);
  } catch (error) {
    console.error('Failed to load settings:', error);
    updateWatchDirDisplay('');
  }
})();
