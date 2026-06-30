/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  euiFontSize,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CodeEditor, monaco } from '@kbn/code-editor';
import { FormattedMessage } from '@kbn/i18n-react';
import type { StepContext } from '@kbn/workflows';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { z } from '@kbn/zod/v4';
import {
  useWorkflowsMonacoTheme,
  WORKFLOWS_MONACO_EDITOR_THEME,
} from '../../hooks/use_workflows_monaco_theme';

export interface ContextOverrideData {
  stepContext: Partial<StepContext>;
  schema: z.ZodType;
  /** Original JSON Schema (avoids lossy Zod → JSON Schema round-trip for Monaco validation) */
  rawJsonSchema?: JsonModelSchemaType;
}

const DEFAULT_SCHEMA = z.object({}).catchall(z.unknown());
const SCHEMA_URI = 'inmemory://schemas/resume-execution-json-editor-schema';

/**
 * JSON Schema `required` means each listed property must exist on the instance.
 * Monaco's JSON dialect enforces that even when a property also declares `default`.
 * Zod's `.default(...)` fills missing keys during `safeParse`, so we check `required`
 * explicitly to keep the Resume button aligned with editor diagnostics.
 */
const parsedObjectHasRequiredJsonSchemaKeys = (
  parsed: unknown,
  rawJsonSchema: JsonModelSchemaType | undefined
): boolean => {
  const required = rawJsonSchema?.required;
  if (!Array.isArray(required) || required.length === 0) {
    return true;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const record = parsed as Record<string, unknown>;
  return required.every(
    (key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(record, key)
  );
};

export interface ResumeExecutionModalProps {
  resumeMessage?: string;
  initialcontextOverride?: ContextOverrideData;
  onSubmit?: (params: { stepInputs: Record<string, unknown> }) => void;
  onClose: () => void;
  /** When true, renders the submit button as a "Run" button (success color, play icon) instead of "Resume" */
  useRunButton?: boolean;
}

export const ResumeExecutionModal: React.FC<ResumeExecutionModalProps> = ({
  resumeMessage,
  initialcontextOverride,
  onSubmit,
  onClose,
  useRunButton = false,
}) => {
  useWorkflowsMonacoTheme();
  const { euiTheme, colorMode, modifications, highContrastMode } = useEuiTheme();
  const modalTitleId = useGeneratedHtmlId();

  const descriptionStyle = useMemo(
    () =>
      css({
        ...euiFontSize({ euiTheme, colorMode, modifications, highContrastMode }, 's'),
        fontWeight: 'normal',
      }),
    [euiTheme, colorMode, modifications, highContrastMode]
  );

  const modalBodyStyle = useMemo(
    () =>
      css({
        backgroundColor: euiTheme.colors.backgroundBaseSubdued,
        borderTop: `1px solid ${euiTheme.colors.borderBasePlain}`,
        borderBottom: `1px solid ${euiTheme.colors.borderBasePlain}`,
      }),
    [euiTheme]
  );

  const [inputsJson, setInputsJson] = useState<string>(
    initialcontextOverride?.stepContext != null
      ? JSON.stringify(initialcontextOverride.stepContext, null, 2)
      : '{}'
  );
  const isResumePayloadValid = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(inputsJson);
      if (!parsedObjectHasRequiredJsonSchemaKeys(parsed, initialcontextOverride?.rawJsonSchema)) {
        return false;
      }
      const schema = initialcontextOverride?.schema;
      if (schema) {
        return schema.safeParse(parsed).success;
      }
      return true;
    } catch {
      return false;
    }
  }, [inputsJson, initialcontextOverride?.schema, initialcontextOverride?.rawJsonSchema]);

  const jsonSchema = useMemo(() => {
    if (initialcontextOverride?.rawJsonSchema) {
      return initialcontextOverride.rawJsonSchema;
    }
    const schema = initialcontextOverride?.schema ?? DEFAULT_SCHEMA;
    return z.toJSONSchema(schema, { target: 'draft-7' });
  }, [initialcontextOverride?.rawJsonSchema, initialcontextOverride?.schema]);

  const mountedOnce = useRef(false);
  const handleMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      if (mountedOnce.current) return;
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
              schema: jsonSchema as Record<string, unknown>,
            },
          ],
        });
      } catch {
        // Monaco setup failed - fall back to basic JSON editing
      }
    },
    [jsonSchema]
  );

  const handleInputChange = useCallback((value: string) => {
    setInputsJson(value);
  }, []);

  const handleSubmit = useCallback(() => {
    if (onSubmit) {
      onSubmit({ stepInputs: JSON.parse(inputsJson) });
    }
  }, [onSubmit, inputsJson]);

  return (
    <EuiModal
      aria-labelledby={modalTitleId}
      maxWidth={false}
      onClose={onClose}
      data-test-subj="workflowResumeExecutionModal"
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle id={modalTitleId}>
          <EuiFlexGroup direction="column" gutterSize="xs">
            <EuiFlexItem>
              <FormattedMessage
                id="workflowsManagement.resumeExecutionModal.title"
                defaultMessage="Provide action"
              />
            </EuiFlexItem>
            <EuiFlexItem css={descriptionStyle}>
              {resumeMessage ?? (
                <FormattedMessage
                  id="workflowsManagement.resumeExecutionModal.description"
                  defaultMessage="Provide input to resume the workflow."
                />
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody css={modalBodyStyle}>
        <CodeEditor
          languageId="json"
          value={inputsJson}
          width={1000}
          height={500}
          editorDidMount={handleMount}
          onChange={handleInputChange}
          dataTestSubj="workflow-resume-json-editor"
          overflowWidgetsContainerZIndexOverride={6001}
          options={{
            language: 'json',
            fixedOverflowWidgets: true,
            lineNumbersMinChars: 2,
            theme: WORKFLOWS_MONACO_EDITOR_THEME,
            automaticLayout: true,
            fontSize: 12,
            minimap: {
              enabled: false,
            },
            overviewRulerBorder: false,
            scrollbar: {
              alwaysConsumeMouseWheel: false,
            },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            wrappingIndent: 'indent',
            hover: {
              enabled: true,
            },
          }}
        />
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButton
          onClick={handleSubmit}
          disabled={!isResumePayloadValid}
          color={useRunButton ? 'success' : 'warning'}
          iconType={useRunButton ? 'play' : 'check'}
          size="s"
          data-test-subj="workflowSubmitResume"
        >
          {useRunButton ? (
            <FormattedMessage
              id="workflowsManagement.resumeExecutionModal.runBtn"
              defaultMessage="Run"
            />
          ) : (
            <FormattedMessage
              id="workflowsManagement.resumeExecutionModal.resumeBtn"
              defaultMessage="Resume"
            />
          )}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};
