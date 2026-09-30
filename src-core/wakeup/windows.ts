// src-core/wakeup/windows.ts
export interface WindowsTaskOpts { taskName: string; nodePath: string; script: string; dailyTimes?: string[]; intervalHours?: number }
export function buildTaskXml(o: WindowsTaskOpts): string {
  const time = o.dailyTimes?.[0] ?? '09:00'
  return `<?xml version="1.0"?><Task><RegistrationInfo><Description>Antigravity wakeup ${o.taskName}</Description></RegistrationInfo><Triggers><CalendarTrigger><StartBoundary>2026-01-01T${time}:00</StartBoundary></CalendarTrigger></Triggers><Actions><Exec><Command>${o.nodePath}</Command><Arguments>"${o.script}" trigger --scheduled</Arguments></Exec></Actions></Task>`
}
export async function installWindowsTask(o: WindowsTaskOpts): Promise<void> {
  const { execFile } = await import('node:child_process')
  const fs = await import('node:fs')
  const tmp = `${process.env.TEMP}\\${o.taskName}.xml`
  fs.writeFileSync(tmp, buildTaskXml(o))
  await new Promise<void>((res, rej) => execFile('schtasks', ['/Create', '/TN', o.taskName, '/XML', tmp, '/F'], (e) => e ? rej(e) : res()))
}
export async function uninstallWindowsTask(taskName: string): Promise<void> {
  const { execFile } = await import('node:child_process')
  await new Promise<void>((res, rej) => execFile('schtasks', ['/Delete', '/TN', taskName, '/F'], (e) => e ? rej(e) : res()))
}
