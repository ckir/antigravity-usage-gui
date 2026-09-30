/**
 * Port detective - discovers listening ports for a given process
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { debug } from '../core/logger'

const execAsync = promisify(exec)

/**
 * Discovers which ports a process is listening on
 * @param pid Process ID to check
 * @returns Array of port numbers the process is listening on
 */
export async function discoverPorts(pid: number): Promise<number[]> {
  const platform = process.platform
  
  debug('port-detective', `Discovering ports for PID ${pid} on platform: ${platform}`)
  
  if (platform === 'win32') {
    return discoverPortsOnWindows(pid)
  } else if (platform === 'darwin') {
    return discoverPortsOnMacOS(pid)
  } else {
    return discoverPortsOnLinux(pid)
  }
}

/**
 * Discover listening ports on macOS using lsof
 */
async function discoverPortsOnMacOS(pid: number): Promise<number[]> {
  try {
    // lsof -nP -iTCP -sTCP:LISTEN -a -p <PID>
    const { stdout } = await execAsync(`lsof -nP -iTCP -sTCP:LISTEN -a -p ${pid}`)
    
    const ports: number[] = []
    const lines = stdout.split('\n')
    
    for (const line of lines) {
      // Format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
      // NAME column contains: *:PORT or IP:PORT (LISTEN)
      const match = line.match(/:(\d+)\s+\(LISTEN\)/)
      if (match) {
        const port = parseInt(match[1], 10)
        if (!isNaN(port) && !ports.includes(port)) {
          ports.push(port)
        }
      }
    }
    
    debug('port-detective', `Found ports on macOS: ${ports.join(', ')}`)
    return ports
  } catch (err) {
    debug('port-detective', 'Error discovering ports on macOS', err)
    return []
  }
}

/**
 * Discover listening ports on Linux using ss or netstat
 */
async function discoverPortsOnLinux(pid: number): Promise<number[]> {
  try {
    // Try ss first (modern)
    const { stdout } = await execAsync(`ss -tlnp | grep "pid=${pid},"`)
    
    const ports: number[] = []
    const lines = stdout.split('\n')
    
    for (const line of lines) {
      // Format: State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
      const match = line.match(/:(\d+)\s/)
      if (match) {
        const port = parseInt(match[1], 10)
        if (!isNaN(port) && !ports.includes(port)) {
          ports.push(port)
        }
      }
    }
    
    if (ports.length > 0) {
      debug('port-detective', `Found ports on Linux (ss): ${ports.join(', ')}`)
      return ports
    }
    
    // Fallback to netstat
    return await discoverPortsOnLinuxNetstat(pid)
  } catch {
    // ss might not find anything, try netstat
    return await discoverPortsOnLinuxNetstat(pid)
  }
}

/**
 * Fallback Linux port discovery using netstat
 */
async function discoverPortsOnLinuxNetstat(pid: number): Promise<number[]> {
  try {
    const { stdout } = await execAsync(`netstat -tlnp 2>/dev/null | grep "${pid}/"`)
    
    const ports: number[] = []
    const lines = stdout.split('\n')
    
    for (const line of lines) {
      // Format: Proto Recv-Q Send-Q Local Address Foreign Address State PID/Program
      const match = line.match(/:(\d+)\s/)
      if (match) {
        const port = parseInt(match[1], 10)
        if (!isNaN(port) && !ports.includes(port)) {
          ports.push(port)
        }
      }
    }
    
    debug('port-detective', `Found ports on Linux (netstat): ${ports.join(', ')}`)
    return ports
  } catch (err) {
    debug('port-detective', 'Error discovering ports on Linux', err)
    return []
  }
}

/**
 * Discover listening ports on Windows using netstat
 */
async function discoverPortsOnWindows(pid: number): Promise<number[]> {
  try {
    // netstat -ano shows all connections with PIDs
    const { stdout } = await execAsync('netstat -ano')
    
    const ports: number[] = []
    const lines = stdout.split('\n')
    
    for (const line of lines) {
      // Format: Proto Local Address Foreign Address State PID
      // Look for LISTENING state and matching PID
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/)
        const linePid = parseInt(parts[parts.length - 1], 10)
        
        if (linePid === pid) {
          // Extract port from local address (format: IP:PORT or [::]:PORT)
          const localAddr = parts[1]
          const portMatch = localAddr.match(/:(\d+)$/)
          if (portMatch) {
            const port = parseInt(portMatch[1], 10)
            if (!isNaN(port) && !ports.includes(port)) {
              ports.push(port)
            }
          }
        }
      }
    }
    
    debug('port-detective', `Found ports on Windows: ${ports.join(', ')}`)
    return ports
  } catch (err) {
    debug('port-detective', 'Error discovering ports on Windows', err)
    return []
  }
}
