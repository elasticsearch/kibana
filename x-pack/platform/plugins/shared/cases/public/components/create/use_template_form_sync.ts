/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useFormContext, useFormData } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import type { ParsedTemplate } from '../../../common/types/domain/template/v1';
import { CASE_EXTENDED_FIELDS, NONE_CONNECTOR_ID } from '../../../common/constants';
import { ConnectorTypes } from '../../../common/types/domain';
import type { CaseConnectorWithoutName } from '../../../common/types/domain_zod/connector/v1';
import { useGetTemplate } from '../templates_v2/hooks/use_get_template';
import {
  buildExtendedFieldsDefaults,
  excludeRefFieldsToDefinitions,
  resolveTemplateFields,
} from '../../../common/utils/template_fields';
import { useGetFieldDefinitions } from '../field_library/hooks/use_get_field_definitions';
import { useGetSupportedActionConnectors } from '../../containers/configure/use_get_supported_action_connectors';

/**
 * Values a template applies by default and reverts to when it stops applying them. Sync detections
 * and extract observables default to off for templates — a template only turns them on if it says so.
 */
const DEFAULT_SYNC_ALERTS = false;
const DEFAULT_EXTRACT_OBSERVABLES = false;

type SetFieldValue = (path: string, value: unknown) => void;
type UpdateFieldValues = (
  values: Record<string, unknown>,
  options?: { runDeserializer?: boolean }
) => void;

const revertSettingsToDefault = (setFieldValue: SetFieldValue): void => {
  setFieldValue('syncAlerts', DEFAULT_SYNC_ALERTS);
  setFieldValue('extractObservables', DEFAULT_EXTRACT_OBSERVABLES);
};

const revertConnectorToDefault = (updateFieldValues: UpdateFieldValues): void => {
  // Mirror `applyTemplateConnector`. The per-type connector inputs remount on connector change and
  // re-read the form's default-value object, so a plain `setFieldValue` leaves the previous
  // template's connector in that default and it reappears in the UI. `updateFieldValues` resets
  // both the default-value object and the live fields, fully reversing the applied connector.
  updateFieldValues({ connectorId: NONE_CONNECTOR_ID, fields: null }, { runDeserializer: false });
};

/**
 * Writes a template's default connector into the create-case form. Falls back to `.none` (no error)
 * when the `id` no longer resolves to a connector of the same type (deleted/unauthorized/other space).
 */
const applyTemplateConnector = (
  connector: CaseConnectorWithoutName,
  connectors: Array<{ id: string; actionTypeId: string }>,
  updateFieldValues: UpdateFieldValues
): void => {
  const resolved =
    connector.type !== ConnectorTypes.none &&
    connectors.some((c) => c.id === connector.id && c.actionTypeId === connector.type);

  if (resolved) {
    // The per-type connector inputs remount on connector change and initialize from the form's
    // default-value object, so a plain `setFieldValue('fields', …)` never reaches them.
    // `updateFieldValues` merges into that default, so the inputs pick up the template's values on
    // (re)mount. `runDeserializer: false` because these values are already in form (deserialized)
    // shape — the create form's deserializer expects a `connector` object, not `connector.id`.
    updateFieldValues(
      { connectorId: connector.id, fields: connector.fields ?? {} },
      { runDeserializer: false }
    );
  } else {
    // Fall back to `.none`, resetting the default-value object too so a previously-applied
    // connector doesn't linger in the form default (see revertConnectorToDefault).
    revertConnectorToDefault(updateFieldValues);
  }
};

type TemplateDefinition = ParsedTemplate['definition'];

/**
 * Standard case field values (title, description, tags, severity, category) reset when no template
 * is selected, while global extended-field values are preserved. Returned object is the reset
 * payload for the inner form's extended-fields tree.
 */
const preserveGlobalFields = (
  innerForm: UseFormReturn,
  globalFieldKeys: ReadonlySet<string>
): Record<string, unknown> => {
  const current =
    (innerForm.getValues() as Record<string, Record<string, unknown>>)?.[CASE_EXTENDED_FIELDS] ??
    {};
  return Object.fromEntries(Object.entries(current).filter(([k]) => globalFieldKeys.has(k)));
};

/**
 * Resets the create-case form to its no-template state, keeping global extended-field values.
 */
const clearTemplateFromForm = (
  setFieldValue: SetFieldValue,
  innerForm: UseFormReturn,
  globalFieldKeys: ReadonlySet<string>
): void => {
  setFieldValue('description', '');
  setFieldValue('tags', []);
  setFieldValue('severity', 'low');
  setFieldValue('category', null);
  setFieldValue('assignees', []);
  innerForm.reset({ [CASE_EXTENDED_FIELDS]: preserveGlobalFields(innerForm, globalFieldKeys) });
};

/**
 * Applies a template's settings block. A declared block is authoritative: keys it declares are
 * applied, keys it omits reset to their defaults, and no block at all reverts a previously-applied
 * template's settings.
 */
const applyTemplateSettings = (
  settings: TemplateDefinition['settings'],
  setFieldValue: SetFieldValue,
  didApplySettingsRef: MutableRefObject<boolean>
): void => {
  if (settings) {
    setFieldValue('syncAlerts', settings.syncAlerts ?? DEFAULT_SYNC_ALERTS);
    setFieldValue('extractObservables', settings.extractObservables ?? DEFAULT_EXTRACT_OBSERVABLES);
    didApplySettingsRef.current = true;
  } else if (didApplySettingsRef.current) {
    revertSettingsToDefault(setFieldValue);
    didApplySettingsRef.current = false;
  }
};

