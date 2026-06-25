/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { differenceWith, intersectionWith, isEmpty } from 'lodash';
import Boom from '@hapi/boom';
import type { Logger } from '@kbn/core/server';
import type { CustomFieldsConfiguration } from '../../../common/types/domain';
import { CaseStatuses } from '../../../common/types/domain';
import type {
  CasePatchRequest,
  CaseRequestCustomFields,
  CasesSearchRequest,
} from '../../../common/types/api';
import { validateDuplicatedKeysInRequest } from '../validators';
import type { ICasesCustomField } from '../../custom_fields';
import { casesCustomFields } from '../../custom_fields';
import { MAX_CUSTOM_FIELDS_PER_CASE } from '../../../common/constants';
import type { CaseSavedObjectTransformed } from '../../common/types/case';
import type { TemplatesService } from '../../services/templates';
import type { FieldDefinitionsService } from '../../services/field_definitions';
import { parseTemplate } from '../../routes/api/templates/parse_template';
import { validateExtendedFields } from '../../../common/types/domain/template/validate_extended_fields';
import { parseFieldDefinitionsToInlineFields, getFieldSnakeKey } from '../../../common/utils';
import type { InlineField } from '../../../common/types/domain/template/fields';
import { isInlineField, FieldType } from '../../../common/types/domain/template/fields';
import { evaluateCondition } from '../../../common/types/domain/template/evaluate_conditions';

interface CustomFieldValidationParams {
  requestCustomFields?: CaseRequestCustomFields;
  customFieldsConfiguration?: CustomFieldsConfiguration;
}

export const validateCustomFields = (params: CustomFieldValidationParams) => {
  validateDuplicatedKeysInRequest({
    requestFields: params.requestCustomFields,
    fieldName: 'customFields',
  });
  validateCustomFieldKeysAgainstConfiguration(params);
  validateRequiredCustomFields(params);
  validateCustomFieldTypesInRequest(params);
};

/**
 * Throws if the type doesn't match the configuration.
 */
export function validateCustomFieldTypesInRequest({
  requestCustomFields,
  customFieldsConfiguration,
}: CustomFieldValidationParams) {
  if (!Array.isArray(requestCustomFields) || !requestCustomFields.length) {
    return;
  }

  if (customFieldsConfiguration === undefined) {
    throw Boom.badRequest('No custom fields configured.');
  }

  const invalidCustomFields = intersectionWith(
    customFieldsConfiguration,
    requestCustomFields,
    (requiredVal, requestedVal) =>
      requiredVal.key === requestedVal.key && requiredVal.type !== requestedVal.type
  ).map((config) => `"${config.label ? config.label : 'Unknown'}"`);

  if (invalidCustomFields.length) {
    throw Boom.badRequest(
      `The following custom fields have the wrong type in the request: ${invalidCustomFields.join(
        ', '
      )}`
    );
  }
}

/**
 * Throws if the key doesn't match the configuration or is missing
 */
export const validateCustomFieldKeysAgainstConfiguration = ({
  requestCustomFields,
  customFieldsConfiguration,
}: CustomFieldValidationParams) => {
  if (!Array.isArray(requestCustomFields) || !requestCustomFields.length) {
    return [];
  }

  if (customFieldsConfiguration === undefined) {
    throw Boom.badRequest('No custom fields configured.');
  }

  const invalidCustomFieldKeys = differenceWith(
    requestCustomFields,
    customFieldsConfiguration,
    (requestVal, configurationVal) => requestVal.key === configurationVal.key
  ).map((e) => e.key);

  if (invalidCustomFieldKeys.length) {
    throw Boom.badRequest(`Invalid custom field keys: ${invalidCustomFieldKeys}`);
  }
};

/**
 * Returns a list of required custom fields missing from the request
 * that don't have a default value configured.
 */
