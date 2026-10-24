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
  openmd — editor de notas markdown en el navegador

  Uso:
    npx openmd [opciones]

  Opciones:
    -p, --port <n>     Puerto del servidor (por defecto 5813)
    -d, --dir <ruta>   Carpeta de notas (por defecto ~/openmd)
    -H, --host <addr>  Escuchar en otra interfaz; sin valor usa 0.0.0.0 (toda la red local)
        --no-open      No abrir el navegador automáticamente
    -v, --version      Mostrar versión
    -h, --help         Mostrar esta ayuda
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
  port = Number(process.env.OPENMD_PORT) || 5813;
} else {
  port = Number(portArg);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Puerto inválido: ${portArg}`);
    process.exit(1);
  }
}

const dir = valueOf('--dir', '-d') ?? process.env.OPENMD_DIR;
const open = !hasFlag('--no-open');

let hostArg = valueOf('--host', '-H');
if (hasFlag('--host', '-H') && (hostArg === undefined || hostArg.startsWith('-'))) {
  hostArg = '0.0.0.0';
}
const host = hostArg ?? process.env.OPENMD_HOST;

try {
  const { url, root } = await start({ port, dir, host, open });
  console.log('');
  console.log(`  openmd ${pkg.version}`);
  console.log(`  notas   ${root}`);
  console.log(`  listo   ${url}`);
  if (host === '0.0.0.0' || host === '::') {
    for (const address of lanAddresses(port)) {
      console.log(`  red     ${address}`);
    }
  }
  console.log('');
} catch (error) {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${port} ya está en uso. Prueba con --port <otro puerto>`);
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
