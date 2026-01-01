import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

interface FileChangeEvent {
  path: string;
  line: string;
  chat_type: string;
}

interface SkillSessionData {
  skill_name: string;
  start_level: number;
  session_gain: number;
  last_gain: number;
}

interface AppSettings {
  watch_dir: string;
}

// Function to escape HTML entities
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

listen<SkillSessionData[]>('skill-sessions', (event) => {
  console.log('🎯 SKILL SESSIONS UPDATED:', event.payload);
  const app = document.querySelector<HTMLDivElement>('#app')!

  // Find or create the skills table
  let skillsTable = app.querySelector('.skills-table') as HTMLTableElement;
  if (!skillsTable) {
    skillsTable = document.createElement('table');
    skillsTable.className = 'skills-table';
    skillsTable.innerHTML = `
      <thead>
        <tr>
          <th>Skill</th>
          <th>Start</th>
          <th>Session Gain</th>
          <th>Last Gain</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    app.appendChild(skillsTable);
  }

  const tbody = skillsTable.querySelector('tbody')!;
  tbody.innerHTML = ''; // Clear existing rows

  // Sort skills alphabetically
  const sortedSkills = event.payload.sort((a, b) => a.skill_name.localeCompare(b.skill_name));

  for (const skill of sortedSkills) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(skill.skill_name)}</td>
      <td>${skill.start_level.toFixed(4)}</td>
      <td>+${skill.session_gain.toFixed(4)}</td>
      <td>+${skill.last_gain.toFixed(4)}</td>
    `;
    tbody.appendChild(row);
  }
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
