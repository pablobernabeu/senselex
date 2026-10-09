// Audit the transcripts of the 300-word panel's collection run: what each of the
// 60 rater calls had available, what it received besides the prompt, and what it
// actually used.
//
// Each rater call ran as a subagent of an AI coding assistant (Claude Code)
// through run_panel.workflow.js. Such a subagent receives the assistant's system
// prompt and session context and has its standard tools, which the
// preregistration's "no tools" did not anticipate. The prompt told the rater to
// use no tool other than the one that returns its answers. This script reads the
// run's transcripts and records, per call:
//   - the tools offered and every tool call made, server-side ones included;
//   - the kinds of context received besides the prompt, and which study-related
//     terms that context contained and where they came from;
//   - whether the model's reasoning text was retained (it was not: the reasoning
//     blocks are present but empty, so their content cannot be checked).
//
// The transcripts themselves are not archived: they hold the session's e-mail
// address and local paths. Only this summary is.
//
//   node validation/audit_panel_transcripts.mjs <transcript folder>
//
// The folder is the workflow run's transcript directory (run wf_342bab11-1c6,
// collected on 2026-09-23). Writes validation/panel-transcript-audit.json.

import process from 'node:process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const folder = process.argv[2];
if (!folder) {
  process.stderr.write('Usage: node validation/audit_panel_transcripts.mjs <transcript folder>\n');
  process.exit(1);
}

// Terms that would show the extra context carried something about the study.
const TERMS = {
  hypothesisLabel: /\bH[123]b?\b/,
  hypothesis: /hypothes/i,
  preregistration: /preregist/i,
  pilot: /\bpilot\b/i,
  xuEtAl: /\bXu\b/,
  lancaster: /Lancaster/i,
  spearman: /Spearman/i,
  reliability: /reliabilit/i,
  sensorimotor: /sensorimotor/i,
};
// Where each kind of context came from, named without its content.
const SOURCE = {
  user: 'relayed request of the session that ran the panel',
  session_context: 'git status of the repository (branch and recent commit titles)',
  skill_listing: "descriptions of the assistant's installed skills",
  instructions: "the assistant's memory index",
  prompt_snapshot: "the assistant's subagent system prompt",
};

const transcripts = readdirSync(folder).filter((f) => /^agent-.*\.jsonl$/.test(f)).sort();
const calls = [];
for (const file of transcripts) {
  const entries = readFileSync(join(folder, file), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const meta = JSON.parse(readFileSync(join(folder, file.replace(/\.jsonl$/, '.meta.json')), 'utf8'));
  const attachments = entries.filter((e) => e.type === 'attachment').map((e) => e.attachment);
  const snapshot = attachments.filter((a) => a.type === 'prompt_snapshot').at(-1);
  const toolsOffered = (snapshot?.tools ?? []).map((t) => t.name ?? t).sort();

  const toolCalls = {};
  const blockTypes = {};
  let reasoningWords = 0;
  let model = null;
  for (const e of entries) {
    if (e.type !== 'assistant') continue;
    model ??= e.message?.model ?? null;
    for (const part of e.message?.content ?? []) {
      blockTypes[part.type] = (blockTypes[part.type] ?? 0) + 1;
      // Client and server tool calls alike (tool_use, server_tool_use).
      if (/tool_use$/.test(part.type)) toolCalls[part.name] = (toolCalls[part.name] ?? 0) + 1;
      if (part.type === 'thinking') reasoningWords += String(part.thinking ?? '').split(/\s+/).filter(Boolean).length;
    }
  }

  // The context besides the prompt: the relayed request (the first user turn;
  // the second is the prompt itself), the attachments and the system prompt.
  const contexts = [];
  const firstUser = entries.find((e) => e.type === 'user');
  if (firstUser) contexts.push(['user', JSON.stringify(firstUser.message.content)]);
  for (const a of attachments) {
    if (a.type === 'prompt_snapshot') contexts.push(['prompt_snapshot', JSON.stringify(a.systemPrompt ?? '')]);
    else contexts.push([a.type, JSON.stringify(a)]);
  }
  const termsInContext = {};
  for (const [term, rx] of Object.entries(TERMS)) {
    const sources = contexts.filter(([, text]) => rx.test(text)).map(([type]) => SOURCE[type] ?? type);
    if (sources.length) termsInContext[term] = [...new Set(sources)].sort();
  }

  const environment = attachments.find((a) => a.type === 'environment');
  const cwd = String(environment?.snapshot?.workingDirectory ?? environment?.snapshot?.cwd ?? '');
  calls.push({
    label: meta.label ?? meta.description ?? basename(file, '.jsonl'),
    model,
    toolsOffered: toolsOffered.length,
    fileAndShellToolsOffered: toolsOffered.filter((t) => ['Read', 'Grep', 'Glob', 'Bash', 'PowerShell', 'Write', 'Edit'].includes(t)),
    toolCalls,
    blockTypes,
    reasoningRetained: reasoningWords > 0,
    contextReceived: {
      systemPrompt: snapshot ? 'workflow subagent system prompt' : null,
      relayedUserRequest: Boolean(firstUser && JSON.stringify(firstUser.message.content).includes('[Workflow harness')),
      attachments: [...new Set(attachments.map((a) => a.type))].filter((t) => t !== 'prompt_snapshot').sort(),
      memoryIndex: attachments.some((a) => a.type === 'instructions' && (a.files ?? []).some((f) => /MEMORY\.md$/.test(f.path ?? ''))),
      termsInContext,
    },
    // Described relative to this repository, without the local path or the name
    // of the private folder that contained it.
    workingDirectory: !cwd ? null : basename(cwd) === 'software' ? 'repository root' : 'folder containing the repository',
  });
}
calls.sort((a, b) => String(a.label).localeCompare(String(b.label), 'en', { numeric: true }));

const total = {};
for (const c of calls) for (const [t, n] of Object.entries(c.toolCalls)) total[t] = (total[t] ?? 0) + n;
const termsAcrossCalls = {};
for (const c of calls) for (const [term, sources] of Object.entries(c.contextReceived.termsInContext)) {
  termsAcrossCalls[term] ??= { calls: 0, sources: [] };
  termsAcrossCalls[term].calls += 1;
  termsAcrossCalls[term].sources = [...new Set([...termsAcrossCalls[term].sources, ...sources])].sort();
}
const summary = {
  run: 'wf_342bab11-1c6',
  calls: calls.length,
  toolCallsAcrossAllCalls: total,
  everyCallUsedOnlyTheOutputTool: calls.every((c) => Object.keys(c.toolCalls).join() === 'StructuredOutput' && c.toolCalls.StructuredOutput === 1),
  everyCallWasOfferedFileAndShellTools: calls.every((c) => c.fileAndShellToolsOffered.length > 0),
  reasoningRetainedInAnyCall: calls.some((c) => c.reasoningRetained),
  studyTermsInContextBesidesThePrompt: termsAcrossCalls,
  studyTermsNeverInContext: Object.keys(TERMS).filter((t) => !termsAcrossCalls[t]),
  workingDirectories: [...new Set(calls.map((c) => c.workingDirectory))].sort(),
  perCall: calls,
};
writeFileSync(resolve(here, 'panel-transcript-audit.json'), `${JSON.stringify(summary, null, 1)}\n`);
process.stdout.write(`${calls.length} calls; tool calls ${JSON.stringify(total)}; only the output tool: ${summary.everyCallUsedOnlyTheOutputTool}; reasoning retained: ${summary.reasoningRetainedInAnyCall}\n`);
