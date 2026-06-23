/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiSkeletonText, EuiSpacer, EuiTitle } from '@elastic/eui';
import type { CaseUI } from '../../../../common';
import type { InlineField } from '../../../../common/types/domain/template/fields';
import { isRefField } from '../../../../common/types/domain/template/fields';
import { useGetTemplate } from '../../templates_v2/hooks/use_get_template';
import { useGetFieldDefinitions } from '../../field_library/hooks/use_get_field_definitions';
import { parseFieldDefinitionsToInlineFields } from '../../../../common/utils';
import * as i18n from '../translations';
import type { OnUpdateFields } from '../types';
import { EMPTY_EXTENDED_FIELDS, TemplateFieldsFormReady } from './template_fields_form_ready';

interface GlobalCaseFieldsProps {
  caseData: CaseUI;
  onUpdateField: (args: OnUpdateFields) => void;
}

/**
 * Renders all field definitions that have `isGlobal: true` for the
 * case's owner, regardless of which template (if any) the case uses.
 * Fields that are also referenced via `$ref` in the active template are
 * excluded here — the template section owns their display and may apply
 * name/default overrides.
 * Values are stored in `extended_fields` alongside template-specific fields.
 */
export const GlobalCaseFields = React.memo<GlobalCaseFieldsProps>(({ caseData, onUpdateField }) => {
  const {
    data: globalFieldDefsData,
    isLoading,
    isError,
  } = useGetFieldDefinitions({
    owner: caseData.owner,
    isGlobal: true,
    // Prevent a background refetch from producing a new array reference that would
    // re-trigger memos and potentially reset an in-progress edit. Same rationale as the
    // create form (create/template_fields.tsx).
    staleTime: Infinity,
  });

  // React Query deduplicates this fetch — TemplateFields makes the same call.
  const { data: templateData, isLoading: isLoadingTemplate } = useGetTemplate(
    caseData.template?.id,
    caseData.template?.version
  );

  const templateRefNames = useMemo<ReadonlySet<string>>(
    () => new Set((templateData?.definition.fields ?? []).filter(isRefField).map((f) => f.$ref)),
    [templateData]
  );

  const visibleGlobalFields = useMemo<InlineField[]>(
    () =>
      parseFieldDefinitionsToInlineFields(globalFieldDefsData?.fieldDefinitions ?? []).filter(
        (f) => !templateRefNames.has(f.name)
      ),
    [globalFieldDefsData, templateRefNames]
  );

  if (isError) return null;

  // Show a skeleton while loading to give visual feedback, but still suppress
  // render of actual fields until both field definitions and (if a template is
  // active) the template definition have loaded — this prevents a flash of a
  // global field that will be filtered out once the template definition arrives.
  const isDataLoading = isLoading || (!!caseData.template?.id && isLoadingTemplate);

  if (isDataLoading) {
    return <EuiSkeletonText data-test-subj="global-case-fields-loading" lines={3} size="m" />;
  }

  if (!visibleGlobalFields.length) return null;

  // When there's no active template, TemplateFields renders nothing (no heading).
  // Provide the section heading here so global fields are labelled in the sidebar.
  const showHeading = !caseData.template?.id;

  return (
    <>
      {showHeading && (
        <>
          <EuiTitle size="xs">
            <h3>{i18n.EXTENDED_FIELDS_TITLE}</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
        </>
      )}
      <TemplateFieldsFormReady
        resolvedFields={visibleGlobalFields}
        extendedFields={caseData.extendedFields ?? EMPTY_EXTENDED_FIELDS}
        onUpdateField={onUpdateField}
      />
    </>
  );
});

GlobalCaseFields.displayName = 'GlobalCaseFields';
