/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import path from 'path';

import { parse } from 'yaml';
import { loggerMock } from '@kbn/logging-mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';

import { errors } from '@elastic/elasticsearch';

import {
  FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME,
  FLEET_EVENT_INGESTED_COMPONENT_TEMPLATE_NAME,
  OTEL_COMPONENT_SEMCONV_RESOURCE_TO_ECS_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_LOGS_CUSTOM_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_METRICS_CUSTOM_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_METRICS_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_SETTINGS,
  OTEL_COMPONENT_TEMPLATE_TRACES_CUSTOM_MAPPINGS,
  OTEL_COMPONENT_TEMPLATE_TRACES_MAPPINGS,
  STACK_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
} from '../../../../constants/fleet_es_assets';

import { createAppContextStartContractMock } from '../../../../mocks';
import { appContextService } from '../../..';
import type { RegistryDataStream } from '../../../../types';
import { processFields } from '../../fields/field';
import type { Field } from '../../fields/field';
import {
  STACK_COMPONENT_TEMPLATE_ECS_MAPPINGS,
  FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
  STACK_COMPONENT_TEMPLATE_LOGS_SETTINGS,
} from '../../../../constants';

import {
  generateMappings,
  getTemplate,
  getTemplatePriority,
  generateTemplateIndexPattern,
  generateTemplateName,
  generateESIndexPatterns,
  generateNamespaceTemplateName,
  generateNamespaceTemplateIndexPattern,
  getNamespaceTemplatePriority,
  isNamespaceTemplate,
  getNamespaceFromTemplateId,
  NAMESPACE_TEMPLATE_PRIORITY_BOOST,
  updateCurrentWriteIndices,
} from './template';

// Add our own serialiser to just do JSON.stringify
expect.addSnapshotSerializer({
  print(val) {
    return JSON.stringify(val, null, 2);
  },

  test(val) {
    return val;
  },
});

