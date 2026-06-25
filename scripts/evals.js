#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

var Fs = require('fs');
var Path = require('path');

var METADATA_RELATIVE_PATH = '.buildkite/pipelines/evals/evals.suites.json';

function hasFlag(args, flag) {
  if (args.includes(flag)) {
    return true;
  }

  for (var i = 0; i < args.length; i++) {
    if (String(args[i]).startsWith(flag + '=')) {
      return true;
    }
  }

  return false;
}

function readMetadata(repoRoot) {
  var filePath = Path.join(repoRoot, METADATA_RELATIVE_PATH);
  if (!Fs.existsSync(filePath)) {
    return [];
  }

  try {
    var raw = Fs.readFileSync(filePath, 'utf-8');
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed.suites) ? parsed.suites : [];
  } catch (error) {
    return [];
  }
}

function filterMetadataWithExistingConfigs(metadata, repoRoot) {
  var filtered = [];
  var missing = [];

  for (var i = 0; i < metadata.length; i++) {
    var entry = metadata[i];
    if (!entry || typeof entry !== 'object' || !entry.configPath) {
      continue;
    }

    var abs = Path.resolve(repoRoot, entry.configPath);
    if (Fs.existsSync(abs)) {
      filtered.push(entry);
    } else {
      missing.push({ id: entry.id, configPath: entry.configPath });
    }
  }

  if (missing.length > 0) {
    logWarning(
      'Ignoring ' +
        missing.length +
        ' suite(s) from evals.suites.json because their configPath does not exist.'
    );
    for (var j = 0; j < missing.length; j++) {
      logWarning('- ' + String(missing[j].id) + ': ' + String(missing[j].configPath));
    }
  }

  return filtered;
}

function deriveSuiteRoot(configPath) {
  var relPath = String(configPath).replace(/\\/g, '/');
  var parts = relPath.split('/');

  for (var i = 0; i < parts.length; i++) {
    if (String(parts[i]).startsWith('kbn-evals-suite-')) {
      return parts.slice(0, i + 1).join('/');
    }
  }

  return null;
}

function normalizeSuite(entry, repoRoot) {
  var id = entry.id;
  var name = entry.name !== undefined && entry.name !== null ? entry.name : id;
  var tags = entry.tags !== undefined && entry.tags !== null ? entry.tags : [];
  var ciLabels =
    entry.ciLabels !== undefined && entry.ciLabels !== null ? entry.ciLabels : ['evals:' + id];
  var absoluteConfigPath = Path.resolve(repoRoot, entry.configPath);
  var suiteRoot = deriveSuiteRoot(entry.configPath);

  return {
    id: id,
    name: name,
    configPath: entry.configPath,
    absoluteConfigPath: absoluteConfigPath,
    suiteRoot: suiteRoot,
    relativeSuiteRoot: suiteRoot,
    tags: tags,
    ciLabels: ciLabels,
    description: entry.description,
    source: 'metadata',
  };
}

function logInfo(message) {
  console.log(' info ' + message);
}

function logWarning(message) {
  console.log('warning ' + message);
}

function printSuiteTable(suites) {
  if (suites.length === 0) {
    return;
  }

  var idWidth = 'Suite ID'.length;
  var tagsWidth = 'Tags'.length;

  for (var i = 0; i < suites.length; i++) {
    if (String(suites[i].id).length > idWidth) {
      idWidth = String(suites[i].id).length;
    }

    var tagString = suites[i].tags && suites[i].tags.length ? suites[i].tags.join(', ') : '-';
    if (tagString.length > tagsWidth) {
      tagsWidth = tagString.length;
    }
  }

  logInfo('Suite ID'.padEnd(idWidth) + '  ' + 'Tags'.padEnd(tagsWidth) + '  Config');
  for (var j = 0; j < suites.length; j++) {
    var tags = suites[j].tags && suites[j].tags.length ? suites[j].tags.join(', ') : '-';
    logInfo(
      String(suites[j].id).padEnd(idWidth) +
        '  ' +
        tags.padEnd(tagsWidth) +
        '  ' +
        suites[j].configPath
    );
  }
}

function runFastList(repoRoot, args) {
  var metadata = filterMetadataWithExistingConfigs(readMetadata(repoRoot), repoRoot);
  if (metadata.length === 0) {
    return false;
  }

  var suites = [];
  for (var i = 0; i < metadata.length; i++) {
    suites.push(normalizeSuite(metadata[i], repoRoot));
  }

  var wantsJson = hasFlag(args, '--json');
  logInfo('Using cached suite metadata (fast). Run with --refresh to rescan configs.');

  if (wantsJson) {
    process.stdout.write(JSON.stringify(suites, null, 2) + '\n');
    return true;
  }

  logInfo('Found ' + suites.length + ' eval suite(s):');
  printSuiteTable(suites);
  return true;
}

