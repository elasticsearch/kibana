/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiFlexGroup, EuiFlexItem, EuiFormRow } from '@elastic/eui';
import { css } from '@emotion/react';
import type { JSONSchema7 } from 'json-schema';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { CodeEditor, monaco } from '@kbn/code-editor';
import { i18n } from '@kbn/i18n';
import { mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema } from '@kbn/workflows';
import { buildFieldsZodValidator } from '@kbn/workflows/spec/lib/build_fields_zod_validator';
import { applyInputDefaults, hasDefaultsRecursive } from '@kbn/workflows/spec/lib/field_conversion';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { WORKFLOWS_MONACO_EDITOR_THEME } from '@kbn/workflows-ui';
import { InputValidationCallout } from './input_validation_callout';
import { generateSampleFromJsonSchema } from '../../../../common/lib/generate_sample_from_json_schema';

const SCHEMA_URI = `inmemory://schemas/workflow-manual-json-editor-schema`;

const getDefaultWorkflowInput = (inputs?: JsonModelSchemaType): Record<string, unknown> => {
  if (!inputs?.properties) {
    return {};
  }

  // Resolve defaults (with $ref and nested object support) so we can reuse the
  // same values applyInputDefaults would produce at execution time.
  const resolvedDefaults = applyInputDefaults(undefined, inputs) ?? {};

  // Only include a property when the user should see/edit it: required fields, fields with
  // defaults in the subtree (hasDefaultsRecursive), or $ref inputs (optional: partial defaults
  // from applyInputDefaults; required: full generated sample via resolveRef).
  // Optional properties without defaults stay omitted so runtime can treat them as unset.
  // See issue elastic/security-team#16857.
  const requiredProps = new Set(inputs.required ?? []);
  const result: Record<string, unknown> = {};

  for (const [propertyName, propertySchema] of Object.entries(inputs.properties)) {
    const jsonSchema = propertySchema as JSONSchema7;
    const isRequired = requiredProps.has(propertyName);
    const hasDefaults = hasDefaultsRecursive(jsonSchema, inputs);
    const resolvedValue = resolvedDefaults[propertyName];
    const isRefProp = Boolean(jsonSchema.$ref);

    // Required $ref: prefer a full generated sample (resolveRef + placeholders) so the run
    // modal matches what authors need to edit; fall back to applyInputDefaults if sampling fails.
    if (isRequired && isRefProp) {
      const sample = generateSampleFromJsonSchema(jsonSchema, inputs);
      if (sample !== undefined) {
        result[propertyName] = sample;
      } else if (resolvedValue !== undefined && (hasDefaults || isRefProp)) {
        result[propertyName] = resolvedValue;
      } else {
        // Unknown/invalid $ref: keep the key editable so the run modal is not missing a required field.
        result[propertyName] = {};
      }
    } else if (resolvedValue !== undefined && (hasDefaults || isRefProp)) {
      // Optional $ref (or defaults in subtree): partial structs from applyInputDefaults without
      // hasDefaultsRecursive on the $ref wrapper alone.
      result[propertyName] = resolvedValue;
    } else if (isRequired) {
      const sample = generateSampleFromJsonSchema(jsonSchema, inputs);
      if (sample !== undefined) {
        result[propertyName] = sample;
      }
    }
  }

  return result;
};

interface WorkflowExecuteManualFormProps {
  value: string;
  inputs?: JsonModelSchemaType; // normalized inputs
  setValue: (data: string) => void;
  errors: string | null;
  setErrors: (errors: string | null) => void;
}
export const WorkflowExecuteManualForm = ({
  value,
  inputs,
  setValue,
  errors,
  setErrors,
}: WorkflowExecuteManualFormProps): React.JSX.Element => {
  const inputsValidator = useMemo(() => buildFieldsZodValidator(inputs), [inputs]);

  /** Same root merge as workflow YAML Monaco schema so `#/kibana/definitions/*` $ref resolves. */
  const monacoInputsJsonSchema = useMemo(() => {
    if (!inputs) {
      return undefined;
    }
    return (mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema(inputs as object) ??
      inputs) as JsonModelSchemaType;
  }, [inputs]);

  useEffect(() => {
    setValue(JSON.stringify(getDefaultWorkflowInput(inputs), null, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validate inputs on initial load and when definition changes
  useEffect(() => {
    if (value) {
      try {
        const res = inputsValidator.safeParse(JSON.parse(value));
        if (!res.success) {
          setErrors(
            res.error.issues
              .map((e) => (e.path.length > 0 ? `${e.path.join('.')}: ${e.message}` : e.message))
              .join(', ')
          );
        } else {
          setErrors(null);
        }
      } catch (e: Error | unknown) {
        setErrors(
          i18n.translate('workflows.workflowExecuteManualForm.invalidJson', {
            defaultMessage: 'Invalid JSON: {message}',
            values: { message: e instanceof Error ? e.message : String(e) },
          })
        );
      }
    }
  }, [inputsValidator, value, setErrors]);

  const mountedOnce = useRef(false);
  const handleMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      if (!monacoInputsJsonSchema || mountedOnce.current) return;
      mountedOnce.current = true;

      try {
        const currentModel = editor.getModel();
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
          validate: true,
          allowComments: false,
          enableSchemaRequest: false,
          schemas: [
            {
              uri: SCHEMA_URI,
              fileMatch: [currentModel?.uri.toString() ?? ''],
              schema: monacoInputsJsonSchema,
            },
          ],
        });
      } catch {
        // Monaco setup failed — fall back to basic JSON editing
      }
    },
    [monacoInputsJsonSchema]
  );

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="s"
      css={css`
        flex: 1;
        min-height: 0;
        align-self: stretch;
      `}
    >
      {errors && (
        <EuiFlexItem grow={false}>
          <InputValidationCallout errors={errors} />
        </EuiFlexItem>
      )}

      <EuiFlexItem
        grow
        css={css`
          flex: 1;
          min-height: 0;
          overflow: hidden;
        `}
      >
        <EuiFormRow
          label={i18n.translate('workflows.workflowExecuteManualForm.inputDataLabel', {
            defaultMessage: 'Input Data',
          })}
          fullWidth
          css={css`
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            .euiFormRow__fieldWrapper {
              flex: 1;
              min-height: 0;
              display: flex;
              flex-direction: column;
            }
          `}
        >
          <CodeEditor
            languageId="json"
            value={value}
            width="100%"
            height="100%"
            onChange={setValue}
            editorDidMount={handleMount}
            dataTestSubj={'workflow-manual-json-editor'}
            overflowWidgetsContainerZIndexOverride={6001}
            options={{
              language: 'json',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              lineNumbers: 'on',
              glyphMargin: true,
              tabSize: 2,
              lineNumbersMinChars: 2,
              insertSpaces: true,
              fontSize: 14,
              renderWhitespace: 'all',
              wordWrapColumn: 80,
              wrappingIndent: 'indent',
              theme: WORKFLOWS_MONACO_EDITOR_THEME,
              formatOnType: true,
              quickSuggestions: false,
              suggestOnTriggerCharacters: false,
              wordBasedSuggestions: false,
              parameterHints: {
                enabled: false,
              },
            }}
          />
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
