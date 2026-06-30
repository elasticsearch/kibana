/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiComboBox,
  EuiSpacer,
  EuiCodeBlock,
  EuiPanel,
  EuiTitle,
  EuiText,
} from '@elastic/eui';
import { css } from '@emotion/css';
import type { ISearchGeneric } from '@kbn/search-types';
import { useIndexFields } from '../hooks/use_index_fields';
import * as i18n from '../translations';

const CONTAINER_BREAKPOINT = 500;

const mainContainerCss = css`
  container-type: inline-size;
`;

const dropdownCss = css`
  flex-basis: 100%;
  @container (min-width: ${CONTAINER_BREAKPOINT}px) {
    flex: 1;
    min-width: 0;
  }
`;

const operatorCss = css`
  flex-basis: 100%;
  justify-content: center;
  text-align: center;
  @container (min-width: ${CONTAINER_BREAKPOINT}px) {
    align-self: center;
    justify-content: flex-start;
    flex: 0 0 auto;
  }
`;

const inputCss = css`
  flex-basis: 100%;
  @container (min-width: ${CONTAINER_BREAKPOINT}px) {
    flex: 0 0 150px;
  }
`;

const rowCss = css`
  flex-wrap: wrap;
  @container (min-width: ${CONTAINER_BREAKPOINT}px) {
    flex-wrap: nowrap;
  }
`;

interface ThresholdFieldsProps {
  indexPatterns: string[];
  onIndexPatternsChange: (patterns: string[]) => void;
  groupByFields: string[];
  onGroupByFieldsChange: (fields: string[]) => void;
  thresholdValue: number;
  onThresholdValueChange: (value: number) => void;
  cardinalityField: string;
  onCardinalityFieldChange: (field: string) => void;
  cardinalityValue: number;
  onCardinalityValueChange: (value: number) => void;
  filterQuery: string;
  onFilterQueryChange: (query: string) => void;
  generatedQuery: string;
  search: ISearchGeneric;
}

export const ThresholdFields = ({
  indexPatterns,
  onIndexPatternsChange,
  groupByFields,
  onGroupByFieldsChange,
  thresholdValue,
  onThresholdValueChange,
  cardinalityField,
  onCardinalityFieldChange,
  cardinalityValue,
  onCardinalityValueChange,
  filterQuery,
  onFilterQueryChange,
  generatedQuery,
  search,
}: ThresholdFieldsProps) => {
  const { fieldOptions, isLoading: isLoadingFields } = useIndexFields({ indexPatterns, search });
  const indexOptions = indexPatterns.map((p) => ({ label: p }));
  const groupByOptions = groupByFields.map((f) => ({ label: f }));

  return (
    <div className={mainContainerCss}>
      <EuiFormRow label={i18n.INDEX_PATTERNS_LABEL} helpText={i18n.INDEX_PATTERNS_HELP} fullWidth>
        <EuiComboBox
          fullWidth
          selectedOptions={indexOptions}
          onCreateOption={(value) => onIndexPatternsChange([...indexPatterns, value])}
          onChange={(options) => onIndexPatternsChange(options.map((o) => o.label))}
          data-test-subj="rulesV2IndexPatterns"
          noSuggestions
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiFormRow label={i18n.FILTER_QUERY_LABEL} helpText={i18n.FILTER_QUERY_HELP} fullWidth>
        <EuiFieldText
          fullWidth
          value={filterQuery}
          onChange={(e) => onFilterQueryChange(e.target.value)}
          placeholder={'status >= 400 AND service.name == "api"'}
          data-test-subj="rulesV2FilterQuery"
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="l" className={rowCss}>
        <EuiFlexItem className={dropdownCss}>
          <EuiFormRow label={i18n.THRESHOLD_GROUP_BY_LABEL} fullWidth>
            <EuiComboBox
              fullWidth
              options={fieldOptions}
              selectedOptions={groupByOptions}
              onChange={(options) => onGroupByFieldsChange(options.map((o) => o.label))}
              placeholder={i18n.THRESHOLD_FIELD_PLACEHOLDER}
              isLoading={isLoadingFields}
              data-test-subj="rulesV2ThresholdGroupBy"
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem className={operatorCss}>
          <EuiFormRow hasEmptyLabelSpace>
            <span>{'>='}</span>
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem className={inputCss}>
          <EuiFormRow label={i18n.THRESHOLD_VALUE_LABEL}>
            <EuiFieldNumber
              value={thresholdValue}
              onChange={(e) => onThresholdValueChange(Number(e.target.value))}
              min={1}
              data-test-subj="rulesV2ThresholdValue"
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="l" className={rowCss}>
        <EuiFlexItem className={dropdownCss}>
          <EuiFormRow label={i18n.CARDINALITY_FIELD_LABEL} fullWidth>
            <EuiComboBox
              fullWidth
              singleSelection={{ asPlainText: true }}
              options={fieldOptions}
              selectedOptions={cardinalityField ? [{ label: cardinalityField }] : []}
              onChange={(options) => onCardinalityFieldChange(options[0]?.label ?? '')}
              placeholder={i18n.THRESHOLD_FIELD_PLACEHOLDER}
              isLoading={isLoadingFields}
              data-test-subj="rulesV2CardinalityField"
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem className={operatorCss}>
          <EuiFormRow hasEmptyLabelSpace>
            <span>{'>='}</span>
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem className={inputCss}>
          <EuiFormRow label={i18n.CARDINALITY_VALUE_LABEL}>
            <EuiFieldNumber
              value={cardinalityValue}
              onChange={(e) => onCardinalityValueChange(Number(e.target.value))}
              min={0}
              data-test-subj="rulesV2CardinalityValue"
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiPanel color="subdued" paddingSize="m">
        <EuiTitle size="xxs">
          <h4>{i18n.GENERATED_QUERY_LABEL}</h4>
        </EuiTitle>
        <EuiSpacer size="s" />
        {generatedQuery ? (
          <EuiCodeBlock language="esql" fontSize="m" paddingSize="m" isCopyable>
            {generatedQuery}
          </EuiCodeBlock>
        ) : (
          <EuiText size="s" color="subdued">
            Configure index patterns and threshold fields to generate the query.
          </EuiText>
        )}
      </EuiPanel>
    </div>
  );
};
