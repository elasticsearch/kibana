/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButtonIcon,
  EuiFieldNumber,
  EuiFormRow,
  EuiIconTip,
  EuiToolTip,
  useEuiTheme,
  type EuiFieldNumberProps,
} from '@elastic/eui';

import { getFieldValidityAndErrorMessage } from '../../../../../../../shared_imports';
import { UseField } from '../../../../form';
import type { RolloverField } from '../../../../constants';
import { UnitField } from '../../shared_fields/unit_field';

import { rolloverFieldConfig } from './rollover_field_config';

interface RolloverRuleRowProps<T extends RolloverField> {
  field: T;
  conditionLabel: string;
  disableRemove: boolean;
  removeDisabledReason?: string;
  onRemove: (field: T) => void;
}

export const RolloverRuleRow = <T extends RolloverField>({
  field,
  conditionLabel,
  disableRemove,
  removeDisabledReason,
  onRemove,
}: RolloverRuleRowProps<T>) => {
  const config = rolloverFieldConfig[field];
  const { euiTheme } = useEuiTheme();
  const removeButtonLabel = i18n.translate(
    'xpack.indexLifecycleMgmt.hotPhase.removeRolloverRuleLabel',
    {
      defaultMessage: 'Remove rollover rule',
    }
  );
  const removeButton = (
    <EuiToolTip content={removeButtonLabel} disableScreenReaderOutput>
      <EuiButtonIcon
        aria-label={removeButtonLabel}
        color="danger"
        iconType="cross"
        isDisabled={disableRemove}
        onClick={() => onRemove(field)}
        data-test-subj={`rolloverRemoveField-${field}`}
      />
    </EuiToolTip>
  );
  const conditionPrefix = (
    <span
      style={{
        alignSelf: 'center',
        fontSize: euiTheme.size.m,
        fontWeight: euiTheme.font.weight.medium,
        textAlign: 'right',
      }}
    >
      {conditionLabel}
    </span>
  );
  const fieldNamePrefix = (
    <span
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        gap: 4,
        fontSize: euiTheme.size.m,
        fontWeight: euiTheme.font.weight.medium,
        whiteSpace: 'nowrap',
      }}
    >
      {config.deprecationMessage && (
        <EuiIconTip
          type="warning"
          aria-label={config.deprecationMessage}
          content={config.deprecationMessage}
          disableScreenReaderOutput
        />
      )}
      {config.menuLabel} &ge;
    </span>
  );

  return (
    <div
      style={{
        alignItems: 'start',
        columnGap: 8,
        display: 'grid',
        gridTemplateColumns: '28px minmax(0, 1fr) 24px',
      }}
    >
      {conditionPrefix}
      <UseField path={config.path}>
        {(formField) => {
          const { isInvalid, errorMessage } = getFieldValidityAndErrorMessage(formField);

          return (
            <EuiFormRow fullWidth isInvalid={isInvalid} error={errorMessage}>
              <EuiFieldNumber
                isInvalid={isInvalid}
                value={formField.value as EuiFieldNumberProps['value']}
                onChange={formField.onChange}
                isLoading={formField.isValidating}
                fullWidth
                data-test-subj={config.testSubject}
                min={config.min ?? 1}
                prepend={fieldNamePrefix}
                append={
                  config.unitPath && config.unitOptions ? (
                    <UnitField
                      path={config.unitPath}
                      options={config.unitOptions}
                      euiFieldProps={{
                        'data-test-subj': config.unitTestSubject,
                        'aria-label': config.unitAriaLabel,
                      }}
                      buttonColor="primary"
                    />
                  ) : undefined
                }
              />
            </EuiFormRow>
          );
        }}
      </UseField>
      <div style={{ marginTop: 8 }}>
        {disableRemove && removeDisabledReason ? (
          <EuiToolTip content={removeDisabledReason}>{removeButton}</EuiToolTip>
        ) : (
          removeButton
        )}
      </div>
    </div>
  );
};
