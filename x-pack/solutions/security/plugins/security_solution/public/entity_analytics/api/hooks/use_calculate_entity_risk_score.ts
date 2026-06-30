/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';

import { i18n } from '@kbn/i18n';
import { useMutation } from '@kbn/react-query';
import { FF_ENABLE_ENTITY_STORE_V2 } from '@kbn/entity-store/public';
import { useUiSetting } from '../../../common/lib/kibana/kibana_react';
import type { EntityType } from '../../../../common/entity_analytics/types';
import { RiskEngineStatusEnum } from '../../../../common/api/entity_analytics/risk_engine/engine_status_route.gen';
import { useEntityAnalyticsRoutes } from '../api';
import { useAppToasts } from '../../../common/hooks/use_app_toasts';
import { useRiskEngineStatus } from './use_risk_engine_status';

export const useCalculateEntityRiskScore = ({
  identifierType,
  identifier,
  entityId,
  onSuccess,
}: {
  identifierType: EntityType;
  identifier: string;
  // V2-only: the canonical EUID for the entity being scored
  entityId?: string;
  onSuccess: () => void;
}) => {
  const { addError } = useAppToasts();
  const { data: riskEngineStatus } = useRiskEngineStatus();
  const { calculateEntityRiskScore, calculateEntityRiskScoreV2 } = useEntityAnalyticsRoutes();
  const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);

  const onError = useCallback(
    (error: unknown) => {
      addError(error, {
        title: i18n.translate('xpack.securitySolution.entityDetails.userPanel.error', {
          defaultMessage: 'There was a problem calculating the {entity} risk score',
          values: { entity: `${identifierType}'s` },
        }),
      });
    },
    [addError, identifierType]
  );

  const { mutate, isLoading } = useMutation(calculateEntityRiskScore, {
    onSuccess,
    onError,
  });

  const { mutate: mutateV2, isLoading: isLoadingV2 } = useMutation(calculateEntityRiskScoreV2, {
    onSuccess,
    onError,
  });

  const calculateEntityRiskScoreCb = useCallback(async () => {
    if (entityStoreV2Enabled) {
      mutateV2({
        identifier_type: identifierType,
        identifier,
        entity_id: entityId,
      });
      return;
    }

    if (riskEngineStatus?.risk_engine_status === RiskEngineStatusEnum.ENABLED) {
      mutate({
        identifier_type: identifierType,
        identifier,
      });
    }
  }, [
    riskEngineStatus?.risk_engine_status,
    mutate,
    mutateV2,
    identifierType,
    identifier,
    entityId,
    entityStoreV2Enabled,
  ]);

  return {
    isLoading: entityStoreV2Enabled ? isLoadingV2 : isLoading,
    calculateEntityRiskScore: calculateEntityRiskScoreCb,
  };
};
