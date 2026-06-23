/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CreateFieldDefinitionInput,
  FieldDefinition,
  UpdateFieldDefinitionInput,
} from '../../../../common/types/domain/field_definition/v1';
import type { FieldDefinitionsFindResponse } from '../../../../common/types/api/field_definition/v1';
import {
  INTERNAL_FIELD_DEFINITIONS_URL,
  INTERNAL_FIELD_DEFINITION_DETAILS_URL,
} from '../../../../common/constants';
import { KibanaServices } from '../../../common/lib/kibana';

export const getFieldDefinitions = async ({
  owner,
  isGlobal,
  signal,
}: {
  owner?: string | string[];
  isGlobal?: boolean;
  signal?: AbortSignal;
}): Promise<FieldDefinitionsFindResponse> => {
  return KibanaServices.get().http.fetch<FieldDefinitionsFindResponse>(
    INTERNAL_FIELD_DEFINITIONS_URL,
    {
      method: 'GET',
      query: {
        ...(owner ? { owner } : {}),
        ...(isGlobal !== undefined ? { isGlobal } : {}),
      },
      signal,
    }
  );
};

export const postFieldDefinition = async ({
  fieldDefinition,
  signal,
}: {
  fieldDefinition: CreateFieldDefinitionInput;
  signal?: AbortSignal;
}): Promise<FieldDefinition> => {
  return KibanaServices.get().http.fetch<FieldDefinition>(INTERNAL_FIELD_DEFINITIONS_URL, {
    method: 'POST',
    body: JSON.stringify(fieldDefinition),
    signal,
  });
};

export const putFieldDefinition = async ({
  id,
  fieldDefinition,
  signal,
}: {
  id: string;
  fieldDefinition: UpdateFieldDefinitionInput;
  signal?: AbortSignal;
}): Promise<FieldDefinition> => {
  const url = INTERNAL_FIELD_DEFINITION_DETAILS_URL.replace('{field_definition_id}', id);
  return KibanaServices.get().http.fetch<FieldDefinition>(url, {
    method: 'PUT',
    body: JSON.stringify(fieldDefinition),
    signal,
  });
};

export const deleteFieldDefinition = async ({
  id,
  signal,
}: {
  id: string;
  signal?: AbortSignal;
}): Promise<void> => {
  const url = INTERNAL_FIELD_DEFINITION_DETAILS_URL.replace('{field_definition_id}', id);
  return KibanaServices.get().http.fetch(url, {
    method: 'DELETE',
    signal,
  });
};
