/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState, Fragment } from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiPageSection, EuiSpacer, EuiCallOut } from '@elastic/eui';
import type { ScopedHistory } from '@kbn/core/public';

import type { TemplateDeserialized } from '../../../../common';
import type { Error } from '../../../shared_imports';
import { PageError, PageLoading, attemptToURIDecode } from '../../../shared_imports';
import { breadcrumbService, IndexManagementBreadcrumb } from '../../services/breadcrumbs';
import { useLoadIndexTemplate, updateTemplate } from '../../services/api';
import { getTemplateDetailsLink } from '../../services/routing';
import { TemplateForm } from '../../components';
import { getIsLegacyFromQueryParams } from '../../lib/index_templates';
import { useAppContext } from '../../app_context';

interface MatchParams {
  name: string;
}

export const TemplateEdit: React.FunctionComponent<RouteComponentProps<MatchParams>> = ({
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

  // We don't expect the `legacy` query to be used when legacy templates are disabled, however, we add the enableLegacyTemplates check as a safeguard
  const isLegacy = enableLegacyTemplates && getIsLegacyFromQueryParams(location);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<any>(null);

  const { error, data: template, isLoading } = useLoadIndexTemplate(decodedTemplateName, isLegacy);

  useEffect(() => {
    breadcrumbService.setBreadcrumbs(IndexManagementBreadcrumb.templateEdit);
  }, []);

  const onSave = async (updatedTemplate: TemplateDeserialized) => {
    setIsSaving(true);
    setSaveError(null);

    const { error: saveErrorObject } = await updateTemplate(updatedTemplate);

    setIsSaving(false);

    if (saveErrorObject) {
      setSaveError(saveErrorObject);
      return;
    }

    history.push(getTemplateDetailsLink(decodedTemplateName, updatedTemplate._kbnMeta.isLegacy));
  };

  const clearSaveError = () => {
    setSaveError(null);
  };

  let isSystemTemplate;
  let isDeprecatedTemplate;

  if (isLoading) {
    return (
      <PageLoading>
        <FormattedMessage
          id="xpack.idxMgmt.templateEdit.loadingIndexTemplateDescription"
          defaultMessage="Loading template…"
        />
      </PageLoading>
    );
  } else if (error) {
    return (
      <PageError
        title={
          <FormattedMessage
            id="xpack.idxMgmt.templateEdit.loadingIndexTemplateErrorMessage"
            defaultMessage="Error loading template"
          />
        }
        error={error}
        data-test-subj="sectionError"
      />
    );
  } else if (template) {
    const {
      name: templateName,
      _kbnMeta: { type },
    } = template;

    isSystemTemplate = templateName && templateName.startsWith('.');
    isDeprecatedTemplate = template?.deprecated;

    if (type === 'cloudManaged') {
      return (
        <PageError
          title={
            <FormattedMessage
              id="xpack.idxMgmt.templateEdit.managedTemplateWarningTitle"
              defaultMessage="Editing a managed template is not permitted"
            />
          }
          error={
            {
              message: i18n.translate(
                'xpack.idxMgmt.templateEdit.managedTemplateWarningDescription',
                {
                  defaultMessage: 'Managed templates are critical for internal operations.',
                }
              ),
            } as Error
          }
          data-test-subj="systemTemplateEditCallout"
        />
      );
    }
  }

  return (
    <>
      {(isSystemTemplate || isDeprecatedTemplate) && (
        <EuiPageSection restrictWidth style={{ width: '100%' }} paddingSize="none">
          <EuiSpacer size="l" />
          {isSystemTemplate && (
            <Fragment>
              <EuiCallOut
                announceOnMount
                title={
                  <FormattedMessage
                    id="xpack.idxMgmt.templateEdit.systemTemplateWarningTitle"
                    defaultMessage="Editing a system template can break Kibana"
                  />
                }
                color="danger"
                iconType="warning"
                data-test-subj="systemTemplateEditCallout"
              >
                <FormattedMessage
                  id="xpack.idxMgmt.templateEdit.systemTemplateWarningDescription"
                  defaultMessage="System templates are critical for internal operations."
                />
              </EuiCallOut>
              <EuiSpacer size="l" />
            </Fragment>
          )}
          {isDeprecatedTemplate && (
            <>
              <EuiCallOut
                announceOnMount
                title={
                  <FormattedMessage
                    id="xpack.idxMgmt.templateEdit.deprecatedTemplateWarningTitle"
                    defaultMessage="This index template is deprecated"
                  />
                }
                iconType="warning"
                color="warning"
                data-test-subj="deprecatedIndexTemplateCallout"
              >
                <FormattedMessage
                  id="xpack.idxMgmt.templateEdit.deprecatedTemplateWarningDescription"
                  defaultMessage="This index template is no longer supported and might be removed in a future release. Instead, use one of the other index templates available or create a new one."
                />
              </EuiCallOut>
              <EuiSpacer size="l" />
            </>
          )}
        </EuiPageSection>
      )}

      <TemplateForm
        title={i18n.translate('xpack.idxMgmt.editTemplate.editTemplatePageTitle', {
          defaultMessage: "Edit template ''{name}''",
          values: { name: decodedTemplateName },
        })}
        defaultValue={template!}
        onSave={onSave}
        isSaving={isSaving}
        saveError={saveError}
        clearSaveError={clearSaveError}
        isEditing={true}
        isLegacy={isLegacy}
        history={history as ScopedHistory}
      />
    </>
  );
};
