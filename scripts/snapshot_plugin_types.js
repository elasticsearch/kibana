/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

require('@kbn/setup-node-env/setup_env');
require('@kbn/setup-node-env/dns_ipv4_first');

require('@kbn/swc-register').install({ ignore: [/\.(?:js|ts|tsx)$/] });
require('@babel/register')({
  extensions: ['.js', '.ts', '.tsx'],
  presets: [require.resolve('@kbn/babel-preset/node_preset')],
  babelrc: false,
  sourceMaps: 'both',
});

require('@kbn/setup-node-env/polyfill');
require('@kbn/security-hardening');
require('reflect-metadata');

var command = process.argv[2];

switch (command) {
  case 'snapshot':
    require('@kbn/dev/so_migration/so_migration_snapshot_cli');
    break;
  case 'compare':
    require('@kbn/dev/so_migration/so_migration_compare_cli');
    break;
  default:
    printHelp();
    break;
}

function printHelp() {
  var scriptName = process.argv[1].replace(/^.*scripts\//, 'scripts/');

  console.log(`
  Usage: node ${scriptName} <command>

  Commands:
    snapshot  - Create a snapshot of the current Saved Object types
    compare   - Compare two snapshots to reveal changes in Saved Object types
  `);

  process.exit(0);
}
