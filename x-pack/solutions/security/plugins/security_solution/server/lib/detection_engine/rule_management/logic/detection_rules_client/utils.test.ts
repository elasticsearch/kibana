/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getRulesSchemaMock } from '../../../../../../common/api/detection_engine/model/rule_schema/rule_response_schema.mock';
import { getMockRulesAuthz } from '../../__mocks__/authz';
import {
  mergeExceptionLists,
  validateFieldWritePermissions,
  validateEditedFieldWritePermissions,
  hasOnlyReadAuthEditableChanges,
  extractChangedUpdatableFields,
} from './utils';

describe('utils', () => {
  describe('validateFieldWritePermissions', () => {
    it('should not throw when user has all required permissions', () => {
      const rulesAuthz = getMockRulesAuthz();
      const ruleUpdate = {
        exceptions_list: [],
        investigation_fields: { field_names: ['host.name'] },
        note: 'Investigation guide content',
      };

      expect(() => validateFieldWritePermissions(ruleUpdate, rulesAuthz)).not.toThrow();
    });

    it('should throw 403 when editing exceptions_list without canEditExceptions', () => {
      const rulesAuthz = { ...getMockRulesAuthz(), canEditExceptions: false };
      const ruleUpdate = { exceptions_list: [] };

      expect(() => validateFieldWritePermissions(ruleUpdate, rulesAuthz)).toThrow(
        expect.objectContaining({
          statusCode: 403,
          message:
            'The current user does not have the permissions to edit the following fields: exceptions_list',
        })
      );
    });

    it('should throw 403 when editing investigation_fields without canEditCustomHighlightedFields', () => {
      const rulesAuthz = { ...getMockRulesAuthz(), canEditCustomHighlightedFields: false };
      const ruleUpdate = { investigation_fields: { field_names: ['host.name'] } };

      expect(() => validateFieldWritePermissions(ruleUpdate, rulesAuthz)).toThrow(
        expect.objectContaining({
          statusCode: 403,
          message:
            'The current user does not have the permissions to edit the following fields: investigation_fields',
        })
      );
    });

    it('should throw 403 when editing note without canEditInvestigationGuides', () => {
      const rulesAuthz = { ...getMockRulesAuthz(), canEditInvestigationGuides: false };
      const ruleUpdate = { note: 'Investigation guide content' };

      expect(() => validateFieldWritePermissions(ruleUpdate, rulesAuthz)).toThrow(
        expect.objectContaining({
          statusCode: 403,
          message:
            'The current user does not have the permissions to edit the following fields: note',
        })
      );
    });

    it('should aggregate multiple field errors into single error message', () => {
      const rulesAuthz = {
        ...getMockRulesAuthz(),
        canEditExceptions: false,
        canEditCustomHighlightedFields: false,
        canEditInvestigationGuides: false,
      };
      const ruleUpdate = {
        exceptions_list: [],
        investigation_fields: { field_names: ['host.name'] },
        note: 'Investigation guide',
      };

      expect(() => validateFieldWritePermissions(ruleUpdate, rulesAuthz)).toThrow(
        expect.objectContaining({
          statusCode: 403,
          message:
            'The current user does not have the permissions to edit the following fields: exceptions_list,investigation_fields,note',
        })
      );
    });
  });

  describe('validateEditedFieldWritePermissions', () => {
    it('should not throw when user has all required permissions', () => {
      const rulesAuthz = getMockRulesAuthz();
      const ruleUpdate = {
        exceptions_list: [],
        investigation_fields: { field_names: ['host.name'] },
        note: 'Investigation guide content',
      };

      expect(() => validateEditedFieldWritePermissions(ruleUpdate, rulesAuthz)).not.toThrow();
    });

    it('should not throw when a restricted field is absent from the edit', () => {
      const rulesAuthz = { ...getMockRulesAuthz(), canEditInvestigationGuides: false };
      const ruleUpdate = { exceptions_list: [] };

      expect(() => validateEditedFieldWritePermissions(ruleUpdate, rulesAuthz)).not.toThrow();
    });

    it('should throw 403 when setting a restricted field without permission', () => {
      const rulesAuthz = { ...getMockRulesAuthz(), canEditInvestigationGuides: false };
      const ruleUpdate = { note: 'Investigation guide content' };

      expect(() => validateEditedFieldWritePermissions(ruleUpdate, rulesAuthz)).toThrow(
        expect.objectContaining({
          statusCode: 403,
          message:
            'The current user does not have the permissions to edit the following fields: note',
        })
      );
    });

    it('should throw 403 when unsetting a restricted field via null without permission', () => {
      const rulesAuthz = { ...getMockRulesAuthz(), canEditInvestigationGuides: false };
      const ruleUpdate = { note: null } as unknown as Parameters<
        typeof validateEditedFieldWritePermissions
      >[0];

      expect(() => validateEditedFieldWritePermissions(ruleUpdate, rulesAuthz)).toThrow(
        expect.objectContaining({
          statusCode: 403,
          message:
            'The current user does not have the permissions to edit the following fields: note',
        })
      );
    });

    it('should throw 403 when unsetting a restricted field via undefined without permission', () => {
      const rulesAuthz = { ...getMockRulesAuthz(), canEditCustomHighlightedFields: false };
      const ruleUpdate = { investigation_fields: undefined };

      expect(() => validateEditedFieldWritePermissions(ruleUpdate, rulesAuthz)).toThrow(
        expect.objectContaining({
          statusCode: 403,
          message:
            'The current user does not have the permissions to edit the following fields: investigation_fields',
        })
      );
    });

    it('should aggregate multiple field errors into a single error message', () => {
      const rulesAuthz = {
        ...getMockRulesAuthz(),
        canEditExceptions: false,
        canEditCustomHighlightedFields: false,
        canEditInvestigationGuides: false,
      };
      const ruleUpdate = {
        exceptions_list: [],
        investigation_fields: undefined,
        note: null,
      } as unknown as Parameters<typeof validateEditedFieldWritePermissions>[0];

      expect(() => validateEditedFieldWritePermissions(ruleUpdate, rulesAuthz)).toThrow(
        expect.objectContaining({
          statusCode: 403,
          message:
            'The current user does not have the permissions to edit the following fields: exceptions_list,investigation_fields,note',
        })
      );
    });
  });

  describe('hasOnlyReadAuthEditableChanges', () => {
    it('should return true when only note changed', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = { ...getRulesSchemaMock(), note: 'Updated investigation guide' };

      expect(hasOnlyReadAuthEditableChanges(ruleUpdate, existingRule)).toBe(true);
    });

    it('should return true when only investigation_fields changed', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = {
        ...getRulesSchemaMock(),
        investigation_fields: { field_names: ['host.name', 'user.name'] },
      };

      expect(hasOnlyReadAuthEditableChanges(ruleUpdate, existingRule)).toBe(true);
    });

    it('should return true when only exceptions_list changed', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = {
        ...getRulesSchemaMock(),
        exceptions_list: [
          {
            id: 'new_list',
            list_id: 'new_list_id',
            namespace_type: 'single' as const,
            type: 'detection' as const,
          },
        ],
      };

      expect(hasOnlyReadAuthEditableChanges(ruleUpdate, existingRule)).toBe(true);
    });

    it('should return true when multiple read-auth fields changed', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = {
        ...getRulesSchemaMock(),
        note: 'Updated investigation guide',
        investigation_fields: { field_names: ['host.name'] },
        exceptions_list: [
          {
            id: 'new_list',
            list_id: 'new_list_id',
            namespace_type: 'single' as const,
            type: 'detection' as const,
          },
        ],
      };

      expect(hasOnlyReadAuthEditableChanges(ruleUpdate, existingRule)).toBe(true);
    });

    it('should return false when name changed', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = { ...getRulesSchemaMock(), name: 'Updated Rule Name' };

      expect(hasOnlyReadAuthEditableChanges(ruleUpdate, existingRule)).toBe(false);
    });

    it('should return false when description changed', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = { ...getRulesSchemaMock(), description: 'Updated description' };

      expect(hasOnlyReadAuthEditableChanges(ruleUpdate, existingRule)).toBe(false);
    });

    it('should return false when non-read-auth fields changed alongside read-auth fields', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = {
        ...getRulesSchemaMock(),
        note: 'Updated investigation guide',
        name: 'Updated Rule Name',
      };

      expect(hasOnlyReadAuthEditableChanges(ruleUpdate, existingRule)).toBe(false);
    });

    it('should return true when no fields changed', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = getRulesSchemaMock();

      expect(hasOnlyReadAuthEditableChanges(ruleUpdate, existingRule)).toBe(true);
    });
  });

  describe('extractChangedUpdatableFields', () => {
    it('should extract only changed note field', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = { ...getRulesSchemaMock(), note: 'Updated investigation guide' };

      const result = extractChangedUpdatableFields(ruleUpdate, existingRule);

      expect(result.note).toBe('Updated investigation guide');
      expect(result.rule_source).not.toBeUndefined();
      expect(result.exceptions_list).toBeUndefined();
      expect(result.investigation_fields).toBeUndefined();
    });

    it('should extract only changed investigation_fields field', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = {
        ...getRulesSchemaMock(),
        investigation_fields: { field_names: ['host.name', 'user.name'] },
      };

      const result = extractChangedUpdatableFields(ruleUpdate, existingRule);

      expect(result.investigation_fields).toEqual({ field_names: ['host.name', 'user.name'] });
      expect(result.rule_source).not.toBeUndefined();
      expect(result.note).toBeUndefined();
      expect(result.exceptions_list).toBeUndefined();
    });

    it('should always include rule_source', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = getRulesSchemaMock();

      const result = extractChangedUpdatableFields(ruleUpdate, existingRule);

      expect(result.rule_source).not.toBeUndefined();
    });

    it('should not include unchanged fields', () => {
      const existingRule = getRulesSchemaMock();
      existingRule.note = 'Same note';
      const ruleUpdate = { ...getRulesSchemaMock(), note: 'Same note' };

      const result = extractChangedUpdatableFields(ruleUpdate, existingRule);

      expect(result.note).toBeUndefined();
      expect(result.rule_source).not.toBeUndefined();
    });

    it('should extract multiple changed fields', () => {
      const existingRule = getRulesSchemaMock();
      const ruleUpdate = {
        ...getRulesSchemaMock(),
        note: 'Updated investigation guide',
        investigation_fields: { field_names: ['host.name'] },
        exceptions_list: [
          {
            id: 'new_list',
            list_id: 'new_list_id',
            namespace_type: 'single' as const,
            type: 'detection' as const,
          },
        ],
      };

      const result = extractChangedUpdatableFields(ruleUpdate, existingRule);

      expect(result.note).toBe('Updated investigation guide');
      expect(result.investigation_fields).toEqual({ field_names: ['host.name'] });
      expect(result.exceptions_list).not.toBeUndefined();
      expect(result.rule_source).not.toBeUndefined();
    });
  });

  describe('mergeExceptionLists', () => {
    test('should add back an exception_list if it was removed by the end user on an immutable rule during an upgrade', () => {
      const ruleAsset1 = getRulesSchemaMock();
      ruleAsset1.exceptions_list = [
        {
          id: 'endpoint_list',
          list_id: 'endpoint_list',
          namespace_type: 'agnostic',
          type: 'endpoint',
        },
      ];
      ruleAsset1.rule_id = 'rule-1';
      ruleAsset1.version = 2;

      const installedRule1 = getRulesSchemaMock();
      installedRule1.rule_id = 'rule-1';
      installedRule1.version = 1;
      installedRule1.exceptions_list = [];

      const update = mergeExceptionLists(ruleAsset1, installedRule1);
      expect(update.exceptions_list).toEqual(ruleAsset1.exceptions_list);
    });

    test('should not remove an additional exception_list if an additional one was added by the end user on an immutable rule during an upgrade', () => {
      const ruleAsset1 = getRulesSchemaMock();
      ruleAsset1.exceptions_list = [
        {
          id: 'endpoint_list',
          list_id: 'endpoint_list',
          namespace_type: 'agnostic',
          type: 'endpoint',
        },
      ];
      ruleAsset1.rule_id = 'rule-1';
      ruleAsset1.version = 2;

      const installedRule1 = getRulesSchemaMock();
      installedRule1.rule_id = 'rule-1';
      installedRule1.version = 1;
      installedRule1.exceptions_list = [
        {
          id: 'second_exception_list',
          list_id: 'some-other-id',
          namespace_type: 'single',
          type: 'detection',
        },
      ];

      const update = mergeExceptionLists(ruleAsset1, installedRule1);
      expect(update.exceptions_list).toEqual([
        ...ruleAsset1.exceptions_list,
        ...installedRule1.exceptions_list,
      ]);
    });

    test('should not remove an existing exception_list if they are the same between the current installed one and the upgraded one', () => {
      const ruleAsset1 = getRulesSchemaMock();
      ruleAsset1.exceptions_list = [
        {
          id: 'endpoint_list',
          list_id: 'endpoint_list',
          namespace_type: 'agnostic',
          type: 'endpoint',
        },
      ];
      ruleAsset1.rule_id = 'rule-1';
      ruleAsset1.version = 2;

      const installedRule1 = getRulesSchemaMock();
      installedRule1.rule_id = 'rule-1';
      installedRule1.version = 1;
      installedRule1.exceptions_list = [
        {
          id: 'endpoint_list',
          list_id: 'endpoint_list',
          namespace_type: 'agnostic',
          type: 'endpoint',
        },
      ];

      const update = mergeExceptionLists(ruleAsset1, installedRule1);
      expect(update.exceptions_list).toEqual(ruleAsset1.exceptions_list);
    });

    test('should not remove an existing exception_list if the rule has an empty exceptions list', () => {
      const ruleAsset1 = getRulesSchemaMock();
      ruleAsset1.exceptions_list = [];
      ruleAsset1.rule_id = 'rule-1';
      ruleAsset1.version = 2;

      const installedRule1 = getRulesSchemaMock();
      installedRule1.rule_id = 'rule-1';
      installedRule1.version = 1;
      installedRule1.exceptions_list = [
        {
          id: 'endpoint_list',
          list_id: 'endpoint_list',
          namespace_type: 'agnostic',
          type: 'endpoint',
        },
      ];

      const update = mergeExceptionLists(ruleAsset1, installedRule1);
      expect(update.exceptions_list).toEqual(installedRule1.exceptions_list);
    });
  });
});