export const validateRequiredCustomFields = ({
  requestCustomFields,
  customFieldsConfiguration,
}: CustomFieldValidationParams) => {
  if (customFieldsConfiguration === undefined) {
    if (!Array.isArray(requestCustomFields) || !requestCustomFields.length) {
      return;
    } else {
      throw Boom.badRequest('No custom fields configured.');
    }
  }

  const requiredCustomFields = customFieldsConfiguration.filter(
    (customField) => customField.required
  );

  if (!requiredCustomFields.length) {
    return;
  }

  const missingRequiredCustomFields = differenceWith(
    requiredCustomFields,
    requestCustomFields ?? [],
    (configuration, request) => configuration.key === request.key
  ) // missing custom field and missing defaultValue -> error
    .filter(
      (customField) => customField.defaultValue === undefined || customField.defaultValue === null
    )
    .map((e) => `"${e.label}"`);

  if (missingRequiredCustomFields.length) {
    throw Boom.badRequest(
      `Missing required custom fields without default value configured: ${missingRequiredCustomFields.join(
        ', '
      )}`
    );
  }

  const nullRequiredCustomFields = requiredCustomFields
    .filter((requiredField) => {
      const found = requestCustomFields?.find(
        (requestField) => requestField.key === requiredField.key
      );

      // required custom fields cannot be set to null
      return found && found.value === null;
    })
    .map((e) => `"${e.label}"`);

  if (nullRequiredCustomFields.length) {
    throw Boom.badRequest(
      `Invalid value "null" supplied for the following required custom fields: ${nullRequiredCustomFields.join(
        ', '
      )}`
    );
  }
};

/**
 * Fetches isGlobal field definitions for the given owner and returns them as
 * parsed inline fields.
 *
 * Uses the unsecured SO client directly because the `owner` has already been
 * validated by `authorization.ensureAuthorized` on the parent case operation —
 * no additional privilege check is required here.
 */
export const resolveGlobalFields = async (
  owner: string,
  fieldDefinitionsService: FieldDefinitionsService
): Promise<InlineField[]> => {
  const { fieldDefinitions } = await fieldDefinitionsService.getFieldDefinitions(owner, {
    isGlobal: true,
  });
  return parseFieldDefinitionsToInlineFields(fieldDefinitions);
};

/**
 * @deprecated Use `resolveGlobalFields` instead (returns the full InlineField array so
 * values can be validated against each field's definition).
 */
export const resolveGlobalFieldKeys = async (
  owner: string,
  fieldDefinitionsService: FieldDefinitionsService
): Promise<Set<string>> => {
  const inlineFields = await resolveGlobalFields(owner, fieldDefinitionsService);
  return new Set(inlineFields.map((f) => getFieldSnakeKey(f.name, f.type)));
};

/**
 * Shared helper that validates `extended_fields` in a case create or update request.
 *
 * - When there is no active template, only keys that correspond to `isGlobal` field
 *   definitions are permitted, and their *values* are validated against each definition.
 * - When a template is present, template-specific keys are validated against the template
 *   definition; global keys are validated against the global field definitions.
 *
 * Throws Boom.badRequest on any violation.
 */
