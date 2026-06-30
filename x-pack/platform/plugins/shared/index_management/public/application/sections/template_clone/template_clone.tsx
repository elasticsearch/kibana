/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ScopedHistory } from '@kbn/core/public';

import type { Error } from '../../../shared_imports';
import { PageLoading, PageError, attemptToURIDecode } from '../../../shared_imports';
import type { TemplateDeserialized } from '../../../../common';
import { TemplateForm } from '../../components';
import { breadcrumbService, IndexManagementBreadcrumb } from '../../services/breadcrumbs';
import { getTemplateDetailsLink } from '../../services/routing';
import { saveTemplate, useLoadIndexTemplate } from '../../services/api';
import { getIsLegacyFromQueryParams } from '../../lib/index_templates';
import { useAppContext } from '../../app_context';

interface MatchParams {
  name: string;
}

export const TemplateClone: React.FunctionComponent<RouteComponentProps<MatchParams>> = ({
  match: {
    params: { name },
  },
  location,
  history,
}) => {
  const decodedTemplateName = attemptToURIDecode(name)!;
  const {
    config: { enableLegacyTemplates },
  } = useAppContext();
  // We don't expect the `legacy` query to be used when legacy templates are disabled, however, we add the `enableLegacyTemplates` check as a safeguard
  const isLegacy = enableLegacyTemplates && getIsLegacyFromQueryParams(location);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<any>(null);
  const {
    error: templateToCloneError,
    data: templateToClone,
    isLoading,
  } = useLoadIndexTemplate(decodedTemplateName, isLegacy);

  const onSave = async (template: TemplateDeserialized) => {
    setIsSaving(true);
    setSaveError(null);

    const { error } = await saveTemplate(template, true);

    const { name: newTemplateName } = template;

    setIsSaving(false);

    if (error) {
      setSaveError(error);
      return;
    }

    history.push(getTemplateDetailsLink(newTemplateName, template._kbnMeta.isLegacy));
  };

  const clearSaveError = () => {
    setSaveError(null);
  };

  useEffect(() => {
    breadcrumbService.setBreadcrumbs(IndexManagementBreadcrumb.templateClone);
  }, []);

  if (isLoading) {
    return (
      <PageLoading>
        <FormattedMessage
          id="xpack.idxMgmt.templateCreate.loadingTemplateToCloneDescription"
          defaultMessage="Loading template to clone…"
        />
      </PageLoading>
    );
  } else if (templateToCloneError) {
    return (
      <PageError
        title={
          <FormattedMessage
            id="xpack.idxMgmt.templateCreate.loadingTemplateToCloneErrorMessage"
            defaultMessage="Error loading template to clone"
          />
        }
        error={templateToCloneError as Error}
        data-test-subj="sectionError"
      />
    );
  }

  const templateData = {
    ...templateToClone,
    name: `${decodedTemplateName}-copy`,
  } as TemplateDeserialized;

  return (
    <TemplateForm
      title={i18n.translate('xpack.idxMgmt.createTemplate.cloneTemplatePageTitle', {
        defaultMessage: "Clone template ''{name}''",
        values: { name: decodedTemplateName },
      })}
      defaultValue={templateData}
      onSave={onSave}
      isSaving={isSaving}
      saveError={saveError}
      clearSaveError={clearSaveError}
      isLegacy={isLegacy}
      history={history as ScopedHistory}
    />
  );
};
