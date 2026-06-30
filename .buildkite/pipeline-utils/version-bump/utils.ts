/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RestEndpointMethodTypes } from '@octokit/rest';
import { getPrChangesCached } from '../github';

const VERSION_BUMP_BRANCH_RE = /^bump-versions(-json)?-\d{4}-\d{2}-\d{2}/;
const KIBANAMACHINE_LOGIN = 'kibanamachine';

const VERSION_BUMP_FILE_MATCHERS = [
  /^versions\.json$/,
  /^\.backportrc\.json$/,
  /^package\.json$/,
  /^x-pack\/package\.json$/,
  /^x-pack\/solutions\/search\/plugins\/enterprise_search\/common\/__mocks__\/initial_app_data\.ts$/,
  /^src\/core\/server\/integration_tests\/saved_objects\/migrations\/kibana_migrator_archive_utils\.ts$/,
  /^src\/core\/server\/integration_tests\/saved_objects\/migrations\/archives\//,
  /^src\/core\/server\/integration_tests\/saved_objects\/migrations\/group1\/__snapshots__\/v2_migration\.test\.ts\.snap$/,
];

export const isAutomatedVersionBumpPR = async (
  changes: null | RestEndpointMethodTypes['pulls']['listFiles']['response']['data'] = null
) => {
  const branch = process.env.GITHUB_PR_BRANCH ?? '';
  const prUser = process.env.GITHUB_PR_USER ?? '';

  if (!VERSION_BUMP_BRANCH_RE.test(branch) || prUser !== KIBANAMACHINE_LOGIN) {
    return false;
  }

  const prChanges = changes || (await getPrChangesCached());

  return prChanges.every((change) =>
    VERSION_BUMP_FILE_MATCHERS.some(
      (pattern) =>
        change.filename.match(pattern) &&
        (!change.previous_filename || change.previous_filename.match(pattern))
    )
  );
};
