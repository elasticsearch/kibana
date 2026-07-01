/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { parse as parseYaml } from 'yaml';
import { useFormContext, useFormData } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import type { ParsedTemplate } from '../../../common/types/domain/template/v1';
import { CASE_EXTENDED_FIELDS } from '../../../common/constants';
import { ConnectorTypes } from '../../../common/types/domain';
import type { CaseConnectorWithoutName } from '../../../common/types/domain_zod/connector/v1';
import { useGetTemplate } from '../templates_v2/hooks/use_get_template';
import { getFieldSnakeKey } from '../../../common/utils';
import { getYamlDefaultAsString } from '../templates_v2/utils';
import {
  FieldSchema,
  isInlineField,
  isRefField,
} from '../../../common/types/domain/template/fields';
import type { InlineField } from '../../../common/types/domain/template/fields';
import { useGetFieldDefinitions } from '../field_library/hooks/use_get_field_definitions';
import { useGetSupportedActionConnectors } from '../../containers/configure/use_get_supported_action_connectors';

/**
 * Default form values restored when a template that had set the connector / settings is cleared.
 * These mirror the create form schema defaults (`case_form_fields/schema.tsx`).
 */
const NONE_CONNECTOR_ID = 'none';
const DEFAULT_SYNC_ALERTS = true;
const DEFAULT_EXTRACT_OBSERVABLES = true;

/**
 * Writes a template's default connector into the create-case form (`connectorId` + per-type
 * `fields`). Resolves the connector `id` against the supported connectors and, when it cannot be
 * resolved to a connector of the same type (deleted, unauthorized, or space-scoped away), falls
 * back to the `.none` connector without erroring.
 */
const applyTemplateConnector = (
  connector: CaseConnectorWithoutName,
  connectors: Array<{ id: string; actionTypeId: string }>,
  setFieldValue: (path: string, value: unknown) => void
): void => {
  const resolved =
    connector.type !== ConnectorTypes.none &&
    connectors.some((c) => c.id === connector.id && c.actionTypeId === connector.type);

  if (resolved) {
    setFieldValue('connectorId', connector.id);
    setFieldValue('fields', connector.fields);
  } else {
    setFieldValue('connectorId', NONE_CONNECTOR_ID);
    setFieldValue('fields', null);
  }
};

interface UseTemplateFormSyncReturn {
  template: ParsedTemplate | undefined;
  isLoading: boolean;
}

/**
 * Syncs the selected template into the create-case form.
 *
 * - Standard case fields (title, description, tags, severity, category) are
 *   written to the parent form (`@kbn/es-ui-shared-plugin` form_lib).
 * - Extended (template-defined) fields are written to the inner react-hook-form
 *   instance owned by `CreateCaseTemplateFields` and mirrored back to the
 *   parent's `extendedFields` field by that component.
 * - `globalFieldKeys` contains the snake_case keys of `isGlobal` field
 *   definitions; their values are preserved across template changes and resets.
 */
