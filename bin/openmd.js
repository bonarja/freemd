#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import { start } from '../server/index.js';

const args = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const hasFlag = (...flags) => args.some((arg) => flags.includes(arg));
const valueOf = (...flags) => {
  for (const flag of flags) {
    const index = args.indexOf(flag);
    if (index !== -1) return args[index + 1];
  }
  return undefined;
};

if (hasFlag('-h', '--help')) {
  console.log(`
  freemd — markdown notes editor in your browser

  Usage:
    npx freemd [options]

  Options:
    -p, --port <n>     Server port (default 5813)
    -d, --dir <path>   Notes folder (default ~/freemd)
    -H, --host <addr>  Listen on another interface; no value binds 0.0.0.0 (whole local network)
        --no-open      Do not open the browser automatically
    -v, --version      Print version
    -h, --help         Show this help
`);
  process.exit(0);
}

if (hasFlag('-v', '--version')) {
  console.log(pkg.version);
  process.exit(0);
}

const portArg = valueOf('--port', '-p');
let port;
if (portArg === undefined) {
  port = Number(process.env.FREEMD_PORT) || 5813;
} else {
  port = Number(portArg);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${portArg}`);
    process.exit(1);
  }
}

const dir = valueOf('--dir', '-d') ?? process.env.FREEMD_DIR;
const open = !hasFlag('--no-open');

let hostArg = valueOf('--host', '-H');
if (hasFlag('--host', '-H') && (hostArg === undefined || hostArg.startsWith('-'))) {
  hostArg = '0.0.0.0';
}
const host = hostArg ?? process.env.FREEMD_HOST;

try {
  const { url, root, migrated } = await start({ port, dir, host, open });
  console.log('');
  console.log(`  freemd ${pkg.version}`);
  console.log(`  notes   ${root}`);
  if (migrated) console.log(`  migrated ${migrated} → ${root}`);
  console.log(`  ready   ${url}`);
  if (host === '0.0.0.0' || host === '::') {
    for (const address of lanAddresses(port)) {
      console.log(`  network ${address}`);
    }
  }
  console.log('');
} catch (error) {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try --port <another port>`);
  } else {
    console.error(error.message ?? error);
  }
  process.exit(1);
}

function lanAddresses(port) {
  const urls = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const entry of addresses ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      urls.push(`http://${entry.address}:${port}`);
    }
  }
  return urls;
}
