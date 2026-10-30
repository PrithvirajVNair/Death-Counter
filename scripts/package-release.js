/**
 * Dedicated Release Packaging Script
 * Generates a clean, auditable release ZIP using an explicit allowlist and pure Node.js ZIP creation.
 * Excludes: .env, node_modules, .git, logs, development utilities, obsolete binaries.
 * Preserves: Production dist, API backend, migrations, docs.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { verifyReleaseHygiene } from './verify-release.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const STAGING_DIR = path.join(RELEASE_DIR, 'package');
const ZIP_NAME = 'souls-death-counter-release.zip';
const ZIP_PATH = path.join(RELEASE_DIR, ZIP_NAME);

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function collectAllFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      results = results.concat(collectAllFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/**
 * Pure Node.js standard ZIP archiver (RFC 1951 Deflate + PKZip standard format)
 * Eliminates external shell or PowerShell dependencies.
 */
function createPureNodeZip(stagingDir, zipPath) {
  const allFiles = collectAllFiles(stagingDir);
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const absPath of allFiles) {
    const relPath = path.relative(stagingDir, absPath).replace(/\\/g, '/');
    const filenameBuf = Buffer.from(relPath, 'utf8');
    const uncompressedData = fs.readFileSync(absPath);
    const compressedData = zlib.deflateRawSync(uncompressedData);
    const crc = zlib.crc32(uncompressedData);

    const mtime = fs.statSync(absPath).mtime;
    const dosTime = ((mtime.getHours() << 11) | (mtime.getMinutes() << 5) | (mtime.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((mtime.getFullYear() - 1980) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate()) & 0xffff;

    // Local file header (30 bytes + filename length)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    localHeader.writeUInt16LE(20, 4);         // version needed: 2.0
    localHeader.writeUInt16LE(0, 6);          // flags
    localHeader.writeUInt16LE(8, 8);          // compression method: 8 (deflate)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(uncompressedData.length, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);         // extra field length

    localHeaders.push(localHeader, filenameBuf, compressedData);

    // Central directory header (46 bytes + filename length)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    centralHeader.writeUInt16LE(20, 4);          // version made by
    centralHeader.writeUInt16LE(20, 6);          // version needed
    centralHeader.writeUInt16LE(0, 8);           // flags
    centralHeader.writeUInt16LE(8, 10);          // compression method: 8
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedData.length, 20);
    centralHeader.writeUInt32LE(uncompressedData.length, 24);
    centralHeader.writeUInt16LE(filenameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);          // extra field len
    centralHeader.writeUInt16LE(0, 32);          // comment len
    centralHeader.writeUInt16LE(0, 34);          // disk number start
    centralHeader.writeUInt16LE(0, 36);          // internal file attrs
    centralHeader.writeUInt32LE(0, 38);          // external file attrs
    centralHeader.writeUInt32LE(offset, 42);     // relative offset of local header

    centralHeaders.push(centralHeader, filenameBuf);
    offset += localHeader.length + filenameBuf.length + compressedData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const buf of centralHeaders) centralDirSize += buf.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4);          // disk number
  eocd.writeUInt16LE(0, 6);          // disk with CD
  eocd.writeUInt16LE(allFiles.length, 8);  // entries on this disk
  eocd.writeUInt16LE(allFiles.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);         // comment length

  const allBuffers = [...localHeaders, ...centralHeaders, eocd];
  fs.writeFileSync(zipPath, Buffer.concat(allBuffers));
}

