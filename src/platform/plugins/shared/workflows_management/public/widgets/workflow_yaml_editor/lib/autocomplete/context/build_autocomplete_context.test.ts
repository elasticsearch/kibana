/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { monaco } from '@kbn/monaco';
import type { ConnectorTypeInfo } from '@kbn/workflows';
import { expectZodSchemaEqual } from '@kbn/workflows/common/utils/zod/test_utils/expect_zod_schema_equal';
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';
import { z } from '@kbn/zod/v4';
import type { BuildAutocompleteContextParams } from './build_autocomplete_context';
import { buildAutocompleteContext } from './build_autocomplete_context';
import { createFakeMonacoModel } from '../../../../../../common/mocks/monaco_model';
import type { WorkflowDetailState } from '../../../../../entities/workflows/store/workflow_detail/types';
import { performComputation } from '../../../../../entities/workflows/store/workflow_detail/utils/computation';
import { findStepByLine } from '../../../../../entities/workflows/store/workflow_detail/utils/step_finder';
import { triggerSchemas } from '../../../../../trigger_schemas';

jest.mock('../../../../../features/workflow_context/lib/get_output_schema_for_step_type');

export function getFakeAutocompleteContextParams(
  yamlContent: string,
  customConnectorTypes?: Record<string, ConnectorTypeInfo>
): BuildAutocompleteContextParams {
  const defaultConnectorTypes: Record<string, ConnectorTypeInfo> = {
    console: {
      actionTypeId: 'console',
      displayName: 'Console',
      instances: [],
      minimumLicenseRequired: 'basic',
      subActions: [],
      enabled: true,
      enabledInConfig: true,
      enabledInLicense: true,
    },
  };

  const connectorTypes = customConnectorTypes || defaultConnectorTypes;

  const cursorOffset = yamlContent.indexOf('|<-');
  const cleanedYaml = yamlContent.replace('|<-', '');
  const mockModel = createFakeMonacoModel(cleanedYaml, cursorOffset);
  const position = mockModel.getPositionAt(cursorOffset);
  const triggerCharacter = cleanedYaml.slice(cursorOffset - 1, cursorOffset);
  const computedData = performComputation(cleanedYaml);
  const mockEditorState = {
    yamlString: cleanedYaml,
    focusedStepId: computedData?.workflowLookup
      ? findStepByLine(position.lineNumber, computedData.workflowLookup)
      : undefined,
    computed: computedData,
    connectors: { connectorTypes, totalConnectors: Object.keys(connectorTypes).length },
    workflows: {
      workflows: {},
      totalWorkflows: 0,
    },
  } as WorkflowDetailState;

  return {
    model: mockModel as unknown as monaco.editor.ITextModel,
    position: position as monaco.Position,
    completionContext: {
      triggerKind: monaco.languages.CompletionTriggerKind.TriggerCharacter,
      triggerCharacter,
    } as monaco.languages.CompletionContext,
    editorState: mockEditorState,
  };
}

