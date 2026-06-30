/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import hash from 'object-hash';
import type { CallOutMessage } from '../../common/components/callouts';
import { CallOut, CallOutSwitcher } from '../../common/components/callouts';
import { missingPrivilegesCallOutBody } from '../../common/components/missing_privileges';
import { MISSING_PRIVILEGES_CALLOUT_TITLE } from '../../common/components/missing_privileges/translations';
import type { MissingIndexPrivileges } from '../../common/hooks/use_missing_privileges';
import type { RiskEngineMissingPrivilegesResponse } from '../hooks/use_missing_risk_engine_privileges';
import type { EntityAnalyticsPrivileges } from '../../../common/api/entity_analytics';

interface EntityAnalyticsReadPrivilegesCalloutProps {
  riskEngineReadPrivileges: RiskEngineMissingPrivilegesResponse;
  entityEnginePrivileges: EntityAnalyticsPrivileges | undefined;
  leadGenerationPrivileges?: EntityAnalyticsPrivileges;
  /**
   * Identifies the surface rendering the callout. Used as the dismissal storage
   * namespace and as the message id prefix, so ids stay unique and dismissals
   * stay independent across pages.
   */
  id: string;
  /**
   * When `true` (default) renders a dismissible callout whose dismissal is
   * remembered in local storage. When `false` renders a static, non-dismissible
   * inline callout (e.g. the cases "Entities" attachment tab).
   */
  dismissible?: boolean;
}

/**
 * Displays an "Insufficient privileges" callout when the user is missing read
 * privileges required by Entity Analytics, or nothing when all are granted.
 *
 * Shared across surfaces (the EA home page and the cases "Entities" attachment
 * tab): `dismissible` selects the container (dismissible `CallOutSwitcher` vs a
 * static `CallOut`) while the privilege derivation stays in one place.
 */
export const EntityAnalyticsReadPrivilegesCallout = React.memo(
  ({
    riskEngineReadPrivileges,
    entityEnginePrivileges,
    leadGenerationPrivileges,
    id,
    dismissible = true,
  }: EntityAnalyticsReadPrivilegesCalloutProps) => {
    const message = useMemo<CallOutMessage | null>(() => {
      const indexPrivileges: MissingIndexPrivileges[] = [
        ...getRiskEngineMissingReadPrivileges(riskEngineReadPrivileges),
        ...getEntityStoreMissingReadPrivileges(entityEnginePrivileges),
        ...getEntityStoreMissingReadPrivileges(leadGenerationPrivileges),
      ];

      if (indexPrivileges.length === 0) return null;

      return {
        type: 'primary' as const,
        id: `${id}-missing-privileges-${hash(indexPrivileges)}`,
        title: MISSING_PRIVILEGES_CALLOUT_TITLE,
        description: missingPrivilegesCallOutBody({
          indexPrivileges,
          featurePrivileges: [],
          docs: [],
        }),
      };
    }, [riskEngineReadPrivileges, entityEnginePrivileges, leadGenerationPrivileges, id]);

    if (!message) return null;

    if (dismissible) {
      return <CallOutSwitcher namespace={id} condition={true} message={message} />;
    }

    return <CallOut message={message} showDismissButton={false} />;
  }
);
EntityAnalyticsReadPrivilegesCallout.displayName = 'EntityAnalyticsPrivilegesCallout';

const READ_RELEVANT_PRIVILEGES = new Set(['read', 'view_index_metadata']);

const getEntityStoreMissingReadPrivileges = (
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

const getRiskEngineMissingReadPrivileges = (
  privileges: RiskEngineMissingPrivilegesResponse
): MissingIndexPrivileges[] => {
  if (privileges.isLoading || privileges.hasAllRequiredPrivileges) return [];

  return privileges.missingPrivileges.indexPrivileges
    .filter(([, missingPrivs]) => missingPrivs.length > 0)
    .map(([indexName, missingPrivs]) => [indexName, [...missingPrivs]]);
};
