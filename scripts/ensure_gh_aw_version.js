/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

require('@kbn/setup-node-env/node_version_validator');

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var yaml = require('yaml');

function printHelp() {
  console.log(`Ensure the local gh-aw extension matches the repo-pinned version.

The pinned version is read from:
  .github/workflows/validate-agentic-workflow-locks.yml

Behavior:
  - installs gh-aw when it is missing
  - replaces gh-aw when the installed version differs
  - exits when gh-aw already matches the pinned version`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

function run(command, args, options) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options && options.stdio ? options.stdio : 'pipe',
  });
}

function runOrFail(command, args) {
  var result = run(command, args, { stdio: 'inherit' });

  if (result.error) {
    console.error('Error: failed to run `' + command + '`: ' + result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function readRepoRoot() {
  var result = run('git', ['rev-parse', '--show-toplevel']);

  if (result.error || result.status !== 0) {
    console.error('Error: this script must be run from inside the Kibana git repository.');
    process.exit(result.status || 1);
  }

  return result.stdout.trim();
}

function readPinnedVersion(workflowPath) {
  var workflow = yaml.parse(fs.readFileSync(workflowPath, 'utf8'));
  var version = workflow && workflow.env && workflow.env.GH_AW_VERSION;

  if (typeof version !== 'string' || version.length === 0) {
    console.error('Error: could not find GH_AW_VERSION in ' + workflowPath + '.');
    process.exit(1);
  }

  return version;
}

function readCurrentVersion() {
  var result = run('gh', ['extension', 'list']);

  if (result.error) {
    console.error('Error: GitHub CLI (gh) is required to install gh-aw.');
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }

  var ghAwLine = result.stdout.split('\n').find(function (line) {
    return line.split(/\s+/).slice(0, 2).join(' ') === 'gh aw';
  });

  return ghAwLine ? ghAwLine.trim().split(/\s+/)[3] : '';
}

var repoRoot = readRepoRoot();
var workflowPath = path.join(repoRoot, '.github/workflows/validate-agentic-workflow-locks.yml');
var version = readPinnedVersion(workflowPath);
var current = readCurrentVersion();

if (current === version) {
  console.log('gh-aw is already ' + version);
  process.exit(0);
}

if (current) {
  console.log('Replacing gh-aw ' + current + ' with ' + version);
  runOrFail('gh', ['extension', 'remove', 'gh-aw']);
} else {
  console.log('Installing gh-aw ' + version);
}

runOrFail('gh', ['extension', 'install', 'github/gh-aw', '--pin', version]);
runOrFail('gh', ['aw', '--version']);
