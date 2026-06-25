/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RunWithCommands } from '@kbn/dev-cli-runner';
import { redTeamCmd } from './commands/red_team';

export async function run() {
  await new RunWithCommands(
    {
      usage: 'node scripts/evals ext',
      description: 'Evals extensions CLI (experimental)',
    },
    [redTeamCmd]
  ).execute();
}
