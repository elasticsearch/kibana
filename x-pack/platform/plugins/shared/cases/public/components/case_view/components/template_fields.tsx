/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useMemo } from 'react';
import type { z } from '@kbn/zod/v4';
import { EuiSpacer, EuiTitle } from '@elastic/eui';
import type { CaseUI } from '../../../../common';
import type { ParsedTemplateDefinitionSchema } from '../../../../common/types/domain/template/latest';
import type { InlineField } from '../../../../common/types/domain/template/fields';
import { useGetTemplate } from '../../templates_v2/hooks/use_get_template';
import { useResolvedFields } from '../../field_library/hooks/use_resolved_fields';
import { useGetFieldDefinitions } from '../../field_library/hooks/use_get_field_definitions';
import { parseFieldDefinitionsToInlineFields } from '../../../../common/utils';
import { isInlineField } from '../../../../common/types/domain/template/fields';
import * as i18n from '../translations';
import type { OnUpdateFields } from '../types';
import { EMPTY_EXTENDED_FIELDS, TemplateFieldsFormReady } from './template_fields_form_ready';

type ParsedTemplateDefinition = z.infer<typeof ParsedTemplateDefinitionSchema>;

interface TemplateFieldsProps {
  caseData: CaseUI;
  onUpdateField: (args: OnUpdateFields) => void;
}

const TemplateFieldsForm: FC<{
  parsedTemplate: ParsedTemplateDefinition;
  owner: string;
  extendedFields: Record<string, unknown>;
  onUpdateField: (args: OnUpdateFields) => void;
}> = ({ parsedTemplate, owner, extendedFields, onUpdateField }) => {
  const { resolvedFields, isLoading: isResolvingFields } = useResolvedFields(
    parsedTemplate.fields,
    owner
  );

  const templateKey = useMemo(
    () => resolvedFields.map((f: InlineField) => `${f.name}:${f.type}`).join('|'),
    [resolvedFields]
  );

  if (isResolvingFields) return null;

  return (
    <TemplateFieldsFormReady
      key={templateKey}
      resolvedFields={resolvedFields}
      extendedFields={extendedFields}
      onUpdateField={onUpdateField}
    />
  );
};

TemplateFieldsForm.displayName = 'TemplateFieldsForm';

export const TemplateFields = React.memo<TemplateFieldsProps>(({ caseData, onUpdateField }) => {
  const { data: templateData } = useGetTemplate(caseData.template?.id, caseData.template?.version);

  const { data: globalFieldDefsData } = useGetFieldDefinitions({
    owner: caseData.owner,
    isGlobal: true,
    // Prevent a background refetch from producing a new Set/array reference that would
    // re-trigger memos and potentially reset an in-progress edit. Same rationale as the
    // create form (create/template_fields.tsx).
    staleTime: Infinity,
  });

  const globalFieldNames = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        parseFieldDefinitionsToInlineFields(globalFieldDefsData?.fieldDefinitions ?? []).map(
          (f) => f.name
        )
      ),
    [globalFieldDefsData]
  );

  const parsedTemplate = templateData?.definition;

  const filteredTemplateFields = useMemo(
    () =>
      parsedTemplate?.fields.filter((f) => !isInlineField(f) || !globalFieldNames.has(f.name)) ??
      [],
    [parsedTemplate, globalFieldNames]
  );

  if (!templateData || !parsedTemplate || filteredTemplateFields.length === 0) return null;

  return (
    <>
      <EuiTitle size="xs">
        <h3>{i18n.EXTENDED_FIELDS_TITLE}</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <TemplateFieldsForm
        parsedTemplate={{ ...parsedTemplate, fields: filteredTemplateFields }}
        owner={templateData.owner}
        extendedFields={caseData.extendedFields ?? EMPTY_EXTENDED_FIELDS}
        onUpdateField={onUpdateField}
      />
    </>
  );
});

TemplateFields.displayName = 'TemplateFields';
