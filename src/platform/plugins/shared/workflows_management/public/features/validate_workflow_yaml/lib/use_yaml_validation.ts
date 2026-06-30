/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { monaco } from '@kbn/monaco';
import { collectAllConnectorIds } from './collect_all_connector_ids';
import { collectAllCustomPropertyItems } from './collect_all_custom_property_items';
import { collectAllVariables } from './collect_all_variables';
import { validateConnectorIds } from './validate_connector_ids';
import { validateCustomProperties } from './validate_custom_properties';
import { validateDeprecatedStepTypes } from './validate_deprecated_step_types';
import { validateIfConditions } from './validate_if_conditions';
import { validateJsonSchemaDefaults } from './validate_json_schema_defaults';
import { validateLiquidYamlScalars } from './validate_liquid_yaml_scalars';
import { validateStepNameUniqueness } from './validate_step_name_uniqueness';
import { validateTriggerConditions } from './validate_trigger_conditions';
import { validateVariables as validateVariablesInternal } from './validate_variables';
import { validateWorkflowInputs } from './validate_workflow_inputs';
import { validateWorkflowOutputsInYaml } from './validate_workflow_outputs_in_yaml';
import { getPropertyHandler } from '../../../../common/schema';
import { selectWorkflowGraph, selectYamlDocument } from '../../../entities/workflows/store';
import {
  selectConnectors,
  selectEditorWorkflowLookup,
  selectIsWorkflowTab,
  selectWorkflowDefinition,
  selectWorkflows,
  selectYamlLineCounter,
} from '../../../entities/workflows/store/workflow_detail/selectors';
import { useKibana } from '../../../hooks/use_kibana';
import { useWorkflowEsqlCallbacks } from '../../../widgets/workflow_yaml_editor/lib/esql_validation/use_workflow_esql_callbacks';
import { validateEsqlSteps } from '../../../widgets/workflow_yaml_editor/lib/esql_validation/validate_esql_steps';
import { MarkerSeverity } from '../../../widgets/workflow_yaml_editor/lib/utils';
import {
  BATCHED_CUSTOM_MARKER_OWNER,
  validationResultFingerprint,
  type YamlValidationResult,
} from '../model/types';

const SEVERITY_MAP = {
  error: MarkerSeverity.Error,
  warning: MarkerSeverity.Warning,
  info: MarkerSeverity.Info,
};

function buildResultsFingerprint(results: YamlValidationResult[]): string {
  if (results.length === 0) {
    return '';
  }
  return results.map(validationResultFingerprint).join('\n');
}

export interface UseYamlValidationResult {
  error: Error | null;
  isLoading: boolean;
  /** Custom validation results (source of truth for accordion; avoids interceptor timing issues) */
  validationResults: YamlValidationResult[];
}

