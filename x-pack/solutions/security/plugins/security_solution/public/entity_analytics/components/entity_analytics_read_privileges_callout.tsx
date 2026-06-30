/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import hash from 'object-hash';
import { CallOutSwitcher } from '../../common/components/callouts';
import { missingPrivilegesCallOutBody } from '../../common/components/missing_privileges';
import { MISSING_PRIVILEGES_CALLOUT_TITLE } from '../../common/components/missing_privileges/translations';
import type {
  MissingFeaturePrivileges,
  MissingIndexPrivileges,
} from '../../common/hooks/use_missing_privileges';
import type { RiskEngineMissingPrivilegesResponse } from '../hooks/use_missing_risk_engine_privileges';
import type { EntityAnalyticsPrivileges } from '../../../common/api/entity_analytics';

/**
 * Displays a Callout section when the user has missing privileges to view the Entity Analytics home page.
 */
export const EntityAnalyticsReadPrivilegesCallout = React.memo(
  ({
    riskEngineReadPrivileges,
    entityEnginePrivileges,
    leadGenerationPrivileges,
    anomalyPrivileges,
  }: {
    riskEngineReadPrivileges: RiskEngineMissingPrivilegesResponse;
    entityEnginePrivileges: EntityAnalyticsPrivileges | undefined;
    leadGenerationPrivileges?: EntityAnalyticsPrivileges;
    anomalyPrivileges?: EntityAnalyticsPrivileges;
  }) => {
    const message = useMemo(() => {
      const indexPrivileges: MissingIndexPrivileges[] = [
        ...getRiskEngineMissingReadPrivileges(riskEngineReadPrivileges),
        ...getAnyMissingReadPrivileges(entityEnginePrivileges),
        ...getAnyMissingReadPrivileges(leadGenerationPrivileges),
        ...getAnyMissingReadPrivileges(anomalyPrivileges),
      ];

      const featurePrivileges: MissingFeaturePrivileges[] = [
        ...getAnomalyMissingKibanaPrivileges(anomalyPrivileges),
      ];

      if (indexPrivileges.length === 0 && featurePrivileges.length === 0) return null;

      return {
        type: 'primary' as const,
        id: `entity-analytics-home-missing-privileges-${hash({
          indexPrivileges,
          featurePrivileges,
        })}`,
        title: MISSING_PRIVILEGES_CALLOUT_TITLE,
        description: missingPrivilegesCallOutBody({
          indexPrivileges,
          featurePrivileges,
          docs: [],
        }),
      };
    }, [
      riskEngineReadPrivileges,
      entityEnginePrivileges,
      leadGenerationPrivileges,
      anomalyPrivileges,
    ]);

    if (!message) return null;

    return <CallOutSwitcher namespace="entity-analytics-home" condition={true} message={message} />;
  }
);
EntityAnalyticsReadPrivilegesCallout.displayName = 'EntityAnalyticsPrivilegesCallout';

const READ_RELEVANT_PRIVILEGES = new Set(['read', 'view_index_metadata']);

const getAnyMissingReadPrivileges = (
  privileges: EntityAnalyticsPrivileges | undefined
): MissingIndexPrivileges[] => {
  if (!privileges) return [];

  return Object.entries(privileges.privileges.elasticsearch.index ?? {})
    .map(
      ([indexName, privs]): MissingIndexPrivileges => [
        indexName,
        Object.entries(privs)
          .filter(([priv, authorized]) => !authorized && READ_RELEVANT_PRIVILEGES.has(priv))
          .map(([priv]) => priv),
      ]
    )
    .filter(([, missingPrivs]) => missingPrivs.length > 0);
};

const ML_KIBANA_READ_ACTION = 'ui:ml/canGetJobs';

const getAnomalyMissingKibanaPrivileges = (
  privileges: EntityAnalyticsPrivileges | undefined
): MissingFeaturePrivileges[] => {
  if (!privileges) return [];

  if (privileges.privileges.kibana?.[ML_KIBANA_READ_ACTION] === false) {
    return [['Machine Learning', ['read']]];
  }

  return [];
};

const getRiskEngineMissingReadPrivileges = (
  privileges: RiskEngineMissingPrivilegesResponse
): MissingIndexPrivileges[] => {
  if (privileges.isLoading || privileges.hasAllRequiredPrivileges) return [];

  return privileges.missingPrivileges.indexPrivileges
    .filter(([, missingPrivs]) => missingPrivs.length > 0)
    .map(([indexName, missingPrivs]) => [indexName, [...missingPrivs]]);
};
