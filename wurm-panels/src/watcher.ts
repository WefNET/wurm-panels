import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

type FileChangeEvent = {
    path: string
    line: string
    chat_type: string
}

type SettingsUpdatedEvent = {
    watch_dir: string
}

type AppSettings = {
    watch_dir: string
}

const app = document.querySelector<HTMLDivElement>('#app') || document.body.appendChild(document.createElement('div'))
app.id = app.id || 'app'
app.style.cssText = `padding: 12px; font-family: sans-serif; color: #222;`

const header = document.createElement('h2')
header.textContent = 'Watcher'
header.style.margin = '0 0 8px'
app.appendChild(header)

const watchDir = document.createElement('div')
watchDir.style.cssText = 'font-size: 12px; color: #555; margin-bottom: 8px;'
watchDir.textContent = 'Watching: (not set)'
app.appendChild(watchDir)

const logContainer = document.createElement('div')
logContainer.className = 'log-container'
logContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px; max-height: 70vh; overflow-y: auto; padding-right: 4px;'
app.appendChild(logContainer)

const status = document.createElement('div')
status.style.cssText = 'font-size: 12px; color: #777; margin-bottom: 8px;'
status.textContent = 'Listening...'
app.appendChild(status)

function setWatchDir(dir: string) {
    const label = dir && dir.trim().length > 0 ? dir : '(not set)'
    watchDir.textContent = `Watching: ${label}`
}

function addLogEntry(ev: FileChangeEvent) {
    const entry = document.createElement('div')
    entry.className = `log-entry chat-${ev.chat_type}`
    entry.style.cssText = 'font-size: 13px; padding: 6px 8px; border-radius: 6px; background:#f5f5f5; border:1px solid #e0e0e0;'
    entry.textContent = `[${ev.chat_type}] ${ev.line}`
    logContainer.appendChild(entry)
    logContainer.scrollTop = logContainer.scrollHeight
}

async function bootstrap() {
    try {
        const settings = await invoke<AppSettings>('get_settings')
        setWatchDir(settings.watch_dir)
    } catch (err) {
        console.error('Failed to load settings for watcher window', err)
        status.textContent = 'Failed to load settings'
    }

    try {
        await listen<FileChangeEvent>('file-changed', (event) => {
            console.log('[watcher] file-changed', event.payload)
            status.textContent = 'Receiving events'
            addLogEntry(event.payload)
        })

        await listen<SettingsUpdatedEvent>('settings-updated', (event) => {
            setWatchDir(event.payload.watch_dir)
        })
    } catch (err) {
        console.error('Failed to register event listeners in watcher', err)
        status.textContent = 'Listener registration failed'
    }
}

bootstrap()
