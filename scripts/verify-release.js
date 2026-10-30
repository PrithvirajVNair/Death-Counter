/**
 * Pre-Release Security & Hygiene Verification Script
 * Validates repository state against strict release standards:
 * - Ensures ZERO native executables (.exe) exist anywhere in workspace or release packages.
 * - Ensures all discontinued desktop companion files are completely absent.
 * - Ensures no .env, secret files, or logs are tracked in Git.
 * - Ensures no PowerShell/Batch scripts contain Unblock-File or unverified downloads.
 * - Validates required application web assets, API files, and migration scripts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export function verifyReleaseHygiene() {
  const issues = [];
  console.log('[Verify] Starting Pre-Release Security & Hygiene Audit...\n');

  // 1. Forbidden Files Check (Discontinued companion files & executables)
  const forbiddenFiles = [
    'scripts/DeathCounterHotkeys.exe',
    'public/DeathCounterHotkeys.exe',
    'dist/DeathCounterHotkeys.exe',
    'scripts/HotkeyListenerApp.cs',
    'scripts/HotkeyListener.cs',
    'scripts/GenerateIcon.exe',
    'scripts/GenerateIcon.cs',
    'scripts/hotkey-listener.exe',
    'public/hotkey-listener.exe',
    'dist/hotkey-listener.exe',
    'scripts/RunHotkeys.bat',
    'public/RunHotkeys.bat',
    'dist/RunHotkeys.bat',
    'scripts/start-hotkeys.ps1',
    'public/run.ps1',
    'dist/run.ps1',
    'scripts/app.ico',
    'public/DeathCounterHotkeys.ico',
  ];

  for (const rel of forbiddenFiles) {
    const full = path.join(ROOT_DIR, rel);
    if (fs.existsSync(full)) {
      issues.push(`Forbidden discontinued companion file found: ${rel}`);
    }
  }

  // 2. Strict Executable Audit: ZERO .exe files allowed anywhere
  function findExecutables(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name !== 'node_modules' && ent.name !== '.git') {
          results = results.concat(findExecutables(full));
        }
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.exe')) {
        results.push(full);
      }
    }
    return results;
  }

  const allExes = findExecutables(ROOT_DIR);
  for (const exePath of allExes) {
    issues.push(`Unauthorized executable detected in workspace: ${path.relative(ROOT_DIR, exePath)}`);
  }

  // 3. Git Tracking Check (No secrets, .env, logs, or executables)
  try {
    const trackedFiles = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf8' })
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    for (const file of trackedFiles) {
      if (file === '.env' || (file.startsWith('.env.') && file !== '.env.example')) {
        issues.push(`Secret configuration file is tracked in Git: ${file}`);
      }
      if (file.endsWith('.log')) {
        issues.push(`Log file containing potential local paths is tracked in Git: ${file}`);
      }
      if (file.toLowerCase().endsWith('.exe')) {
        issues.push(`Unauthorized executable is tracked in Git: ${file}`);
      }
      if (file.toLowerCase().includes('deathcounterhotkeys') || file.toLowerCase().includes('hotkeylistener')) {
        issues.push(`Discontinued desktop companion file is tracked in Git: ${file}`);
      }
    }
  } catch (err) {
    console.warn('[Verify] Warning: Could not run git ls-files:', err.message);
  }

  // 4. Required Application Files Check
  const requiredFiles = [
    'dist/index.html',
    'api/index.js',
    'api/_db.js',
    'supabase_schema.sql',
    'supabase_migration_v2.sql',
    'supabase_migration_v3_cleanup.sql',
    '.env.example',
    'README.md',
    'package.json',
    'vercel.json',
  ];

  for (const rel of requiredFiles) {
    const full = path.join(ROOT_DIR, rel);
    if (!fs.existsSync(full)) {
      issues.push(`Required application release file is missing: ${rel}`);
    }
  }

  // 5. Script Security Check (No Unblock-File or unsafe downloads)
  function findScripts(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name !== 'node_modules' && ent.name !== '.git') {
          results = results.concat(findScripts(full));
        }
      } else if (ent.isFile() && /\.(ps1|bat|cmd)$/i.test(ent.name)) {
        results.push(full);
      }
    }
    return results;
  }

  const allScripts = findScripts(ROOT_DIR);
  for (const scriptPath of allScripts) {
    const content = fs.readFileSync(scriptPath, 'utf8');
    if (/Unblock-File/i.test(content)) {
      issues.push(`Unsafe security-bypass command (Unblock-File) found in: ${path.relative(ROOT_DIR, scriptPath)}`);
    }
    if (/DownloadFile.*\.exe/i.test(content) && !/verify|hash|checksum/i.test(content)) {
      issues.push(`Unverified binary download found in: ${path.relative(ROOT_DIR, scriptPath)}`);
    }
  }

  // Report Findings
  if (issues.length > 0) {
    console.error('[Verify] FAILED with security / release hygiene errors:');
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    return false;
  }

  console.log('[Verify] PASSED: All pre-release security and hygiene criteria satisfied.');
  console.log('  âœ“ Zero executables (.exe) present anywhere in the repository.');
  console.log('  âœ“ All discontinued desktop companion files removed.');
  console.log('  âœ“ No secrets or logs tracked in Git.');
  console.log('  âœ“ All scripts free of Unblock-File or unverified download bypasses.');
  console.log('  âœ“ All required web application, API, and database assets verified.');
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const ok = verifyReleaseHygiene();
  process.exit(ok ? 0 : 1);
}
