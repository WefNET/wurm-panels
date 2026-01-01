import { listen } from '@tauri-apps/api/event'

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

// Function to escape HTML entities
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

listen<FileChangeEvent>('file-changed', (event) => {
  console.log(`[${event.payload.chat_type}] File changed: ${event.payload.path}, line: ${event.payload.line}`);
  const app = document.querySelector<HTMLDivElement>('#app')!
  const escapedLine = escapeHtml(event.payload.line);
  app.innerHTML += `<div class="log-entry chat-${event.payload.chat_type}">[${event.payload.chat_type}] ${escapedLine}</div>`
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
