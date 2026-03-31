import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from 'process';
loadEnvFile('.env');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const PROD_BASE = process.env.PROD_BASE;
const TARGET_DIR = process.env.TARGET_DIR;

function pad(value) {
  return String(value).padStart(2, '0');
}

function getTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());

  return `${yyyy}${mm}${dd}_${hh}_${min}`;
}

function runBuild() {
  const npmExecPath = process.env.npm_execpath;

  if (!npmExecPath) {
    throw new Error(
      'process.env.npm_execpath is not set. Script must be started via yarn.'
    );
  }

  const result = spawnSync(process.execPath, [npmExecPath, 'build'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_BASE: PROD_BASE,
    },
  });

  if (result.error) {
    throw new Error(`Failed to start build process: ${result.error.message}`);
  }

  if (result.signal) {
    throw new Error(`Build process was terminated by signal: ${result.signal}`);
  }

  if (result.status !== 0) {
    throw new Error(`Build failed with exit code ${result.status}`);
  }
}

function backupTarget() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.log(`Target folder does not exist, backup skipped: ${TARGET_DIR}`);
    return;
  }

  const backupDir = `${TARGET_DIR}_${getTimestamp()}`;
  fs.cpSync(TARGET_DIR, backupDir, {
    recursive: true,
    force: true,
  });

  console.log(`Backup created: ${backupDir}`);
}

function clearTargetContents(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }

  for (const entry of fs.readdirSync(targetDir)) {
    const entryPath = path.join(targetDir, entry);
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
}

function copyDistToTarget() {
  const distDir = path.join(projectRoot, 'dist');

  if (!fs.existsSync(distDir)) {
    throw new Error(`dist folder not found: ${distDir}`);
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });

  // чтобы в target не оставались старые файлы, которых уже нет в dist
  clearTargetContents(TARGET_DIR);

  fs.cpSync(distDir, TARGET_DIR, {
    recursive: true,
    force: true,
  });

  console.log(`dist copied to: ${TARGET_DIR}`);
}

try {
  console.log('1) Run production build with custom VITE_BASE...');
  runBuild();

  console.log('2) Backup target folder...');
  backupTarget();

  console.log('3) Copy dist to target folder...');
  copyDistToTarget();

  console.log('buildProd completed successfully');
} catch (error) {
  console.error('buildProd failed');
  console.error(error);
  process.exit(1);
}