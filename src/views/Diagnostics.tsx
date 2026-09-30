import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { runDoctor, type DoctorReport } from '../../src-tauri/commands/doctor'

/** 5-minute stale time matching the CLI quota cache (Global Constraints). */
export const DOCTOR_STALE_MS = 5 * 60 * 1000
export const doctorKey = ['doctor'] as const

async function copyReport(report: DoctorReport): Promise<void> {
  const text = JSON.stringify(report, null, 2)
  await navigator.clipboard.writeText(text)
}

export default function Diagnostics() {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const doctor = useQuery({ queryKey: doctorKey, queryFn: runDoctor, staleTime: DOCTOR_STALE_MS })

  const handleCopy = (): void => {
    if (!doctor.data) return
    setCopyError(null)
    copyReport(doctor.data)
      .then(() => setCopied(true))
      .catch(() => setCopyError('Copy failed'))
  }

  const report = doctor.data

  return (
    <main data-testid="diagnostics-view">
      <header>
        <h1>Diagnostics</h1>
        <button
          type="button"
          data-testid="doctor-rerun"
          disabled={doctor.isFetching}
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: doctorKey })
          }}
        >
          Rerun
        </button>
        <button type="button" data-testid="copy-report" disabled={!report} onClick={handleCopy}>
          Copy Report
        </button>
      </header>

      {doctor.isLoading && <p data-testid="doctor-loading">Running checks…</p>}
      {doctor.isError && <p data-testid="doctor-error">Doctor checks failed</p>}
      {copied && <p data-testid="copy-confirmation">Report copied</p>}
      {copyError && <p data-testid="copy-error">{copyError}</p>}

      {report && (
        <>
          <section data-testid="account-status">
            <h2>Account status</h2>
            {report.auth.length === 0 && <p>No accounts found.</p>}
            <ul>
              {report.auth.map((a) => (
                <li key={a.email} data-testid={`status-${a.email}`}>
                  {a.email}{' '}
                  <span data-testid={a.valid ? 'status-valid' : 'status-expired'}>
                    {a.valid ? 'valid' : 'expired'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section data-testid="local-server-status">
            <h2>Local server</h2>
            <p>
              {report.localServer.running
                ? `running${report.localServer.port !== undefined ? ` on port ${report.localServer.port}` : ''}`
                : 'not running'}
            </p>
          </section>

          <section data-testid="doctor-tips">
            <h2>Tips</h2>
            {report.tips.length === 0 ? (
              <p>No issues found.</p>
            ) : (
              <ul>
                {report.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}
