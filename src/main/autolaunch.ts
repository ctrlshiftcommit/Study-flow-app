import { app } from 'electron';
import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const valueName = 'StudyFlow';
const legacyValueName = 'electron';

export async function setAutoLaunch(enabled: boolean): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  await execFileAsync('reg', ['delete', runKey, '/v', legacyValueName, '/f']).catch(() => undefined);
  if (enabled) {
    await execFileAsync('reg', ['add', runKey, '/v', valueName, '/t', 'REG_SZ', '/d', launchCommand(), '/f']);
  } else {
    await execFileAsync('reg', ['delete', runKey, '/v', valueName, '/f']).catch(() => undefined);
  }
  return isAutoLaunchEnabled();
}

async function isAutoLaunchEnabled(): Promise<boolean> {
  const { stdout } = await execFileAsync('reg', ['query', runKey, '/v', valueName]).catch(() => ({ stdout: '' }));
  return stdout.includes(valueName) && stdout.includes(launchCommand());
}

function launchCommand(): string {
  const executable = process.execPath;
  const isElectronRuntime = basename(executable).toLowerCase() === 'electron.exe';
  if (process.defaultApp || isElectronRuntime) return `"${executable}" "${app.getAppPath()}"`;
  return `"${executable}"`;
}
