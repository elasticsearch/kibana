/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityStoreSetupContract } from '@kbn/entity-store/server';
import type { AnalyticsServiceSetup } from '@kbn/core/server';
import {
  createRiskScoreMaintainer,
  type RegisterRiskScoreMaintainerDeps,
} from './risk_score_maintainer';

const INTERVAL = '1h';

export type RegisterRiskScoreMaintainerOptions = RegisterRiskScoreMaintainerDeps & {
  entityStore: EntityStoreSetupContract | undefined;
  telemetry: AnalyticsServiceSetup;
};

/**
 * Registers the risk score maintainer with the entity store.
 *
 * The experimental flag (riskScoringMaintainerEnabled) gates maintainer
 * registration at plugin startup. The UI setting (entityStoreV2Enabled)
 * independently controls id-based scoring and entity store dual-write at
 * runtime. Both gates are intentionally separate so the maintainer can be
 * toggled without restarting Kibana.
 */
export const registerRiskScoreMaintainer = ({
  entityStore,
  ...deps
}: RegisterRiskScoreMaintainerOptions): void => {
  if (!entityStore) {
    deps.logger.info('Entity Store is unavailable; skipping risk score maintainer registration.');
    return;
  }

  const maintainer = createRiskScoreMaintainer(deps);

  entityStore.registerEntityMaintainer({
    id: 'risk-score',
    description: 'Entity Analytics Risk Score Maintainer',
    interval: INTERVAL,
    timeout: '45m',
    initialState: {},
    setup: maintainer.setup,
    run: maintainer.run,
  });
};
