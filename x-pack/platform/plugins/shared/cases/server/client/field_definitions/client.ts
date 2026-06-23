/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { castArray } from 'lodash';
import type { SavedObject } from '@kbn/core/server';
import type {
  CreateFieldDefinitionInput,
  FieldDefinition,
  UpdateFieldDefinitionInput,
} from '../../../common/types/domain/field_definition/latest';
import type {
  FieldDefinitionsFindRequest,
  FieldDefinitionsFindResponse,
} from '../../../common/types/api/field_definition/v1';
import type { CasesClientArgs } from '../types';
import { Operations } from '../../authorization';
import { MAX_FIELD_DEFINITIONS_PER_OWNER } from '../../../common/constants';

/**
 * API for interacting with field definitions (the reusable fields library).
 */
export interface FieldDefinitionsSubClient {
  getFieldDefinitions(params: FieldDefinitionsFindRequest): Promise<FieldDefinitionsFindResponse>;
  getFieldDefinition(id: string): Promise<SavedObject<FieldDefinition>>;
  createFieldDefinition(input: CreateFieldDefinitionInput): Promise<SavedObject<FieldDefinition>>;
  updateFieldDefinition(
    id: string,
    input: UpdateFieldDefinitionInput
  ): Promise<SavedObject<FieldDefinition>>;
  deleteFieldDefinition(id: string): Promise<void>;
}

/**
 * Creates the interface for field definitions.
 *
 * @ignore
 */
export const createFieldDefinitionsSubClient = (
  clientArgs: CasesClientArgs
): FieldDefinitionsSubClient => {
  const { services, authorization } = clientArgs;
  const { fieldDefinitionsService } = services;

  const fieldDefinitionsSubClient: FieldDefinitionsSubClient = {
    getFieldDefinitions: async (params: FieldDefinitionsFindRequest) => {
      const owners = params.owner ? castArray(params.owner) : [];
      if (owners.length === 0) {
        throw Boom.badRequest('owner is required');
      }
      await authorization.ensureAuthorized({
        operation: Operations.getFieldDefinitions,
        entities: owners.map((owner) => ({ owner, id: owner })),
      });
      return fieldDefinitionsService.getFieldDefinitions(owners, {
        isGlobal: params.isGlobal,
      });
    },

    getFieldDefinition: async (id: string) => {
      const fieldDef = await fieldDefinitionsService.getFieldDefinition(id);
      await authorization.ensureAuthorized({
        operation: Operations.manageTemplate,
        entities: [{ owner: fieldDef.attributes.owner, id: fieldDef.id }],
      });
      return fieldDef;
    },

    createFieldDefinition: async (input: CreateFieldDefinitionInput) => {
      await authorization.ensureAuthorized({
        operation: Operations.manageTemplate,
        entities: [{ owner: input.owner, id: input.name }],
      });

      const existing = await fieldDefinitionsService.getFieldDefinitions([input.owner]);

      if (existing.total >= MAX_FIELD_DEFINITIONS_PER_OWNER) {
        throw Boom.badRequest(
          `Cannot create more than ${MAX_FIELD_DEFINITIONS_PER_OWNER} field definitions per owner.`
        );
      }

      const nameLower = input.name.toLowerCase();
      const conflict = existing.fieldDefinitions.find((fd) => fd.name.toLowerCase() === nameLower);
      if (conflict) {
        throw Boom.conflict(
          `A field definition with name "${conflict.name}" already exists for this owner.`
        );
      }

      return fieldDefinitionsService.createFieldDefinition(input);
    },

    // Field definitions are library-level objects, not case-level objects. They are
    // not part of any case's audit trail so no UserAction is created for mutations.
    updateFieldDefinition: async (id: string, input: UpdateFieldDefinitionInput) => {
      const fieldDef = await fieldDefinitionsService.getFieldDefinition(id);
      await authorization.ensureAuthorized({
        operation: Operations.manageTemplate,
        entities: [{ owner: fieldDef.attributes.owner, id: fieldDef.id }],
      });
      if (input.owner !== fieldDef.attributes.owner) {
        throw Boom.badRequest(
          `Cannot change the owner of a field definition. Current owner: ${fieldDef.attributes.owner}`
        );
      }

      const existing = await fieldDefinitionsService.getFieldDefinitions([
        fieldDef.attributes.owner,
      ]);
      const nameLower = input.name.toLowerCase();
      const conflict = existing.fieldDefinitions.find(
        (fd) => fd.name.toLowerCase() === nameLower && fd.fieldDefinitionId !== id
      );
      if (conflict) {
        throw Boom.conflict(
          `A field definition with name "${conflict.name}" already exists for this owner.`
        );
      }

      return fieldDefinitionsService.updateFieldDefinition(id, input);
    },

    deleteFieldDefinition: async (id: string) => {
      const fieldDef = await fieldDefinitionsService.getFieldDefinition(id);
      await authorization.ensureAuthorized({
        operation: Operations.manageTemplate,
        entities: [{ owner: fieldDef.attributes.owner, id: fieldDef.id }],
      });
      return fieldDefinitionsService.deleteFieldDefinition(id);
    },
  };

  return Object.freeze(fieldDefinitionsSubClient);
};
