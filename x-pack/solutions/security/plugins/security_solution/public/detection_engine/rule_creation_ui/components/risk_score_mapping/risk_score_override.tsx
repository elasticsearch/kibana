/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { noop } from 'lodash/fp';
import styled from 'styled-components';
import {
  EuiFormRow,
  EuiCheckbox,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormLabel,
  EuiIcon,
  EuiSpacer,
} from '@elastic/eui';
import type { DataViewBase, DataViewFieldBase } from '@kbn/es-query';
import { EsFieldSelector } from '@kbn/securitysolution-autocomplete';
import * as i18n from './translations';
import type { RiskScoreMapping } from '../../../../../common/api/detection_engine';

const NestedContent = styled.div`
  margin-left: 24px;
`;

const EuiFlexItemComboBoxColumn = styled(EuiFlexItem)`
  max-width: 376px;
`;

const EuiFlexItemIconColumn = styled(EuiFlexItem)`
  width: 20px;
`;

const EuiFlexItemRiskScoreColumn = styled(EuiFlexItem)`
  width: 160px;
`;

const fieldTypeFilter = ['number'];

interface RiskScoreOverrideProps {
  isMappingChecked: boolean;
  onToggleMappingChecked: () => void;
  onMappingChange: ([newField]: DataViewFieldBase[]) => void;
  mapping: RiskScoreMapping;
  indices: DataViewBase;
  dataTestSubj?: string;
  idAria?: string;
  isDisabled: boolean;
}

export function RiskScoreOverride({
  isMappingChecked,
  onToggleMappingChecked,
  onMappingChange,
  mapping,
  indices,
  dataTestSubj = 'riskScoreOverride',
  idAria,
  isDisabled,
}: RiskScoreOverrideProps) {
  const riskScoreMappingLabel = useMemo(() => {
    return (
      <div>
        <EuiFlexGroup
          alignItems="center"
          gutterSize="s"
          onClick={!isDisabled ? onToggleMappingChecked : noop}
        >
          <EuiFlexItem grow={false}>
            <EuiCheckbox
              id="risk_score-mapping-override"
              checked={isMappingChecked}
              onChange={onToggleMappingChecked}
              disabled={isDisabled}
            />
          </EuiFlexItem>
          <EuiFlexItem>{i18n.RISK_SCORE_MAPPING}</EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="xs" />
        <NestedContent>
          <EuiText size="xs">{i18n.RISK_SCORE_MAPPING_DESCRIPTION}</EuiText>
        </NestedContent>
      </div>
    );
  }, [isDisabled, isMappingChecked, onToggleMappingChecked]);

  const describedByIds = useMemo(() => (idAria ? [idAria] : undefined), [idAria]);
  const selectedField = useMemo(() => getFieldTypeByMapping(mapping, indices), [mapping, indices]);

  return (
    <EuiFormRow
      label={riskScoreMappingLabel}
      helpText={
        isMappingChecked ? <NestedContent>{i18n.RISK_SCORE_MAPPING_DETAILS}</NestedContent> : ''
      }
      fullWidth
      data-test-subj={`${dataTestSubj}-riskOverride`}
      describedByIds={describedByIds}
    >
      <NestedContent>
        <EuiSpacer size="s" />
        {isMappingChecked && (
          <EuiFlexGroup direction="column" gutterSize="s">
            <EuiFlexItem>
              <EuiFlexGroup alignItems="center" gutterSize="s">
                <EuiFlexItemComboBoxColumn>
                  <EuiFormLabel>{i18n.SOURCE_FIELD}</EuiFormLabel>
                </EuiFlexItemComboBoxColumn>
                <EuiFlexItemIconColumn grow={false} />
                <EuiFlexItemRiskScoreColumn grow={false}>
                  <EuiFormLabel>{i18n.DEFAULT_RISK_SCORE}</EuiFormLabel>
                </EuiFlexItemRiskScoreColumn>
              </EuiFlexGroup>
            </EuiFlexItem>

            <EuiFlexItem>
              <EuiFlexGroup alignItems="center" gutterSize="s">
                <EuiFlexItemComboBoxColumn>
                  <EsFieldSelector
                    placeholder=""
                    indexPattern={indices}
                    selectedField={selectedField}
                    fieldTypeFilter={fieldTypeFilter}
                    isDisabled={isDisabled}
                    onChange={onMappingChange}
                    data-test-subj={dataTestSubj}
                    aria-label={idAria}
                  />
                </EuiFlexItemComboBoxColumn>
                <EuiFlexItemIconColumn grow={false}>
                  <EuiIcon type="sortRight" aria-hidden={true} />
                </EuiFlexItemIconColumn>
                <EuiFlexItemRiskScoreColumn grow={false}>
                  <EuiText size="s">{i18n.RISK_SCORE_FIELD}</EuiText>
                </EuiFlexItemRiskScoreColumn>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        )}
      </NestedContent>
    </EuiFormRow>
  );
}

/**
 * Looks for field metadata (DataViewFieldBase) in existing index pattern.
 * If specified field doesn't exist, returns a stub DataViewFieldBase created based on the mapping --
 * because the field might not have been indexed yet, but we still need to display the mapping.
 *
 * @param mapping Mapping of a specified field name to risk score.
 * @param pattern Existing index pattern.
 */
const getFieldTypeByMapping = (
  mapping: RiskScoreMapping,
  pattern: DataViewBase
): DataViewFieldBase => {
  const field = mapping?.[0]?.field ?? '';
  const [knownFieldType] = pattern.fields.filter(({ name }) => field != null && field === name);
  return knownFieldType ?? { name: field, type: 'number' };
};
