/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiFlyoutFooter, EuiPanel, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { TakeAction } from '../shared/components/take_action';
import type { IdentityFields } from '../../document_details/shared/utils';
import type { EntityStoreRecord } from '../shared/hooks/use_entity_from_store';
import { getRiskFromEntityRecord } from '../shared/entity_store_risk_utils';
import { AiAssistantButton } from '../../../entity_analytics/components/ai_assistant_button/ai_assistant_button';
import { EntityType } from '../../../../common/entity_analytics/types';
import type { RiskSeverity } from '../../../../common/search_strategy';
import type { EntityToAttach } from '../../../cases/attachments/entity';
import { useEntityCaseTakeActionItems } from '../../../cases/attachments/entity/hooks/use_entity_case_take_action_items';

export const UserPanelFooter = ({
  identityFields,
  entity,
}: {
  identityFields: IdentityFields;
  /** When entity store v2 is enabled: entity record from the store. */
  entity?: EntityStoreRecord;
}) => {
  const userName = useMemo(
    () => identityFields['user.name'] || Object.values(identityFields)[0] || '',
    [identityFields]
  );

  const euidApi = useEntityStoreEuidApi();
  const euidEntityFilter = useMemo((): string | undefined => {
    if (!euidApi?.euid || !entity) {
      return undefined;
    }
    return euidApi.euid.kql.getEuidFilterBasedOnDocument('user', entity);
  }, [euidApi?.euid, entity]);

  const entityStoreId = entity?.entity?.id;
  const risk = entity ? getRiskFromEntityRecord(entity) : undefined;
  const riskLevel = risk?.calculated_level as RiskSeverity | undefined;
  const riskScore = risk?.calculated_score_norm;

  const entityToAttach = useMemo<EntityToAttach>(
    () => ({ id: entityStoreId ?? '', name: userName, type: 'user', riskLevel, riskScore }),
    [entityStoreId, userName, riskLevel, riskScore]
  );
  const additionalItems = useEntityCaseTakeActionItems(entityToAttach);

  return (
    <EuiFlyoutFooter>
      <EuiPanel color="transparent">
        <EuiFlexGroup justifyContent="flexEnd" alignItems="center">
          <EuiFlexItem grow={false}>
            <AiAssistantButton
              entityType={EntityType.user}
              entityName={userName}
              telemetryPathway="entity_flyout"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <TakeAction
              isDisabled={!userName}
              kqlQuery={euidEntityFilter ?? `user.name: "${userName}"`}
              additionalItems={additionalItems}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </EuiFlyoutFooter>
  );
};
