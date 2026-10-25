#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportMarkdown } from '../server/export/index.js';
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

// Subcomando convert: convierte un markdown externo a pdf/docx (headless).
if (args[0] === 'convert') {
  await convertCommand(args.slice(1));
  process.exit(0);
}

if (hasFlag('-h', '--help')) {
  console.log(`
  freemd — markdown notes editor in your browser

  Usage:
    npx freemd [options]              start the notes server
    npx freemd convert <file> [opts]  convert a markdown file to pdf/docx

  Server options:
    -p, --port <n>     Server port (default 5813)
    -d, --dir <path>   Notes folder (default ~/freemd)
    -H, --host <addr>  Listen on another interface; no value binds 0.0.0.0 (whole local network)
        --no-open      Do not open the browser automatically

  Convert options:
    --pdf              Export as PDF
    --docx             Export as Word (.docx)
    -f, --format <f>   Format: pdf | docx (can be repeated)
    -o, --output <p>   Output file path (single format only)
    -h, --help         Show convert help

  Common:
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
  const { url, root } = await start({ port, dir, host, open });
  console.log('');
  console.log(`  freemd ${pkg.version}`);
  console.log(`  notes   ${root}`);
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

async function convertCommand(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(`
  freemd convert — convert a markdown file to pdf/docx

  Usage:
    npx freemd convert <file.md> [options]

  Options:
    --pdf              Export as PDF
    --docx             Export as Word (.docx)
    -f, --format <f>   Format: pdf | docx (can be repeated)
    -o, --output <p>   Output file path (single format only)
    -h, --help         Show this help

  Examples:
    npx freemd convert notes.md --pdf
    npx freemd convert notes.md --pdf --docx
    npx freemd convert notes.md --docx -o ~/Desktop/notes.docx
`);
    process.exit(0);
  }

  let input = null;
  let output = null;
  const formats = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pdf' || arg === '--docx') {
      formats.push(arg.slice(2));
    } else if (arg === '-f' || arg === '--format') {
      const value = (argv[++i] ?? '').toLowerCase();
      if (value !== 'pdf' && value !== 'docx') {
        console.error(`Invalid format: ${value}. Use pdf or docx`);
        process.exit(1);
      }
      formats.push(value);
    } else if (arg === '-o' || arg === '--output') {
      output = argv[++i];
      if (!output) {
        console.error('Missing value for --output');
        process.exit(1);
      }
    } else if (input === null) {
      input = arg;
    } else {
      console.error(`Unexpected argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!input) {
    console.error('Missing input file. Usage: npx freemd convert <file.md> --pdf|--docx');
    process.exit(1);
  }
  const uniqueFormats = [...new Set(formats)];
  if (uniqueFormats.length === 0) {
    console.error('No format given. Add --pdf, --docx or -f <pdf|docx>');
    process.exit(1);
  }
  if (output && uniqueFormats.length > 1) {
    console.error('--output can only be used with a single format');
    process.exit(1);
  }

  const inputPath = path.resolve(input);
  let stat;
  try {
    stat = await fsp.stat(inputPath);
  } catch {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }
  if (!stat.isFile()) {
    console.error(`Not a file: ${inputPath}`);
    process.exit(1);
  }

  const source = await fsp.readFile(inputPath, 'utf8');
  const inputDir = path.dirname(inputPath);
  const base = path.basename(inputPath).replace(/\.(md|markdown)$/i, '');
  const title = base;

  for (const format of uniqueFormats) {
    let out;
    if (output) {
      out = path.resolve(output);
      if (!out.toLowerCase().endsWith(`.${format}`)) out += `.${format}`;
    } else {
      out = path.join(inputDir, `${base}.${format}`);
    }
    try {
      const buffer = await exportMarkdown(source, {
        format,
        root: inputDir,
        baseRel: '',
        title
      });
      await fsp.writeFile(out, buffer);
      console.log(`✓ ${out} (${(buffer.length / 1024).toFixed(1)} KB)`);
    } catch (error) {
      console.error(`✗ ${format}: ${error.message ?? error}`);
      process.exit(1);
    }
  }
}