export function useYamlValidation(
  editor: monaco.editor.IStandaloneCodeEditor | null
): UseYamlValidationResult {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [validationResults, setValidationResults] = useState<YamlValidationResult[]>([]);
  const lastFingerprintRef = useRef<string>('');
  const setStableValidationResults = useCallback((results: YamlValidationResult[]) => {
    const fingerprint = buildResultsFingerprint(results);
    if (fingerprint !== lastFingerprintRef.current) {
      lastFingerprintRef.current = fingerprint;
      setValidationResults(results);
    }
  }, []);
  const decorationsCollection = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const yamlDocument = useSelector(selectYamlDocument);
  const workflowLookup = useSelector(selectEditorWorkflowLookup);
  const workflowGraph = useSelector(selectWorkflowGraph);
  const workflowDefinition = useSelector(selectWorkflowDefinition);
  const lineCounter = useSelector(selectYamlLineCounter);
  const isWorkflowTab = useSelector(selectIsWorkflowTab);
  const connectors = useSelector(selectConnectors);
  const workflows = useSelector(selectWorkflows);
  const { application, http, data, licensing } = useKibana().services;
  const esqlCallbacks = useWorkflowEsqlCallbacks({
    http,
    application,
    data,
    licensing,
  });
  // Held in a ref so the effect below doesn't re-fire just because the
  // memo identity rebuilt (it does on every render in tests where the kibana
  // mock returns fresh service objects).
  const esqlCallbacksRef = useRef(esqlCallbacks);
  esqlCallbacksRef.current = esqlCallbacks;

  useEffect(() => {
    const esqlAbortController = new AbortController();

    async function validateYaml() {
      if (!editor) {
        return;
      }

      const model = editor.getModel();
      if (!model) {
        return;
      }

      if (!isWorkflowTab) {
        if (decorationsCollection.current) {
          decorationsCollection.current.clear();
        }
        monaco.editor.setModelMarkers(model, BATCHED_CUSTOM_MARKER_OWNER, []);
        setStableValidationResults([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      if (!yamlDocument) {
        setStableValidationResults([]);
        setIsLoading(false);
        setError(new Error('Error validating: Yaml document is not loaded'));
        return;
      }

      const connectorIdItems = collectAllConnectorIds(yamlDocument, lineCounter);
      const customPropertyItems =
        workflowLookup && lineCounter
          ? collectAllCustomPropertyItems(
              workflowLookup,
              lineCounter,
              (stepType: string, scope: 'config' | 'input', key: string) =>
                getPropertyHandler(stepType, scope, key)
            )
          : [];
      const dynamicConnectorTypes = connectors?.connectorTypes ?? null;

      // Generate the connectors management URL
      const connectorsManagementUrl = application.getUrlForApp('management', {
        deepLinkId: 'triggersActionsConnectors',
        absolute: true,
      });

      // These validations only need the parsed YAML document, not the full workflow graph.
      // They must run even when workflowGraph/workflowDefinition are unavailable
      // (e.g. during editing when the YAML doesn't fully match the workflow schema yet)
      // so that connector-id, step-name, liquid-template, custom-property, and
      // workflow-inputs validation still provide feedback.
      const yamlString = model.getValue();
      const liquidScalarResults =
        workflowGraph && workflowDefinition
          ? validateLiquidYamlScalars(
              yamlString,
              yamlDocument,
              model,
              workflowGraph,
              workflowDefinition
            )
          : validateLiquidYamlScalars(yamlString, yamlDocument, null);
      const results: YamlValidationResult[] = [
        ...(lineCounter ? validateStepNameUniqueness(yamlDocument, lineCounter) : []),
        ...liquidScalarResults.filter((result) => result.owner === 'liquid-template-validation'),
        ...validateConnectorIds(connectorIdItems, dynamicConnectorTypes, connectorsManagementUrl),
        ...validateWorkflowOutputsInYaml(yamlDocument, model, workflowDefinition?.outputs),
        ...(customPropertyItems ? await validateCustomProperties(customPropertyItems) : []),
        // Lookup-backed validators run sequentially (each await blocks the next).
        // ES|QL runs after custom-property validation so property errors surface first
        // and we avoid overlapping cluster calls from validateQuery with property handlers.
        ...(workflowLookup && lineCounter
          ? [
              ...validateDeprecatedStepTypes(workflowLookup, lineCounter),
              ...validateWorkflowInputs(workflowLookup, workflows, lineCounter),
              ...validateIfConditions(workflowLookup, lineCounter),
              ...(await validateEsqlSteps(
                workflowLookup,
                lineCounter,
                model,
                esqlCallbacksRef.current,
                esqlAbortController.signal
              ).catch(() => [])),
            ]
          : []),
      ];

      // Variable and JSON-schema-default validations require a fully parsed
      // workflowGraph and workflowDefinition. When those are unavailable
      // (e.g. YAML has structural issues that prevent graph construction),
      // these validations are skipped gracefully; the remaining validators
      // above still provide feedback.
      if (workflowGraph && workflowDefinition) {
        const variableItems = collectAllVariables(model, yamlDocument, workflowGraph);
        results.push(
          ...validateTriggerConditions(workflowDefinition, yamlDocument),
          ...validateVariablesInternal(
            variableItems,
            workflowGraph,
            workflowDefinition,
            yamlDocument,
            model
          ),
          ...liquidScalarResults.filter((result) => result.owner === 'variable-validation'),
          ...validateJsonSchemaDefaults(yamlDocument, workflowDefinition, model)
        );
      }

      const { markers, decorations } = createMarkersAndDecorations(results);

      if (decorationsCollection.current) {
        decorationsCollection.current.clear();
      }
      decorationsCollection.current = editor.createDecorationsCollection(decorations);

      setStableValidationResults(results);
      setIsLoading(false);
      monaco.editor.setModelMarkers(model, BATCHED_CUSTOM_MARKER_OWNER, markers);
      setError(null);
    }

    validateYaml();

    return () => {
      esqlAbortController.abort();
    };
  }, [
    editor,
    lineCounter,
    workflowDefinition,
    workflowGraph,
    yamlDocument,
    application,
    isWorkflowTab,
    connectors?.connectorTypes,
    workflowLookup,
    workflows,
    setStableValidationResults,
  ]);

  return {
    error,
    isLoading,
    validationResults,
  };
}

// create markers and decorations for the validation results
function createMarkersAndDecorations(validationResults: YamlValidationResult[]): {
  markers: monaco.editor.IMarkerData[];
  decorations: monaco.editor.IModelDeltaDecoration[];
} {
  const markers: monaco.editor.IMarkerData[] = [];
  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  for (const validationResult of validationResults) {
    const marker = {
      startLineNumber: validationResult.startLineNumber,
      startColumn: validationResult.startColumn,
      endLineNumber: validationResult.endLineNumber,
      endColumn: validationResult.endColumn,
    };
    if (validationResult.owner === 'variable-validation') {
      if (validationResult.severity !== null) {
        markers.push({
          ...marker,
          severity: SEVERITY_MAP[validationResult.severity],
          message: validationResult.message,
          source: 'variable-validation',
        });
      }
      // handle valid variables
      decorations.push({
        range: createRange(validationResult),
        options: {
          inlineClassName: `template-variable-${validationResult.severity ?? 'valid'}`,
          hoverMessage: validationResult.hoverMessage
            ? createMarkdownContent(validationResult.hoverMessage)
            : null,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    } else if (validationResult.owner === 'json-schema-default-validation') {
      if (validationResult.severity !== null) {
        markers.push({
          ...marker,
          severity: SEVERITY_MAP[validationResult.severity],
          message: validationResult.message,
          source: 'json-schema-default-validation',
        });
      }
    } else if (validationResult.owner === 'liquid-template-validation') {
      markers.push({
        ...marker,
        severity: SEVERITY_MAP[validationResult.severity],
        message: validationResult.message,
        source: 'liquid-template-validation',
      });
      decorations.push({
        range: createRange(validationResult),
        options: {
          inlineClassName: `liquid-template-${validationResult.severity ?? 'valid'}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          hoverMessage: validationResult.hoverMessage
            ? createMarkdownContent(validationResult.hoverMessage)
            : null,
        },
      });
    } else if (validationResult.owner === 'step-name-validation') {
      markers.push({
        ...marker,
        severity: SEVERITY_MAP[validationResult.severity],
        message: validationResult.message,
        source: 'step-name-validation',
      });
      decorations.push({
        range: new monaco.Range(
          validationResult.startLineNumber,
          1,
          validationResult.startLineNumber,
          validationResult.endColumn
        ),
        options: {
          className: 'duplicate-step-name-error',
          marginClassName: 'duplicate-step-name-error-margin',
          isWholeLine: true,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    } else if (validationResult.owner === 'connector-id-validation') {
      if (validationResult.severity !== null) {
        markers.push({
          ...marker,
          severity: SEVERITY_MAP[validationResult.severity],
          message: validationResult.message ?? '',
          source: 'connector-id-validation',
        });
      }
      decorations.push({
        range: createRange(validationResult),
        options: createSelectionDecoration(validationResult),
      });
    } else if (validationResult.owner === 'custom-property-validation') {
      if (validationResult.severity !== null) {
        markers.push({
          ...marker,
          severity: SEVERITY_MAP[validationResult.severity],
          message: validationResult.message,
          source: 'custom-property-validation',
        });
      }
      decorations.push({
        range: createRange(validationResult),
        options: createSelectionDecoration(validationResult),
      });
    } else if (validationResult.owner === 'workflow-output-validation') {
      markers.push({
        ...marker,
        severity: SEVERITY_MAP[validationResult.severity],
        message: validationResult.message,
        source: 'workflow-output-validation',
      });
      decorations.push({
        range: createRange(validationResult),
        options: {
          inlineClassName: `workflow-output-validation-${validationResult.severity}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          hoverMessage: validationResult.hoverMessage
            ? createMarkdownContent(validationResult.hoverMessage)
            : null,
        },
      });
    } else {
      if (validationResult.severity !== null) {
        markers.push({
          ...marker,
          severity: SEVERITY_MAP[validationResult.severity],
          message: validationResult.message,
          source: validationResult.owner,
        });
      }
      decorations.push({
        range: createRange(validationResult),
        options: {
          inlineClassName: `${validationResult.owner}-${validationResult.severity ?? 'valid'}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          hoverMessage: validationResult.hoverMessage
            ? createMarkdownContent(validationResult.hoverMessage)
            : null,
          after: validationResult.afterMessage
            ? {
                content: validationResult.afterMessage,
                cursorStops: monaco.editor.InjectedTextCursorStops.None,
                inlineClassName: `after-text`,
              }
            : null,
        },
      });
    }
  }
  return { markers, decorations };
}

function createRange(validationResult: YamlValidationResult): monaco.Range {
  return new monaco.Range(
    validationResult.startLineNumber,
    validationResult.startColumn,
    validationResult.endLineNumber,
    validationResult.endColumn
  );
}

function createMarkdownContent(content: string): monaco.IMarkdownString {
  return {
    value: content,
    isTrusted: true,
    supportHtml: true,
  };
}

function createSelectionDecoration(
  validationResult: YamlValidationResult
): monaco.editor.IModelDecorationOptions {
  const decorationOptions: monaco.editor.IModelDecorationOptions = {
    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    hoverMessage: validationResult.hoverMessage
      ? createMarkdownContent(validationResult.hoverMessage)
      : null,
    before: validationResult.beforeMessage
      ? {
          content: validationResult.beforeMessage,
          cursorStops: monaco.editor.InjectedTextCursorStops.None,
          inlineClassName: `connector-name-badge`,
        }
      : null,
  };
  // Only add inlineClassName for errors, not for valid connectors
  if (validationResult.severity !== null) {
    decorationOptions.inlineClassName = `template-variable-${validationResult.severity}`;
  }
  return decorationOptions;
}
