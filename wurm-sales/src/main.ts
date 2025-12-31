import { listen } from '@tauri-apps/api/event'

interface FileChangeEvent {
    path: string;
    line: string;
    chat_type: string;
}

interface SkillGainEvent {
    skill_name: string;
    current_level: number;
    gain: number;
    session_gain: number;
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

listen<SkillGainEvent>('skill-gained', (event) => {
  console.log(`🎯 SKILL GAIN: ${event.payload.skill_name} +${event.payload.gain.toFixed(4)} (session: +${event.payload.session_gain.toFixed(4)})`);
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML += `<div class="skill-gain">[SKILL] ${event.payload.skill_name}: +${event.payload.gain.toFixed(4)} (session: +${event.payload.session_gain.toFixed(4)})</div>`
})
