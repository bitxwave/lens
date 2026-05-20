#!/usr/bin/env node
// Regenerate server/bootstrap.json from scripts/bootstrap-source.ts.
// Usage: from repo root: node scripts/dump-bootstrap.mjs
//
// Requires: pnpm/npx to invoke tsx.

import { writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const tsxOut = execSync(
  `npx -y tsx -e "import { BOOTSTRAP } from './scripts/bootstrap-source.ts'; process.stdout.write(JSON.stringify(BOOTSTRAP, null, 2))"`,
  { encoding: 'utf8' }
);

const target = 'server/bootstrap.json';
await writeFile(target, tsxOut + '\n', 'utf8');
console.log(`Wrote ${target} (${tsxOut.length} bytes).`);
