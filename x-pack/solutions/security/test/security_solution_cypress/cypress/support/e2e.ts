/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import './commands';
import 'cypress-real-events/support';
import { register as registerCypressGrep } from '@cypress/grep';
import {
  KNOWN_ESS_ROLE_DEFINITIONS,
  KNOWN_SERVERLESS_ROLE_DEFINITIONS,
} from '@kbn/security-solution-plugin/common/test';
import { setupUsers } from './setup_users';
import { CLOUD_SERVERLESS, IS_SERVERLESS } from '../env_var_names_constants';
import { suppressGlobalAnnouncements } from '../tasks/api_calls/suppress_global_announcements';

before(() => {
  // Pass an explicit Cypress-task timeout so that slow index creation on loaded
  // CI machines does not abort the entire suite via an unretriable "before all"
  // hook failure.  The auditbeat_single archive has >7 000-line mappings; creating
  // the index can take >30 s, which exceeds the default cy.task() timeout (60 s
  // can be hit when ES is under load).  120 s matches the per-request timeout
  // set inside createCreateIndexStream for heavy index operations.
  // See: https://github.com/elastic/kibana/issues/262814
  cy.task('esArchiverLoad', { archiveName: 'auditbeat_single' }, { timeout: 120_000 });
  suppressGlobalAnnouncements();
});

if (!Cypress.env(IS_SERVERLESS) && !Cypress.env(CLOUD_SERVERLESS)) {
  // Create Serverless + ESS roles and corresponding users. This helps to seamlessly reuse tests
  // between ESS and Serverless having all the necessary users set up.
  before(() => {
    const KNOWN_ROLE_DEFINITIONS = [
      ...Object.values(KNOWN_SERVERLESS_ROLE_DEFINITIONS),
      ...Object.values(KNOWN_ESS_ROLE_DEFINITIONS),
    ];

    setupUsers(KNOWN_ROLE_DEFINITIONS);
  });
}

registerCypressGrep();

Cypress.on('uncaught:exception', () => {
  return false;
});