function runFastCiMap(repoRoot, args) {
  var metadata = filterMetadataWithExistingConfigs(readMetadata(repoRoot), repoRoot);
  if (metadata.length === 0) {
    return false;
  }

  var entries = [];
  entries.push({
    label: 'evals:all',
    suiteId: '*',
    command: 'Run all eval suites in PR CI',
  });
  for (var i = 0; i < metadata.length; i++) {
    var suite = metadata[i];
    var labels = suite.ciLabels && suite.ciLabels.length ? suite.ciLabels : ['evals:' + suite.id];

    for (var j = 0; j < labels.length; j++) {
      entries.push({
        label: labels[j],
        suiteId: suite.id,
        command:
          'EVALUATION_CONNECTOR_ID=<connector-id> node scripts/evals run --suite ' + suite.id,
      });
    }
  }

  var wantsJson = hasFlag(args, '--json');
  if (wantsJson) {
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
    return true;
  }

  if (entries.length === 0) {
    logWarning('No eval suite metadata found to generate CI mapping.');
    return true;
  }

  logInfo('CI label mappings:');
  for (var k = 0; k < entries.length; k++) {
    logInfo('- ' + entries[k].label + ': ' + entries[k].command);
  }
  return true;
}

var ENV_DOCS = [
  {
    name: 'TEST_RUN_ID',
    description:
      'Run identifier used to tag exported evaluation scores/traces. Auto-generated by Scout if unset; set it explicitly to make comparisons repeatable.',
    example: 'TEST_RUN_ID=agent-builder-baseline',
  },
  {
    name: 'EVALUATION_CONNECTOR_ID',
    description: 'Connector used for LLM-as-a-judge evaluators (required).',
    example: 'EVALUATION_CONNECTOR_ID=bedrock-claude',
  },
  {
    name: 'EVALUATION_REPETITIONS',
    description: 'Overrides configured repetition count for evals.',
    example: 'EVALUATION_REPETITIONS=3',
  },
  {
    name: 'KBN_EVALS_EXECUTOR',
    description: 'Switch to the Phoenix-backed executor.',
    example: 'KBN_EVALS_EXECUTOR=phoenix',
  },
  {
    name: 'KBN_EVALS_SKIP_CONNECTOR_SETUP',
    description:
      'Skip automatic connector setup/teardown. Use this option when evaluating with pre-defined connectors.',
    example: 'KBN_EVALS_SKIP_CONNECTOR_SETUP=true',
  },
  {
    name: 'PHOENIX_BASE_URL',
    description: 'Phoenix base URL used when KBN_EVALS_EXECUTOR=phoenix.',
    example: 'PHOENIX_BASE_URL=http://localhost:6006',
  },
  {
    name: 'PHOENIX_API_KEY',
    description: 'Phoenix API key used when KBN_EVALS_EXECUTOR=phoenix.',
    example: 'PHOENIX_API_KEY=...',
  },
  {
    name: 'TRACING_ES_URL',
    description: 'Elasticsearch URL for trace-based evaluators.',
    example: 'TRACING_ES_URL=http://elastic:changeme@localhost:9200',
  },
  {
    name: 'TRACING_ES_API_KEY',
    description: 'API key for authenticating with the tracing Elasticsearch cluster.',
    example: 'TRACING_ES_API_KEY=...',
  },
  {
    name: 'TRACING_EXPORTERS',
    description:
      'JSON array of trace exporter configs (http/grpc/phoenix/langfuse). Overrides kibana.dev.yml tracing exporters when set.',
    example: 'TRACING_EXPORTERS=\'[{"http":{"url":"https://ingest.example.com/v1/traces"}}]\'',
  },
  {
    name: 'EVALUATIONS_KBN_URL',
    description:
      'Kibana URL used for eval score ingestion and dataset operations when targeting a non-local cluster.',
    example: 'EVALUATIONS_KBN_URL=http://elastic:changeme@localhost:5601',
  },
  {
    name: 'EVALUATIONS_KBN_API_KEY',
    description: 'API key for authenticating to EVALUATIONS_KBN_URL.',
    example: 'EVALUATIONS_KBN_API_KEY=...',
  },
  {
    name: 'SELECTED_EVALUATORS',
    description: 'Comma-separated list of evaluator names to run.',
    example: 'SELECTED_EVALUATORS="Factuality,Relevance"',
  },
  {
    name: 'RAG_EVAL_K',
    description: 'Overrides default k used by RAG evaluators.',
    example: 'RAG_EVAL_K=5',
  },
  {
    name: 'INDEX_FOCUSED_RAG_EVAL',
    description: 'Restrict RAG evaluators to ground-truth indices.',
    example: 'INDEX_FOCUSED_RAG_EVAL=true',
  },
];