export function packageRelease() {
  console.log('====================================================');
  console.log('  SOULS DEATH COUNTER - CLEAN RELEASE PACKAGER');
  console.log('====================================================\n');

  // Step 1: Pre-Release Hygiene Audit
  const hygienePassed = verifyReleaseHygiene();
  if (!hygienePassed) {
    console.error('\n[Packaging] ABORTED: Pre-release hygiene checks failed.');
    process.exit(1);
  }

  // Step 2: Clean and initialize release directory
  if (fs.existsSync(RELEASE_DIR)) {
    fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  // Step 3: Explicit Allowlist of Release Artifacts
  console.log('\n[Packaging] Staging release artifacts via explicit allowlist...');
  const allowlist = [
    { src: 'dist', dest: 'dist' },
    { src: 'api', dest: 'api' },
    { src: 'supabase_schema.sql', dest: 'supabase_schema.sql' },
    { src: 'supabase_migration_v2.sql', dest: 'supabase_migration_v2.sql' },
    { src: 'supabase_migration_v3_cleanup.sql', dest: 'supabase_migration_v3_cleanup.sql' },
    { src: 'package.json', dest: 'package.json' },
    { src: 'package-lock.json', dest: 'package-lock.json' },
    { src: 'vercel.json', dest: 'vercel.json' },
    { src: '.env.example', dest: '.env.example' },
    { src: 'README.md', dest: 'README.md' },
  ];

  for (const item of allowlist) {
    const srcPath = path.join(ROOT_DIR, item.src);
    const destPath = path.join(STAGING_DIR, item.dest);
    if (!fs.existsSync(srcPath)) {
      console.error(`[Packaging] Missing required allowlisted item: ${item.src}`);
      process.exit(1);
    }
    copyRecursive(srcPath, destPath);
    console.log(`  + Staged: ${item.src}`);
  }

  // Step 4: Staging Security Audit
  console.log('\n[Packaging] Verifying staged package security...');
  const stagedFiles = collectAllFiles(STAGING_DIR);

  for (const file of stagedFiles) {
    const rel = path.relative(STAGING_DIR, file).replace(/\\/g, '/');
    const base = path.basename(file).toLowerCase();

    // Check for forbidden items in staging
    if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) {
      throw new Error(`CRITICAL: Secret file detected in staging package: ${rel}`);
    }
    if (base.endsWith('.log')) {
      throw new Error(`CRITICAL: Log file detected in staging package: ${rel}`);
    }
    if (rel.includes('node_modules') || rel.includes('.git')) {
      throw new Error(`CRITICAL: Dependency/VCS dir detected in staging package: ${rel}`);
    }

    if (base.endsWith('.exe') || base.endsWith('.dll')) {
      throw new Error(`CRITICAL: Executable detected in staging package: ${rel}`);
    }
  }

  console.log(`  ✓ Total files staged: ${stagedFiles.length}`);
  console.log(`  ✓ Total executables staged: 0 (Pure Web Application)`);

  // Step 5: Archive Staged Package into ZIP via pure Node.js
  console.log(`\n[Packaging] Compressing into ${ZIP_NAME}...`);
  createPureNodeZip(STAGING_DIR, ZIP_PATH);

  if (!fs.existsSync(ZIP_PATH)) {
    throw new Error('Failed to generate release ZIP archive.');
  }

  const zipSize = fs.statSync(ZIP_PATH).size;
  const zipSha = sha256(ZIP_PATH);

  // Step 6: Generate CHECKSUMS.txt
  const checksumContent = [
    `# Souls Game Death Counter (SDC) Release Checksums`,
    `# Generated: ${new Date().toISOString()}`,
    ``,
    `${zipSha}  ${ZIP_NAME}  (${zipSize} bytes)`,
    `# Pure Web Application Release (Zero native executables)`,
    ``,
  ].join('\n');

  fs.writeFileSync(path.join(RELEASE_DIR, 'CHECKSUMS.txt'), checksumContent, 'utf8');

  console.log('\n====================================================');
  console.log('  CLEAN RELEASE PACKAGING COMPLETE');
  console.log('====================================================');
  console.log(`Release Archive: release/${ZIP_NAME} (${(zipSize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`SHA-256:        ${zipSha}`);
  console.log(`Checksum File:  release/CHECKSUMS.txt`);
  console.log('====================================================\n');
}

if (process.argv[1] && process.argv[1].endsWith('package-release.js')) {
  packageRelease();
}
