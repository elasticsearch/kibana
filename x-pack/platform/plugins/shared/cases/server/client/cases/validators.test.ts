/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { stringify as yamlStringify } from 'yaml';
import type { Logger } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { CustomFieldsConfiguration, CaseCustomFields } from '../../../common/types/domain';
import { CustomFieldTypes, CaseStatuses } from '../../../common/types/domain';
import type { CasesSearchRequest } from '../../../common/types/api';
import { MAX_CUSTOM_FIELDS_PER_CASE } from '../../../common/constants';
import {
  validateCustomFieldKeysAgainstConfiguration,
  validateCustomFieldTypesInRequest,
  validateRequiredCustomFields,
  validateSearchCasesCustomFields,
  validateExtendedFieldsInRequest,
  validateExtendedFieldsOnClose,
  resolveTemplateFieldsForClose,
} from './validators';
import type { CaseSavedObjectTransformed } from '../../common/types/case';
import type { TemplatesService } from '../../services/templates';
import type { InlineField } from '../../../common/types/domain/template/fields';

describe('validators', () => {
  describe('validateCustomFieldTypesInRequest', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('does not throw if all custom fields types in request match the configuration', () => {
      expect(() =>
        validateCustomFieldTypesInRequest({
          requestCustomFields: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT as const,
              value: 'this is a text field value',
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TOGGLE as const,
              value: null,
            },
          ],
          customFieldsConfiguration: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT,
              label: 'foo',
              required: false,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TOGGLE,
              label: 'foo',
              required: false,
            },
          ] as CustomFieldsConfiguration,
        })
      ).not.toThrow();
    });

    it('does not throw if no custom fields are in request', () => {
      expect(() =>
        validateCustomFieldTypesInRequest({
          customFieldsConfiguration: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT,
              label: 'foo',
              required: false,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TOGGLE,
              label: 'foo',
              required: false,
            },
          ] as CustomFieldsConfiguration,
        })
      ).not.toThrow();
    });

    it('does not throw if the configuration is undefined but no custom fields are in request', () => {
      expect(() => validateCustomFieldTypesInRequest({})).not.toThrow();
    });

    it('throws for a single invalid type', () => {
      expect(() =>
        validateCustomFieldTypesInRequest({
          requestCustomFields: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TOGGLE,
              value: null,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TOGGLE,
              value: true,
            },
          ],

          customFieldsConfiguration: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT,
              label: 'first label',
              required: false,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TOGGLE,
              label: 'foo',
              required: false,
            },
          ] as CustomFieldsConfiguration,
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"The following custom fields have the wrong type in the request: \\"first label\\""`
      );
    });

    it('throws for multiple custom fields with invalid types', () => {
      expect(() =>
        validateCustomFieldTypesInRequest({
          requestCustomFields: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TOGGLE,
              value: null,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TOGGLE,
              value: true,
            },
            {
              key: 'third_key',
              type: CustomFieldTypes.TEXT,
              value: 'abc',
            },
          ],

          customFieldsConfiguration: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT,
              label: 'first label',
              required: false,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TEXT,
              label: 'second label',
              required: false,
            },
            {
              key: 'third_key',
              type: CustomFieldTypes.TOGGLE,
              label: 'third label',
              required: false,
            },
          ] as CustomFieldsConfiguration,
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"The following custom fields have the wrong type in the request: \\"first label\\", \\"second label\\", \\"third label\\""`
      );
    });

    it('throws with label unknown for missing custom field labels', () => {
      expect(() =>
        validateCustomFieldTypesInRequest({
          requestCustomFields: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TOGGLE,
              value: true,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TEXT,
              value: 'foobar',
            },
          ],

          customFieldsConfiguration: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT,
              required: false,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TEXT,
              required: false,
            },
          ] as CustomFieldsConfiguration,
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"The following custom fields have the wrong type in the request: \\"Unknown\\""`
      );
    });

    it('throws if configuration is missing and request has custom fields', () => {
      expect(() =>
        validateCustomFieldTypesInRequest({
          requestCustomFields: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TOGGLE,
              value: null,
            },
          ],
        })
      ).toThrowErrorMatchingInlineSnapshot(`"No custom fields configured."`);
    });
  });

  describe('validateCustomFieldKeysAgainstConfiguration', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('does not throw if all custom fields are in configuration', () => {
      expect(() =>
        validateCustomFieldKeysAgainstConfiguration({
          requestCustomFields: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT as const,
              value: 'this is a text field value',
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TEXT as const,
              value: null,
            },
          ],
          customFieldsConfiguration: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT,
              label: 'foo',
              required: false,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TOGGLE,
              label: 'foo',
              required: false,
            },
          ] as CustomFieldsConfiguration,
        })
      ).not.toThrow();
    });

    it('does not throw if no custom fields are in request', () => {
      expect(() =>
        validateCustomFieldKeysAgainstConfiguration({
          customFieldsConfiguration: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT,
              label: 'foo',
              required: false,
            },
            {
              key: 'second_key',
              type: CustomFieldTypes.TOGGLE,
              label: 'foo',
              required: false,
            },
          ] as CustomFieldsConfiguration,
        })
      ).not.toThrow();
    });

    it('does not throw if no configuration found but no custom fields are in request', () => {
      expect(() => validateCustomFieldKeysAgainstConfiguration({})).not.toThrow();
    });

    it('throws if there are invalid custom field keys', () => {
      expect(() =>
        validateCustomFieldKeysAgainstConfiguration({
          requestCustomFields: [
            {
              key: 'invalid_key',
              type: CustomFieldTypes.TOGGLE,
              value: null,
            },
          ],
          customFieldsConfiguration: [
            {
              key: 'first_key',
              type: CustomFieldTypes.TEXT,
              label: 'foo',
              required: false,
            },
          ] as CustomFieldsConfiguration,
        })
      ).toThrowErrorMatchingInlineSnapshot(`"Invalid custom field keys: invalid_key"`);
    });

    it('throws if configuration is missing and request has custom fields', () => {
      expect(() =>
        validateCustomFieldKeysAgainstConfiguration({
          requestCustomFields: [
            {
              key: 'invalid_key',
              type: CustomFieldTypes.TOGGLE,
              value: null,
            },
          ],
        })
      ).toThrowErrorMatchingInlineSnapshot(`"No custom fields configured."`);
    });
  });

  describe('validateRequiredCustomFields', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('does not throw if all required custom fields are in the request', () => {
      const customFieldsConfiguration: CustomFieldsConfiguration = [
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT,
          label: 'foo',
          required: true,
        },
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          label: 'foo',
          required: true,
        },
      ];

      const requestCustomFields: CaseCustomFields = [
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT as const,
          value: 'this is a text field value',
        },
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE as const,
          value: true,
        },
      ];
      expect(() =>
        validateRequiredCustomFields({
          requestCustomFields,
          customFieldsConfiguration,
        })
      ).not.toThrow();
    });

    it('does not throw if all missing required custom fields have default values', () => {
      const customFieldsConfiguration: CustomFieldsConfiguration = [
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT,
          label: 'foo',
          required: true,
          defaultValue: 'default value',
        },
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          label: 'foo',
          required: true,
          defaultValue: false,
        },
      ];

      expect(() =>
        validateRequiredCustomFields({
          requestCustomFields: [],
          customFieldsConfiguration,
        })
      ).not.toThrow();
    });

    it('does not throw if there are only optional custom fields in configuration', () => {
      const customFieldsConfiguration: CustomFieldsConfiguration = [
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT,
          label: 'foo',
          required: false,
        },
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          label: 'foo',
          required: false,
        },
      ];

      expect(() =>
        validateRequiredCustomFields({
          customFieldsConfiguration,
        })
      ).not.toThrow();
    });

    it('does not throw if the configuration is undefined but no custom fields are in request', () => {
      expect(() => validateRequiredCustomFields({})).not.toThrow();
    });

    it('throws if there are missing required custom fields without a default value', () => {
      const requestCustomFields: CaseCustomFields = [
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          value: true,
        },
      ];
      const customFieldsConfiguration: CustomFieldsConfiguration = [
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT,
          label: 'missing field 1',
          required: true,
        },
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          label: 'foo',
          required: true,
          defaultValue: null,
        },
        {
          key: 'third_key',
          type: CustomFieldTypes.TEXT,
          label: 'foo',
          required: true,
          defaultValue: 'default value',
        },
      ];
      expect(() =>
        validateRequiredCustomFields({
          requestCustomFields,
          customFieldsConfiguration,
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"Missing required custom fields without default value configured: \\"missing field 1\\""`
      );
    });

    it('throws if required custom fields with default have null value', () => {
      const requestCustomFields: CaseCustomFields = [
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          value: null,
        },
      ];
      const customFieldsConfiguration: CustomFieldsConfiguration = [
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          label: 'missing field 2',
          required: true,
          defaultValue: true,
        },
      ];
      expect(() =>
        validateRequiredCustomFields({
          requestCustomFields,
          customFieldsConfiguration,
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"Invalid value \\"null\\" supplied for the following required custom fields: \\"missing field 2\\""`
      );
    });

    it('throws if required custom fields without default have null value', () => {
      const requestCustomFields: CaseCustomFields = [
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          value: null,
        },
      ];
      const customFieldsConfiguration: CustomFieldsConfiguration = [
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          label: 'missing field 2',
          required: true,
        },
      ];
      expect(() =>
        validateRequiredCustomFields({
          requestCustomFields,
          customFieldsConfiguration,
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"Invalid value \\"null\\" supplied for the following required custom fields: \\"missing field 2\\""`
      );
    });

    it('throws if configuration is missing and request has custom fields', () => {
      const requestCustomFields: CaseCustomFields = [
        {
          key: 'first_key',
          type: CustomFieldTypes.TOGGLE,
          value: null,
        },
      ];
      expect(() =>
        validateRequiredCustomFields({
          requestCustomFields,
        })
      ).toThrowErrorMatchingInlineSnapshot(`"No custom fields configured."`);
    });

    it('throws if all missing required custom fields do not have default values', () => {
      const customFieldsConfiguration: CustomFieldsConfiguration = [
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT,
          label: 'missing field 1',
          required: true,
          defaultValue: null,
        },
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          label: 'foo',
          required: true,
        },
      ];
      expect(() =>
        validateRequiredCustomFields({
          customFieldsConfiguration,
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"Missing required custom fields without default value configured: \\"missing field 1\\", \\"foo\\""`
      );
    });

    it('throws if some missing required custom fields do not have default values', () => {
      const customFieldsConfiguration: CustomFieldsConfiguration = [
        {
          key: 'first_key',
          type: CustomFieldTypes.TEXT,
          label: 'missing field 1',
          required: true,
          defaultValue: 'default value',
        },
        {
          key: 'second_key',
          type: CustomFieldTypes.TOGGLE,
          label: 'foo',
          required: true,
        },
      ];
      expect(() =>
        validateRequiredCustomFields({
          customFieldsConfiguration,
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"Missing required custom fields without default value configured: \\"foo\\""`
      );
    });
  });

  describe('validateSearchCasesCustomFields', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    const customFieldsConfiguration: CustomFieldsConfiguration = [
      {
        key: 'first_key',
        type: CustomFieldTypes.TEXT,
        label: 'Text field',
        required: true,
      },
      {
        key: 'second_key',
        type: CustomFieldTypes.TOGGLE,
        label: 'Toggle field',
        required: true,
      },
    ];

    const customFields: CasesSearchRequest['customFields'] = {
      second_key: [true],
    };

    it('does not throw when custom fields are correct', () => {
      const newConfig = [
        ...customFieldsConfiguration,
        {
          key: 'third_key',
          type: CustomFieldTypes.TOGGLE,
          label: 'Another toggle field',
          required: false,
        },
      ];

      const newCustomFields = { ...customFields, third_key: [false] };

      expect(() =>
        validateSearchCasesCustomFields({
          customFieldsConfiguration: newConfig,
          customFields: newCustomFields,
        })
      ).not.toThrow();
    });

    it('does not throw when multiple custom fields', () => {
      expect(() =>
        validateSearchCasesCustomFields({
          customFieldsConfiguration,
          customFields,
        })
      ).not.toThrow();
    });

    it('does not throw when custom fields are empty', () => {
      expect(() =>
        validateSearchCasesCustomFields({
          customFieldsConfiguration,
          customFields: {},
        })
      ).not.toThrow();
    });

    it('does not throw when custom field value is null', () => {
      expect(() =>
        validateSearchCasesCustomFields({
          customFieldsConfiguration,
          customFields: { second_key: [null] },
        })
      ).not.toThrow();
    });

    it('throws error when custom fields configurations is empty', () => {
      expect(() =>
        validateSearchCasesCustomFields({
          customFieldsConfiguration: [],
          customFields,
        })
      ).toThrowErrorMatchingInlineSnapshot(`"No custom fields configured."`);
    });

    it('throws error when custom fields key does not match with configuration', () => {
      expect(() =>
        validateSearchCasesCustomFields({
          customFieldsConfiguration,
          customFields: { random_key: [true] },
        })
      ).toThrowErrorMatchingInlineSnapshot(`"Invalid custom field key: random_key."`);
    });

    it('throws error when custom field is not filterable', () => {
      expect(() =>
        validateSearchCasesCustomFields({
          customFieldsConfiguration,
          customFields: { first_key: ['hello'] },
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"Filtering by custom field of type text is not allowed."`
      );
    });

    it('throws error when custom field is searched with invalid value', () => {
      expect(() =>
        validateSearchCasesCustomFields({
          customFieldsConfiguration,
          customFields: { second_key: ['foobar', true, 1234] },
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"Unsupported filtering value for custom field of type toggle."`
      );
    });

    it('throws error when custom fields reach maximum', () => {
      let customFieldsMax = {};

      for (let i = 0; i <= MAX_CUSTOM_FIELDS_PER_CASE + 1; i++) {
        customFieldsMax = { ...customFieldsMax, [`test_key_${i}`]: [true] };
      }

      expect(() =>
        validateSearchCasesCustomFields({
          customFieldsConfiguration,
          customFields: customFieldsMax,
        })
      ).toThrowErrorMatchingInlineSnapshot(`"Maximum 10 customFields are allowed."`);
    });
  });

  describe('validateExtendedFieldsInRequest', () => {
    const makeOriginalCase = (templateId?: string): CaseSavedObjectTransformed =>
      ({
        id: 'case-1',
        attributes: {
          template: templateId ? { id: templateId, version: 1 } : null,
        },
      } as unknown as CaseSavedObjectTransformed);

    const makeTemplatesSO = (definition: object) => ({
      id: 'so-id',
      type: 'cases-templates',
      references: [],
      attributes: {
        templateId: 'tpl-1',
        name: 'Test Template',
        owner: 'securitySolution',
        definition: yamlStringify({ name: 'Test Template', fields: [], ...definition }),
        templateVersion: 1,
        deletedAt: null,
        isLatest: true,
      },
    });

    /**
     * Builds a minimal array of InlineField objects for the given name/type pairs,
     * matching the shape that `resolveGlobalFields` returns.
     */
    const makeGlobalFields = (
      defs: Array<{
        name: string;
        type?: string;
        label?: string;
        validation?: Record<string, unknown>;
      }> = []
    ): InlineField[] =>
      defs.map(({ name, type = 'keyword', label = name, validation }) => ({
        control: 'INPUT_TEXT' as const,
        name,
        type,
        label,
        ...(validation ? { validation } : {}),
      })) as unknown as InlineField[];

    const simpleTemplateSO = makeTemplatesSO({
      fields: [{ control: 'INPUT_TEXT', name: 'summary', label: 'Summary', type: 'keyword' }],
    });

    let templatesService: jest.Mocked<Pick<TemplatesService, 'getTemplate'>>;

    beforeEach(() => {
      templatesService = {
        getTemplate: jest.fn().mockResolvedValue(simpleTemplateSO),
      };
    });

    it('returns without error when extended_fields is undefined', async () => {
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: { id: 'case-1', version: '1' },
          originalCase: makeOriginalCase('tpl-1'),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields(),
        })
      ).resolves.toBeUndefined();
    });

    it('allows global field keys in extended_fields when no template is set', async () => {
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: { id: 'case-1', version: '1', extended_fields: { summary_as_keyword: 'hi' } },
          originalCase: makeOriginalCase(), // no template
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields([{ name: 'summary', type: 'keyword' }]),
        })
      ).resolves.toBeUndefined();
    });

    it('throws when extended_fields has non-global keys and no template is set', async () => {
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: { id: 'case-1', version: '1', extended_fields: { summary_as_keyword: 'hi' } },
          originalCase: makeOriginalCase(), // no template, no global defs
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields(),
        })
      ).rejects.toThrow(
        'extended_fields keys [summary_as_keyword] are not global (isGlobal) field definitions'
      );
    });

    it('throws when template not found', async () => {
      templatesService.getTemplate.mockResolvedValue(undefined);

      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            template: { id: 'missing-tpl', version: 1 },
            extended_fields: { summary_as_keyword: 'hi' },
          },
          originalCase: makeOriginalCase(),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields(),
        })
      ).rejects.toThrow('Template missing-tpl not found');
    });

    it('does not throw for valid extended_fields', async () => {
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            template: { id: 'tpl-1', version: 1 },
            extended_fields: { summary_as_keyword: 'hello' },
          },
          originalCase: makeOriginalCase(),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields(),
        })
      ).resolves.toBeUndefined();
    });

    it('throws with validation errors for invalid extended_fields', async () => {
      const templateSOWithRequired = makeTemplatesSO({
        fields: [
          {
            control: 'INPUT_TEXT',
            name: 'summary',
            label: 'Summary',
            type: 'keyword',
            validation: { required: true },
          },
        ],
      });
      templatesService.getTemplate.mockResolvedValue(templateSOWithRequired);

      // Explicitly setting a required field to empty string should still fail.
      // Omitting the key entirely (partial update) is allowed — the server merges
      // existing values, so absent keys retain their stored value.
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            template: { id: 'tpl-1', version: 1 },
            extended_fields: { summary_as_keyword: '' },
          },
          originalCase: makeOriginalCase(),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields(),
        })
      ).rejects.toThrow('Invalid extended_fields: Field "Summary" is required');
    });

    it('does not throw when only global fields are provided for a case with required template fields', async () => {
      const templateSOWithRequired = makeTemplatesSO({
        fields: [
          {
            control: 'INPUT_TEXT',
            name: 'summary',
            label: 'Summary',
            type: 'keyword',
            validation: { required: true },
          },
        ],
      });
      templatesService.getTemplate.mockResolvedValue(templateSOWithRequired);

      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            template: { id: 'tpl-1', version: 1 },
            extended_fields: { my_global_field_as_keyword: 'value' },
          },
          originalCase: makeOriginalCase('tpl-1'),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields([{ name: 'my_global_field', type: 'keyword' }]),
        })
      ).resolves.toBeUndefined();
    });

    it('throws when template definition is invalid YAML/schema', async () => {
      templatesService.getTemplate.mockResolvedValue({
        id: 'so-id',
        type: 'cases-templates',
        references: [],
        attributes: {
          templateId: 'tpl-1',
          name: 'Bad Template',
          owner: 'securitySolution',
          definition: 'not: valid: yaml: [broken',
          templateVersion: 1,
          deletedAt: null,
          isLatest: true,
        },
      });

      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            template: { id: 'tpl-1', version: 1 },
            extended_fields: { summary_as_keyword: 'hi' },
          },
          originalCase: makeOriginalCase(),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields(),
        })
      ).rejects.toThrow('Template tpl-1 has an invalid definition');
    });

    it('throws when template is explicitly null and non-global extended_fields are provided', async () => {
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            template: null,
            extended_fields: { summary_as_keyword: 'hi' },
          },
          originalCase: makeOriginalCase('tpl-from-original'),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields(),
        })
      ).rejects.toThrow(
        'extended_fields keys [summary_as_keyword] are not global (isGlobal) field definitions'
      );

      expect(templatesService.getTemplate).not.toHaveBeenCalled();
    });

    it('allows global field keys when template is explicitly null', async () => {
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            template: null,
            extended_fields: { summary_as_keyword: 'hi' },
          },
          originalCase: makeOriginalCase('tpl-from-original'),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields([{ name: 'summary', type: 'keyword' }]),
        })
      ).resolves.toBeUndefined();

      expect(templatesService.getTemplate).not.toHaveBeenCalled();
    });

    it('uses template id from original case when not on update request', async () => {
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            extended_fields: { summary_as_keyword: 'hello' },
          },
          originalCase: makeOriginalCase('tpl-from-original'),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields(),
        })
      ).resolves.toBeUndefined();

      expect(templatesService.getTemplate).toHaveBeenCalledWith('tpl-from-original');
    });

    it('allows global field keys alongside template fields when template is set', async () => {
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            template: { id: 'tpl-1', version: 1 },
            extended_fields: {
              summary_as_keyword: 'hello',
              global_tag_as_keyword: 'security',
            },
          },
          originalCase: makeOriginalCase(),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields([{ name: 'global_tag', type: 'keyword' }]),
        })
      ).resolves.toBeUndefined();
    });

    it('throws when a global field value violates its definition (required, no template)', async () => {
      // FAILURE SCENARIO: a client sends an empty string for a required global field
      // with no template active. Previously the value was stored without validation.
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            extended_fields: { summary_as_keyword: '' },
          },
          originalCase: makeOriginalCase(), // no template
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields([
            { name: 'summary', type: 'keyword', label: 'Summary', validation: { required: true } },
          ]),
        })
      ).rejects.toThrow('Invalid extended_fields');
    });

    it('throws when a global field value violates its definition (required, with template)', async () => {
      // FAILURE SCENARIO: empty required global field sent alongside a valid template.
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            template: { id: 'tpl-1', version: 1 },
            extended_fields: {
              summary_as_keyword: 'valid template value',
              global_required_as_keyword: '',
            },
          },
          originalCase: makeOriginalCase(),
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields([
            {
              name: 'global_required',
              type: 'keyword',
              label: 'Global Required',
              validation: { required: true },
            },
          ]),
        })
      ).rejects.toThrow('Invalid extended_fields');
    });

    it('accepts a valid global field value when definition has a required constraint', async () => {
      await expect(
        validateExtendedFieldsInRequest({
          updateReq: {
            id: 'case-1',
            version: '1',
            extended_fields: { summary_as_keyword: 'a valid value' },
          },
          originalCase: makeOriginalCase(), // no template
          templatesService: templatesService as unknown as TemplatesService,
          globalFields: makeGlobalFields([
            { name: 'summary', type: 'keyword', label: 'Summary', validation: { required: true } },
          ]),
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('validateExtendedFieldsOnClose', () => {
    const makeOriginalCase = (
      overrides: Partial<{
        templateId: string | null;
        status: string;
        extendedFields: Record<string, string>;
      }> = {}
    ): CaseSavedObjectTransformed =>
      ({
        id: 'case-1',
        attributes: {
          status: overrides.status ?? CaseStatuses.open,
          template: overrides.templateId ? { id: overrides.templateId, version: 1 } : null,
          extended_fields: overrides.extendedFields ?? {},
        },
      } as unknown as CaseSavedObjectTransformed);

    const makeGlobalFields = (
      defs: Array<{
        name: string;
        type?: string;
        label?: string;
        validation?: Record<string, unknown>;
      }> = []
    ): InlineField[] =>
      defs.map(({ name, type = 'keyword', label = name, validation }) => ({
        control: 'INPUT_TEXT' as const,
        name,
        type,
        label,
        ...(validation ? { validation } : {}),
      })) as unknown as InlineField[];

    const makeTemplateField = (
      def: Partial<{
        name: string;
        label: string;
        type: string;
        validation: Record<string, unknown>;
      }> = {}
    ): InlineField =>
      ({
        control: 'INPUT_TEXT' as const,
        name: def.name ?? 'resolution',
        type: def.type ?? 'keyword',
        label: def.label ?? def.name ?? 'resolution',
        ...(def.validation ? { validation: def.validation } : {}),
      } as unknown as InlineField);

    const requiredOnCloseField = makeTemplateField({
      name: 'resolution',
      label: 'Resolution',
      validation: { required_on_close: true },
    });

    it('returns without error when status is not being set to closed', () => {
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: { id: 'case-1', version: '1', status: CaseStatuses.open },
          originalCase: makeOriginalCase({ status: CaseStatuses.open }),
          templateFields: [requiredOnCloseField],
          globalFields: makeGlobalFields(),
        })
      ).not.toThrow();
    });

    it('returns without error when case is already closed (no transition)', () => {
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: { id: 'case-1', version: '1', status: CaseStatuses.closed },
          originalCase: makeOriginalCase({ status: CaseStatuses.closed }),
          templateFields: [requiredOnCloseField],
          globalFields: makeGlobalFields(),
        })
      ).not.toThrow();
    });

    it('returns without error when no template fields and no global required_on_close fields', () => {
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: { id: 'case-1', version: '1', status: CaseStatuses.closed },
          originalCase: makeOriginalCase(),
          templateFields: [],
          globalFields: makeGlobalFields([{ name: 'notes', type: 'keyword' }]),
        })
      ).not.toThrow();
    });

    it('throws when closing and required_on_close field is missing from merged extended_fields', () => {
      // FAILURE SCENARIO: user closes the case without filling the required_on_close field
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: { id: 'case-1', version: '1', status: CaseStatuses.closed },
          originalCase: makeOriginalCase(),
          templateFields: [requiredOnCloseField],
          globalFields: makeGlobalFields(),
        })
      ).toThrow('Cannot close case case-1, required fields must be filled');
    });

    it('error message includes the case ID', () => {
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: { id: 'my-case-id', version: '1', status: CaseStatuses.closed },
          originalCase: makeOriginalCase(),
          templateFields: [requiredOnCloseField],
          globalFields: makeGlobalFields(),
        })
      ).toThrow('Cannot close case my-case-id, required fields must be filled');
    });

    it('throws when closing and required_on_close field is empty string in extended_fields', () => {
      // FAILURE SCENARIO: field was explicitly cleared before closing
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: {
            id: 'case-1',
            version: '1',
            status: CaseStatuses.closed,
            extended_fields: { resolution_as_keyword: '' },
          },
          originalCase: makeOriginalCase(),
          templateFields: [requiredOnCloseField],
          globalFields: makeGlobalFields(),
        })
      ).toThrow('Cannot close case case-1, required fields must be filled');
    });

    it('passes when closing and required_on_close field is filled in the request', () => {
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: {
            id: 'case-1',
            version: '1',
            status: CaseStatuses.closed,
            extended_fields: { resolution_as_keyword: 'Fixed the issue' },
          },
          originalCase: makeOriginalCase(),
          templateFields: [requiredOnCloseField],
          globalFields: makeGlobalFields(),
        })
      ).not.toThrow();
    });

    it('passes when required_on_close field was filled previously and is not in the request', () => {
      // The existing SO already has the value — no extended_fields in this update request
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: { id: 'case-1', version: '1', status: CaseStatuses.closed },
          originalCase: makeOriginalCase({ extendedFields: { resolution_as_keyword: 'Resolved' } }),
          templateFields: [requiredOnCloseField],
          globalFields: makeGlobalFields(),
        })
      ).not.toThrow();
    });

    it('uses merged extended_fields (request value overrides existing SO value)', () => {
      // FAILURE SCENARIO: existing SO has the field filled, but the request clears it
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: {
            id: 'case-1',
            version: '1',
            status: CaseStatuses.closed,
            extended_fields: { resolution_as_keyword: '' },
          },
          originalCase: makeOriginalCase({
            extendedFields: { resolution_as_keyword: 'was filled' },
          }),
          templateFields: [requiredOnCloseField],
          globalFields: makeGlobalFields(),
        })
      ).toThrow('Cannot close case case-1, required fields must be filled');
    });

    it('passes when no template fields are given (template cleared by caller)', () => {
      // Caller passes [] when template is null — no template fields to enforce
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: { id: 'case-1', version: '1', status: CaseStatuses.closed },
          originalCase: makeOriginalCase({
            templateId: 'tpl-1',
            extendedFields: { resolution_as_keyword: 'old value' },
          }),
          templateFields: [],
          globalFields: makeGlobalFields(),
        })
      ).not.toThrow();
    });

    it('enforces required_on_close on global fields when closing', () => {
      // FAILURE SCENARIO: global field has required_on_close but is not filled
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: { id: 'case-1', version: '1', status: CaseStatuses.closed },
          originalCase: makeOriginalCase(),
          templateFields: [],
          globalFields: makeGlobalFields([
            {
              name: 'impact',
              type: 'keyword',
              label: 'Impact',
              validation: { required_on_close: true },
            },
          ]),
        })
      ).toThrow('Cannot close case case-1, required fields must be filled');
    });

    it('does not enforce regular required fields (write-time concern only)', () => {
      // A field with required:true but NOT required_on_close:true should not block closing
      const regularRequiredField = makeTemplateField({
        name: 'summary',
        label: 'Summary',
        validation: { required: true },
      });
      expect(() =>
        validateExtendedFieldsOnClose({
          updateReq: { id: 'case-1', version: '1', status: CaseStatuses.closed },
          originalCase: makeOriginalCase(),
          templateFields: [regularRequiredField],
          globalFields: makeGlobalFields(),
        })
      ).not.toThrow();
    });
  });

  describe('resolveTemplateFieldsForClose', () => {
    const makeTemplatesSO = (definition: object) => ({
      id: 'so-id',
      type: 'cases-templates',
      references: [],
      attributes: {
        templateId: 'tpl-1',
        name: 'Test Template',
        owner: 'securitySolution',
        definition: yamlStringify({ name: 'Test Template', fields: [], ...definition }),
        templateVersion: 1,
        deletedAt: null,
        isLatest: true,
      },
    });

    const templateWithRequiredOnClose = () =>
      makeTemplatesSO({
        fields: [
          {
            control: 'INPUT_TEXT',
            name: 'resolution',
            label: 'Resolution',
            type: 'keyword',
            validation: { required_on_close: true },
          },
        ],
      });

    let templatesService: jest.Mocked<Pick<TemplatesService, 'getTemplate'>>;
    let logger: jest.Mocked<Logger>;

    beforeEach(() => {
      templatesService = {
        getTemplate: jest.fn().mockResolvedValue(templateWithRequiredOnClose()),
      };
      logger = loggingSystemMock.create().get() as jest.Mocked<Logger>;
    });

    it('returns parsed inline fields from a valid template SO', async () => {
      const fields = await resolveTemplateFieldsForClose({
        templateId: 'tpl-1',
        templatesService: templatesService as unknown as TemplatesService,
        logger,
      });
      expect(fields.length).toBeGreaterThan(0);
      expect(fields[0].name).toBe('resolution');
      expect(templatesService.getTemplate).toHaveBeenCalledWith('tpl-1', undefined);
    });

    it('passes templateVersion as string to getTemplate when provided', async () => {
      await resolveTemplateFieldsForClose({
        templateId: 'tpl-1',
        templateVersion: 3,
        templatesService: templatesService as unknown as TemplatesService,
        logger,
      });
      expect(templatesService.getTemplate).toHaveBeenCalledWith('tpl-1', '3');
    });

    it('returns [] when template is not found', async () => {
      templatesService.getTemplate.mockResolvedValue(undefined);
      const fields = await resolveTemplateFieldsForClose({
        templateId: 'tpl-missing',
        templatesService: templatesService as unknown as TemplatesService,
        logger,
      });
      expect(fields).toEqual([]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('returns [] and logs a warning when template definition is unparseable', async () => {
      const invalidSO = makeTemplatesSO({});
      templatesService.getTemplate.mockResolvedValue({
        ...invalidSO,
        attributes: { ...invalidSO.attributes, definition: '{invalid yaml: [unclosed' },
      } as unknown as Awaited<ReturnType<TemplatesService['getTemplate']>>);

      const fields = await resolveTemplateFieldsForClose({
        templateId: 'tpl-1',
        templatesService: templatesService as unknown as TemplatesService,
        logger,
      });
      expect(fields).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse template "tpl-1"')
      );
    });
  });
});