/**
 * Applies a template's default connector, or reverts a previously-applied template's connector to
 * `.none` when the new template declares none. Mirrors {@link applyTemplateSettings}.
 */
const syncTemplateConnector = (
  connector: TemplateDefinition['connector'],
  connectors: Array<{ id: string; actionTypeId: string }>,
  updateFieldValues: UpdateFieldValues,
  didApplyConnectorRef: MutableRefObject<boolean>
): void => {
  if (connector) {
    applyTemplateConnector(connector, connectors, updateFieldValues);
    didApplyConnectorRef.current = true;
  } else if (didApplyConnectorRef.current) {
    revertConnectorToDefault(updateFieldValues);
    didApplyConnectorRef.current = false;
  }
};

interface UseTemplateFormSyncReturn {
  template: ParsedTemplate | undefined;
  isLoading: boolean;
}

// Stable default so omitting the parameter never changes the effect's dependency identity.
const EMPTY_EXCLUDED_REF_NAMES: ReadonlySet<string> = new Set();

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
 * - `excludedLinkedRefNames` contains the normalized names of field definitions whose linked
 *   legacy custom field is currently rendered as an input on this form. Template `$ref`s to
 *   them are dropped before default resolution — the legacy control is the single source of
 *   input for those fields, and writing their template defaults into `extendedFields` would
 *   submit a second value the server rejects as a dual-input conflict. The set participates in
 *   the applied-template identity so a legacy-visibility change re-syncs the form.
 */
export const useTemplateFormSync = (
  innerForm: UseFormReturn,
  globalFieldKeys: ReadonlySet<string>,
  excludedLinkedRefNames: ReadonlySet<string> = EMPTY_EXCLUDED_REF_NAMES
): UseTemplateFormSyncReturn => {
  const { setFieldValue, updateFieldValues } = useFormContext();
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
  // Track whether the applied template set the connector / settings, so switching or clearing only
  // reverts what a template actually changed (preserving the configuration's default connector).
  const didApplyConnectorRef = useRef(false);
  const didApplySettingsRef = useRef(false);

  useEffect(() => {
    if (!templateId) {
      if (appliedRef.current) {
        appliedRef.current = undefined;
        clearTemplateFromForm(setFieldValue, innerForm, globalFieldKeys);
      }

      // Only revert connector / settings if a template actually set them, so we don't clobber the
      // configuration's default connector when no connector-bearing template was ever applied.
      if (didApplyConnectorRef.current) {
        didApplyConnectorRef.current = false;
        revertConnectorToDefault(updateFieldValues);
      }
      if (didApplySettingsRef.current) {
        didApplySettingsRef.current = false;
        revertSettingsToDefault(setFieldValue);
      }
      return;
    }

    if (!template || template.templateId !== templateId) {
      return;
    }

    const { definition } = template;
    // The exclusion set is part of the applied identity: when legacy custom-field visibility
    // changes (e.g. the forced-on switch resolves after the configuration loads), the same
    // template must re-sync so excluded defaults are removed from — or restored to — the form.
    const exclusionIdentity = [...excludedLinkedRefNames].sort().join('|');
    const key = `${template.templateId}:${template.templateVersion}:${exclusionIdentity}`;
    if (appliedRef.current === key) {
      return;
    }

    const fieldMappings: Array<[string, unknown]> = [
      // The create-case form field is `title`; the template's case-default title is `name`.
      ['title', definition.name],
      ['description', definition.description],
      ['tags', definition.tags?.length ? definition.tags : undefined],
      ['severity', definition.severity],
      ['category', definition.category],
      ['assignees', definition.assignees],
    ];

    for (const [fieldName, value] of fieldMappings) {
      // Skip `null` as well as `undefined`. Case-default scalars (severity/description/category) are
      // nullable and seeded as `null` ("no default") in the editor, so a template can carry e.g.
      // `severity: null`. A null default means "don't override" — pushing it into the create-case
      // form would set an invalid `null` on the severity enum (which resets to `low` by default).
      if (value != null) {
        setFieldValue(fieldName, value);
      }
    }

    applyTemplateSettings(definition.settings, setFieldValue, didApplySettingsRef);

    // Wait for field definitions AND supported connectors to load before finishing. Connectors are
    // needed to resolve the template's default connector; field defs to resolve $ref field defaults.
    // Do NOT set appliedRef.current yet — the effect must re-run once both are available.
    if (isLoadingFieldDefs || isLoadingConnectors) return;

    syncTemplateConnector(
      definition.connector,
      connectors,
      updateFieldValues,
      didApplyConnectorRef
    );

    // Resolve all fields — inline fields pass through, ref fields are looked up in the library.
    // `$ref`s to legacy-visible linked definitions are dropped first (see the hook doc): their
    // input lives in the legacy custom-fields section, so no default may be written for them.
    const libraryDefs = fieldDefsData?.fieldDefinitions ?? [];
    const syncableFields = excludeRefFieldsToDefinitions(definition.fields, excludedLinkedRefNames);
    const resolvedFields = resolveTemplateFields(syncableFields, libraryDefs);
    const nextExtended = buildExtendedFieldsDefaults(resolvedFields);
    // Preserve current values for global fields when template changes.
    innerForm.reset({
      [CASE_EXTENDED_FIELDS]: {
        ...nextExtended,
        ...preserveGlobalFields(innerForm, globalFieldKeys),
      },
    });
    appliedRef.current = key;
  }, [
    templateId,
    template,
    setFieldValue,
    updateFieldValues,
    innerForm,
    fieldDefsData,
    isLoadingFieldDefs,
    globalFieldKeys,
    excludedLinkedRefNames,
    connectors,
    isLoadingConnectors,
  ]);

  return { template, isLoading };
};
