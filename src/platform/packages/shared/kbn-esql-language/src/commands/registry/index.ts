/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { CommandRegistry } from './registry';
import { limitCommand } from './limit';
import { dedupCommand } from './dedup';
import { dropCommand } from './drop';
import { keepCommand } from './keep';
import { forkCommand } from './fork';
import { renameCommand } from './rename';
import { changePointCommand } from './change_point';
import { completionCommand } from './completion';
import { dissectCommand } from './dissect';
import { uriPartsCommand } from './uri_parts';
import { userAgentCommand } from './user_agent';
import { registeredDomainCommand } from './registered_domain';
import { enrichCommand } from './enrich';
import { evalCommand } from './eval';
import { fromCommand } from './from';
import { grokCommand } from './grok';
import { joinCommand } from './join';
import { mvExpandCommand } from './mv_expand';
import { rowCommand } from './row';
import { sortCommand } from './sort';
import { statsCommand } from './stats';
import { inlineStatsCommand } from './inlinestats';
import { sampleCommand } from './sample';
import { showCommand } from './show';
import { timeseriesCommand } from './timeseries';
import { whereCommand } from './where';
import { fuseCommand } from './fuse';
import { rerankCommand } from './rerank';
import { promqlCommand } from './promql';
import { mergeCommandWithGeneratedCommandData } from './elastisearch_command_data_loader';
import { setCommand } from './set';
import { mmrCommand } from './mmr';
import { metricsInfoCommand } from './metrics_info';
import { tsInfoCommand } from './ts_info';
import { highlightCommand } from './highlight';

const esqlCommandRegistry = new CommandRegistry();

const baseCommands = [
  limitCommand,
  dedupCommand,
  dropCommand,
  forkCommand,
  renameCommand,
  changePointCommand,
  completionCommand,
  dissectCommand,
  uriPartsCommand,
  userAgentCommand,
  registeredDomainCommand,
  enrichCommand,
  evalCommand,
  fromCommand,
  grokCommand,
  joinCommand,
  mvExpandCommand,
  keepCommand,
  rowCommand,
  sortCommand,
  statsCommand,
  inlineStatsCommand,
  sampleCommand,
  setCommand,
  showCommand,
  timeseriesCommand,
  whereCommand,
  fuseCommand,
  rerankCommand,
  promqlCommand,
  mmrCommand,
  metricsInfoCommand,
  tsInfoCommand,
  highlightCommand,
];

baseCommands.forEach((command) => {
  const mergedCommand = mergeCommandWithGeneratedCommandData(command);
  esqlCommandRegistry.registerCommand(mergedCommand);
});

export { esqlCommandRegistry };
