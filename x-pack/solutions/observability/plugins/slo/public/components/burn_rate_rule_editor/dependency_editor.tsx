/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiComboBox,
  EuiForm,
  EuiFormRow,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import React, { useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { Rule } from '@kbn/triggers-actions-ui-plugin/public';
import { isRight } from 'fp-ts/Either';
import type { SloRule } from '../../hooks/use_fetch_slos_with_burn_rate_rules';
import type { Dependency } from '../../../common/burn_rate_rule/types';
import { DependencyRT } from '../../../common/burn_rate_rule/types';
import {
  ALERT_ACTION,
  HIGH_PRIORITY_ACTION,
  LOW_PRIORITY_ACTION,
  MEDIUM_PRIORITY_ACTION,
} from '../../../common/constants';

const ACTION_GROUP_OPTIONS = [
  { value: ALERT_ACTION.id, label: ALERT_ACTION.name },
  { value: HIGH_PRIORITY_ACTION.id, label: HIGH_PRIORITY_ACTION.name },
  { value: MEDIUM_PRIORITY_ACTION.id, label: MEDIUM_PRIORITY_ACTION.name },
  { value: LOW_PRIORITY_ACTION.id, label: LOW_PRIORITY_ACTION.name },
];

interface DependencyEditorProps {
  isLoading: boolean;
  onSubmit: (dependency: Dependency) => void;
  dependency?: Dependency;
  rules?: Array<Rule<SloRule>>;
}

export function DependencyEditor({
  isLoading,
  onSubmit,
  dependency,
  rules,
}: DependencyEditorProps) {
  const isEditMode = dependency != null;
  const [isOpen, setPopoverState] = useState(false);

  const [partialDependency, setPartialDependency] = useState<Partial<Dependency>>(dependency || {});

  const handleOpenPopover = () => setPopoverState(true);
  const handleClosePopover = () => {
    if (!isEditMode) {
      setPartialDependency({});
    }
    setPopoverState(false);
  };

  const handleRuleSelection = (opts: Array<EuiComboBoxOptionOption<string>>) => {
    if (opts.length > 0 && opts[0].value) {
      setPartialDependency((previous) => ({ ...previous, ruleId: opts[0].value }));
    }
  };

  const handleActionGroupSelection = (opts: Array<EuiComboBoxOptionOption<string>>) => {
    if (opts.length > 0 && opts.every((opt) => !!opt.value)) {
      const values = opts.map((opt) => opt.value);
      setPartialDependency((previous) => ({
        ...previous,
        actionGroupsToSuppressOn: values as string[],
      }));
    }
  };

  const rulesOptions = rules?.map((rule) => ({ label: rule.name, value: rule.id })) ?? [];
  const selectedRuleOption = rulesOptions?.filter((opt) => opt.value === partialDependency.ruleId);
  const selectedRule = rules?.find((rule) => rule.id === partialDependency.ruleId);
  const ruleActionGroups =
    (selectedRule && selectedRule.params.windows.map((winDef) => winDef.actionGroup)) || [];
  const actionGroupOptions = ACTION_GROUP_OPTIONS.filter((group) =>
    ruleActionGroups.includes(group.value)
  );
  const selectedActionGroups = ACTION_GROUP_OPTIONS.filter((group) =>
    partialDependency.actionGroupsToSuppressOn?.includes(group.value)
  );

  const handleSubmit = () => {
    const dep = DependencyRT.decode(partialDependency);
    if (isRight(dep)) {
      onSubmit(dep.right);
    }
    handleClosePopover();
  };

  const button = isEditMode ? (
    <EuiToolTip
      content={i18n.translate('xpack.slo.rules.editDependencyAriaLabel', {
        defaultMessage: 'Edit dependency',
      })}
      disableScreenReaderOutput
    >
      <EuiButtonIcon
        isDisabled={isLoading}
        data-test-subj="sloBurnRateRuleEditDependencyButton"
        color={'primary'}
        size="s"
        iconType={'pencil'}
        onClick={handleOpenPopover}
        aria-label={i18n.translate('xpack.slo.rules.editDependencyAriaLabel', {
          defaultMessage: 'Edit dependency',
        })}
      />
    </EuiToolTip>
  ) : (
    <EuiButtonEmpty
      isDisabled={isLoading || rules?.length === 0}
      data-test-subj="sloBurnRateRuleAddDependencyButton"
      color={'primary'}
      size="s"
      iconType={'plusCircle'}
      onClick={handleOpenPopover}
      aria-label={i18n.translate('xpack.slo.rules.addDependencyAriaLabel', {
        defaultMessage: 'Add dependency',
      })}
    >
      <FormattedMessage id="xpack.slo.rules.addDependencyLabel" defaultMessage="Add dependency" />
    </EuiButtonEmpty>
  );

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.slo.dependencyEditor.popoverAriaLabel', {
        defaultMessage: 'Dependency editor',
      })}
      button={button}
      isOpen={isOpen}
      closePopover={handleSubmit}
    >
      <div style={{ width: 400 }}>
        <EuiForm component="form">
          <EuiFormRow
            label={i18n.translate('xpack.slo.rules.addDependencyForm.ruleLabel', {
              defaultMessage: 'Rule (required)',
            })}
          >
            <EuiComboBox
              compressed
              fullWidth
              options={rulesOptions}
              singleSelection={{ asPlainText: true }}
              isLoading={isLoading}
              onChange={handleRuleSelection}
              selectedOptions={selectedRuleOption}
            />
          </EuiFormRow>
          <EuiFormRow
            label={i18n.translate('xpack.slo.rules.addDependencyForm.suppressOnLabel', {
              defaultMessage: 'Suppress on (required)',
            })}
          >
            <EuiComboBox
              compressed
              fullWidth
              isDisabled={!partialDependency.ruleId}
              options={actionGroupOptions}
              onChange={handleActionGroupSelection}
              selectedOptions={selectedActionGroups}
            />
          </EuiFormRow>
        </EuiForm>
      </div>
    </EuiPopover>
  );
}