describe('EPM template', () => {
  beforeEach(async () => {
    appContextService.start(createAppContextStartContractMock());
  });

  describe('getTemplate', () => {
    it('gets index patterns for the template', () => {
      const templateIndexPattern = 'logs-nginx.access-abcd-*';

      const template = getTemplate({
        templateIndexPattern,
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates: [],
        templatePriority: 200,
        isIndexModeTimeSeries: false,
      });
      expect(template.index_patterns).toStrictEqual([templateIndexPattern]);
    });
    it('tests processing keyword field attributes in a dynamic template', () => {
      const textFieldLiteralYml = `
- name: labels.*
  type: keyword
  ignore_above: 4096
`;
      const fieldMapping = {
        properties: {
          labels: {
            type: 'object',
            dynamic: true,
          },
        },
        dynamic_templates: [
          {
            'labels.*': {
              match_mapping_type: 'string',
              path_match: 'labels.*',
              mapping: {
                type: 'keyword',
                ignore_above: 4096,
              },
            },
          },
        ],
      };
      const fields: Field[] = parse(textFieldLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(fieldMapping);
    });

    it('adds composed_of correctly', () => {
      const composedOfTemplates = ['component1', 'component2'];

      const template = getTemplate({
        templateIndexPattern: 'logs-*',
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates,
        templatePriority: 200,
        isIndexModeTimeSeries: false,
      });
      expect(template.composed_of).toStrictEqual([
        STACK_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
        STACK_COMPONENT_TEMPLATE_LOGS_SETTINGS,
        ...composedOfTemplates,
        STACK_COMPONENT_TEMPLATE_ECS_MAPPINGS,
        FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
        FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME,
      ]);
    });

    it('supplies metrics@tsdb-settings for time series', () => {
      const composedOfTemplates = ['component1', 'component2'];

      const template = getTemplate({
        templateIndexPattern: 'metrics-*',
        type: 'metrics',
        packageName: 'nginx',
        composedOfTemplates,
        templatePriority: 200,
        isIndexModeTimeSeries: true,
      });
      expect(template.composed_of).toStrictEqual([
        'metrics@tsdb-settings',
        ...composedOfTemplates,
        STACK_COMPONENT_TEMPLATE_ECS_MAPPINGS,
        FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
        FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME,
      ]);
    });

    it('does not create fleet agent id verification component template if agentIdVerification is disabled', () => {
      appContextService.start(
        createAppContextStartContractMock({
          agentIdVerificationEnabled: false,
        })
      );
      const composedOfTemplates = ['component1', 'component2'];

      const template = getTemplate({
        templateIndexPattern: 'logs-*',
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates,
        templatePriority: 200,
        isIndexModeTimeSeries: false,
      });
      expect(template.composed_of).toStrictEqual([
        STACK_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
        STACK_COMPONENT_TEMPLATE_LOGS_SETTINGS,
        ...composedOfTemplates,
        STACK_COMPONENT_TEMPLATE_ECS_MAPPINGS,
        FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
      ]);
    });

    it('creates fleet event ingested component template if event ingested flag is enabled', () => {
      appContextService.start(
        createAppContextStartContractMock({
          agentIdVerificationEnabled: false,
          eventIngestedEnabled: true,
        })
      );
      const composedOfTemplates = ['component1', 'component2'];

      const template = getTemplate({
        templateIndexPattern: 'logs-*',
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates,
        templatePriority: 200,
        isIndexModeTimeSeries: false,
      });
      expect(template.composed_of).toStrictEqual([
        STACK_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
        STACK_COMPONENT_TEMPLATE_LOGS_SETTINGS,
        ...composedOfTemplates,
        STACK_COMPONENT_TEMPLATE_ECS_MAPPINGS,
        FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
        FLEET_EVENT_INGESTED_COMPONENT_TEMPLATE_NAME,
      ]);
    });

    it('adds empty composed_of correctly', () => {
      const composedOfTemplates: string[] = [];

      const template = getTemplate({
        templateIndexPattern: 'logs-*',
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates,
        templatePriority: 200,
        isIndexModeTimeSeries: false,
      });
      expect(template.composed_of).toStrictEqual([
        STACK_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
        STACK_COMPONENT_TEMPLATE_LOGS_SETTINGS,
        STACK_COMPONENT_TEMPLATE_ECS_MAPPINGS,
        FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
        FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME,
      ]);
    });

    it('adds hidden field correctly', () => {
      const templateIndexPattern = 'logs-nginx.access-abcd-*';

      const templateWithHidden = getTemplate({
        templateIndexPattern,
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates: [],
        templatePriority: 200,
        hidden: true,
        isIndexModeTimeSeries: false,
      });
      expect(templateWithHidden.data_stream.hidden).toEqual(true);

      const templateWithoutHidden = getTemplate({
        templateIndexPattern,
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates: [],
        templatePriority: 200,
        isIndexModeTimeSeries: false,
      });
      expect(templateWithoutHidden.data_stream.hidden).toEqual(undefined);
    });

    it('adds index_template.data_stream.hidden field correctly', () => {
      const templateIndexPattern = 'logs-nginx.access-abcd-*';

      const templateWithGlobalAndDataStreamHidden = getTemplate({
        templateIndexPattern,
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates: [],
        templatePriority: 200,
        hidden: false,
        registryElasticsearch: {
          'index_template.data_stream': {
            hidden: true,
          },
        },
        isIndexModeTimeSeries: false,
      });
      expect(templateWithGlobalAndDataStreamHidden.data_stream.hidden).toEqual(true);

      const templateWithDataStreamHidden = getTemplate({
        templateIndexPattern,
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates: [],
        templatePriority: 200,
        registryElasticsearch: {
          'index_template.data_stream': {
            hidden: true,
          },
        },
        isIndexModeTimeSeries: false,
      });
      expect(templateWithDataStreamHidden.data_stream.hidden).toEqual(true);

      const templateWithoutDataStreamHidden = getTemplate({
        templateIndexPattern,
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates: [],
        templatePriority: 200,
        hidden: true,
        isIndexModeTimeSeries: false,
      });
      expect(templateWithoutDataStreamHidden.data_stream.hidden).toEqual(true);

      const templateWithGlobalHiddenTrueAndDataStreamHiddenFalse = getTemplate({
        templateIndexPattern,
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates: [],
        templatePriority: 200,
        hidden: true,
        registryElasticsearch: {
          'index_template.data_stream': {
            hidden: false,
          },
        },
        isIndexModeTimeSeries: false,
      });
      expect(templateWithGlobalHiddenTrueAndDataStreamHiddenFalse.data_stream.hidden).toEqual(true);

      const templateWithoutHidden = getTemplate({
        templateIndexPattern,
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates: [],
        templatePriority: 200,
        isIndexModeTimeSeries: false,
      });
      expect(templateWithoutHidden.data_stream.hidden).toEqual(undefined);
    });

    it('adds composed_of correctly for otel input packages of type logs', () => {
      const composedOfTemplates = [
        'logs-check@package',
        'logs@custom',
        OTEL_COMPONENT_TEMPLATE_LOGS_CUSTOM_MAPPINGS,
        'httpcheck@custom',
        'logs-check@custom',
      ];

      const template = getTemplate({
        templateIndexPattern: 'logs.otel-*',
        type: 'logs',
        packageName: 'otel-test',
        composedOfTemplates,
        templatePriority: 200,
        isOtelInputType: true,
      });

      expect(template.composed_of).toStrictEqual([
        OTEL_COMPONENT_TEMPLATE_MAPPINGS,
        OTEL_COMPONENT_TEMPLATE_SETTINGS,
        OTEL_COMPONENT_TEMPLATE_LOGS_MAPPINGS,
        OTEL_COMPONENT_SEMCONV_RESOURCE_TO_ECS_MAPPINGS,
        ...composedOfTemplates,
        FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
        FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME,
      ]);
    });

    it('adds composed_of correctly for otel input packages of type metrics', () => {
      const composedOfTemplates = [
        'metrics-check@package',
        'metrics@custom',
        OTEL_COMPONENT_TEMPLATE_METRICS_CUSTOM_MAPPINGS,
        'httpcheck@custom',
        'metrics-check@custom',
      ];

      const template = getTemplate({
        templateIndexPattern: 'metrics.otel-*',
        type: 'metrics',
        packageName: 'otel-test',
        composedOfTemplates,
        templatePriority: 200,
        isOtelInputType: true,
      });
      expect(template.composed_of).toStrictEqual([
        OTEL_COMPONENT_TEMPLATE_MAPPINGS,
        OTEL_COMPONENT_TEMPLATE_SETTINGS,
        OTEL_COMPONENT_TEMPLATE_METRICS_MAPPINGS,
        OTEL_COMPONENT_SEMCONV_RESOURCE_TO_ECS_MAPPINGS,
        ...composedOfTemplates,
        FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
        FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME,
      ]);
    });

    it('adds composed_of correctly for otel input packages of type traces', () => {
      const composedOfTemplates = [
        'traces-check@package',
        'traces@custom',
        OTEL_COMPONENT_TEMPLATE_TRACES_CUSTOM_MAPPINGS,
        'httpcheck@custom',
        'traces-check@custom',
      ];

      const template = getTemplate({
        templateIndexPattern: 'traces.otel-*',
        type: 'traces',
        packageName: 'otel-test',
        composedOfTemplates,
        templatePriority: 200,
        isOtelInputType: true,
      });
      expect(template.composed_of).toStrictEqual([
        OTEL_COMPONENT_TEMPLATE_MAPPINGS,
        OTEL_COMPONENT_TEMPLATE_SETTINGS,
        OTEL_COMPONENT_SEMCONV_RESOURCE_TO_ECS_MAPPINGS,
        OTEL_COMPONENT_TEMPLATE_TRACES_MAPPINGS,
        ...composedOfTemplates,
        FLEET_GLOBALS_COMPONENT_TEMPLATE_NAME,
        FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME,
      ]);
    });
  });

  describe('generateMappings', () => {
    it('tests loading base.yml', () => {
      const ymlPath = path.join(__dirname, '../../fields/tests/base.yml');
      const fieldsYML = readFileSync(ymlPath, 'utf-8');
      const fields: Field[] = parse(fieldsYML);

      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);

      expect(mappings).toMatchSnapshot(path.basename(ymlPath));
    });

    it('tests loading coredns.logs.yml', () => {
      const ymlPath = path.join(__dirname, '../../fields/tests/coredns.logs.yml');
      const fieldsYML = readFileSync(ymlPath, 'utf-8');
      const fields: Field[] = parse(fieldsYML);

      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);

      expect(mappings).toMatchSnapshot(path.basename(ymlPath));
    });

    it('tests loading system.yml', () => {
      const ymlPath = path.join(__dirname, '../../fields/tests/system.yml');
      const fieldsYML = readFileSync(ymlPath, 'utf-8');
      const fields: Field[] = parse(fieldsYML);
      const processedFields = processFields(fields);

      const mappings = generateMappings(processedFields);

      expect(mappings).toMatchSnapshot(path.basename(ymlPath));
    });

    it('tests loading cockroachdb_dynamic_templates.yml', () => {
      const ymlPath = path.join(__dirname, '../../fields/tests/cockroachdb_dynamic_templates.yml');
      const fieldsYML = readFileSync(ymlPath, 'utf-8');
      const fields: Field[] = parse(fieldsYML);
      const processedFields = processFields(fields);

      const mappings = generateMappings(processedFields);

      expect(mappings).toMatchSnapshot(path.basename(ymlPath));
    });

    it('tests processing long field with index false', () => {
      const longWithIndexFalseYml = `
- name: longIndexFalse
  type: long
  index: false
`;
      const longWithIndexFalseMapping = {
        properties: {
          longIndexFalse: {
            type: 'long',
            index: false,
          },
        },
      };
      const fields: Field[] = parse(longWithIndexFalseYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(longWithIndexFalseMapping);
    });

    it('tests processing keyword field with doc_values false', () => {
      const keywordWithIndexFalseYml = `
- name: keywordIndexFalse
  type: keyword
  doc_values: false
`;
      const keywordWithIndexFalseMapping = {
        properties: {
          keywordIndexFalse: {
            type: 'keyword',
            doc_values: false,
          },
        },
      };
      const fields: Field[] = parse(keywordWithIndexFalseYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(keywordWithIndexFalseMapping);
    });

    it('tests processing text field with store true', () => {
      const textWithStoreTrueYml = `
- name: someTextId
  type: text
  store: true
`;
      const textWithStoreTrueMapping = {
        properties: {
          someTextId: {
            type: 'text',
            store: true,
          },
        },
      };
      const fields: Field[] = parse(textWithStoreTrueYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(textWithStoreTrueMapping);
    });

    it('tests processing text field with multi fields', () => {
      const textWithMultiFieldsLiteralYml = `
- name: textWithMultiFields
  type: text
  multi_fields:
    - name: raw
      type: keyword
    - name: indexed
      type: text
`;
      const textWithMultiFieldsMapping = {
        properties: {
          textWithMultiFields: {
            type: 'text',
            fields: {
              raw: {
                ignore_above: 1024,
                type: 'keyword',
              },
              indexed: {
                type: 'text',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(textWithMultiFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(textWithMultiFieldsMapping);
    });

    it('tests processing keyword field with multi fields', () => {
      const keywordWithMultiFieldsLiteralYml = `
- name: keywordWithMultiFields
  type: keyword
  multi_fields:
    - name: raw
      type: keyword
    - name: indexed
      type: text
`;

      const keywordWithMultiFieldsMapping = {
        properties: {
          keywordWithMultiFields: {
            ignore_above: 1024,
            type: 'keyword',
            fields: {
              raw: {
                ignore_above: 1024,
                type: 'keyword',
              },
              indexed: {
                type: 'text',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(keywordWithMultiFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(keywordWithMultiFieldsMapping);
    });

    it('tests processing keyword field with multi fields with analyzed text field', () => {
      const keywordWithAnalyzedMultiFieldsLiteralYml = `
  - name: keywordWithAnalyzedMultiField
    type: keyword
    multi_fields:
      - name: analyzed
        type: text
        analyzer: autocomplete
        search_analyzer: standard
  `;

      const keywordWithAnalyzedMultiFieldsMapping = {
        properties: {
          keywordWithAnalyzedMultiField: {
            ignore_above: 1024,
            type: 'keyword',
            fields: {
              analyzed: {
                analyzer: 'autocomplete',
                search_analyzer: 'standard',
                type: 'text',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(keywordWithAnalyzedMultiFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(keywordWithAnalyzedMultiFieldsMapping);
    });

    it('tests processing keyword field with multi fields with normalized keyword field', () => {
      const keywordWithNormalizedMultiFieldsLiteralYml = `
  - name: keywordWithNormalizedMultiField
    type: keyword
    multi_fields:
      - name: normalized
        type: keyword
        normalizer: lowercase
  `;

      const keywordWithNormalizedMultiFieldsMapping = {
        properties: {
          keywordWithNormalizedMultiField: {
            ignore_above: 1024,
            type: 'keyword',
            fields: {
              normalized: {
                type: 'keyword',
                ignore_above: 1024,
                normalizer: 'lowercase',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(keywordWithNormalizedMultiFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(keywordWithNormalizedMultiFieldsMapping);
    });

    it('tests processing keyword field with multi fields with long field', () => {
      const keywordWithMultiFieldsLiteralYml = `
      - name: keywordWithMultiFields
        type: keyword
        multi_fields:
          - name: number_memory_devices
            type: long
            normalizer: lowercase
      `;

      const keywordWithMultiFieldsMapping = {
        properties: {
          keywordWithMultiFields: {
            ignore_above: 1024,
            type: 'keyword',
            fields: {
              number_memory_devices: {
                type: 'long',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(keywordWithMultiFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(keywordWithMultiFieldsMapping);
    });

    it('tests processing keyword field with multi fields with double field', () => {
      const keywordWithMultiFieldsLiteralYml = `
      - name: keywordWithMultiFields
        type: keyword
        multi_fields:
          - name: number
            type: double
            normalizer: lowercase
      `;

      const keywordWithMultiFieldsMapping = {
        properties: {
          keywordWithMultiFields: {
            ignore_above: 1024,
            type: 'keyword',
            fields: {
              number: {
                type: 'double',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(keywordWithMultiFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(keywordWithMultiFieldsMapping);
    });

    it('tests processing date field with format', () => {
      const dateWithFormatYml = `
- name: dateWithFormat
  type: date
  date_format: yyyy-MM-dd
`;

      const dateWithMapping = {
        properties: {
          dateWithFormat: {
            type: 'date',
            format: 'yyyy-MM-dd',
          },
        },
      };
      const fields: Field[] = parse(dateWithFormatYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(dateWithMapping);
    });

    it('tests processing wildcard field with multi fields', () => {
      const keywordWithMultiFieldsLiteralYml = `
- name: keywordWithMultiFields
  type: wildcard
  multi_fields:
    - name: raw
      type: keyword
    - name: indexed
      type: text
`;

      const keywordWithMultiFieldsMapping = {
        properties: {
          keywordWithMultiFields: {
            ignore_above: 1024,
            type: 'wildcard',
            fields: {
              raw: {
                ignore_above: 1024,
                type: 'keyword',
              },
              indexed: {
                type: 'text',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(keywordWithMultiFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(keywordWithMultiFieldsMapping);
    });

    it('tests processing wildcard field with multi fields with match_only_text type', () => {
      const wildcardWithMultiFieldsLiteralYml = `
- name: wildcardWithMultiFields
  type: wildcard
  multi_fields:
    - name: text
      type: match_only_text
`;

      const wildcardWithMultiFieldsMapping = {
        properties: {
          wildcardWithMultiFields: {
            ignore_above: 1024,
            type: 'wildcard',
            fields: {
              text: {
                type: 'match_only_text',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(wildcardWithMultiFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(wildcardWithMultiFieldsMapping);
    });

    it('tests processing object field with no other attributes', () => {
      const objectFieldLiteralYml = `
- name: objectField
  type: object
`;
      const objectFieldMapping = {
        properties: {
          objectField: {
            type: 'object',
          },
        },
      };
      const fields: Field[] = parse(objectFieldLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldMapping);
    });

    it('tests processing object field with enabled set to false', () => {
      const objectFieldEnabledFalseLiteralYml = `
- name: objectField
  type: object
  enabled: false
`;
      const objectFieldEnabledFalseMapping = {
        properties: {
          objectField: {
            type: 'object',
            enabled: false,
          },
        },
      };
      const fields: Field[] = parse(objectFieldEnabledFalseLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldEnabledFalseMapping);
    });

    it('tests processing object field with dynamic set to false', () => {
      const objectFieldDynamicFalseLiteralYml = `
- name: objectField
  type: object
  dynamic: false
`;
      const objectFieldDynamicFalseMapping = {
        properties: {
          objectField: {
            type: 'object',
            dynamic: false,
          },
        },
      };
      const fields: Field[] = parse(objectFieldDynamicFalseLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldDynamicFalseMapping);
    });

    it('tests processing object field with dynamic set to true', () => {
      const objectFieldDynamicTrueLiteralYml = `
- name: objectField
  type: object
  dynamic: true
`;
      const objectFieldDynamicTrueMapping = {
        properties: {
          objectField: {
            type: 'object',
            dynamic: true,
          },
        },
      };
      const fields: Field[] = parse(objectFieldDynamicTrueLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldDynamicTrueMapping);
    });

    it('tests processing object field with dynamic set to strict', () => {
      const objectFieldDynamicStrictLiteralYml = `
- name: objectField
  type: object
  dynamic: strict
`;
      const objectFieldDynamicStrictMapping = {
        properties: {
          objectField: {
            type: 'object',
            dynamic: 'strict',
          },
        },
      };
      const fields: Field[] = parse(objectFieldDynamicStrictLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldDynamicStrictMapping);
    });

    it('tests processing object field with property', () => {
      const objectFieldWithPropertyLiteralYml = `
- name: a
  type: object
- name: a.b
  type: keyword
  `;
      const objectFieldWithPropertyMapping = {
        properties: {
          a: {
            properties: {
              b: {
                ignore_above: 1024,
                type: 'keyword',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(objectFieldWithPropertyLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldWithPropertyMapping);
    });

    it('tests processing object field with property, reverse order', () => {
      const objectFieldWithPropertyReversedLiteralYml = `
- name: a.b
  type: keyword
- name: a
  type: object
  dynamic: false
  `;
      const objectFieldWithPropertyReversedMapping = {
        properties: {
          a: {
            dynamic: false,
            properties: {
              b: {
                ignore_above: 1024,
                type: 'keyword',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(objectFieldWithPropertyReversedLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldWithPropertyReversedMapping);
    });

    it('tests processing object field with more specific properties without wildcard', () => {
      const objectFieldWithPropertyReversedLiteralYml = `
- name: labels
  type: object
  object_type: keyword
  object_type_mapping_type: '*'
- name: labels.count
  type: long
`;
      const objectFieldWithPropertyReversedMapping = {
        dynamic_templates: [
          {
            labels: {
              path_match: 'labels.*',
              match_mapping_type: '*',
              mapping: {
                type: 'keyword',
              },
            },
          },
        ],
        properties: {
          labels: {
            dynamic: true,
            type: 'object',
            properties: {
              count: {
                type: 'long',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(objectFieldWithPropertyReversedLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldWithPropertyReversedMapping);
    });

    it('tests processing object field with more specific properties with wildcard', () => {
      const objectFieldWithPropertyReversedLiteralYml = `
- name: labels.*
  type: object
  object_type: keyword
  object_type_mapping_type: '*'
- name: labels.count
  type: long
`;
      const objectFieldWithPropertyReversedMapping = {
        dynamic_templates: [
          {
            'labels.*': {
              path_match: 'labels.*',
              match_mapping_type: '*',
              mapping: {
                type: 'keyword',
              },
            },
          },
        ],
        properties: {
          labels: {
            dynamic: true,
            type: 'object',
            properties: {
              count: {
                type: 'long',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(objectFieldWithPropertyReversedLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldWithPropertyReversedMapping);
    });

    it('tests processing object field with subobjects set to false (case B)', () => {
      const objectFieldWithPropertyReversedLiteralYml = `
- name: b.labels.*
  type: object
  object_type: keyword
  subobjects: false
  `;
      const objectFieldWithPropertyReversedMapping = {
        dynamic_templates: [
          {
            'b.labels.*': {
              path_match: 'b.labels.*',
              match_mapping_type: 'string',
              mapping: {
                type: 'keyword',
              },
            },
          },
        ],
        properties: {
          b: {
            type: 'object',
            dynamic: true,
            properties: {
              labels: {
                dynamic: true,
                type: 'object',
                subobjects: false,
              },
            },
          },
        },
      };
      const fields: Field[] = parse(objectFieldWithPropertyReversedLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldWithPropertyReversedMapping);
    });

    it('tests processing object field with subobjects set to false (case D)', () => {
      const objectFieldWithPropertyReversedLiteralYml = `
- name: d.labels
  type: object
  object_type: keyword
  subobjects: false
  `;
      const objectFieldWithPropertyReversedMapping = {
        dynamic_templates: [
          {
            'd.labels': {
              path_match: 'd.labels.*',
              match_mapping_type: 'string',
              mapping: {
                type: 'keyword',
              },
            },
          },
        ],
        properties: {
          d: {
            type: 'object',
            dynamic: true,
            properties: {
              labels: {
                dynamic: true,
                type: 'object',
                subobjects: false,
              },
            },
          },
        },
      };
      const fields: Field[] = parse(objectFieldWithPropertyReversedLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(objectFieldWithPropertyReversedMapping);
    });

    it('tests processing nested field with property', () => {
      const nestedYaml = `
  - name: a.b
    type: keyword
  - name: a
    type: nested
    dynamic: false
    `;
      const expectedMapping = {
        properties: {
          a: {
            dynamic: false,
            type: 'nested',
            properties: {
              b: {
                ignore_above: 1024,
                type: 'keyword',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(nestedYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests processing nested field with property, nested field first', () => {
      const nestedYaml = `
  - name: a
    type: nested
    include_in_parent: true
  - name: a.b
    type: keyword
    `;
      const expectedMapping = {
        properties: {
          a: {
            include_in_parent: true,
            type: 'nested',
            properties: {
              b: {
                ignore_above: 1024,
                type: 'keyword',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(nestedYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests processing nested field with subobject, nested field first', () => {
      const nestedYaml = `
  - name: a
    type: nested
    include_in_parent: true
  - name: a.b
    type: group
    fields:
      - name: c
        type: keyword
    `;
      const expectedMapping = {
        properties: {
          a: {
            include_in_parent: true,
            type: 'nested',
            properties: {
              b: {
                properties: {
                  c: {
                    ignore_above: 1024,
                    type: 'keyword',
                  },
                },
              },
            },
          },
        },
      };
      const fields: Field[] = parse(nestedYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests processing nested field with subfields', () => {
      const nestedYaml = `
  - name: a
    type: nested
    include_in_parent: true
    fields:
    - name: b
      type: keyword
    `;
      const expectedMapping = {
        properties: {
          a: {
            include_in_parent: true,
            type: 'nested',
            properties: {
              b: {
                ignore_above: 1024,
                type: 'keyword',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(nestedYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests processing nested field with subobjects', () => {
      const nestedYaml = `
  - name: a
    type: nested
    include_in_parent: true
    fields:
    - name: b
      type: group
      fields:
      - name: c
        type: keyword
    `;
      const expectedMapping = {
        properties: {
          a: {
            include_in_parent: true,
            type: 'nested',
            properties: {
              b: {
                properties: {
                  c: {
                    ignore_above: 1024,
                    type: 'keyword',
                  },
                },
              },
            },
          },
        },
      };
      const fields: Field[] = parse(nestedYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests processing nested leaf field with properties', () => {
      const nestedYaml = `
  - name: a
    type: object
    dynamic: false
  - name: a.b
    type: nested
    enabled: false
    `;
      const expectedMapping = {
        properties: {
          a: {
            dynamic: false,
            properties: {
              b: {
                enabled: false,
                type: 'nested',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(nestedYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests constant_keyword field type handling', () => {
      const constantKeywordLiteralYaml = `
- name: constantKeyword
  type: constant_keyword
  `;
      const constantKeywordMapping = {
        properties: {
          constantKeyword: {
            type: 'constant_keyword',
          },
        },
      };
      const fields: Field[] = parse(constantKeywordLiteralYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(JSON.stringify(mappings)).toEqual(JSON.stringify(constantKeywordMapping));
    });

    it('tests constant_keyword field type with value', () => {
      const constantKeywordLiteralYaml = `
- name: constantKeyword
  type: constant_keyword
  value: always_the_same
  `;
      const constantKeywordMapping = {
        properties: {
          constantKeyword: {
            type: 'constant_keyword',
            value: 'always_the_same',
          },
        },
      };
      const fields: Field[] = parse(constantKeywordLiteralYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(JSON.stringify(mappings)).toEqual(JSON.stringify(constantKeywordMapping));
    });

    it('tests processing dimension field on a keyword', () => {
      const literalYml = `
- name: example.id
  type: keyword
  dimension: true
  `;
      const expectedMapping = {
        properties: {
          example: {
            properties: {
              id: {
                time_series_dimension: true,
                type: 'keyword',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(literalYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields, true);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests processing dimension field on a keyword - tsdb disabled', () => {
      const literalYml = `
- name: example.id
  type: keyword
  dimension: true
  `;
      const expectedMapping = {
        properties: {
          example: {
            properties: {
              id: {
                type: 'keyword',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(literalYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields, false);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests processing dimension field on a long', () => {
      const literalYml = `
- name: example.id
  type: long
  dimension: true
  `;
      const expectedMapping = {
        properties: {
          example: {
            properties: {
              id: {
                time_series_dimension: true,
                type: 'long',
              },
            },
          },
        },
      };
      const fields: Field[] = parse(literalYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields, true);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests processing metric_type field', () => {
      const literalYml = `
- name: total.norm.pct
  type: scaled_float
  metric_type: gauge
  unit: percent
  format: percent
`;
      const expectedMapping = {
        properties: {
          total: {
            properties: {
              norm: {
                properties: {
                  pct: {
                    scaling_factor: 1000,
                    type: 'scaled_float',
                    meta: {
                      unit: 'percent',
                    },
                    time_series_metric: 'gauge',
                  },
                },
              },
            },
          },
        },
      };
      const fields: Field[] = parse(literalYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields, true);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests processing metric_type field - tsdb disabled', () => {
      const literalYml = `
- name: total.norm.pct
  type: scaled_float
  metric_type: gauge
  unit: percent
  format: percent
`;
      const expectedMapping = {
        properties: {
          total: {
            properties: {
              norm: {
                properties: {
                  pct: {
                    scaling_factor: 1000,
                    type: 'scaled_float',
                    meta: {
                      unit: 'percent',
                    },
                  },
                },
              },
            },
          },
        },
      };
      const fields: Field[] = parse(literalYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields, false);
      expect(mappings).toEqual(expectedMapping);
    });

    it('tests processing metric_type field with long field', () => {
      const literalYml = `
    - name: total
      type: long
      format: bytes
      unit: byte
      metric_type: gauge
      description: |
        Total swap memory.
`;
      const expectedMapping = {
        properties: {
          total: {
            type: 'long',
            meta: {
              unit: 'byte',
            },
            time_series_metric: 'gauge',
          },
        },
      };
      const fields: Field[] = parse(literalYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields, true);
      expect(mappings).toEqual(expectedMapping);
    });

    it('processes meta fields', () => {
      const metaFieldLiteralYaml = `
- name: fieldWithMetas
  type: integer
  unit: byte
  `;
      const metaFieldMapping = {
        properties: {
          fieldWithMetas: {
            type: 'long',
            meta: {
              unit: 'byte',
            },
          },
        },
      };
      const fields: Field[] = parse(metaFieldLiteralYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(JSON.stringify(mappings)).toEqual(JSON.stringify(metaFieldMapping));
    });

    it('processes grouped meta fields', () => {
      const metaFieldLiteralYaml = `
- name: groupWithMetas
  type: group
  unit: byte
  fields:
    - name: fieldA
      type: integer
      unit: byte
    - name: fieldB
      type: integer
      unit: byte
  `;
      const metaFieldMapping = {
        properties: {
          groupWithMetas: {
            properties: {
              fieldA: {
                type: 'long',
                meta: {
                  unit: 'byte',
                },
              },
              fieldB: {
                type: 'long',
                meta: {
                  unit: 'byte',
                },
              },
            },
          },
        },
      };
      const fields: Field[] = parse(metaFieldLiteralYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(JSON.stringify(mappings)).toEqual(JSON.stringify(metaFieldMapping));
    });

    it('tests processing field of aggregate_metric_double type', () => {
      const fieldLiteralYaml = `
    - name: aggregate_metric
      type: aggregate_metric_double
      metrics: ["min", "max", "sum", "value_count"]
      default_metric: "max"
    `;
      const fieldMapping = {
        properties: {
          aggregate_metric: {
            metrics: ['min', 'max', 'sum', 'value_count'],
            default_metric: 'max',
            type: 'aggregate_metric_double',
          },
        },
      };
      const fields: Field[] = parse(fieldLiteralYaml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(JSON.stringify(mappings)).toEqual(JSON.stringify(fieldMapping));
    });

    it('tests processing runtime fields without script', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: runtime_field
  type: boolean
  runtime: true
`;
      const runtimeFieldMapping = {
        properties: {},
        runtime: {
          runtime_field: {
            type: 'boolean',
          },
        },
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    it('tests processing runtime fields with painless script', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: day_of_week
  type: date
  runtime: |
    emit(doc['@timestamp'].value.dayOfWeekEnum.getDisplayName(TextStyle.FULL, Locale.ROOT))
`;
      const runtimeFieldMapping = {
        properties: {},
        runtime: {
          day_of_week: {
            type: 'date',
            script: {
              source:
                "emit(doc['@timestamp'].value.dayOfWeekEnum.getDisplayName(TextStyle.FULL, Locale.ROOT))",
            },
          },
        },
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    it('tests processing runtime fields defined in a group', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: responses
  type: group
  fields:
    - name: day_of_week
      type: date
      date_format: date_optional_time
      runtime: |
        emit(doc['@timestamp'].value.dayOfWeekEnum.getDisplayName(TextStyle.FULL, Locale.ROOT))
`;
      const runtimeFieldMapping = {
        properties: {},
        runtime: {
          'responses.day_of_week': {
            type: 'date',
            format: 'date_optional_time',
            script: {
              source:
                "emit(doc['@timestamp'].value.dayOfWeekEnum.getDisplayName(TextStyle.FULL, Locale.ROOT))",
            },
          },
        },
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    it('tests processing runtime fields in a dynamic template', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: labels.*
  type: keyword
  runtime: true
`;
      const runtimeFieldMapping = {
        properties: {
          labels: {
            type: 'object',
            dynamic: true,
          },
        },
        dynamic_templates: [
          {
            'labels.*': {
              match_mapping_type: 'string',
              path_match: 'labels.*',
              runtime: {
                type: 'keyword',
              },
            },
          },
        ],
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    it('tests processing store true in a dynamic template', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: messages.*
  type: text
  store: true
`;
      const runtimeFieldMapping = {
        properties: {
          messages: {
            type: 'object',
            dynamic: true,
          },
        },
        dynamic_templates: [
          {
            'messages.*': {
              match_mapping_type: 'string',
              path_match: 'messages.*',
              mapping: {
                type: 'text',
                store: true,
              },
            },
          },
        ],
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    it('tests processing dimension fields on a dynamic template object', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: labels.*
  type: object
  object_type: keyword
  dimension: true
`;
      const runtimeFieldMapping = {
        properties: {
          labels: {
            type: 'object',
            dynamic: true,
          },
        },
        dynamic_templates: [
          {
            'labels.*': {
              match_mapping_type: 'string',
              path_match: 'labels.*',
              mapping: {
                type: 'keyword',
                time_series_dimension: true,
              },
            },
          },
        ],
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields, true);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    it('tests processing dimension fields on a dynamic template field', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: labels.*
  type: keyword
  dimension: true
`;
      const runtimeFieldMapping = {
        properties: {
          labels: {
            type: 'object',
            dynamic: true,
          },
        },
        dynamic_templates: [
          {
            'labels.*': {
              match_mapping_type: 'string',
              path_match: 'labels.*',
              mapping: {
                type: 'keyword',
                time_series_dimension: true,
              },
            },
          },
        ],
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields, true);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    it('tests processing scaled_float fields in a dynamic template', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: numeric_labels
  type: object
  object_type: scaled_float
`;
      const runtimeFieldMapping = {
        properties: {
          numeric_labels: {
            type: 'object',
            dynamic: true,
          },
        },
        dynamic_templates: [
          {
            numeric_labels: {
              match_mapping_type: '*',
              path_match: 'numeric_labels.*',
              mapping: {
                type: 'scaled_float',
                scaling_factor: 1000,
              },
            },
          },
        ],
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    it('tests processing aggregate_metric_double fields in a dynamic template', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: aggregate.*
  type: aggregate_metric_double
  metrics: ["min", "max", "sum", "value_count"]
  default_metric: "max"
`;
      const runtimeFieldMapping = {
        properties: {
          aggregate: {
            type: 'object',
            dynamic: true,
          },
        },
        dynamic_templates: [
          {
            'aggregate.*': {
              match_mapping_type: '*',
              path_match: 'aggregate.*',
              mapping: {
                type: 'aggregate_metric_double',
                metrics: ['min', 'max', 'sum', 'value_count'],
                default_metric: 'max',
              },
            },
          },
        ],
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    it('tests processing group sub fields in a dynamic template', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: group.*.network
  type: group
  fields:
  - name: bytes
    type: integer
    metric_type: counter
`;
      const runtimeFieldMapping = {
        properties: {
          group: {
            type: 'object',
            dynamic: true,
          },
        },
        dynamic_templates: [
          {
            'group.*.network.bytes': {
              match_mapping_type: 'long',
              path_match: 'group.*.network.bytes',
              mapping: {
                type: 'long',
                time_series_metric: 'counter',
              },
            },
          },
          {
            'group.*.network': {
              path_match: 'group.*.network',
              match_mapping_type: 'object',
              mapping: {
                type: 'object',
                dynamic: true,
              },
            },
          },
          {
            'group.*': {
              path_match: 'group.*',
              match_mapping_type: 'object',
              mapping: {
                type: 'object',
                dynamic: true,
              },
            },
          },
        ],
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields, true);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    it('tests processing dynamic templates priority of intermediate objects', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: group.*.value
  type: object
  object_type: double
  object_type_mapping_type: "*"
  metric_type: gauge
- name: group.*.histogram
  type: object
  object_type: histogram
  object_type_mapping_type: "*"
`;
      const runtimeFieldMapping = {
        properties: {
          group: {
            type: 'object',
            dynamic: true,
          },
        },
        dynamic_templates: [
          {
            'group.*.value': {
              match_mapping_type: '*',
              path_match: 'group.*.value',
              mapping: {
                time_series_metric: 'gauge',
                type: 'double',
              },
            },
          },
          {
            'group.*.histogram': {
              path_match: 'group.*.histogram',
              match_mapping_type: '*',
              mapping: {
                type: 'histogram',
              },
            },
          },
          {
            'group.*': {
              path_match: 'group.*',
              match_mapping_type: 'object',
              mapping: {
                type: 'object',
                dynamic: true,
              },
            },
          },
        ],
      };
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields, true);
      expect(mappings).toEqual(runtimeFieldMapping);
    });

    // TODO(#270746): this test documents a known bug — the intermediate object
    // template "a.*.b" is incorrectly dropped when two sibling wildcard fields
    // share it. See the TODO in MappingsBuilder.addDynamicTemplate for details.
    it.skip('tests that sibling wildcard fields sharing a deep intermediate object preserve all dynamic templates', () => {
      const yml = `
- name: a.*.b.value
  type: object
  object_type: keyword
- name: a.*.b.other
  type: object
  object_type: keyword
`;
      const fields: Field[] = parse(yml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      // "a.*.b" is an intermediate wildcard object shared by both fields.
      // It should appear once in dynamic_templates, and both leaf templates
      // should be present. The stale-index bug (#270746) in addDynamicTemplate
      // causes "a.*.b.other" to be dropped and "a.*" to appear twice instead.
      expect(mappings.dynamic_templates).toEqual([
        {
          'a.*.b.value': {
            path_match: 'a.*.b.value',
            match_mapping_type: 'string',
            mapping: { type: 'keyword' },
          },
        },
        {
          'a.*.b.other': {
            path_match: 'a.*.b.other',
            match_mapping_type: 'string',
            mapping: { type: 'keyword' },
          },
        },
        {
          'a.*.b': {
            path_match: 'a.*.b',
            match_mapping_type: 'object',
            mapping: { type: 'object', dynamic: true },
          },
        },
        {
          'a.*': {
            path_match: 'a.*',
            match_mapping_type: 'object',
            mapping: { type: 'object', dynamic: true },
          },
        },
      ]);
    });

    it('tests unexpected type for field as dynamic template fails', () => {
      const textWithRuntimeFieldsLiteralYml = `
- name: labels.*
  type: object
  object_type: constant_keyword
`;
      const fields: Field[] = parse(textWithRuntimeFieldsLiteralYml);
      expect(() => {
        const processedFields = processFields(fields);
        generateMappings(processedFields);
      }).toThrow();
    });

    it('tests processing flattened field with ignore_above 1024', () => {
      const flattenedFieldYml = `
- name: flattenedField
  type: flattened
  ignore_above: 1024
`;
      const flattenedFieldMapping = {
        properties: {
          flattenedField: {
            type: 'flattened',
            ignore_above: 1024,
          },
        },
      };
      const fields: Field[] = parse(flattenedFieldYml);
      const processedFields = processFields(fields);
      const mappings = generateMappings(processedFields);
      expect(mappings).toEqual(flattenedFieldMapping);
    });
  });

  describe('generateTemplateIndexPattern and getTemplatePriority', () => {
    it('tests priority and index pattern for data stream without dataset_is_prefix', () => {
      const dataStreamDatasetIsPrefixUnset = {
        type: 'metrics',
        dataset: 'package.dataset',
        title: 'test data stream',
        release: 'experimental',
        package: 'package',
        path: 'path',
        ingest_pipeline: 'default',
      } as RegistryDataStream;
      const templateIndexPatternDatasetIsPrefixUnset = 'metrics-package.dataset-*';
      const templatePriorityDatasetIsPrefixUnset = 200;
      const templateIndexPattern = generateTemplateIndexPattern(dataStreamDatasetIsPrefixUnset);
      const templatePriority = getTemplatePriority(dataStreamDatasetIsPrefixUnset);

      expect(templateIndexPattern).toEqual(templateIndexPatternDatasetIsPrefixUnset);
      expect(templatePriority).toEqual(templatePriorityDatasetIsPrefixUnset);
    });

    it('tests priority and index pattern for data stream with dataset_is_prefix set to false', () => {
      const dataStreamDatasetIsPrefixFalse = {
        type: 'metrics',
        dataset: 'package.dataset',
        title: 'test data stream',
        release: 'experimental',
        package: 'package',
        path: 'path',
        ingest_pipeline: 'default',
        dataset_is_prefix: false,
      } as RegistryDataStream;
      const templateIndexPatternDatasetIsPrefixFalse = 'metrics-package.dataset-*';
      const templatePriorityDatasetIsPrefixFalse = 200;
      const templateIndexPattern = generateTemplateIndexPattern(dataStreamDatasetIsPrefixFalse);
      const templatePriority = getTemplatePriority(dataStreamDatasetIsPrefixFalse);

      expect(templateIndexPattern).toEqual(templateIndexPatternDatasetIsPrefixFalse);
      expect(templatePriority).toEqual(templatePriorityDatasetIsPrefixFalse);
    });

    it('tests priority and index pattern for data stream with dataset_is_prefix set to true', () => {
      const dataStreamDatasetIsPrefixTrue = {
        type: 'metrics',
        dataset: 'package.dataset',
        title: 'test data stream',
        release: 'experimental',
        package: 'package',
        path: 'path',
        ingest_pipeline: 'default',
        dataset_is_prefix: true,
      } as RegistryDataStream;
      const templateIndexPatternDatasetIsPrefixTrue = 'metrics-package.dataset.*-*';
      const templatePriorityDatasetIsPrefixTrue = 150;
      const templateIndexPattern = generateTemplateIndexPattern(dataStreamDatasetIsPrefixTrue);
      const templatePriority = getTemplatePriority(dataStreamDatasetIsPrefixTrue);

      expect(templateIndexPattern).toEqual(templateIndexPatternDatasetIsPrefixTrue);
      expect(templatePriority).toEqual(templatePriorityDatasetIsPrefixTrue);
    });

    it('generates correct index pattern when isOtelInputType true', () => {
      const dataStreamDatasetIsPrefixFalse = {
        type: 'metrics',
        dataset: 'package.dataset',
        title: 'test data stream',
        release: 'experimental',
        package: 'package',
        path: 'path',
        ingest_pipeline: 'default',
        dataset_is_prefix: false,
      } as RegistryDataStream;

      const templateIndexPattern = generateTemplateIndexPattern(
        dataStreamDatasetIsPrefixFalse,
        true
      );

      expect(templateIndexPattern).toEqual(`metrics-package.dataset.otel-*`);
    });
  });

  describe('updateCurrentWriteIndices', () => {
    it('update all the index matching, index template index pattern', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: { properties: {} },
        },
      } as any);
      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'test',
          indexTemplate: {
            index_patterns: ['test.*-*'],
            template: {
              settings: { index: {} },
              mappings: { properties: {} },
            },
          } as any,
        },
      ]);
      expect(esClient.indices.getDataStream).toBeCalledWith({
        name: 'test.*-*',
        expand_wildcards: ['open', 'hidden'],
      });
      const putMappingsCall = esClient.indices.putMapping.mock.calls.map(([{ index }]) => index);
      expect(putMappingsCall).toHaveLength(1);
      expect(putMappingsCall[0]).toBe('test.prefix1-default');
    });
    it('update non replicated datastream', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [
          { name: 'test-non-replicated' },
          { name: 'test-replicated', replicated: true },
        ],
      } as any);

      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: { properties: {} },
          lifecycle: {
            data_retention: '7d',
          },
        },
      } as any);

      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'test',
          indexTemplate: {
            index_patterns: ['test-*'],
            template: {
              settings: { index: {} },
              mappings: { properties: {} },
            },
          } as any,
        },
      ]);

      const putMappingsCall = esClient.indices.putMapping.mock.calls.map(([{ index }]) => index);
      expect(putMappingsCall).toHaveLength(1);
      expect(putMappingsCall[0]).toBe('test-non-replicated');

      const putDatastreamLifecycleCalls = esClient.transport.request.mock.calls;
      expect(putDatastreamLifecycleCalls).toHaveLength(1);
      expect(putDatastreamLifecycleCalls[0][0]).toEqual({
        method: 'PUT',
        path: '_data_stream/test-non-replicated/_lifecycle',
        body: {
          data_retention: '7d',
        },
      });
    });

    it('should fill constant keywords from previous mappings', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();

      esClient.indices.getDataStream.mockResponse({
        data_streams: [
          {
            name: 'test-constant.keyword-default',
            indices: [
              { index_name: '.ds-test-constant.keyword-default-0001' },
              { index_name: '.ds-test-constant.keyword-default-0002' },
            ],
          },
        ],
      } as any);

      esClient.indices.get.mockResponse({
        'test-constant.keyword-default': {
          mappings: {
            properties: {
              some_keyword_field: {
                type: 'constant_keyword',
              },
            },
          },
        },
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: {
            properties: {
              some_keyword_field: {
                type: 'constant_keyword',
                value: 'some_value',
              },
            },
          },
        },
      } as any);
      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'test',
          indexTemplate: {
            index_patterns: ['test-constant.keyword-*'],
            template: {
              template: {
                settings: { index: {} },
                mappings: { properties: {} },
              },
            },
          } as any,
        },
      ]);
      expect(esClient.indices.get).toBeCalledWith({
        index: '.ds-test-constant.keyword-default-0002',
      });
      const putMappingsCalls = esClient.indices.putMapping.mock.calls;
      expect(putMappingsCalls).toHaveLength(1);
      expect(putMappingsCalls[0][0]).toEqual({
        index: 'test-constant.keyword-default',
        properties: {
          some_keyword_field: {
            type: 'constant_keyword',
            value: 'some_value',
          },
        },
        write_index_only: true,
      });
    });

    it('should not error when previous mappings are not found', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test-constant.keyword-default' }],
      } as any);
      esClient.indices.get.mockResponse({
        'test-constant.keyword-default': {
          mappings: {
            properties: {
              some_keyword_field: {
                type: 'constant_keyword',
              },
            },
          },
        },
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {},
      } as any);
      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'test',
          indexTemplate: {
            index_patterns: ['test-constant.keyword-*'],
            template: {
              template: {
                settings: { index: {} },
                mappings: { properties: {} },
              },
            },
          } as any,
        },
      ]);
      const putMappingsCalls = esClient.indices.putMapping.mock.calls;
      expect(putMappingsCalls).toHaveLength(1);
      expect(putMappingsCalls[0][0]).toEqual({
        index: 'test-constant.keyword-default',
        write_index_only: true,
      });
    });

    it('should rollover on expected error', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.simulateTemplate.mockImplementation(() => {
        throw new errors.ResponseError({
          statusCode: 400,
          body: {
            error: {
              type: 'illegal_argument_exception',
            },
          },
        } as any);
      });
      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'test',
          indexTemplate: {
            index_patterns: ['test.*-*'],
            template: {
              settings: { index: {} },
              mappings: { properties: {} },
            },
          } as any,
        },
      ]);

      expect(esClient.transport.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test.prefix1-default/_rollover',
          querystring: {
            lazy: true,
          },
        })
      );
    });

    it('should rollover on expected error when field subobjects in mappings changed', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.get.mockResponse({
        'test.prefix1-default': {
          mappings: {},
        },
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: { subobjects: false },
        },
      } as any);
      esClient.indices.putMapping.mockImplementation(() => {
        throw new errors.ResponseError({
          body: {
            error: {
              message:
                'mapper_exception\n' +
                '\tRoot causes:\n' +
                "\t\tmapper_exception: the [subobjects] parameter can't be updated for the object mapping [_doc]",
            },
          },
        } as any);
      });

      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'test',
          indexTemplate: {
            index_patterns: ['test.*-*'],
            template: {
              settings: { index: {} },
              mappings: {},
            },
          } as any,
        },
      ]);

      expect(esClient.transport.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test.prefix1-default/_rollover',
          querystring: {
            lazy: true,
          },
        })
      );
    });
    it('should rollover on mapper exception with subobjects in reason', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.get.mockResponse({
        'test.prefix1-default': {
          mappings: {},
        },
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: {},
        },
      } as any);
      esClient.indices.putMapping.mockImplementation(() => {
        throw new errors.ResponseError({
          body: {
            error: {
              type: 'mapper_exception',
              reason:
                "the [subobjects] parameter can't be updated for the object mapping [okta.debug_context.debug_data]",
            },
          },
        } as any);
      });

      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'test',
          indexTemplate: {
            index_patterns: ['test.*-*'],
            template: {
              settings: { index: {} },
              mappings: {},
            },
          } as any,
        },
      ]);

      expect(esClient.transport.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test.prefix1-default/_rollover',
          querystring: {
            lazy: true,
          },
        })
      );
    });

    it('should rollover on mapper exception that change enabled object mappings', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.get.mockResponse({
        'test.prefix1-default': {
          mappings: {},
        },
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: {},
        },
      } as any);
      esClient.indices.putMapping.mockImplementation(() => {
        throw new errors.ResponseError({
          body: {
            error: {
              type: 'mapper_exception',
              reason: `Mappings update for logs-cisco_ise.log-default failed due to ResponseError: mapper_exception
 	Root causes:
		mapper_exception: the [enabled] parameter can't be updated for the object mapping [cisco_ise.log.cisco_av_pair]`,
            },
          },
        } as any);
      });

      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'test',
          indexTemplate: {
            index_patterns: ['test.*-*'],
            template: {
              settings: { index: {} },
              mappings: {},
            },
          } as any,
        },
      ]);

      expect(esClient.transport.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test.prefix1-default/_rollover',
          querystring: {
            lazy: true,
          },
        })
      );
    });

    it('should skip rollover on expected error when flag is on', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.simulateTemplate.mockImplementation(() => {
        throw new errors.ResponseError({
          statusCode: 400,
          body: {
            error: {
              type: 'illegal_argument_exception',
            },
          },
        } as any);
      });
      const logger = loggerMock.create();
      await updateCurrentWriteIndices(
        esClient,
        logger,
        [
          {
            templateName: 'test',
            indexTemplate: {
              index_patterns: ['test.*-*'],
              template: {
                settings: { index: {} },
                mappings: { properties: {} },
              },
            } as any,
          },
        ],
        {
          skipDataStreamRollover: true,
        }
      );

      expect(esClient.indices.rollover).not.toHaveBeenCalled();
    });
    it('should not rollover on total_fields limit error and should throw', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.simulateTemplate.mockImplementation(() => {
        throw new errors.ResponseError({
          statusCode: 400,
          body: {
            error: {
              type: 'illegal_argument_exception',
              reason: 'Limit of total fields [2500] has been exceeded',
            },
          },
        } as any);
      });
      const logger = loggerMock.create();
      await expect(
        updateCurrentWriteIndices(esClient, logger, [
          {
            templateName: 'test',
            indexTemplate: {
              index_patterns: ['test.*-*'],
              template: {
                settings: { index: {} },
                mappings: { properties: {} },
              },
            } as any,
          },
        ])
      ).rejects.toThrow();

      // Rollover must NOT be triggered for total_fields errors — it cannot fix them.
      expect(esClient.transport.request).not.toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test.prefix1-default/_rollover' })
      );
    });

    it('should not rollover on total_fields limit error and should not throw when ignoreMappingUpdateErrors is set', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.simulateTemplate.mockImplementation(() => {
        throw new errors.ResponseError({
          statusCode: 400,
          body: {
            error: {
              type: 'illegal_argument_exception',
              reason: 'Limit of total fields [2500] has been exceeded',
            },
          },
        } as any);
      });
      const logger = loggerMock.create();
      await expect(
        updateCurrentWriteIndices(
          esClient,
          logger,
          [
            {
              templateName: 'test',
              indexTemplate: {
                index_patterns: ['test.*-*'],
                template: {
                  settings: { index: {} },
                  mappings: { properties: {} },
                },
              } as any,
            },
          ],
          { ignoreMappingUpdateErrors: true }
        )
      ).resolves.not.toThrow();

      expect(esClient.transport.request).not.toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test.prefix1-default/_rollover' })
      );
    });

    it('should not rollover on unexpected error', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.simulateTemplate.mockImplementation(() => {
        throw new Error();
      });
      const logger = loggerMock.create();
      try {
        await updateCurrentWriteIndices(esClient, logger, [
          {
            templateName: 'test',
            indexTemplate: {
              index_patterns: ['test.*-*'],
              template: {
                settings: { index: {} },
                mappings: { properties: {} },
              },
            } as any,
          },
        ]);
        fail('expected updateCurrentWriteIndices to throw error');
      } catch (err) {
        // noop
      }

      expect(esClient.indices.rollover).not.toHaveBeenCalled();
    });
    it('should not throw on unexpected error when flag is on', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.simulateTemplate.mockImplementation(() => {
        throw new Error();
      });
      const logger = loggerMock.create();
      await updateCurrentWriteIndices(
        esClient,
        logger,
        [
          {
            templateName: 'test',
            indexTemplate: {
              index_patterns: ['test.*-*'],
              template: {
                settings: { index: {} },
                mappings: { properties: {} },
              },
            } as any,
          },
        ],
        {
          ignoreMappingUpdateErrors: true,
        }
      );

      expect(esClient.indices.rollover).not.toHaveBeenCalled();
    });

    it('should rollover on dynamic dimension mappings changed', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.get.mockResponse({
        'test.prefix1-default': {
          mappings: {},
        },
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: {
            dynamic_templates: [
              { 'prometheus.labels.*': { mapping: { time_series_dimension: true } } },
            ],
          },
        },
      } as any);

      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'test',
          indexTemplate: {
            index_patterns: ['test.*-*'],
            template: {
              settings: { index: {} },
              mappings: {},
            },
          } as any,
        },
      ]);

      expect(esClient.transport.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test.prefix1-default/_rollover',
          querystring: {
            lazy: true,
          },
        })
      );
    });

    it('should not rollover on dynamic dimension mappings not changed', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'test.prefix1-default' }],
      } as any);
      esClient.indices.get.mockResponse({
        'test.prefix1-default': {
          mappings: {
            dynamic_templates: [
              { 'prometheus.labels.*': { mapping: { time_series_dimension: true } } },
              { 'prometheus.test.*': { mapping: { time_series_dimension: true } } },
            ],
          },
        },
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: {
            dynamic_templates: [
              { 'prometheus.test.*': { mapping: { time_series_dimension: true } } },
              { 'prometheus.labels.*': { mapping: { time_series_dimension: true } } },
            ],
          },
        },
      } as any);

      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'test',
          indexTemplate: {
            index_patterns: ['test.*-*'],
            template: {
              settings: { index: {} },
              mappings: {},
            },
          } as any,
        },
      ]);

      expect(esClient.transport.request).not.toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test.prefix1-default/_rollover',
          querystring: {
            lazy: true,
          },
        })
      );
    });

    it('should not rollover when package do not define index mode and defaut source mode is logsdb', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'logs.prefix1-default' }],
      } as any);
      esClient.indices.get.mockResponse({
        'logs.prefix1-default': {
          mappings: {},
          settings: {
            index: {
              mode: 'logsdb',
              mapping: {
                source: {
                  mode: 'STORED',
                },
              },
            },
          },
        },
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: {},
        },
      } as any);

      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'logs.prefix1',
          indexTemplate: {
            index_patterns: ['logs.prefix1-*'],
            template: {
              settings: { index: {} },
              mappings: {},
            },
          } as any,
        },
      ]);

      expect(esClient.transport.request).not.toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test.prefix1-default/_rollover',
          querystring: {
            lazy: true,
          },
        })
      );
    });

    it('should complete successfully when packageInstallation.maxConcurrentDatastreamOperations is set in config', async () => {
      appContextService.start(
        createAppContextStartContractMock({
          packageInstallation: { maxConcurrentDatastreamOperations: 5 },
        })
      );

      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'logs.prefix1-default' }],
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: { properties: {} },
        },
      } as any);

      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'logs.prefix1',
          indexTemplate: {
            index_patterns: ['logs.prefix1-*'],
            template: {
              settings: { index: {} },
              mappings: { properties: {} },
            },
          } as any,
        },
      ]);

      const putMappingsCall = esClient.indices.putMapping.mock.calls.map(([{ index }]) => index);
      expect(putMappingsCall).toHaveLength(1);
      expect(putMappingsCall[0]).toBe('logs.prefix1-default');
    });

    it('should complete successfully when packageInstallation config is absent (falls back to constant)', async () => {
      appContextService.start(createAppContextStartContractMock());

      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.indices.getDataStream.mockResponse({
        data_streams: [{ name: 'logs.prefix1-default' }],
      } as any);
      esClient.indices.simulateTemplate.mockResponse({
        template: {
          settings: { index: {} },
          mappings: { properties: {} },
        },
      } as any);

      const logger = loggerMock.create();
      await updateCurrentWriteIndices(esClient, logger, [
        {
          templateName: 'logs.prefix1',
          indexTemplate: {
            index_patterns: ['logs.prefix1-*'],
            template: {
              settings: { index: {} },
              mappings: { properties: {} },
            },
          } as any,
        },
      ]);

      const putMappingsCall = esClient.indices.putMapping.mock.calls.map(([{ index }]) => index);
      expect(putMappingsCall).toHaveLength(1);
    });
  });

  describe('getTemplate — event-ingested suppression when agentIdVerification is enabled', () => {
    it('does not add event-ingested template when agentIdVerificationEnabled is true even if eventIngestedEnabled is true', () => {
      appContextService.start(
        createAppContextStartContractMock({
          agentIdVerificationEnabled: true,
          eventIngestedEnabled: true,
        })
      );

      const template = getTemplate({
        templateIndexPattern: 'logs-*',
        type: 'logs',
        packageName: 'nginx',
        composedOfTemplates: [],
        templatePriority: 200,
        isIndexModeTimeSeries: false,
      });

      expect(template.composed_of).not.toContain(FLEET_EVENT_INGESTED_COMPONENT_TEMPLATE_NAME);
      expect(template.composed_of).toContain(FLEET_AGENT_ID_VERIFY_COMPONENT_TEMPLATE_NAME);
    });
  });

  describe('generateTemplateName', () => {
    it('returns the base name for a data stream', () => {
      const dataStream = {
        type: 'logs',
        dataset: 'nginx.access',
        title: 'Nginx access logs',
        release: 'ga',
        package: 'nginx',
        path: 'access',
        ingest_pipeline: 'default',
      } as RegistryDataStream;

      expect(generateTemplateName(dataStream)).toBe('logs-nginx.access');
    });
  });

  describe('generateESIndexPatterns', () => {
    it('returns empty object when dataStreams is undefined', () => {
      expect(generateESIndexPatterns(undefined)).toEqual({});
    });

    it('returns a record mapping path to index pattern for each data stream', () => {
      const dataStreams = [
        {
          type: 'logs',
          dataset: 'nginx.access',
          title: 'Nginx access logs',
          release: 'ga',
          package: 'nginx',
          path: 'access',
          ingest_pipeline: 'default',
        },
        {
          type: 'metrics',
          dataset: 'nginx.stub',
          title: 'Nginx metrics',
          release: 'ga',
          package: 'nginx',
          path: 'stub',
          ingest_pipeline: 'default',
        },
      ] as RegistryDataStream[];

      expect(generateESIndexPatterns(dataStreams)).toEqual({
        access: 'logs-nginx.access-*',
        stub: 'metrics-nginx.stub-*',
      });
    });

    // TODO: generateESIndexPatterns does not accept an isOtelInputType flag and therefore
    // never appends the '.otel' suffix for OTel input packages. The pattern is stored in
    // the Fleet installation saved object (es_index_patterns) and used by get.ts to match
    // active data streams for the Fleet UI — it does not affect ES index template routing.
    // With the missing suffix, the UI will fail to match data streams named
    // 'logs-generic.otel-<namespace>' against the stored pattern 'logs-generic-*'.
    // The test below locks in the current (incorrect) behavior so any future fix is explicit.
    it('does not append .otel suffix for OTel input data streams (current behavior — see TODO above)', () => {
      const otelDataStream = {
        type: 'logs',
        dataset: 'generic',
        title: 'Generic OTel logs',
        release: 'ga',
        package: 'otel',
        path: 'generic',
        ingest_pipeline: 'default',
      } as RegistryDataStream;

      expect(generateESIndexPatterns([otelDataStream])).toEqual({
        generic: 'logs-generic-*',
      });
    });
  });

  describe('namespace template helpers', () => {
    const baseDataStream = {
      type: 'logs',
      dataset: 'nginx.access',
      title: 'Nginx access logs',
      release: 'ga',
      package: 'nginx',
      path: 'access',
      ingest_pipeline: 'default',
    } as RegistryDataStream;

    const prefixDataStream = {
      ...baseDataStream,
      type: 'metrics',
      dataset: 'test.dataset',
      dataset_is_prefix: true,
    } as RegistryDataStream;

    describe('generateNamespaceTemplateName', () => {
      it('appends @namespace.<namespace> to the base name', () => {
        expect(generateNamespaceTemplateName('logs-nginx.access', 'production')).toBe(
          'logs-nginx.access@namespace.production'
        );
      });

      it('works with any namespace string', () => {
        expect(generateNamespaceTemplateName('metrics-test.dataset', 'default')).toBe(
          'metrics-test.dataset@namespace.default'
        );
      });
    });

    describe('generateNamespaceTemplateIndexPattern', () => {
      it('returns <baseName>-<namespace> for a regular data stream (no trailing wildcard)', () => {
        const pattern = generateNamespaceTemplateIndexPattern(baseDataStream, 'production');
        expect(pattern).toBe('logs-nginx.access-production');
        // Pattern must not end with * so it does not match sibling namespaces like production_eu
        expect(pattern.endsWith('*')).toBe(false);
      });

      it('returns <baseName>.*-<namespace> for a dataset_is_prefix data stream', () => {
        const pattern = generateNamespaceTemplateIndexPattern(prefixDataStream, 'production');
        expect(pattern).toBe('metrics-test.dataset.*-production');
        expect(pattern.endsWith('*')).toBe(false);
      });

      it('handles isOtelInputType flag (appends .otel to dataset name)', () => {
        const otelDataStream = {
          ...baseDataStream,
          type: 'traces',
          dataset: 'generic',
        } as RegistryDataStream;
        // With isOtelInputType=true, getRegistryDataStreamAssetBaseName appends '.otel'
        // so 'generic' becomes 'traces-generic.otel'.
        const pattern = generateNamespaceTemplateIndexPattern(otelDataStream, 'production', true);
        expect(pattern).toBe('traces-generic.otel-production');
      });
    });

    describe('getNamespaceTemplatePriority', () => {
      it('returns base priority + NAMESPACE_TEMPLATE_PRIORITY_BOOST for non-prefix data stream', () => {
        // 200 (DEFAULT_TEMPLATE_PRIORITY) + 50 = 250
        expect(getNamespaceTemplatePriority(baseDataStream)).toBe(250);
        expect(getNamespaceTemplatePriority(baseDataStream)).toBe(
          200 + NAMESPACE_TEMPLATE_PRIORITY_BOOST
        );
      });

      it('returns 200 for dataset_is_prefix data stream (150 + 50), same as regular base priority — tie broken by index pattern specificity', () => {
        // 150 (DATASET_IS_PREFIX_TEMPLATE_PRIORITY) + 50 = 200
        expect(getNamespaceTemplatePriority(prefixDataStream)).toBe(200);
        expect(getNamespaceTemplatePriority(prefixDataStream)).toBe(
          150 + NAMESPACE_TEMPLATE_PRIORITY_BOOST
        );
      });
    });

    describe('isNamespaceTemplate', () => {
      it('returns true for a namespace template id', () => {
        expect(isNamespaceTemplate('logs-nginx.access@namespace.production')).toBe(true);
      });

      it('returns false for a regular template id', () => {
        expect(isNamespaceTemplate('logs-nginx.access')).toBe(false);
      });

      it('returns false for an empty string', () => {
        expect(isNamespaceTemplate('')).toBe(false);
      });

      it('returns true even when there are multiple @ in the id', () => {
        expect(isNamespaceTemplate('logs-nginx@custom@namespace.production')).toBe(true);
      });
    });

    describe('getNamespaceFromTemplateId', () => {
      it('returns the namespace portion after @namespace.', () => {
        expect(getNamespaceFromTemplateId('logs-nginx.access@namespace.production')).toBe(
          'production'
        );
      });

      it('returns undefined for a non-namespace template id', () => {
        expect(getNamespaceFromTemplateId('logs-nginx.access')).toBeUndefined();
      });

      it('returns undefined for an empty string', () => {
        expect(getNamespaceFromTemplateId('')).toBeUndefined();
      });

      it('returns the substring after the first @namespace. when there are multiple occurrences', () => {
        // Locks in current behavior: slice starts after first marker
        const id = 'a@namespace.b@namespace.c';
        expect(getNamespaceFromTemplateId(id)).toBe('b@namespace.c');
      });
    });
  });

  describe('generateMappings — field type × context cross-product matrix', () => {
    // Helper to generate mappings from a single field definition and extract the
    // relevant output for the given context.
    const staticResult = (field: Field) => generateMappings([field]).properties ?? {};

    const dynamicResult = (field: Field) => {
      const result = generateMappings([field]);
      return result.dynamic_templates ?? [];
    };

    const runtimeResult = (field: Field) => {
      const result = generateMappings([field]);
      return result.runtime ?? {};
    };

    // --- static context ---

    describe('static mappings (top-level field)', () => {
      it('keyword', () => {
        expect(staticResult({ name: 'f', type: 'keyword' })).toEqual({
          f: { type: 'keyword', ignore_above: 1024 },
        });
      });

      it('text', () => {
        expect(staticResult({ name: 'f', type: 'text' })).toEqual({ f: { type: 'text' } });
      });

      it('match_only_text', () => {
        expect(staticResult({ name: 'f', type: 'match_only_text' })).toEqual({
          f: { type: 'match_only_text' },
        });
      });

      it('wildcard includes default ignore_above', () => {
        expect(staticResult({ name: 'f', type: 'wildcard' })).toEqual({
          f: { type: 'wildcard', ignore_above: 1024 },
        });
      });

      it('long', () => {
        expect(staticResult({ name: 'f', type: 'long' })).toEqual({ f: { type: 'long' } });
      });

      it('integer maps to long', () => {
        expect(staticResult({ name: 'f', type: 'integer' })).toEqual({ f: { type: 'long' } });
      });

      it('short', () => {
        expect(staticResult({ name: 'f', type: 'short' })).toEqual({ f: { type: 'short' } });
      });

      it('byte', () => {
        expect(staticResult({ name: 'f', type: 'byte' })).toEqual({ f: { type: 'byte' } });
      });

      it('unsigned_long', () => {
        expect(staticResult({ name: 'f', type: 'unsigned_long' })).toEqual({
          f: { type: 'unsigned_long' },
        });
      });

      it('double', () => {
        expect(staticResult({ name: 'f', type: 'double' })).toEqual({ f: { type: 'double' } });
      });

      it('float', () => {
        expect(staticResult({ name: 'f', type: 'float' })).toEqual({ f: { type: 'float' } });
      });

      it('half_float', () => {
        expect(staticResult({ name: 'f', type: 'half_float' })).toEqual({
          f: { type: 'half_float' },
        });
      });

      it('boolean', () => {
        expect(staticResult({ name: 'f', type: 'boolean' })).toEqual({ f: { type: 'boolean' } });
      });

      it('date', () => {
        expect(staticResult({ name: 'f', type: 'date' })).toEqual({ f: { type: 'date' } });
      });

      it('date with format', () => {
        expect(staticResult({ name: 'f', type: 'date', date_format: 'strict_date' })).toEqual({
          f: { type: 'date', format: 'strict_date' },
        });
      });

      it('ip', () => {
        expect(staticResult({ name: 'f', type: 'ip' })).toEqual({ f: { type: 'ip' } });
      });

      it('histogram', () => {
        expect(staticResult({ name: 'f', type: 'histogram' })).toEqual({
          f: { type: 'histogram' },
        });
      });

      it('scaled_float', () => {
        expect(staticResult({ name: 'f', type: 'scaled_float' })).toEqual({
          f: { type: 'scaled_float', scaling_factor: 1000 },
        });
      });

      it('aggregate_metric_double', () => {
        expect(
          staticResult({
            name: 'f',
            type: 'aggregate_metric_double',
            metrics: ['min', 'max'],
            default_metric: 'min',
          })
        ).toEqual({
          f: { type: 'aggregate_metric_double', metrics: ['min', 'max'], default_metric: 'min' },
        });
      });

      it('flattened', () => {
        expect(staticResult({ name: 'f', type: 'flattened' })).toEqual({
          f: { type: 'flattened' },
        });
      });

      it('flattened with ignore_above', () => {
        expect(staticResult({ name: 'f', type: 'flattened', ignore_above: 512 })).toEqual({
          f: { type: 'flattened', ignore_above: 512 },
        });
      });

      it('constant_keyword without value', () => {
        expect(staticResult({ name: 'f', type: 'constant_keyword' })).toEqual({
          f: { type: 'constant_keyword' },
        });
      });

      it('constant_keyword with value', () => {
        expect(staticResult({ name: 'f', type: 'constant_keyword', value: 'prod' })).toEqual({
          f: { type: 'constant_keyword', value: 'prod' },
        });
      });

      it('alias', () => {
        expect(staticResult({ name: 'f', type: 'alias', path: 'other.field' })).toEqual({
          f: { type: 'alias', path: 'other.field' },
        });
      });

      it('array with object_type maps to object_type', () => {
        expect(staticResult({ name: 'f', type: 'array', object_type: 'keyword' })).toEqual({
          f: { type: 'keyword' },
        });
      });

      it('object without object_type', () => {
        expect(staticResult({ name: 'f', type: 'object' })).toEqual({
          f: { type: 'object' },
        });
      });

      it('nested (empty fields produces empty properties object)', () => {
        expect(staticResult({ name: 'f', type: 'nested', fields: [] })).toEqual({
          f: { type: 'nested', properties: {} },
        });
      });

      it('group produces no top-level property but includes child properties', () => {
        const result = staticResult({
          name: 'g',
          type: 'group',
          fields: [{ name: 'child', type: 'keyword' }],
        });
        expect(result).toEqual({
          g: { properties: { child: { type: 'keyword', ignore_above: 1024 } } },
        });
      });

      it('group with no fields produces no mapping', () => {
        const result = staticResult({ name: 'g', type: 'group', fields: [] });
        expect(result).toEqual({});
      });
    });

    // --- multi-field context ---

    describe('multi-field mappings', () => {
      const multiFieldResult = (baseType: string, multiFieldDef: Field) => {
        const result = generateMappings([
          { name: 'f', type: baseType, multi_fields: [multiFieldDef] },
        ]);
        const baseProps = result.properties?.f as any;
        return baseProps?.fields ?? {};
      };

      it('keyword multi-field on a text field', () => {
        expect(multiFieldResult('text', { name: 'raw', type: 'keyword' })).toEqual({
          raw: { type: 'keyword', ignore_above: 1024 },
        });
      });

      it('text multi-field on a keyword field', () => {
        expect(multiFieldResult('keyword', { name: 'analyzed', type: 'text' })).toEqual({
          analyzed: { type: 'text' },
        });
      });

      it('long multi-field', () => {
        expect(multiFieldResult('keyword', { name: 'num', type: 'long' })).toEqual({
          num: { type: 'long' },
        });
      });

      it('double multi-field', () => {
        expect(multiFieldResult('keyword', { name: 'num', type: 'double' })).toEqual({
          num: { type: 'double' },
        });
      });

      it('match_only_text multi-field', () => {
        expect(multiFieldResult('keyword', { name: 'txt', type: 'match_only_text' })).toEqual({
          txt: { type: 'match_only_text' },
        });
      });

      it('unsupported multi-field type produces no entry (current silent-skip behavior)', () => {
        // Types not in the multiFields switch today produce no output — lock this in.
        expect(multiFieldResult('keyword', { name: 'b', type: 'boolean' })).toEqual({});
      });
    });

    // --- object_type dynamic mapping context ---

    describe('object_type dynamic mappings (type: object, object_type: X)', () => {
      it('keyword object_type produces dynamic template', () => {
        const templates = dynamicResult({
          name: 'labels',
          type: 'object',
          object_type: 'keyword',
        });
        expect(templates.length).toBeGreaterThan(0);
        const entry = templates[0] as any;
        expect(Object.values(entry)[0]).toMatchObject({
          mapping: { type: 'keyword' },
          match_mapping_type: 'string',
        });
      });

      it('long object_type produces dynamic template with matchingType long', () => {
        const templates = dynamicResult({ name: 'metrics', type: 'object', object_type: 'long' });
        expect(templates.length).toBeGreaterThan(0);
        const entry = templates[0] as any;
        expect(Object.values(entry)[0]).toMatchObject({
          mapping: { type: 'long' },
          match_mapping_type: 'long',
        });
      });

      it('integer object_type maps to long', () => {
        const templates = dynamicResult({
          name: 'metrics',
          type: 'object',
          object_type: 'integer',
        });
        expect(templates.length).toBeGreaterThan(0);
        const entry = templates[0] as any;
        expect((Object.values(entry)[0] as any).mapping.type).toBe('long');
      });

      it('double object_type produces dynamic template', () => {
        const templates = dynamicResult({
          name: 'metrics',
          type: 'object',
          object_type: 'double',
        });
        expect(templates.length).toBeGreaterThan(0);
        const entry = templates[0] as any;
        expect(Object.values(entry)[0]).toMatchObject({
          mapping: { type: 'double' },
          match_mapping_type: 'double',
        });
      });

      it('boolean object_type produces dynamic template', () => {
        const templates = dynamicResult({
          name: 'flags',
          type: 'object',
          object_type: 'boolean',
        });
        expect(templates.length).toBeGreaterThan(0);
        const entry = templates[0] as any;
        expect(Object.values(entry)[0]).toMatchObject({ mapping: { type: 'boolean' } });
      });

      it('ip object_type produces dynamic template', () => {
        const templates = dynamicResult({ name: 'addrs', type: 'object', object_type: 'ip' });
        expect(templates.length).toBeGreaterThan(0);
      });

      it('scaled_float object_type produces dynamic template', () => {
        const templates = dynamicResult({
          name: 'vals',
          type: 'object',
          object_type: 'scaled_float',
          scaling_factor: 1000,
        });
        expect(templates.length).toBeGreaterThan(0);
      });

      it('histogram object_type produces dynamic template', () => {
        const templates = dynamicResult({
          name: 'hist',
          type: 'object',
          object_type: 'histogram',
        });
        expect(templates.length).toBeGreaterThan(0);
      });

      it('flattened object_type produces dynamic template', () => {
        const templates = dynamicResult({
          name: 'flat',
          type: 'object',
          object_type: 'flattened',
        });
        expect(templates.length).toBeGreaterThan(0);
      });

      it('text object_type produces dynamic template with matchingType string', () => {
        const templates = dynamicResult({ name: 'msgs', type: 'object', object_type: 'text' });
        expect(templates.length).toBeGreaterThan(0);
        const entry = templates[0] as any;
        expect(Object.values(entry)[0]).toMatchObject({
          mapping: { type: 'text' },
          match_mapping_type: 'string',
        });
      });

      it('aggregate_metric_double object_type produces dynamic template', () => {
        const templates = dynamicResult({
          name: 'agg',
          type: 'object',
          object_type: 'aggregate_metric_double',
          metrics: ['min', 'max'],
          default_metric: 'min',
        });
        expect(templates.length).toBeGreaterThan(0);
        const entry = templates[0] as any;
        expect((Object.values(entry)[0] as any).mapping.type).toBe('aggregate_metric_double');
      });

      it('unsupported object_type throws PackageInvalidArchiveError', () => {
        expect(() =>
          dynamicResult({ name: 'f', type: 'object', object_type: 'totally_unknown_type' })
        ).toThrow();
      });
    });

    // --- runtime_simple context ---

    describe('runtime mappings (runtime: true, standard types)', () => {
      it('keyword runtime field', () => {
        const result = runtimeResult({ name: 'f', type: 'keyword', runtime: true });
        expect(result).toHaveProperty('f');
        expect((result as any).f.type).toBe('keyword');
      });

      it('long runtime field', () => {
        const result = runtimeResult({ name: 'f', type: 'long', runtime: true });
        expect((result as any).f.type).toBe('long');
      });

      it('double runtime field', () => {
        const result = runtimeResult({ name: 'f', type: 'double', runtime: true });
        expect((result as any).f.type).toBe('double');
      });

      it('boolean runtime field', () => {
        const result = runtimeResult({ name: 'f', type: 'boolean', runtime: true });
        expect((result as any).f.type).toBe('boolean');
      });

      it('date runtime field', () => {
        const result = runtimeResult({ name: 'f', type: 'date', runtime: true });
        expect((result as any).f.type).toBe('date');
      });

      it('integer runtime field maps to long', () => {
        const result = runtimeResult({ name: 'f', type: 'integer', runtime: true });
        expect((result as any).f.type).toBe('long');
      });

      it('runtime field with painless script', () => {
        const result = runtimeResult({
          name: 'f',
          type: 'keyword',
          runtime: 'emit(doc["other"].value)',
        });
        expect((result as any).f.script).toEqual({ source: 'emit(doc["other"].value)' });
      });
    });

    // --- runtime_object context (type: object, object_type: X, runtime: true) ---

    describe('runtime + object_type dynamic mappings', () => {
      it('keyword runtime object_type produces a dynamic template with a runtime slot', () => {
        const templates = dynamicResult({
          name: 'labels',
          type: 'object',
          object_type: 'keyword',
          runtime: true,
        });
        expect(templates.length).toBeGreaterThan(0);
        const entry = templates[0] as any;
        expect(Object.values(entry)[0]).toHaveProperty('runtime');
      });

      it('long runtime object_type produces a dynamic template with runtime slot', () => {
        const templates = dynamicResult({
          name: 'metrics',
          type: 'object',
          object_type: 'long',
          runtime: true,
        });
        expect(templates.length).toBeGreaterThan(0);
        const entry = templates[0] as any;
        expect(Object.values(entry)[0]).toHaveProperty('runtime');
      });

      it('boolean runtime object_type produces a dynamic template with runtime slot', () => {
        const templates = dynamicResult({
          name: 'flags',
          type: 'object',
          object_type: 'boolean',
          runtime: true,
        });
        expect(templates.length).toBeGreaterThan(0);
        const entry = templates[0] as any;
        expect(Object.values(entry)[0]).toHaveProperty('runtime');
      });

      it('ip runtime object_type — current behavior: no dynamic template produced (silent skip)', () => {
        // ip is not in the runtime+object_type switch today — lock in the silent-skip.
        // This test documents the gap; a follow-up can add support intentionally.
        const templates = dynamicResult({
          name: 'addrs',
          type: 'object',
          object_type: 'ip',
          runtime: true,
        });
        expect(templates).toEqual([]);
      });

      it('histogram runtime object_type — current behavior: no dynamic template produced (silent skip)', () => {
        const templates = dynamicResult({
          name: 'hist',
          type: 'object',
          object_type: 'histogram',
          runtime: true,
        });
        expect(templates).toEqual([]);
      });
    });

    // --- text mapping: static vs dynamic ignore_above behavior ---

    describe('text mapping: static vs dynamic ignore_above parity', () => {
      it('wildcard static mapping includes default ignore_above 1024', () => {
        const result = staticResult({ name: 'f', type: 'wildcard' });
        expect((result as any).f.ignore_above).toBe(1024);
      });

      it('wildcard object_type dynamic mapping does NOT include default ignore_above (backwards compat)', () => {
        const templates = dynamicResult({ name: 'f', type: 'object', object_type: 'wildcard' });
        const entry = templates[0] as any;
        const mapping = (Object.values(entry)[0] as any).mapping;
        expect(mapping.ignore_above).toBeUndefined();
      });

      it('text static mapping does NOT include ignore_above', () => {
        const result = staticResult({ name: 'f', type: 'text' });
        expect((result as any).f.ignore_above).toBeUndefined();
      });

      it('text object_type dynamic mapping does NOT include ignore_above', () => {
        const templates = dynamicResult({ name: 'f', type: 'object', object_type: 'text' });
        const entry = templates[0] as any;
        const mapping = (Object.values(entry)[0] as any).mapping;
        expect(mapping.ignore_above).toBeUndefined();
      });
    });

    // --- group + object_type (deduplication merge) ---
    //
    // dedupFields() in fields/field.ts merges a sibling `object` field carrying
    // `object_type` into an existing `group` field, so the deduped group ends up
    // with both `fields` and an inherited `object_type`. The mapper must emit the
    // dynamic template for that object_type — and the parent object placeholder —
    // even when the group's `fields` end up producing no static or dynamic
    // mappings of their own (e.g. empty fields after alias validation removes
    // dangling aliases, or children that are all runtime fields).

    describe('group + object_type — from dedup merging an object into a group', () => {
      it('with non-empty static children produces both properties and dynamic template', () => {
        const result = generateMappings([
          {
            name: 'a',
            type: 'group',
            object_type: 'keyword',
            fields: [{ name: 'b', type: 'keyword' }],
          },
        ]);

        expect(result.properties).toEqual({
          a: {
            type: 'object',
            dynamic: true,
            properties: { b: { type: 'keyword', ignore_above: 1024 } },
          },
        });
        expect(result.dynamic_templates).toHaveLength(1);
        const entry = (result.dynamic_templates as any[])[0];
        expect(Object.values(entry)[0]).toMatchObject({
          mapping: { type: 'keyword' },
          match_mapping_type: 'string',
          path_match: 'a.*',
        });
      });

      it('with empty fields still produces dynamic template and placeholder property', () => {
        const result = generateMappings([
          {
            name: 'a',
            type: 'group',
            object_type: 'keyword',
            fields: [],
          },
        ]);

        expect(result.properties).toEqual({ a: { type: 'object', dynamic: true } });
        expect(result.dynamic_templates).toHaveLength(1);
        const entry = (result.dynamic_templates as any[])[0];
        expect(Object.values(entry)[0]).toMatchObject({
          mapping: { type: 'keyword' },
          match_mapping_type: 'string',
          path_match: 'a.*',
        });
      });

      it('with only-runtime children still produces dynamic template and placeholder property', () => {
        const result = generateMappings([
          {
            name: 'a',
            type: 'group',
            object_type: 'keyword',
            fields: [{ name: 'b', type: 'keyword', runtime: true }],
          },
        ]);

        expect(result.properties).toEqual({ a: { type: 'object', dynamic: true } });
        expect(result.dynamic_templates).toHaveLength(1);
        expect(result.runtime).toEqual({ 'a.b': { type: 'keyword' } });
      });
    });

    // --- group with no fields key ---
    //
    // Real EPR packages can contain group fields without a `fields` array (the
    // key is simply absent from the YAML). This must not throw — it should
    // silently produce no properties for that group, identical to a group whose
    // `fields` array is empty.
    describe('group with no fields key', () => {
      it('does not throw and emits no properties', () => {
        expect(() => generateMappings([{ name: 'a', type: 'group' } as any])).not.toThrow();

        const result = generateMappings([{ name: 'a', type: 'group' } as any]);
        expect(result.properties).toEqual({});
      });

      it('behaves identically to a group with an empty fields array', () => {
        const withUndefined = generateMappings([{ name: 'a', type: 'group' } as any]);
        const withEmpty = generateMappings([{ name: 'a', type: 'group', fields: [] }]);
        expect(withUndefined).toEqual(withEmpty);
      });
    });
  });
});
