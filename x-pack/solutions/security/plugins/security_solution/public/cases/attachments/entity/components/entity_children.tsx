/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { formatRiskScore } from '../../../../entity_analytics/common';
import type { EntityAttachmentMetadata } from '../../../../../common/cases/attachments/entity';
import {
  ENTITY_NAME_TEST_ID,
  ENTITY_RISK_LEVEL_TEST_ID,
  ENTITY_RISK_SCORE_TEST_ID,
  ENTITY_TYPE_TEST_ID,
} from '../../../../../common/cases/attachments/entity/test_ids';

export interface EntityChildrenProps {
  /**
   * Entity identifier saved as the attachment id (e.g. user name, host name, IP).
   */
  id: string;
  /**
   * Metadata saved in the case attachment (entity).
   */
  metadata: EntityAttachmentMetadata;
}

interface FieldRowProps {
  label: React.ReactNode;
  value: React.ReactNode;
  valueTestSubj: string;
}

const FieldRow: FC<FieldRowProps> = ({ label, value, valueTestSubj }) => (
  <EuiFlexGroup gutterSize="s">
    <EuiFlexItem grow={false}>
      <EuiText size="s">
        <strong>{label}</strong>
      </EuiText>
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiText size="s">
        <p data-test-subj={valueTestSubj}>{value}</p>
      </EuiText>
    </EuiFlexItem>
  </EuiFlexGroup>
);

/**
 * Renders the basic entity values (name, type, and risk, when present) in the
 * case attachment view. Render directly from the persisted metadata
 * rather than re-fetching the entity.
 */
export const EntityChildren: FC<EntityChildrenProps> = ({ metadata }) => {
  const { entityName, entityType, riskScore, riskLevel } = metadata;

  return (
    <EuiFlexGroup gutterSize="s" direction="column">
      <FieldRow
        label={
          <FormattedMessage
            id="xpack.securitySolution.entityAnalytics.cases.entityName"
            defaultMessage="Entity name:"
          />
        }
        value={entityName}
        valueTestSubj={ENTITY_NAME_TEST_ID}
      />
      <FieldRow
        label={
          <FormattedMessage
            id="xpack.securitySolution.entityAnalytics.cases.entityType"
            defaultMessage="Entity type:"
          />
        }
        value={entityType}
        valueTestSubj={ENTITY_TYPE_TEST_ID}
      />
      {riskLevel != null && (
        <FieldRow
          label={
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.cases.entityRiskLevel"
              defaultMessage="Risk level:"
            />
          }
          value={riskLevel}
          valueTestSubj={ENTITY_RISK_LEVEL_TEST_ID}
        />
      )}
      {riskScore != null && (
        <FieldRow
          label={
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.cases.entityRiskScore"
              defaultMessage="Risk score:"
            />
          }
          value={formatRiskScore(riskScore)}
          valueTestSubj={ENTITY_RISK_SCORE_TEST_ID}
        />
      )}
    </EuiFlexGroup>
  );
};
