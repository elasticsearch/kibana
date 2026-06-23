/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

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
import React, { useCallback, useMemo } from 'react';
import type { DataViewBase, DataViewFieldBase } from '@kbn/es-query';
import {
  EsFieldSelector,
  AutocompleteFieldMatchComponent,
} from '@kbn/securitysolution-autocomplete';
import type { Severity, SeverityMappingItem } from '@kbn/securitysolution-io-ts-alerting-types';
import { useSeverityOptions } from '../step_about_rule/data';
import { useKibana } from '../../../../common/lib/kibana';
import * as styles from './styles';
import * as i18n from './translations';

interface SeverityOverrideProps {
  isDisabled: boolean;
  onSeverityMappingChecked: () => void;
  onFieldChange: (index: number, severity: Severity, [newField]: DataViewFieldBase[]) => void;
  onFieldMatchValueChange: (index: number, severity: Severity, newMatchValue: string) => void;
  isMappingChecked: boolean;
  dataTestSubj?: string;
  idAria?: string;
  mapping: SeverityMappingItem[];
  indices: DataViewBase;
}

export function SeverityOverride({
  isDisabled,
  onSeverityMappingChecked,
  onFieldChange,
  onFieldMatchValueChange,
  isMappingChecked,
  dataTestSubj = 'severity',
  idAria,
  mapping,
  indices,
}: SeverityOverrideProps) {
  const severityMappingLabel = useMemo(() => {
    return (
      <div>
        <EuiFlexGroup
          alignItems="center"
          gutterSize="s"
          onClick={isDisabled ? undefined : onSeverityMappingChecked}
        >
          <EuiFlexItem grow={false}>
            <EuiCheckbox
              id="severity-mapping-override"
              checked={isMappingChecked}
              disabled={isDisabled}
              onChange={onSeverityMappingChecked}
            />
          </EuiFlexItem>
          <EuiFlexItem>{i18n.SEVERITY_MAPPING}</EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="xs" />
        <NestedContent>
          <EuiText size="xs">{i18n.SEVERITY_MAPPING_DESCRIPTION}</EuiText>
        </NestedContent>
      </div>
    );
  }, [onSeverityMappingChecked, isDisabled, isMappingChecked]);

  const describedByIds = useMemo(() => (idAria ? [idAria] : undefined), [idAria]);

  return (
    <EuiFormRow
      label={severityMappingLabel}
      helpText={
        isMappingChecked ? <NestedContent>{i18n.SEVERITY_MAPPING_DETAILS}</NestedContent> : ''
      }
      fullWidth
      data-test-subj={`${dataTestSubj}-severityOverride`}
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
                <EuiFlexItemComboBoxColumn>
                  <EuiFormLabel>{i18n.SOURCE_VALUE}</EuiFormLabel>
                </EuiFlexItemComboBoxColumn>
                <EuiFlexItemIconColumn />
                <EuiFlexItemSeverityColumn>
                  <EuiFormLabel>{i18n.DEFAULT_SEVERITY}</EuiFormLabel>
                </EuiFlexItemSeverityColumn>
              </EuiFlexGroup>
            </EuiFlexItem>

            {mapping.map((severityMappingItem, index) => (
              <SeverityMappingRow
                key={index}
                severityMappingItem={severityMappingItem}
                index={index}
                indices={indices}
                isDisabled={isDisabled}
                onFieldChange={onFieldChange}
                onFieldMatchValueChange={onFieldMatchValueChange}
              />
            ))}
          </EuiFlexGroup>
        )}
      </NestedContent>
    </EuiFormRow>
  );
}

interface SeverityMappingRowProps {
  severityMappingItem: SeverityMappingItem;
  index: number;
  indices: DataViewBase;
  isDisabled: boolean;
  onFieldChange: (index: number, severity: Severity, [newField]: DataViewFieldBase[]) => void;
  onFieldMatchValueChange: (index: number, severity: Severity, newMatchValue: string) => void;
}

function SeverityMappingRow({
  severityMappingItem,
  index,
  indices,
  isDisabled,
  onFieldChange,
  onFieldMatchValueChange,
}: SeverityMappingRowProps) {
  const { services } = useKibana();

  const handleFieldChange = useCallback(
    (newField: DataViewFieldBase[]) => {
      onFieldChange(index, severityMappingItem.severity, newField);
    },
    [index, severityMappingItem.severity, onFieldChange]
  );

  const handleFieldMatchValueChange = useCallback(
    (newMatchValue: string) => {
      onFieldMatchValueChange(index, severityMappingItem.severity, newMatchValue);
    },
    [index, severityMappingItem.severity, onFieldMatchValueChange]
  );

  const severityOptions = useSeverityOptions();

  return (
    <EuiFlexItem key={`${severityMappingItem.severity}-${index}`}>
      <EuiFlexGroup data-test-subj="severityOverrideRow" alignItems="center" gutterSize="s">
        <EuiFlexItemComboBoxColumn>
          <EsFieldSelector
            placeholder=""
            selectedField={getFieldTypeByMapping(severityMappingItem, indices)}
            isDisabled={isDisabled}
            indexPattern={indices}
            onChange={handleFieldChange}
            aria-label={i18n.SOURCE_FIELD}
          />
        </EuiFlexItemComboBoxColumn>

        <EuiFlexItemComboBoxColumn>
          <AutocompleteFieldMatchComponent
            autocompleteService={services.kql.autocomplete}
            placeholder=""
            selectedField={getFieldTypeByMapping(severityMappingItem, indices)}
            selectedValue={severityMappingItem.value}
            isClearable={true}
            isDisabled={isDisabled}
            indexPattern={indices}
            onChange={handleFieldMatchValueChange}
            aria-label={i18n.SOURCE_VALUE}
          />
        </EuiFlexItemComboBoxColumn>
        <EuiFlexItemIconColumn>
          <EuiIcon type="sortRight" aria-hidden={true} />
        </EuiFlexItemIconColumn>
        <EuiFlexItemSeverityColumn>
          {severityOptions.find((o) => o.value === severityMappingItem.severity)?.inputDisplay}
        </EuiFlexItemSeverityColumn>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
}

const NestedContent: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className={styles.nestedContent}>{children}</div>
);

const EuiFlexItemComboBoxColumn: React.FC<React.PropsWithChildren> = ({ children }) => (
  <EuiFlexItem className={styles.comboBoxColumn}>{children}</EuiFlexItem>
);

const EuiFlexItemIconColumn: React.FC<React.PropsWithChildren> = ({ children }) => (
  <EuiFlexItem className={styles.iconColumn} grow={false}>
    {children}
  </EuiFlexItem>
);

const EuiFlexItemSeverityColumn: React.FC<React.PropsWithChildren> = ({ children }) => (
  <EuiFlexItem className={styles.severityColumn} grow={false}>
    {children}
  </EuiFlexItem>
);

/**
 * Looks for field metadata (DataViewFieldBase) in existing index pattern.
 * If specified field doesn't exist, returns a stub DataViewFieldBase created based on the mapping --
 * because the field might not have been indexed yet, but we still need to display the mapping.
 *
 * @param mapping Mapping of a specified field name + value to a certain severity value.
 * @param pattern Existing index pattern.
 */
const getFieldTypeByMapping = (
  mapping: SeverityMappingItem,
  pattern: DataViewBase
): DataViewFieldBase => {
  const { field } = mapping;
  const [knownFieldType] = pattern.fields.filter(({ name }) => field === name);
  return knownFieldType ?? { name: field, type: 'string' };
};