describe('buildAutocompleteContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null if the yaml is empty', () => {
    const result = buildAutocompleteContext(getFakeAutocompleteContextParams(''));

    expect(result).toBeNull();
  });

  it('should return an autocomplete context if the yaml document is not null', () => {
    const result = buildAutocompleteContext(getFakeAutocompleteContextParams('name: "test"'));

    expect(result).toBeDefined();
  });

  it('should have consts in the context schema', () => {
    const result = buildAutocompleteContext(
      getFakeAutocompleteContextParams(`
name: "test"
consts:
  stringConst: "test-const"
  numberConst: 1
  booleanConst: true
  arrayConst: [1, 2, 3]
  objectConst: { key: "value" }
steps:
  - name: "first-step"
    type: "console"
    with:
      message: "|<-"
`)
    );

    expect(result?.contextSchema).toBeDefined();
    expect((result?.contextSchema as z.ZodObject<any>).shape.consts).toBeDefined();
    const constsShape = (result?.contextSchema as z.ZodObject<any>).shape.consts.shape;
    expectZodSchemaEqual(constsShape.stringConst, z.literal('test-const'));
    expectZodSchemaEqual(constsShape.numberConst, z.literal(1));
    expectZodSchemaEqual(constsShape.booleanConst, z.literal(true));
    expectZodSchemaEqual(constsShape.arrayConst, z.array(z.literal(1)).length(3));
    expectZodSchemaEqual(constsShape.objectConst, z.object({ key: z.literal('value') }));
  });

  it('should have steps outputs in the context schema', () => {
    const result = buildAutocompleteContext(
      getFakeAutocompleteContextParams(`
name: "test"
steps:
  - name: first-step
    type: console
    with:
      message: hello
  - name: second-step
    type: console
    with:
      message: "|<-"
`)
    );

    expect(result?.contextSchema).toBeDefined();
    expect((result?.contextSchema as z.ZodObject<any>).shape.steps).toBeDefined();
    const stepsShape = (result?.contextSchema as z.ZodObject<any>).shape.steps.shape;
    expect(stepsShape['first-step']).toBeDefined();
    expectZodSchemaEqual(
      stepsShape['first-step'],
      z.object({ output: z.string().optional(), error: z.any().optional() })
    );
  });

  it('should have steps outputs in the context schema for nested steps', () => {
    const result = buildAutocompleteContext(
      getFakeAutocompleteContextParams(`version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: if-step
    type: if
    with:
      condition: "something:something"
    steps:
      - name: first-true-step
        type: console
        with:
          message: "im true"
      - name: second-true-step
        type: console
        with:
          message: "im true, {{steps.|<-}}"
    else: 
      - name: false-step
        type: console
        with:
          message: "im unreachable"
`)
    );

    expect(result?.contextSchema).toBeDefined();
    const stepsShape = (result?.contextSchema as z.ZodObject<any>).shape;
    expect(stepsShape['first-true-step']).toBeDefined();
    expectZodSchemaEqual(
      stepsShape['first-true-step'],
      z.object({ output: z.string().optional(), error: z.any().optional() })
    );
  });

  it('should detect if we are in a scheduled trigger with block', () => {
    const result = buildAutocompleteContext(
      getFakeAutocompleteContextParams(`
version: "1"
name: "test"
triggers:
  - type: scheduled
    enabled: true
    with:
      |<-
steps: []
`)
    );

    expect(result?.isInScheduledTriggerWithBlock).toBe(true);
  });

  it('should detect triggers[i].on.condition and resolve registered trigger definition', () => {
    const mockDefinition: PublicTriggerDefinition = {
      id: 'example.custom_trigger',
      stability: 'tech_preview',
      title: 'Example',
      description: 'Example trigger',
      eventSchema: z.object({ severity: z.string() }),
    };
    const getDef = jest
      .spyOn(triggerSchemas, 'getTriggerDefinition')
      .mockReturnValue(mockDefinition);

    const result = buildAutocompleteContext(
      getFakeAutocompleteContextParams(`
version: "1"
name: "test"
enabled: true
triggers:
  - type: example.custom_trigger
    on:
      condition: "event.severity: hi and |<-foo"
steps:
  - name: s1
    type: wait
    with:
      duration: 1s
`)
    );

    expect(result?.isInTriggerConditionField).toBe(true);
    expect(result?.path).toEqual(['triggers', 0, 'on', 'condition']);
    expect(getDef).toHaveBeenCalledWith('example.custom_trigger');
    expect(result?.triggerConditionDefinition).toEqual(mockDefinition);

    getDef.mockRestore();
  });

  it('detects on.condition field but leaves triggerConditionDefinition unset for unregistered type', () => {
    const getDef = jest.spyOn(triggerSchemas, 'getTriggerDefinition').mockReturnValue(undefined);

    const result = buildAutocompleteContext(
      getFakeAutocompleteContextParams(`
version: "1"
name: "test"
triggers:
  - type: manual
    on:
      condition: "event.severity: hi and |<-foo"
steps: []
`)
    );

    expect(result?.isInTriggerConditionField).toBe(true);
    expect(result?.path).toEqual(['triggers', 0, 'on', 'condition']);
    expect(getDef).toHaveBeenCalledWith('manual');
    expect(result?.triggerConditionDefinition).toBeUndefined();

    getDef.mockRestore();
  });

  describe('ES|QL region detection', () => {
    it('detects when the cursor sits inside an elasticsearch.esql.query body', () => {
      const result = buildAutocompleteContext(
        getFakeAutocompleteContextParams(`steps:
  - type: elasticsearch.esql.query
    with:
      query: |
        FROM logs-* | |<-
`)
      );

      expect(result?.isInEsqlQueryField).toBe(true);
      expect(result?.esqlRegion).not.toBeNull();
      expect(result?.esqlOffsetInQuery).not.toBeNull();
      expect(result?.esqlOffsetInQuery).toBeGreaterThan(0);
    });

    it('keeps the cursor inside the region when it sits in trailing whitespace', () => {
      // Reproduces the bug where a 500ms-debounced store yamlDocument made the
      // cursor land outside `contentEndInFile` on every keystroke. The build
      // context now re-parses model.getValue() directly AND treats trailing
      // whitespace immediately after the trimmed region content as in-region,
      // so the cursor at the very end of an in-progress ES|QL line still
      // resolves as in-region.
      const result = buildAutocompleteContext(
        getFakeAutocompleteContextParams(`steps:
  - type: elasticsearch.esql.query
    with:
      query: |
        FROM logs-* |<-`)
      );

      expect(result?.isInEsqlQueryField).toBe(true);
      expect(result?.esqlRegion?.esql).toBe('        FROM logs-*');
      // Cursor offset is past the trimmed end, into the trailing whitespace.
      expect(result?.esqlOffsetInQuery).toBeGreaterThan(result!.esqlRegion!.esql.length);
    });

    it('returns isInEsqlQueryField=false outside an ES|QL query body', () => {
      const result = buildAutocompleteContext(
        getFakeAutocompleteContextParams(`steps:
  - type: elasticsearch.esql.query
    with:
      query: |
        FROM logs
    name: "|<-"
`)
      );

      expect(result?.isInEsqlQueryField).toBe(false);
      expect(result?.esqlRegion).toBeNull();
      expect(result?.esqlOffsetInQuery).toBeNull();
    });

    it('skips the YAML walk when no elasticsearch.esql.query step exists', () => {
      const result = buildAutocompleteContext(
        getFakeAutocompleteContextParams(`steps:
  - type: console
    with:
      message: "|<-"
`)
      );

      expect(result?.isInEsqlQueryField).toBe(false);
      expect(result?.esqlRegion).toBeNull();
    });
  });
});
