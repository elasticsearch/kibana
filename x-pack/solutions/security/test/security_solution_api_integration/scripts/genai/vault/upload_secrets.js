/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

require('@kbn/swc-register').install();
const { uploadConfigToVault } = require('./manage_secrets');
const minimist = require('minimist');

/**
 * Uploads Security Gen AI secrets for testing from local `config.json` to vault. By default, the 'siem-team' accessible
 * vault from secrets.elastic.co is used, but it can be overridden with the --vault parameter to use the 'ci-prod' vault.
 *
 * @returns {Promise<void>}
 */
async function uploadSecrets() {
  const argv = minimist(process.argv.slice(2));
  const vault = argv.vault || 'siem-team';

  if (vault !== 'siem-team' && vault !== 'ci-prod') {
    console.error('Error: vault parameter must be either "siem-team" or "ci-prod"');
    process.exit(1);
  }

  console.log(`Using ${vault} vault...`);
  await uploadConfigToVault(vault);
  console.log(`Secret upload complete!`);
}

uploadSecrets();
