import { listen } from '@tauri-apps/api/event'

interface FileChangeEvent {
    path: string;
    line: string;
    category: string;
}

listen<FileChangeEvent>('file-changed', (event) => {
  console.log(`[${event.payload.category}] File changed: ${event.payload.path}, line: ${event.payload.line}`);
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML += `<div class="log-entry category-${event.payload.category}">[${event.payload.category}] ${event.payload.line}</div>`
})
