#!/usr/bin/env node
/**
 * Local pre-deploy sanity checks (no network).
 * Run from repo root: npm run check:deploy
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

const fail = (message) => {
  console.error(`[FAIL] ${message}`);
  failed += 1;
};

const ok = (message) => {
  console.log(`[OK] ${message}`);
};

const requireFile = (relativePath, label) => {
  const full = path.join(root, relativePath);
  if (!fs.existsSync(full)) {
    fail(`${label} missing: ${relativePath}`);
    return false;
  }
  ok(`${label} present`);
  return true;
};

requireFile('render.yaml', 'Render blueprint');
requireFile('frontend/vercel.json', 'Vercel config');
requireFile('backend/server.js', 'Backend entry');
requireFile('frontend/package.json', 'Frontend package');

const envExample = path.join(root, 'backend', '.env.example');
if (fs.existsSync(envExample)) {
  const text = fs.readFileSync(envExample, 'utf8');
  if (/xkeysib-[a-z0-9]/i.test(text)) {
    fail('backend/.env.example contains a real-looking Brevo API key — replace with a placeholder');
  } else {
    ok('backend/.env.example has no embedded API keys');
  }
}

const frontendDist = path.join(root, 'frontend', 'dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  ok('frontend/dist built (run npm run build if you need a fresh build)');
} else {
  console.warn('[WARN] frontend/dist not found — run: npm run build');
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll deploy file checks passed.');
process.exit(failed ? 1 : 0);
