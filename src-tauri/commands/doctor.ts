import { invoke } from '@tauri-apps/api/core'

export interface DoctorReport { env: Record<string, string>; auth: { email: string; valid: boolean }[]; localServer: { running: boolean; port?: number }; tips: string[] }
export const runDoctor = (): Promise<DoctorReport> => invoke('doctor')
