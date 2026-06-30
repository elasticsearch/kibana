/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import * as i18n from './translations';
import type { DataConditionEntry, DataConditionTypeDescriptor } from './types';
import { DEFAULT_DATA_CONDITION_TYPES } from './built_in_data_conditions';

export type LogicalOperator = 'all' | 'any';
export type { DataConditionEntry } from './types';

export interface DataConditionPanelProps {
  entry: DataConditionEntry;
  onChange: (newValue: DataConditionEntry | null) => void;
  /**
   * Descriptors for every type that may appear in the dropdown.
   */
  descriptors?: readonly DataConditionTypeDescriptor[];
  /**
   * Type ids that should be hidden from the type dropdown.
   */
  disabledTypes?: readonly string[];
}

export const DataConditionPanel = ({
  entry,
  onChange,
  descriptors = DEFAULT_DATA_CONDITION_TYPES,
  disabledTypes,
}: DataConditionPanelProps) => {
  const typeOptions = useMemo(
    () =>
      descriptors
        .filter((d) => d.id === entry.type || !disabledTypes?.includes(d.id))
        .map((d) => ({ value: d.id, text: d.label })),
    [descriptors, disabledTypes, entry.type]
  );

  const activeDescriptor = useMemo(
    () => descriptors.find((d) => d.id === entry.type),
    [descriptors, entry.type]
  );

  if (!activeDescriptor) return null;

  if (entry.confirmed) {
    return (
      <EuiPanel
        hasBorder={true}
        color="plain"
        paddingSize="s"
        data-test-subj={`dataConditionPanel-${entry.id}`}
      >
        <EuiFlexGroup
          alignItems="center"
          gutterSize="s"
          responsive={false}
          data-test-subj={`dataConditionChip-${entry.id}`}
        >
          <EuiFlexItem grow={false}>
            <EuiIcon type="database" aria-hidden={true} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiBadge>{activeDescriptor.label}</EuiBadge>
              </EuiFlexItem>
              {activeDescriptor.renderConfirmedSummary(entry) && (
                <EuiFlexItem grow={false}>
                  {activeDescriptor.renderConfirmedSummary(entry)}
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={i18n.EDIT_DATA_CONDITION_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="pencil"
                aria-label={i18n.EDIT_DATA_CONDITION_ARIA_LABEL}
                onClick={() => onChange({ ...entry, confirmed: false })}
                data-test-subj={`editDataCondition-${entry.id}`}
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={i18n.REMOVE_DATA_CONDITION_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="trash"
                color="danger"
                aria-label={i18n.REMOVE_DATA_CONDITION_ARIA_LABEL}
                onClick={() => onChange(null)}
                data-test-subj={`deleteDataCondition-${entry.id}`}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    );
  }

  const isComplete = activeDescriptor.isComplete(entry);
  const renderedInput = activeDescriptor.renderInput(entry, onChange);

  return (
    <EuiPanel
      hasBorder={true}
      color="plain"
      paddingSize="s"
      data-test-subj={`dataConditionPanel-${entry.id}`}
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="database" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s">
            <strong>{i18n.DATA_CONDITION_LABEL}</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content={i18n.CONFIRM_CONDITION_ARIA_LABEL} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="check"
              color="success"
              display="base"
              aria-label={i18n.CONFIRM_CONDITION_ARIA_LABEL}
              onClick={() => onChange({ ...entry, confirmed: true })}
              isDisabled={!isComplete}
              data-test-subj={`confirmDataCondition-${entry.id}`}
            />
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content={i18n.REMOVE_DATA_CONDITION_ARIA_LABEL} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="cross"
              aria-label={i18n.REMOVE_DATA_CONDITION_ARIA_LABEL}
              onClick={() => onChange(null)}
              data-test-subj={`removeDataCondition-${entry.id}`}
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <EuiSelect
            compressed
            fullWidth
            options={typeOptions}
            value={entry.type}
            onChange={(e) => onChange({ ...entry, type: e.target.value })}
            aria-label={i18n.CONDITION_FIELD_ARIA_LABEL}
            data-test-subj={`dataConditionType-${entry.id}`}
          />
        </EuiFlexItem>
        {renderedInput && <EuiFlexItem>{renderedInput}</EuiFlexItem>}
      </EuiFlexGroup>
    </EuiPanel>
  );
};
