import { describe, it, expect } from 'vitest'
import { buildTaskXml } from './windows'
describe('windows scheduler xml', () => {
  it('builds schtasks XML with daily trigger', () => {
    const xml = buildTaskXml({ taskName: 'AntigravityWakeup', nodePath: 'C:\\node.exe', script: 'C:\\app\\wakeup.js', dailyTimes: ['09:00'] })
    expect(xml).toContain('AntigravityWakeup')
    expect(xml).toContain('09:00')
  })
})
