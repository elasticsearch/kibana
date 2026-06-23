/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { EuiCallOut, EuiForm, EuiFormRow, EuiSpacer } from '@elastic/eui';
import { useFormContext } from 'react-hook-form';
import { YamlRuleEditor } from '@kbn/yaml-rule-editor';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { useEsqlCallbacks } from './hooks/use_esql_callbacks';
import type { FormValues } from './types';
import { RULE_FORM_ID } from './constants';
import type { RuleFormServices } from './contexts';
import {
  formValuesToYamlObject,
  parseYamlToFormValues,
  serializeFormToYaml,
} from './utils/yaml_form_utils';

// Re-export utils for backward compatibility
export { formValuesToYamlObject, parseYamlToFormValues, serializeFormToYaml };

export interface YamlRuleFormProps {
  services: RuleFormServices;
  /** Optional submit handler. In the compose-discover flyout context, save is
   *  handled externally via methods.handleSubmit() — no onSubmit needed. The
   *  standalone RuleForm still passes this to handle its own submit flow. */
  onSubmit?: (values: FormValues) => void;
  isDisabled?: boolean;
  isSubmitting?: boolean;
  /** YAML buffer, lifted to the parent so it survives Form↔YAML toggle. */
  yamlText: string;
  /** Setter for the lifted YAML buffer. */
  setYamlText: (yaml: string) => void;
  /**
   * Synchronous commit for blur events. The compose-discover flyout passes a
   * callback that also syncs the sandbox state after resetting the RHF form.
   * When absent, blur falls back to `useFormContext().reset()`.
   */
  onBlurSync?: (values: FormValues) => void;
}

/**
 * YAML-based rule form editor.
 *
 * Provides a YAML editor for editing rule configuration with ES|QL autocomplete.
 * Parsing is always lenient — YAML syntax errors are surfaced, but missing
 * required fields get safe defaults. Field-level validation is handled by RHF
 * at submit time through `methods.handleSubmit()`.
 *
 * In the compose-discover flyout context, the parent owns submission and
 * passes a debounced `setYamlText` that also syncs into RHF on every
 * keystroke. The blur handler here acts as a "flush now" fallback.
 *
 * In the standalone RuleForm context, the parent passes `onSubmit` and
 * this component renders an `<EuiForm>` with its own submit handler.
 */
export const YamlRuleForm = ({
  services,
  onSubmit,
  isDisabled = false,
  isSubmitting = false,
  yamlText,
  setYamlText,
  onBlurSync,
}: YamlRuleFormProps) => {
  const [error, setError] = useState<string | null>(null);
  const { reset } = useFormContext<FormValues>();

  const esqlCallbacks = useEsqlCallbacks({
    application: services.application,
    http: services.http,
    search: services.data.search.search,
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const result = parseYamlToFormValues(yamlText);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setError(null);
      onSubmit?.(result.values);
    },
    [yamlText, onSubmit]
  );

  const handleBlur = useCallback(() => {
    const result = parseYamlToFormValues(yamlText);
    if (result.error !== null) {
      setError(result.error);
      return;
    }
    setError(null);
    if (onBlurSync) {
      onBlurSync(result.values);
    } else {
      reset(result.values);
    }
  }, [yamlText, onBlurSync, reset]);

  const handleYamlChange = useCallback(
    (newYaml: string) => {
      setYamlText(newYaml);
      setError(null);
    },
    [setYamlText]
  );

  const isReadOnly = isDisabled || isSubmitting;

  return (
    <>
      {error && (
        <>
          <EuiCallOut
            announceOnMount
            title={i18n.translate('xpack.alertingV2.yamlRuleForm.errorTitle', {
              defaultMessage: 'Configuration error',
            })}
            color="danger"
            iconType="error"
            data-test-subj="yamlRuleFormError"
          >
            {error}
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      <EuiForm id={RULE_FORM_ID} component="form" onSubmit={handleSubmit}>
        <EuiFormRow
          label={
            <FormattedMessage
              id="xpack.alertingV2.yamlRuleForm.label"
              defaultMessage="Rule definition (YAML)"
            />
          }
          fullWidth
          helpText={
            <FormattedMessage
              id="xpack.alertingV2.yamlRuleForm.helpText"
              defaultMessage="Edit the rule as YAML. ES|QL autocomplete is available within the query field."
            />
          }
        >
          <YamlRuleEditor
            value={yamlText}
            onChange={handleYamlChange}
            onBlur={handleBlur}
            esqlCallbacks={esqlCallbacks}
            isReadOnly={isReadOnly}
            dataTestSubj="ruleV2FormYamlEditor"
          />
        </EuiFormRow>
      </EuiForm>
    </>
  );
};
