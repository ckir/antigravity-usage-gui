import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDefaultConfig } from '../../src-core/wakeup/types'
import type { ScheduleMode, TriggerRecord, WakeupConfig } from '../../src-core/wakeup/types'
import { listAccounts } from '../../src-tauri/commands/accounts'
import {
  getWakeupConfig,
  installWakeup,
  uninstallWakeup,
  testTrigger,
  getWakeupStatus,
  getWakeupHistory,
} from '../../src-tauri/commands/wakeup'
import { errorMessage } from '../errorMessage'

/** 5-minute stale time matching the CLI quota cache (Global Constraints). */
export const WAKEUP_STALE_MS = 5 * 60 * 1000
export const wakeupConfigKey = ['wakeup-config'] as const
export const wakeupStatusKey = ['wakeup-status'] as const
export const wakeupHistoryKey = ['wakeup-history'] as const

/** Model families covered by default (Claude + both Gemini quota groups). */
export const DEFAULT_WAKEUP_MODELS = ['claude-sonnet-4-5', 'gemini-3-flash', 'gemini-3-pro-low']

const SCHEDULE_MODES: ScheduleMode[] = ['interval', 'daily', 'weekly', 'custom']
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

function HistoryTable({ history }: { history: TriggerRecord[] }) {
  if (history.length === 0) {
    return <p>No trigger history yet.</p>
  }
  return (
    <table data-testid="wakeup-history">
      <thead>
        <tr>
          <th>Time</th>
          <th>Source</th>
          <th>Model</th>
          <th>Account</th>
          <th>Duration</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {history.map((record, i) => (
          <tr key={`${record.timestamp}-${i}`}>
            <td>{formatTime(record.timestamp)}</td>
            <td>{record.triggerSource}</td>
            <td>{record.models[0] ?? '-'}</td>
            <td>{record.accountEmail}</td>
            <td>{record.durationMs}ms</td>
            <td>{record.success ? 'ok' : `failed: ${record.error ?? 'unknown'}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function Wakeup() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<WakeupConfig>(() => getDefaultConfig())
  const [scope, setScope] = useState<'all' | 'selected'>('all')
  const [extraModels, setExtraModels] = useState('')
  const [weeklyDays, setWeeklyDays] = useState<number[]>([])
  const [weeklyTime, setWeeklyTime] = useState('09:00')
  const [actionError, setActionError] = useState<string | null>(null)

  const [testEmail, setTestEmail] = useState('')
  const [testModel, setTestModel] = useState('claude-sonnet-4-5')
  const [testPrompt, setTestPrompt] = useState('hi')

  const configQuery = useQuery({ queryKey: wakeupConfigKey, queryFn: getWakeupConfig, staleTime: WAKEUP_STALE_MS })
  const statusQuery = useQuery({ queryKey: wakeupStatusKey, queryFn: getWakeupStatus, staleTime: WAKEUP_STALE_MS })
  const historyQuery = useQuery({ queryKey: wakeupHistoryKey, queryFn: () => getWakeupHistory(), staleTime: WAKEUP_STALE_MS })
  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
    staleTime: WAKEUP_STALE_MS,
  })

  useEffect(() => {
    if (configQuery.data) {
      setForm(configQuery.data)
      setScope(configQuery.data.selectedAccounts === undefined ? 'all' : 'selected')
      const extra = configQuery.data.selectedModels.filter((m) => !DEFAULT_WAKEUP_MODELS.includes(m))
      setExtraModels(extra.join(', '))
      const days = Object.keys(configQuery.data.weeklySchedule ?? {}).map(Number)
      setWeeklyDays(days)
      const firstDay = days.sort()[0]
      const firstTime = firstDay !== undefined ? configQuery.data.weeklySchedule?.[firstDay]?.[0] : undefined
      if (firstTime) setWeeklyTime(firstTime)
    }
  }, [configQuery.data])

  useEffect(() => {
    if (!testEmail && accountsQuery.data && accountsQuery.data.length > 0) {
      setTestEmail(accountsQuery.data[0])
    }
  }, [accountsQuery.data, testEmail])

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: wakeupConfigKey })
    void queryClient.invalidateQueries({ queryKey: wakeupStatusKey })
    void queryClient.invalidateQueries({ queryKey: wakeupHistoryKey })
  }
  const onError = (e: unknown): void => {
    setActionError(errorMessage(e, 'Wakeup action failed'))
  }

  const installMutation = useMutation({ mutationFn: installWakeup, onSettled: invalidate, onError })
  const uninstallMutation = useMutation({ mutationFn: uninstallWakeup, onSettled: invalidate, onError })
  const testMutation = useMutation({ mutationFn: testTrigger, onSettled: invalidate, onError })

  const patch = (p: Partial<WakeupConfig>): void => {
    setForm((f) => ({ ...f, ...p }))
  }

  const toggleModel = (modelId: string): void => {
    setForm((f) => ({
      ...f,
      selectedModels: f.selectedModels.includes(modelId)
        ? f.selectedModels.filter((m) => m !== modelId)
        : [...f.selectedModels, modelId],
    }))
  }

  const toggleWeeklyDay = (day: number): void => {
    setWeeklyDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]))
  }

  const handleInstall = (): void => {
    setActionError(null)
    const extra = extraModels.split(',').map((m) => m.trim()).filter(Boolean)
    const base = form.selectedModels.filter((m) => DEFAULT_WAKEUP_MODELS.includes(m) || extra.includes(m))
    const selectedModels = [...base, ...extra.filter((m) => !base.includes(m))]
    const weeklySchedule: WakeupConfig['weeklySchedule'] = {}
    for (const day of weeklyDays) {
      weeklySchedule[day] = [weeklyTime]
    }
    const config: WakeupConfig = {
      ...form,
      enabled: true,
      selectedModels,
      selectedAccounts: scope === 'all' ? undefined : (form.selectedAccounts ?? []),
      dailyTimes: form.dailyTimes?.length ? form.dailyTimes : ['09:00'],
      weeklySchedule,
    }
    installMutation.mutate(config)
  }

  const handleTest = (): void => {
    setActionError(null)
    if (!testEmail) {
      setActionError('Pick an account for the test trigger')
      return
    }
    testMutation.mutate({ email: testEmail, model: testModel, prompt: testPrompt })
  }

  const status = statusQuery.data
  const history = historyQuery.data ?? []

  return (
    <main data-testid="wakeup-view">
      <header>
        <h1>Wakeup</h1>
        <button type="button" data-testid="wakeup-install" disabled={installMutation.isPending} onClick={handleInstall}>
          Install
        </button>
        <button
          type="button"
          data-testid="wakeup-uninstall"
          disabled={uninstallMutation.isPending}
          onClick={() => uninstallMutation.mutate()}
        >
          Uninstall
        </button>
      </header>

      {configQuery.isLoading && <p data-testid="wakeup-loading">Loading wakeup config…</p>}
      {configQuery.isError && <p data-testid="wakeup-error">Failed to load wakeup config</p>}
      {actionError && <p data-testid="wakeup-action-error">{actionError}</p>}

      <section data-testid="wakeup-schedule-form">
        <h2>Schedule</h2>
        <label>
          <input type="checkbox" data-testid="wakeup-enabled" checked={form.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          Enabled
        </label>
        <div role="radiogroup" aria-label="Schedule mode">
          {SCHEDULE_MODES.map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name="scheduleMode"
                data-testid={`mode-${mode}`}
                value={mode}
                checked={form.scheduleMode === mode}
                onChange={() => patch({ scheduleMode: mode })}
              />
              {mode}
            </label>
          ))}
        </div>

        {form.scheduleMode === 'interval' && (
          <label>
            Every N hours (1-23)
            <input
              type="number"
              data-testid="interval-hours"
              min={1}
              max={23}
              value={form.intervalHours ?? 6}
              onChange={(e) => patch({ intervalHours: Number(e.target.value) })}
            />
          </label>
        )}

        {form.scheduleMode === 'daily' && (
          <label>
            Daily times (HH:MM, comma-separated)
            <input
              type="text"
              data-testid="daily-times"
              value={(form.dailyTimes ?? ['09:00']).join(', ')}
              onChange={(e) => patch({ dailyTimes: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
            />
          </label>
        )}

        {form.scheduleMode === 'weekly' && (
          <fieldset>
            <legend>Weekly days + time</legend>
            {WEEK_DAYS.map((name, day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  data-testid={`weekly-day-${day}`}
                  checked={weeklyDays.includes(day)}
                  onChange={() => toggleWeeklyDay(day)}
                />
                {name}
              </label>
            ))}
            <input type="text" data-testid="weekly-time" value={weeklyTime} onChange={(e) => setWeeklyTime(e.target.value)} />
          </fieldset>
        )}

        {form.scheduleMode === 'custom' && (
          <label>
            Cron expression
            <input
              type="text"
              data-testid="cron-expression"
              value={form.cronExpression ?? ''}
              onChange={(e) => patch({ cronExpression: e.target.value })}
            />
          </label>
        )}

        <label>
          <input
            type="checkbox"
            data-testid="wake-on-reset"
            checked={form.wakeOnReset}
            onChange={(e) => patch({ wakeOnReset: e.target.checked })}
          />
          Trigger on quota reset
        </label>
        <label>
          Reset cooldown (minutes)
          <input
            type="number"
            data-testid="reset-cooldown"
            min={1}
            value={form.resetCooldownMinutes}
            onChange={(e) => patch({ resetCooldownMinutes: Number(e.target.value) })}
          />
        </label>
      </section>

      <section data-testid="wakeup-models">
        <h2>Models</h2>
        {DEFAULT_WAKEUP_MODELS.map((modelId) => (
          <label key={modelId}>
            <input
              type="checkbox"
              data-testid={`model-${modelId}`}
              checked={form.selectedModels.includes(modelId)}
              onChange={() => toggleModel(modelId)}
            />
            {modelId}
          </label>
        ))}
        <label>
          Additional models (comma-separated)
          <input type="text" data-testid="extra-models" value={extraModels} onChange={(e) => setExtraModels(e.target.value)} />
        </label>
      </section>

      <section data-testid="wakeup-account-scope">
        <h2>Accounts</h2>
        <label>
          <input type="radio" name="accountScope" data-testid="scope-all" checked={scope === 'all'} onChange={() => setScope('all')} />
          All accounts
        </label>
        <label>
          <input
            type="radio"
            name="accountScope"
            data-testid="scope-selected"
            checked={scope === 'selected'}
            onChange={() => setScope('selected')}
          />
          Selected accounts
        </label>
        {scope === 'selected' &&
          (accountsQuery.data ?? []).map((email) => (
            <label key={email}>
              <input
                type="checkbox"
                data-testid={`account-scope-${email}`}
                checked={form.selectedAccounts?.includes(email) ?? false}
                onChange={(e) =>
                  patch({
                    selectedAccounts: e.target.checked
                      ? [...(form.selectedAccounts ?? []), email]
                      : (form.selectedAccounts ?? []).filter((a) => a !== email),
                  })
                }
              />
              {email}
            </label>
          ))}
        <label>
          Custom prompt (default “hi”)
          <input
            type="text"
            data-testid="custom-prompt"
            value={form.customPrompt ?? ''}
            onChange={(e) => patch({ customPrompt: e.target.value || undefined })}
          />
        </label>
      </section>

      <section data-testid="wakeup-status">
        <h2>Status</h2>
        {statusQuery.isLoading && <p>Loading status…</p>}
        {status && (
          <dl>
            <dt>Enabled</dt>
            <dd data-testid="status-enabled">{status.enabled ? 'yes' : 'no'}</dd>
            <dt>Scheduler</dt>
            <dd data-testid="status-installed">{status.installed ? 'installed' : 'not installed'}</dd>
            {status.cronExpression && (
              <>
                <dt>Schedule</dt>
                <dd data-testid="status-cron">{status.cronExpression}</dd>
              </>
            )}
            {status.nextRun && (
              <>
                <dt>Next run</dt>
                <dd data-testid="status-next-run">{status.nextRun}</dd>
              </>
            )}
            <dt>Last result</dt>
            <dd data-testid="status-last-result">
              {status.lastResult
                ? `${formatTime(status.lastResult.timestamp)} — ${status.lastResult.success ? 'ok' : `failed: ${status.lastResult.error ?? 'unknown'}`}`
                : 'never'}
            </dd>
          </dl>
        )}
      </section>

      <section>
        <h2>History</h2>
        {historyQuery.isLoading && <p>Loading history…</p>}
        <HistoryTable history={history} />
      </section>

      <section data-testid="wakeup-test-form">
        <h2>Test trigger</h2>
        <label>
          Account
          <select data-testid="test-email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}>
            <option value="">Select account…</option>
            {(accountsQuery.data ?? []).map((email) => (
              <option key={email} value={email}>
                {email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Model
          <input type="text" data-testid="test-model" value={testModel} onChange={(e) => setTestModel(e.target.value)} />
        </label>
        <label>
          Prompt
          <input type="text" data-testid="test-prompt" value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} />
        </label>
        <button type="button" data-testid="test-run" disabled={testMutation.isPending} onClick={handleTest}>
          Run test
        </button>
        {testMutation.data && (
          <p data-testid="test-result">
            {testMutation.data.success ? 'ok' : `failed: ${testMutation.data.results[0]?.error ?? 'unknown'}`}
          </p>
        )}
      </section>
    </main>
  )
}
