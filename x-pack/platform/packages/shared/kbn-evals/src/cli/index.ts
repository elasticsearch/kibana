/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RunWithCommands } from '@kbn/dev-cli-runner';
import { listSuitesCmd } from './commands/list';
import { runSuiteCmd } from './commands/run';
import { doctorCmd } from './commands/doctor';
import { envCmd } from './commands/env';
import { ciMapCmd } from './commands/ci_map';
import { compareCmd } from './commands/compare';
import { matrixCmd } from './commands/matrix';
import { initCmd } from './commands/init';
import { labelsCmd } from './commands/labels';
import { startCmd } from './commands/start';
import { stopCmd } from './commands/stop';
import { logsCmd } from './commands/logs';
import { scoutCmd } from './commands/scout';
import { clearIndexCmd } from './commands/clear_index';
import { dataplexCmd } from './commands/dataplex';

export async function run() {
  await new RunWithCommands(
    {
      description: 'Evals CLI',
    },
    [
      initCmd,
      startCmd,
      stopCmd,
      logsCmd,
      scoutCmd,
      clearIndexCmd,
      dataplexCmd,
      runSuiteCmd,
      listSuitesCmd,
      labelsCmd,
      doctorCmd,
      envCmd,
      ciMapCmd,
      compareCmd,
      matrixCmd,
    ]
  ).execute();
}
