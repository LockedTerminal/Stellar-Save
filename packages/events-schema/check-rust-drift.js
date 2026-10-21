#!/usr/bin/env node
// check-rust-drift.js — fails if the topics emitted by the events domain
// modules and the topics in schema.json diverge.
//
// Mirrors the `test_every_*_topic_*` unit tests in events.rs so the check also
// runs in CI without a Rust toolchain.
//
// Also validates that:
//   1. Every schema entry has a schema_version field.
//   2. Every domain source file declares a *_SCHEMA_VERSION constant.

const fs = require('fs');
const path = require('path');

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema.json'), 'utf8'));

// ── Load domain source files ──────────────────────────────────────────────────
const eventsDir = path.join(__dirname, '..', '..', 'contracts', 'stellar-save', 'src', 'events');
const domainFiles = ['group.rs', 'contribution.rs', 'payout.rs', 'admin.rs'];

const domainSources = domainFiles.map((file) => {
  const filePath = path.join(eventsDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ Expected domain file not found: ${filePath}\n`);
    process.exit(1);
  }
  return { file, src: fs.readFileSync(filePath, 'utf8') };
});

// ── 1. Validate schema_version field in every schema entry ───────────────────
const missingVersion = Object.entries(schema.events)
  .filter(([, def]) => !Object.prototype.hasOwnProperty.call(def.fields, 'schema_version'))
  .map(([topic]) => topic);

if (missingVersion.length > 0) {
  console.error(
    '\n❌ schema.json is missing schema_version in the following events:\n' +
    missingVersion.map((t) => `   • ${t}`).join('\n') + '\n' +
    '   Add "schema_version": "u32" as the first field of each entry.\n'
  );
  process.exit(1);
}

// ── 2. Validate *_SCHEMA_VERSION constant in every domain file ────────────────
const missingConst = domainSources.filter(({ src }) => !/_SCHEMA_VERSION:\s*u32\s*=/.test(src));
if (missingConst.length > 0) {
  console.error(
    '\n❌ The following domain files are missing a *_SCHEMA_VERSION constant:\n' +
    missingConst.map(({ file }) => `   • ${file}`).join('\n') + '\n'
  );
  process.exit(1);
}

// ── 3. Topic drift check ─────────────────────────────────────────────────────
const schemaTopics = new Set(Object.values(schema.events).map((e) => e.topic));

const emittedTopics = new Set(
  domainSources.flatMap(({ src }) =>
    [...src.matchAll(/publish\(\s*\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1])
  )
);

const missingFromSchema = [...emittedTopics].filter((t) => !schemaTopics.has(t));
const missingEmitter    = [...schemaTopics].filter((t) => !emittedTopics.has(t));

if (missingFromSchema.length || missingEmitter.length) {
  console.error('\n❌ events domain modules ↔ schema.json drift detected!');
  if (missingFromSchema.length) {
    console.error(
      '   Emitted in domain modules but missing from schema.json: ' +
      missingFromSchema.join(', ')
    );
  }
  if (missingEmitter.length) {
    console.error(
      '   In schema.json but no emitter in domain modules: ' +
      missingEmitter.join(', ')
    );
  }
  process.exit(1);
}

process.stdout.write(
  `✅ Domain modules and schema.json agree on ${schemaTopics.size} topics ` +
  `(all with schema_version).\n`
);
