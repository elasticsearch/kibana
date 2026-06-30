/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RESOLUTION_RULE_IDS } from '../../../common/domain/resolution_rules/constants';
import type { RegisterEntityMaintainerConfig } from '../../tasks/entity_maintainers/types';
import { ResolutionClient } from '../../domain/resolution';
import type { AutomatedResolutionState, PerRuleState } from './types';
import { migrate } from './migrate';
import { RESOLUTION_RULE_CONFIGS } from './rule_config';
import { runEmailRuleResolution } from './run';

export const MAINTAINER_ID = 'automated-resolution';

const EMPTY_RULE_STATE: PerRuleState = { lastProcessedTimestamp: null, lastRun: null };

// Initial state for a brand-new task: an empty map. Per-rule state is persisted by
// task-manager between runs (surviving restarts and upgrades); a rule with no
// persisted entry runs a full scan on its first execution, then records its
// watermark for subsequent runs.
const createInitialState = (): AutomatedResolutionState => ({ rules: {} });

export const automatedResolutionMaintainerConfig: RegisterEntityMaintainerConfig = {
  id: MAINTAINER_ID,
  description: 'Automatically resolves entities using field-matching rules',
  interval: '5m',
  initialState: createInitialState(),
  minLicense: 'enterprise',
  run: async ({ status, abortController, logger, esClient }) => {
    const namespace = status.metadata.namespace;
    const state = migrate(status.state, logger);

    const resolutionClient = new ResolutionClient({ logger, esClient, namespace });
    const rules: Record<string, PerRuleState> = { ...state.rules };

    for (const ruleConfig of RESOLUTION_RULE_CONFIGS) {
      // Only the email rule has a runner today; further rules add their own.
      if (ruleConfig.id === RESOLUTION_RULE_IDS.EMAIL_EXACT_MATCH) {
        rules[ruleConfig.id] = await runEmailRuleResolution({
          state: state.rules[ruleConfig.id] ?? EMPTY_RULE_STATE,
          namespace,
          esClient,
          logger,
          resolutionClient,
          abortController,
        });
      }
    }

    return { ...state, rules };
  },
};
