/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export * from './asset_criticality/constants';
export * from './risk_engine/constants';
export * from './risk_score/constants';
export * from './migrations/constants';
export * from './privileged_user_monitoring/constants';
export * from './watchlists/constants';
export * from './entity_store/constants';
export * from './lead_generation/constants';
export * from './anomalies/constants';

export const API_VERSIONS = {
  public: {
    v1: '2023-10-31',
  },
  internal: {
    v1: '1',
  },
};