export const useTemplateFormSync = (
  innerForm: UseFormReturn,
  globalFieldKeys: ReadonlySet<string>
): UseTemplateFormSyncReturn => {
  const { setFieldValue } = useFormContext();
  const [{ templateId }] = useFormData<{ templateId?: string }>({ watch: ['templateId'] });
  const { data: template, isLoading: isTemplateLoading } = useGetTemplate(templateId || undefined);
  // A disabled query (no templateId) can sit in "loading" state indefinitely in react-query v4;
  // treat it as not-loading so the create form renders global fields without a template selected.
  const isLoading = Boolean(templateId) && isTemplateLoading;
  const { data: fieldDefsData, isLoading: isLoadingFieldDefs } = useGetFieldDefinitions({
    owner: template?.owner,
  });
  // Supported connectors are needed to resolve a template's default connector `id` and fall back
  // to the `.none` connector when it no longer exists. Shares react-query cache with the form.
  const { data: connectors = [], isLoading: isLoadingConnectors } =
    useGetSupportedActionConnectors();
  const appliedRef = useRef<string | undefined>(undefined);
  // Track whether the applied template set the connector / settings, so clearing the template only
  // reverts what a template actually changed (preserving the configuration's default connector).
  const didApplyConnectorRef = useRef(false);
  const didApplySettingsRef = useRef(false);

  useEffect(() => {
    if (!templateId) {
      if (appliedRef.current) {
        appliedRef.current = undefined;
        setFieldValue('description', '');
        setFieldValue('tags', []);
        setFieldValue('severity', 'low');
        setFieldValue('category', null);

        // Clear template-specific extended-field values but preserve global field values.
        const current =
          (innerForm.getValues() as Record<string, Record<string, unknown>>)?.[
            CASE_EXTENDED_FIELDS
          ] ?? {};
        const preserved = Object.fromEntries(
          Object.entries(current).filter(([k]) => globalFieldKeys.has(k))
        );
        innerForm.reset({ [CASE_EXTENDED_FIELDS]: preserved });
      }

      // Only revert connector / settings if a template actually set them, so we don't clobber the
      // configuration's default connector when no connector-bearing template was ever applied.
      if (didApplyConnectorRef.current) {
        didApplyConnectorRef.current = false;
        setFieldValue('connectorId', NONE_CONNECTOR_ID);
        setFieldValue('fields', null);
      }
      if (didApplySettingsRef.current) {
        didApplySettingsRef.current = false;
        setFieldValue('syncAlerts', DEFAULT_SYNC_ALERTS);
        setFieldValue('extractObservables', DEFAULT_EXTRACT_OBSERVABLES);
      }
      return;
    }

    if (!template || template.templateId !== templateId) {
      return;
    }

    const { definition } = template;
    const key = `${template.templateId}:${template.templateVersion}`;
    if (appliedRef.current === key) {
      return;
    }

    const fieldMappings: Array<[string, unknown]> = [
      ['title', definition.name],
      ['description', definition.description],
      ['tags', definition.tags?.length ? definition.tags : undefined],
      ['severity', definition.severity],
      ['category', definition.category],
    ];

    for (const [fieldName, value] of fieldMappings) {
      if (value !== undefined) {
        setFieldValue(fieldName, value);
      }
    }

    // Apply the template's default case settings. Each setting is independent — only the ones the
    // template declares are applied; the rest keep the form's current value.
    if (definition.settings) {
      if (definition.settings.syncAlerts !== undefined) {
        setFieldValue('syncAlerts', definition.settings.syncAlerts);
      }
      if (definition.settings.extractObservables !== undefined) {
        setFieldValue('extractObservables', definition.settings.extractObservables);
      }
      didApplySettingsRef.current = true;
    }

    // Wait for field definitions AND supported connectors to load before finishing. Connectors are
    // needed to resolve the template's default connector; field defs to resolve $ref field defaults.
    // Do NOT set appliedRef.current yet — the effect must re-run once both are available.
    if (isLoadingFieldDefs || isLoadingConnectors) return;

    // Apply the template's default connector. If the connector id no longer resolves to a supported
    // connector of the same type, fall back to the `.none` connector (no error) — mirroring the
    // form serializer's fallback and the legacy template system's resilience.
    if (definition.connector) {
      applyTemplateConnector(definition.connector, connectors, setFieldValue);
      didApplyConnectorRef.current = true;
    }

    // Resolve all fields — inline fields pass through, ref fields are looked up in the library
    const libraryDefs = fieldDefsData?.fieldDefinitions ?? [];
    const resolvedFields = (definition.fields ?? []).flatMap((field): InlineField[] => {
      if (isInlineField(field)) return [field];
      const fd = libraryDefs.find((d) => d.name === field.$ref);
      if (!fd) return [];
      try {
        const parsed = parseYaml(fd.definition);
        const result = FieldSchema.safeParse(parsed);
        if (!result.success || isRefField(result.data)) return [];
        const inlineField = result.data as InlineField;
        return [
          field.name && field.name !== inlineField.name
            ? { ...inlineField, name: field.name }
            : inlineField,
        ];
      } catch {
        return [];
      }
    });

    const nextExtended: Record<string, string> = {};
    for (const field of resolvedFields) {
      nextExtended[getFieldSnakeKey(field.name, field.type)] = getYamlDefaultAsString(
        field.metadata?.default
      );
    }
    // Preserve current values for global fields when template changes.
    const current =
      (innerForm.getValues() as Record<string, Record<string, unknown>>)?.[CASE_EXTENDED_FIELDS] ??
      {};
    const preserved = Object.fromEntries(
      Object.entries(current).filter(([k]) => globalFieldKeys.has(k))
    );
    innerForm.reset({ [CASE_EXTENDED_FIELDS]: { ...nextExtended, ...preserved } });
    appliedRef.current = key;
  }, [
    templateId,
    template,
    setFieldValue,
    innerForm,
    fieldDefsData,
    isLoadingFieldDefs,
    globalFieldKeys,
    connectors,
    isLoadingConnectors,
  ]);

  return { template, isLoading };
};