export const validateCaseExtendedFields = async ({
  extendedFields,
  templateId,
  globalFields,
  templatesService,
  partial = false,
}: {
  extendedFields: Record<string, string>;
  templateId: string | null | undefined;
  globalFields: InlineField[];
  templatesService: TemplatesService;
  /** Pass `true` for update paths where only a subset of fields may be present. */
  partial?: boolean;
}): Promise<void> => {
  const globalKeySet = new Set(globalFields.map((f) => getFieldSnakeKey(f.name, f.type)));

  if (!templateId) {
    // No template — only global field keys are permitted.
    const invalidKeys = Object.keys(extendedFields).filter((k) => !globalKeySet.has(k));
    if (invalidKeys.length) {
      throw Boom.badRequest(
        `extended_fields keys [${invalidKeys.join(
          ', '
        )}] are not global (isGlobal) field definitions`
      );
    }
    // Also validate the VALUES against each global field's own definition.
    const globalErrors = validateExtendedFields(extendedFields, globalFields, { partial });
    if (globalErrors.length) {
      throw Boom.badRequest(`Invalid extended_fields: ${globalErrors.join('; ')}`);
    }
    return;
  }

  const templateSO = await templatesService.getTemplate(templateId);
  if (!templateSO) {
    throw Boom.badRequest(`Template ${templateId} not found`);
  }
  let parsedTemplate;
  try {
    parsedTemplate = parseTemplate(templateSO.attributes);
  } catch (err) {
    throw Boom.badRequest(`Template ${templateId} has an invalid definition`);
  }

  // Validate template-specific keys against the template definition.
  const templateOnlyFields = Object.fromEntries(
    Object.entries(extendedFields).filter(([k]) => !globalKeySet.has(k))
  );
  const templateErrors = validateExtendedFields(
    templateOnlyFields,
    parsedTemplate.definition.fields,
    { partial }
  );
  if (templateErrors.length) {
    throw Boom.badRequest(`Invalid extended_fields: ${templateErrors.join('; ')}`);
  }

  // Also validate global-key VALUES against their own definitions.
  const globalOnlyFields = Object.fromEntries(
    Object.entries(extendedFields).filter(([k]) => globalKeySet.has(k))
  );
  if (Object.keys(globalOnlyFields).length > 0) {
    const globalErrors = validateExtendedFields(globalOnlyFields, globalFields, { partial });
    if (globalErrors.length) {
      throw Boom.badRequest(`Invalid extended_fields: ${globalErrors.join('; ')}`);
    }
  }
};

export const validateExtendedFieldsInRequest = async ({
  updateReq,
  originalCase,
  templatesService,
  globalFields,
}: {
  updateReq: CasePatchRequest;
  originalCase: CaseSavedObjectTransformed;
  templatesService: TemplatesService;
  globalFields: InlineField[];
}): Promise<void> => {
  if (!updateReq.extended_fields) return;

  // null means the template is being cleared; undefined means it is not changing.
  const templateId =
    updateReq.template === null
      ? null
      : updateReq.template?.id ?? originalCase.attributes.template?.id;

  await validateCaseExtendedFields({
    extendedFields: updateReq.extended_fields,
    templateId,
    globalFields,
    templatesService,
    partial: true,
  });
};

/**
 * Fetches and parses a template's inline fields for use in close-time validation.
 * Returns [] if the template is not found or its definition is unparseable.
 * Callers in bulk operations should pre-resolve templates by ID+version to avoid N SO fetches.
 *
 * Pass `templateVersion` to pin validation to the version the case was created with, preventing
 * a later template edit (adding a required_on_close field) from blocking closure of older cases.
 * When omitted, falls back to the latest version.
 */
export const resolveTemplateFieldsForClose = async ({
  templateId,
  templateVersion,
  templatesService,
  logger,
}: {
  templateId: string;
  templateVersion?: number;
  templatesService: TemplatesService;
  logger: Logger;
}): Promise<InlineField[]> => {
  const templateSO = await templatesService.getTemplate(
    templateId,
    templateVersion != null ? String(templateVersion) : undefined
  );
  if (!templateSO) {
    return [];
  }
  try {
    const parsedTemplate = parseTemplate(templateSO.attributes);
    return parsedTemplate.definition.fields.filter(isInlineField);
  } catch (err) {
    logger.warn(
      `Failed to parse template "${templateId}" definition during close validation — skipping template field enforcement: ${err}`
    );
    return [];
  }
};