function runFastEnv() {
  logInfo('Environment variables:');

  var nameWidth = 'Name'.length;
  var descWidth = 'Description'.length;

  for (var i = 0; i < ENV_DOCS.length; i++) {
    if (String(ENV_DOCS[i].name).length > nameWidth) {
      nameWidth = String(ENV_DOCS[i].name).length;
    }
    if (String(ENV_DOCS[i].description).length > descWidth) {
      descWidth = String(ENV_DOCS[i].description).length;
    }
  }

  logInfo('Name'.padEnd(nameWidth) + '  ' + 'Description'.padEnd(descWidth) + '  Example');
  for (var j = 0; j < ENV_DOCS.length; j++) {
    logInfo(
      String(ENV_DOCS[j].name).padEnd(nameWidth) +
        '  ' +
        String(ENV_DOCS[j].description).padEnd(descWidth) +
        '  ' +
        String(ENV_DOCS[j].example)
    );
  }

  return true;
}

function runFastHelp() {
  logInfo('Evals CLI');
  logInfo('');
  logInfo('For full command help/flags: node scripts/evals --full-help');
  logInfo('');
  logInfo('Commands:');
  logInfo('  init                          Set up config + connectors for local evals');
  logInfo('  init config                   Only create/update vault config.json');
  logInfo('    --profile <name>            Write config.<name>.json (e.g. --profile local)');
  logInfo('  start [--suite <id>] [...]    Start stack + run an eval suite');
  logInfo('  stop [--service <name>]       Stop backgrounded eval services');
  logInfo('  logs [--service <name>]       Tail logs from eval services');
  logInfo('  scout                         Start Scout server for evals');
  logInfo('  clear-index                   Delete .evaluation-scores indices (reset export)');
  logInfo('  run [--suite <id>] [...]      Run an eval suite');
  logInfo('  list [--refresh] [--json]     List eval suites');
  logInfo('  labels [suite-id ...]         Create/sync GitHub eval suite labels');
  logInfo('  compare <run-a> <run-b>       Compare two eval runs');
  logInfo('  doctor                        Check local prerequisites');
  logInfo('  env                           List environment variables');
  logInfo('  ci-map [--json]               Output CI label mapping');
  logInfo('  ext <command> [...]           Run the experimental evals extensions CLI');
  logInfo('');
  logInfo('Examples:');
  logInfo('  node scripts/evals init');
  logInfo('  node scripts/evals start --suite agent-builder --model eis-gpt-4.1');
  logInfo('  node scripts/evals stop');
  logInfo('  node scripts/evals logs --service scout');
  logInfo('  node scripts/evals run --suite agent-builder --judge eis-gpt-4.1');
  logInfo('  node scripts/evals ext red-team --suite agent-builder --dry-run');
  return true;
}

function main() {
  var args = process.argv.slice(2);
  var command = args[0];
  if (command && String(command).startsWith('-')) {
    command = null;
  }
  var repoRoot = process.cwd();

  // Delegate the experimental extensions CLI: `node scripts/evals ext <command> [...]`.
  if (command === 'ext') {
    process.argv = [process.argv[0], process.argv[1]].concat(args.slice(1));
    process.env.KBN_PEGGY_REQUIRE_HOOK_LOG ??= 'false';
    require('@kbn/setup-node-env');
    void require('@kbn/evals-extensions').cli.run();
    return;
  }

  var hasHelpFlag = hasFlag(args, '--help') || hasFlag(args, '-h');

  // For subcommand-level help, prefer the full CLI help output.
  // Keep the fast help output for `node scripts/evals --help` (no command).
  if (hasHelpFlag && command && command !== 'help') {
    process.env.KBN_PEGGY_REQUIRE_HOOK_LOG ??= 'false';
    require('@kbn/setup-node-env');
    void require('@kbn/evals').cli.run();
    return;
  }

  if (command === 'list' && !hasFlag(args, '--refresh')) {
    if (runFastList(repoRoot, args)) {
      return;
    }
  }

  if (command === 'list' && hasFlag(args, '--refresh') && !hasFlag(args, '--json')) {
    var metadata = filterMetadataWithExistingConfigs(readMetadata(repoRoot), repoRoot);
    if (metadata.length > 0) {
      var suites = [];
      for (var i = 0; i < metadata.length; i++) {
        suites.push(normalizeSuite(metadata[i], repoRoot));
      }
      logInfo('Cached suites (' + suites.length + '):');
      printSuiteTable(suites);
      logInfo('Refreshing suite discovery...');
      process.env.KBN_EVALS_LIST_CACHE_PRINTED = 'true';
    }
  }

  if (command === 'ci-map') {
    if (runFastCiMap(repoRoot, args)) {
      return;
    }
  }

  if (command === 'env') {
    if (runFastEnv()) {
      return;
    }
  }

  if (!command || command === 'help' || hasHelpFlag) {
    if (runFastHelp()) {
      return;
    }
  }

  if (hasFlag(args, '--full-help')) {
    process.argv = [process.argv[0], process.argv[1], '--help'];
    process.env.KBN_PEGGY_REQUIRE_HOOK_LOG ??= 'false';
    require('@kbn/setup-node-env');
    void require('@kbn/evals').cli.run();
    return;
  }

  process.env.KBN_PEGGY_REQUIRE_HOOK_LOG ??= 'false';
  require('@kbn/setup-node-env');
  void require('@kbn/evals').cli.run();
}

main();
