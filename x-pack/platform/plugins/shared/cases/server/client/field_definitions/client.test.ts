/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject } from '@kbn/core/server';
import { createCasesClientMockArgs } from '../mocks';
import { createFieldDefinitionsSubClient } from './client';
import type { FieldDefinition } from '../../../common/types/domain/field_definition/v1';
import {
  CASE_FIELD_DEFINITION_SAVED_OBJECT,
  MAX_FIELD_DEFINITIONS_PER_OWNER,
} from '../../../common/constants';

const makeFieldDefinitionSO = (
  overrides: Partial<FieldDefinition> & { id?: string } = {}
): SavedObject<FieldDefinition> => {
  const { id = 'fd-1', ...attrs } = overrides;
  return {
    id,
    type: CASE_FIELD_DEFINITION_SAVED_OBJECT,
    references: [],
    attributes: {
      fieldDefinitionId: id,
      name: 'my_field',
      owner: 'securitySolution' as const,
      definition: 'name: my_field\ncontrol: INPUT_TEXT\ntype: keyword\n',
      ...attrs,
    },
  };
};

describe('createFieldDefinitionsSubClient', () => {
  let clientArgs: ReturnType<typeof createCasesClientMockArgs>;
  let client: ReturnType<typeof createFieldDefinitionsSubClient>;

  beforeEach(() => {
    clientArgs = createCasesClientMockArgs();
    client = createFieldDefinitionsSubClient(clientArgs);
    clientArgs.authorization.ensureAuthorized.mockResolvedValue();
  });

  describe('getFieldDefinitions', () => {
    it('throws 400 when no owner is provided', async () => {
      await expect(client.getFieldDefinitions({})).rejects.toThrow('owner is required');
      expect(clientArgs.authorization.ensureAuthorized).not.toHaveBeenCalled();
      expect(
        clientArgs.services.fieldDefinitionsService.getFieldDefinitions
      ).not.toHaveBeenCalled();
    });

    it('returns field definitions for a valid owner', async () => {
      const so = makeFieldDefinitionSO();
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [so.attributes],
        total: 1,
      });

      const result = await client.getFieldDefinitions({ owner: 'securitySolution' });

      expect(clientArgs.authorization.ensureAuthorized).toHaveBeenCalled();
      expect(result.fieldDefinitions).toHaveLength(1);
    });

    it('forwards isGlobal to fieldDefinitionsService', async () => {
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [],
        total: 0,
      });

      await client.getFieldDefinitions({ owner: 'securitySolution', isGlobal: true });

      expect(clientArgs.services.fieldDefinitionsService.getFieldDefinitions).toHaveBeenCalledWith(
        ['securitySolution'],
        { isGlobal: true }
      );
    });
  });

  describe('createFieldDefinition', () => {
    const input = {
      name: 'my_field',
      owner: 'securitySolution' as const,
      definition: 'name: my_field\ncontrol: INPUT_TEXT\ntype: keyword\n',
    };

    it('creates a field definition when no name conflict exists', async () => {
      const so = makeFieldDefinitionSO();
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [],
        total: 0,
      });
      clientArgs.services.fieldDefinitionsService.createFieldDefinition.mockResolvedValue(so);

      const result = await client.createFieldDefinition(input);

      expect(result).toBe(so);
      expect(
        clientArgs.services.fieldDefinitionsService.createFieldDefinition
      ).toHaveBeenCalledWith(input);
    });

    it('throws 400 when the owner already has the maximum number of field definitions', async () => {
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: Array(MAX_FIELD_DEFINITIONS_PER_OWNER).fill(
          makeFieldDefinitionSO().attributes
        ),
        total: MAX_FIELD_DEFINITIONS_PER_OWNER,
      });

      await expect(client.createFieldDefinition(input)).rejects.toThrow(
        `Cannot create more than ${MAX_FIELD_DEFINITIONS_PER_OWNER} field definitions per owner.`
      );
      expect(
        clientArgs.services.fieldDefinitionsService.createFieldDefinition
      ).not.toHaveBeenCalled();
    });

    it('throws 409 when a field with the same name already exists', async () => {
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [makeFieldDefinitionSO().attributes],
        total: 1,
      });

      await expect(client.createFieldDefinition(input)).rejects.toThrow(
        'A field definition with name "my_field" already exists for this owner.'
      );
    });

    it('is case-insensitive when checking for name conflicts', async () => {
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [makeFieldDefinitionSO({ name: 'MY_FIELD' }).attributes],
        total: 1,
      });

      await expect(client.createFieldDefinition({ ...input, name: 'my_field' })).rejects.toThrow(
        'A field definition with name "MY_FIELD" already exists for this owner.'
      );
    });
  });

  describe('updateFieldDefinition', () => {
    const input = {
      name: 'my_field',
      owner: 'securitySolution' as const,
      definition: 'name: my_field\ncontrol: INPUT_TEXT\ntype: keyword\n',
    };

    it('updates a field definition when no name conflict exists', async () => {
      const so = makeFieldDefinitionSO();
      clientArgs.services.fieldDefinitionsService.getFieldDefinition.mockResolvedValue(so);
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [so.attributes],
        total: 1,
      });
      clientArgs.services.fieldDefinitionsService.updateFieldDefinition.mockResolvedValue(so);

      const result = await client.updateFieldDefinition('fd-1', input);

      expect(result).toBe(so);
    });

    it('allows updating a field to keep its own name', async () => {
      const so = makeFieldDefinitionSO({ id: 'fd-1', name: 'my_field' });
      clientArgs.services.fieldDefinitionsService.getFieldDefinition.mockResolvedValue(so);
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [so.attributes],
        total: 1,
      });
      clientArgs.services.fieldDefinitionsService.updateFieldDefinition.mockResolvedValue(so);

      await expect(client.updateFieldDefinition('fd-1', input)).resolves.toBe(so);
    });

    it('throws 409 when another field has the same name', async () => {
      const so = makeFieldDefinitionSO({ id: 'fd-1', name: 'my_field' });
      const other = makeFieldDefinitionSO({ id: 'fd-2', name: 'new_name' });
      clientArgs.services.fieldDefinitionsService.getFieldDefinition.mockResolvedValue(so);
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [so.attributes, other.attributes],
        total: 2,
      });

      await expect(
        client.updateFieldDefinition('fd-1', { ...input, name: 'new_name' })
      ).rejects.toThrow('A field definition with name "new_name" already exists for this owner.');
    });

    it('is case-insensitive when checking for name conflicts on update', async () => {
      const so = makeFieldDefinitionSO({ id: 'fd-1', name: 'my_field' });
      const other = makeFieldDefinitionSO({ id: 'fd-2', name: 'Other_Field' });
      clientArgs.services.fieldDefinitionsService.getFieldDefinition.mockResolvedValue(so);
      clientArgs.services.fieldDefinitionsService.getFieldDefinitions.mockResolvedValue({
        fieldDefinitions: [so.attributes, other.attributes],
        total: 2,
      });

      await expect(
        client.updateFieldDefinition('fd-1', { ...input, name: 'other_field' })
      ).rejects.toThrow(
        'A field definition with name "Other_Field" already exists for this owner.'
      );
    });
  });
});