/**
 * Validates that all `required_on_close` fields are filled when a case transitions to closed.
 * Operates on the merged extended_fields (existing SO state + request updates).
 * Only checks fields with `required_on_close: true` — regular required fields are a write-time
 * concern and are not re-validated here. Orphaned keys from old templates are silently ignored.
 *
 * Template fields must be pre-resolved by the caller (via resolveTemplateFieldsForClose) so that
 * bulk operations can deduplicate SO fetches across cases sharing the same template.
 *
 * NOTE: We intentionally do not delegate to the common validateExtendedFields({ onClose: true })
 * here, even though that option was added in the same PR, because:
 *   1. The common function is designed for client-side real-time preview (no SO access; caller
 *      provides a flat extendedFields map). Here we operate on pre-merged SO + request state.
 *   2. This implementation passes fieldControlMap to evaluateCondition for correct
 *      CHECKBOX_GROUP / USER_PICKER show_when evaluation — the common function omits it
 *      (pre-existing gap). If the common function gains fieldControlMap support, this can
 *      be revisited.
 */
export const validateExtendedFieldsOnClose = ({
  updateReq,
  originalCase,
  templateFields,
  globalFields,
}: {
  updateReq: CasePatchRequest;
  originalCase: CaseSavedObjectTransformed;
  templateFields: InlineField[];
  globalFields: InlineField[];
}): void => {
  if (
    updateReq.status !== CaseStatuses.closed ||
    originalCase.attributes.status === CaseStatuses.closed
  ) {
    return;
  }

  const mergedExtendedFields: Record<string, string> = {
    ...(originalCase.attributes.extended_fields ?? {}),
    ...(updateReq.extended_fields ?? {}),
  };

  const allFields = [...globalFields, ...templateFields];

  // Build helper maps for condition evaluation (show_when).
  const fieldValues: Record<string, string | undefined> = {};
  const fieldTypeMap: Record<string, string> = {};
  const fieldControlMap: Record<string, string> = {};
  for (const field of allFields) {
    fieldValues[field.name] = mergedExtendedFields[getFieldSnakeKey(field.name, field.type)];
    fieldTypeMap[field.name] = field.type;
    fieldControlMap[field.name] = field.control;
  }

  const isFieldVisible = (field: InlineField): boolean =>
    field.display?.show_when == null ||
    evaluateCondition(field.display.show_when, fieldValues, fieldTypeMap, fieldControlMap);

  const isFieldEmpty = (field: InlineField): boolean => {
    const value = fieldValues[field.name];
    const isArrayField =
      field.control === FieldType.CHECKBOX_GROUP || field.control === FieldType.USER_PICKER;
    return (
      value === undefined || value === null || value === '' || (isArrayField && value === '[]')
    );
  };

  const errors = allFields
    .filter(
      (field) =>
        field.validation?.required_on_close === true && isFieldVisible(field) && isFieldEmpty(field)
    )
    .map((field) => `Field "${field.label ?? field.name}" is required`);

  if (errors.length > 0) {
    throw Boom.badRequest(
      `Cannot close case ${updateReq.id}, required fields must be filled: ${errors.join('; ')}`
    );
  }
};

export const validateSearchCasesCustomFields = ({
  customFieldsConfiguration,
  customFields,
}: {
  customFieldsConfiguration: CustomFieldsConfiguration;
  customFields: CasesSearchRequest['customFields'];
}) => {
  let customFieldsMapping: ICasesCustomField | null = null;

  if (!customFields || isEmpty(customFields)) {
    return;
  }

  if (!customFieldsConfiguration.length) {
    throw Boom.badRequest('No custom fields configured.');
  }

  if (Object.keys(customFields).length > MAX_CUSTOM_FIELDS_PER_CASE) {
    throw Boom.badRequest(`Maximum ${MAX_CUSTOM_FIELDS_PER_CASE} customFields are allowed.`);
  }

  Object.entries(customFields).forEach(([key, value]) => {
    const customFieldConfig = customFieldsConfiguration.find((config) => config.key === key);

    if (!customFieldConfig) {
      throw Boom.badRequest(`Invalid custom field key: ${key}.`);
    }

    customFieldsMapping = casesCustomFields.get(customFieldConfig.type);

    if (!customFieldsMapping?.isFilterable) {
      throw Boom.badRequest(
        `Filtering by custom field of type ${customFieldConfig.type} is not allowed.`
      );
    }

    customFieldsMapping?.validateFilteringValues(value);
  });
};
