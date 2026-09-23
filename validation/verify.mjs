// Rerun the whole validation in a scratch copy and check that every output
// matches the committed one. Nothing in the repository is written: the scripts
// run inside a temporary copy of src/, validation/ and the word bank, and only
// their outputs are compared.
//
//   node validation/verify.mjs        (from the software directory; npm run verify)
//
// The steps run in pipeline order, each reading what the previous one wrote:
//   sample_words.mjs     -> words-sample.json
//   make_lists.mjs       -> panel-lists.json
//   compute.mjs          -> results.json, llm-norms-eng.csv,
//                           senselex-llm-validation-dataset.json
//   human_benchmark.mjs  -> human-benchmark-results.json
//   criterion.mjs        -> criterion-results.json, panel-vs-human.json
// The panel itself (raters.json) is model output and is an input here, not a step.
//
// sample_words.mjs, human_benchmark.mjs and criterion.mjs need the Lancaster files
// in SENSELEX_DATA_DIR (see lancaster.mjs). Without the 1.4 GB trial file,
// human_benchmark.mjs is skipped and criterion.mjs reads the committed
// human-benchmark-results.json; the report says so. Pass --require-trial to make
// that a failure instead.
//
// Files are compared after normalising line endings, since Git on Windows may
// check text files out with CRLF while the scripts write LF.

import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIR, LANCASTER_FILES } from './lancaster.mjs';

const validation = dirname(fileURLToPath(import.meta.url));
const software = resolve(validation, '..');
const requireTrial = process.argv.includes('--require-trial');
const haveTrial = existsSync(resolve(DATA_DIR, LANCASTER_FILES.trial.local));

const STEPS = [
  { script: 'sample_words.mjs', outputs: ['words-sample.json'] },
  { script: 'make_lists.mjs', outputs: ['panel-lists.json'] },
  { script: 'compute.mjs', outputs: ['results.json', 'llm-norms-eng.csv', 'senselex-llm-validation-dataset.json'] },
  { script: 'human_benchmark.mjs', outputs: ['human-benchmark-results.json'], nodeArgs: ['--max-old-space-size=6144'], needsTrial: true },
  { script: 'criterion.mjs', outputs: ['criterion-results.json', 'panel-vs-human.json'] },
];

if (!haveTrial && requireTrial) {
  process.stderr.write(`--require-trial given but ${LANCASTER_FILES.trial.local} is not in ${DATA_DIR}\n`);
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), 'senselex-verify-'));
cpSync(resolve(software, 'src'), join(scratch, 'src'), { recursive: true });
cpSync(validation, join(scratch, 'validation'), { recursive: true });
cpSync(resolve(software, 'web-static/words.js'), join(scratch, 'web-static/words.js'));
cpSync(resolve(software, 'package.json'), join(scratch, 'package.json'));

const normalised = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const report = [];
let failed = false;

for (const step of STEPS) {
  if (step.needsTrial && !haveTrial) {
    report.push([step.script, 'skipped', 'trial file absent; later steps use the committed output']);
    continue;
  }
  process.stdout.write(`running ${step.script}...\n`);
  const run = spawnSync(process.execPath, [...(step.nodeArgs ?? []), join('validation', step.script)], {
    cwd: scratch,
    env: { ...process.env, SENSELEX_DATA_DIR: DATA_DIR },
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    failed = true;
    report.push([step.script, 'FAILED', (run.stderr || run.stdout).trim().split('\n').slice(-3).join(' | ')]);
    break;
  }
  for (const output of step.outputs) {
    const same = normalised(join(scratch, 'validation', output)) === normalised(join(validation, output));
    if (!same) failed = true;
    report.push([`  ${output}`, same ? 'identical' : 'DIFFERS', '']);
  }
}

rmSync(scratch, { recursive: true, force: true });
process.stdout.write(`\nNode ${process.version}\n`);
for (const [what, status, note] of report) process.stdout.write(`${what.padEnd(40)} ${status.padEnd(10)} ${note}\n`);
process.stdout.write(failed ? '\nVerification FAILED\n' : '\nEvery output reproduces the committed file.\n');
process.exit(failed ? 1 : 0);
