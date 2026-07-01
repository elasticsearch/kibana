/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';

import { useFormContext } from '../../../../../../../shared_imports';
import { UseField } from '../../../../form';
import { ROLLOVER_FIELD_PATHS, type RolloverField } from '../../../../constants';

import { RolloverAddRuleButton } from './rollover_add_rule_button';
import { RolloverRuleRow } from './rollover_rule_row';

interface RolloverFieldSectionProps<T extends RolloverField> {
  title: string;
  activeFieldPath: string;
  allFields: T[];
  addButtonLabel: string;
  allFieldsInUseMessage: string;
  addButtonTestSubj: string;
  firstConditionLabel: string;
  additionalConditionLabel: string;
  isTriggerSection?: boolean;
}

export const RolloverFieldSection = <T extends RolloverField>({
  title,
  activeFieldPath,
  allFields,
  addButtonLabel,
  allFieldsInUseMessage,
  addButtonTestSubj,
  firstConditionLabel,
  additionalConditionLabel,
  isTriggerSection = false,
}: RolloverFieldSectionProps<T>) => {
  const { setFieldValue } = useFormContext();

  return (
    <UseField<T[]> path={activeFieldPath}>
      {(activeField) => {
        const activeFields = activeField.value ?? [];
        const setActiveFields = (fields: T[]) => activeField.setValue(fields);
        const onRemove = (field: T) => {
          setFieldValue(ROLLOVER_FIELD_PATHS[field], undefined);
          setActiveFields(activeFields.filter((active) => active !== field));
        };

        return (
          <>
            <EuiTitle size="xxxs">
              <h6>{title}...</h6>
            </EuiTitle>
            <EuiSpacer size="xs" />

            <EuiPanel hasShadow={false} hasBorder={false} color="subdued" paddingSize="s">
              {activeFields.map((field, index) => (
                <div key={field} style={{ marginBottom: 8 }}>
                  <RolloverRuleRow
                    field={field}
                    conditionLabel={index === 0 ? firstConditionLabel : additionalConditionLabel}
                    disableRemove={isTriggerSection && activeFields.length === 1}
                    removeDisabledReason={i18n.translate(
                      'xpack.indexLifecycleMgmt.hotPhase.lastRolloverTriggerRemoveDisabled',
                      {
                        defaultMessage: 'At least one trigger is required.',
                      }
                    )}
                    onRemove={onRemove}
                  />
                </div>
              ))}
              <div
                style={{
                  columnGap: 8,
                  display: 'grid',
                  gridTemplateColumns: '28px minmax(0, 1fr)',
                }}
              >
                <span />
                <div>
                  <RolloverAddRuleButton
                    activeFields={activeFields}
                    addButtonLabel={addButtonLabel}
                    allFieldsInUseMessage={allFieldsInUseMessage}
                    allFields={allFields}
                    dataTestSubj={addButtonTestSubj}
                    onAdd={(field) => setActiveFields([...activeFields, field])}
                  />
                </div>
              </div>
            </EuiPanel>
          </>
        );
      }}
    </UseField>
  );
};
