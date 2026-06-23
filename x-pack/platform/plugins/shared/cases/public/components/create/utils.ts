/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty } from 'lodash';
import type { CasePostRequest } from '../../../common';
import { GENERAL_CASES_OWNER } from '../../../common';
import { CASE_EXTENDED_FIELDS } from '../../../common/constants';
import type { ActionConnector } from '../../../common/types/domain';
import { getInitialCaseValue } from '../../../common/utils/get_initial_case_value';
import { getNoneConnector } from '../../../common/utils/connectors';
import type { CasesConfigurationUI } from '../../containers/types';
import type { CaseFormFieldsSchemaProps } from '../case_form_fields/schema';
import { normalizeActionConnector } from '../configure_cases/utils';
import {
  customFieldsFormDeserializer,
  customFieldsFormSerializer,
  getConnectorById,
  getConnectorsFormSerializer,
} from '../utils';

export const trimUserFormData = (
  userFormData: Omit<
    CaseFormFieldsSchemaProps,
    | 'connectorId'
    | 'fields'
    | 'syncAlerts'
    | 'extractObservables'
    | 'customFields'
    | 'templateId'
    | 'templateVersion'
  >
) => {
  let formData = {
    ...userFormData,
    title: userFormData.title.trim(),
    description: userFormData.description.trim(),
  };

  if (userFormData.category) {
    formData = { ...formData, category: userFormData.category.trim() };
  }

  if (userFormData.tags) {
    formData = { ...formData, tags: userFormData.tags.map((tag: string) => tag.trim()) };
  }

  return formData;
};

export const createFormDeserializer = (data: CasePostRequest): CaseFormFieldsSchemaProps => {
  const {
    connector,
    settings,
    customFields,
    [CASE_EXTENDED_FIELDS]: extendedFieldsFromResponse,
    ...restData
  } = data;

  return {
    ...restData,
    connectorId: connector.id,
    fields: connector.fields,
    syncAlerts: settings.syncAlerts,
    extractObservables: settings.extractObservables ?? false,
    customFields: customFieldsFormDeserializer(customFields) ?? {},
    ...(extendedFieldsFromResponse != null
      ? { [CASE_EXTENDED_FIELDS]: extendedFieldsFromResponse }
      : {}),
  };
};

export const createFormSerializer = (
  connectors: ActionConnector[],
  currentConfiguration: CasesConfigurationUI,
  data: CaseFormFieldsSchemaProps
): CasePostRequest => {
  if (data == null || isEmpty(data)) {
    return getInitialCaseValue({
      owner: currentConfiguration.owner,
      connector: currentConfiguration.connector,
    });
  }

  const {
    connectorId: dataConnectorId,
    fields,
    syncAlerts,
    extractObservables,
    customFields,
    templateId,
    templateVersion,
    [CASE_EXTENDED_FIELDS]: extendedFields,
    ...restData
  } = data;

  const serializedConnectorFields = getConnectorsFormSerializer({ fields });
  const caseConnector = getConnectorById(dataConnectorId, connectors);
  const connectorToUpdate = caseConnector
    ? normalizeActionConnector(caseConnector, serializedConnectorFields.fields)
    : getNoneConnector();

  const transformedCustomFields = customFieldsFormSerializer(
    customFields,
    currentConfiguration.customFields
  );

  const trimmedData = trimUserFormData(restData);

  return {
    ...trimmedData,
    connector: connectorToUpdate,
    settings: { syncAlerts: syncAlerts ?? false, extractObservables: extractObservables ?? false },
    owner: currentConfiguration.owner,
    customFields: transformedCustomFields,
    ...(extendedFields != null ? { [CASE_EXTENDED_FIELDS]: extendedFields } : {}),
    ...(templateId && templateVersion
      ? { template: { id: templateId, version: templateVersion } }
      : {}),
  };
};

export const getOwnerDefaultValue = (availableOwners: string[]) =>
  availableOwners.includes(GENERAL_CASES_OWNER)
    ? GENERAL_CASES_OWNER
    : availableOwners[0] ?? GENERAL_CASES_OWNER;
