/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/scout';

const DEFAULT_SPACE_ID = 'default';

export const SPACE_1 = {
  id: 'space_1',
  name: 'Space 1',
  description: 'This is the first test space',
  disabledFeatures: [],
};

export const SPACE_2 = {
  id: 'space_2',
  name: 'Space 2',
  description: 'This is the second test space',
  disabledFeatures: [],
};

export const SPACE_3 = {
  id: 'space_3',
  name: 'Space 3',
  description: 'This is the third test space',
  disabledFeatures: [],
};

/**
 * Features that Kibana automatically disables when a space is assigned the `es`
 * (Elasticsearch) solution. Kept sorted so it can be compared directly against a
 * sorted `disabledFeatures` response.
 */
export const SOLUTION_ES_DISABLED_FEATURES = [
  'apm',
  'infrastructure',
  'logs',
  'observabilityAlerts',
  'observabilityCasesV3',
  'profiling',
  'securitySolutionAlertsV1',
  'securitySolutionAssistant',
  'securitySolutionAttackDiscovery',
  'securitySolutionCasesV3',
  'securitySolutionNotes',
  'securitySolutionRulesV4',
  'securitySolutionSiemMigrations',
  'securitySolutionTimeline',
  'siemV5',
  'slo',
  'uptime',
] as const;

export const getUrlPrefix = (spaceId?: string) =>
  spaceId && spaceId !== DEFAULT_SPACE_ID ? `/s/${spaceId}` : ``;

export const getIdPrefix = (spaceId?: string) =>
  spaceId === DEFAULT_SPACE_ID ? '' : `${spaceId}-`;

/**
 * The default space is exercised both implicitly (no URL prefix) and explicitly
 * (`/s/default`), while any other space is only exercised via its explicit URL prefix.
 */
export const getTestScenariosForSpace = (spaceId: string) => {
  const explicitScenario = {
    spaceId,
    urlPrefix: `/s/${spaceId}`,
    scenario: `when referencing the ${spaceId} space explicitly in the URL`,
  };

  if (spaceId === DEFAULT_SPACE_ID) {
    return [
      { spaceId, urlPrefix: ``, scenario: 'when referencing the default space implicitly' },
      explicitScenario,
    ];
  }

  return [explicitScenario];
};

export const createSpace = (kbnClient: KbnClient, body: Record<string, unknown>) =>
  kbnClient.request({ method: 'POST', path: '/api/spaces/space', body });

export const deleteSpace = (kbnClient: KbnClient, id: string) =>
  kbnClient.request({
    method: 'DELETE',
    path: `/api/spaces/space/${encodeURIComponent(id)}`,
    ignoreErrors: [404],
  });

/**
 * Provisions the baseline `space_1`, `space_2` and `space_3` spaces shared by the
 * CRUD authorization matrix. On non-serverless deployments `space_3` is created with
 * the `es` solution.
 */
export const createTestSpaces = async (kbnClient: KbnClient, isServerless: boolean) => {
  await createSpace(kbnClient, SPACE_1);
  await createSpace(kbnClient, SPACE_2);
  await createSpace(kbnClient, { ...SPACE_3, ...(isServerless ? {} : { solution: 'es' }) });
};

export const deleteTestSpaces = async (kbnClient: KbnClient) => {
  await deleteSpace(kbnClient, SPACE_1.id);
  await deleteSpace(kbnClient, SPACE_2.id);
  await deleteSpace(kbnClient, SPACE_3.id);
};
