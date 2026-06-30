/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiPageSection, EuiSpacer, EuiCallOut } from '@elastic/eui';

import { AppHeader } from '@kbn/app-header';
import { breadcrumbService, IndexManagementBreadcrumb } from '../../../../services/breadcrumbs';
import { useComponentTemplatesContext } from '../../component_templates_context';
import type { ComponentTemplateDeserialized, Error } from '../../shared_imports';
import { PageLoading, PageError, attemptToURIDecode } from '../../shared_imports';
import { ComponentTemplateForm } from '../component_template_form';
import { useRedirectPath } from '../../../../hooks/redirect_path';

import { useStepFromQueryString } from '../use_step_from_query_string';
import { useUpdateAssociatedDsMappings } from '../component_template_ds_mappings/use_update_associated_ds_mappings';

interface MatchParams {
  name: string;
}

export const ComponentTemplateEdit: React.FunctionComponent<RouteComponentProps<MatchParams>> = ({
  match: {
    params: { name },
  },
  history,
}) => {
  const { api } = useComponentTemplatesContext();
  const { activeStep: defaultActiveStep, updateStep } = useStepFromQueryString(history);
  const redirectTo = useRedirectPath(history);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<any>(null);

  const decodedName = attemptToURIDecode(name)!;

  const { error, data: componentTemplate, isLoading } = api.useLoadComponentTemplate(decodedName);
  const { data: dataStreamResponse } = api.useLoadComponentTemplatesDatastream(decodedName);
  const dataStreams = useMemo(() => dataStreamResponse?.data_streams ?? [], [dataStreamResponse]);
  // If the component template is referenced by an index template that is part of
  // a package and is managed we can allow the user to roll it over if possible.
  const { data: refIndexTemplate } = api.useLoadReferencedIndexTemplateMeta(decodedName);
  const canRollover = useMemo(
    () => Boolean(refIndexTemplate?.managed_by && refIndexTemplate?.package),
    [refIndexTemplate]
  );

  const { updateAssociatedDsMappings } = useUpdateAssociatedDsMappings();

  useEffect(() => {
    breadcrumbService.setBreadcrumbs(IndexManagementBreadcrumb.componentTemplateEdit);
  }, []);

  const onSave = async (updatedComponentTemplate: ComponentTemplateDeserialized) => {
    setIsSaving(true);
    setSaveError(null);

    const { error: saveErrorObject } = await api.updateComponentTemplate(updatedComponentTemplate);

    setIsSaving(false);

    if (saveErrorObject) {
      setSaveError(saveErrorObject);
      return;
    }

    // Update mappings from template for associated data streams for @custom templates or when
    // the component template is referenced by a managed package index template. Each data stream
    // updates its mappings from its index template. If updating fails, a modal prompts to rollover.
    if (updatedComponentTemplate.name.endsWith('@custom') || canRollover) {
      await updateAssociatedDsMappings(updatedComponentTemplate.name);
    }

    redirectTo({
      pathname: encodeURI(
        `/component_templates/${encodeURIComponent(updatedComponentTemplate.name)}`
      ),
    });
  };

  const clearSaveError = () => {
    setSaveError(null);
  };

  if (isLoading) {
    return (
      <PageLoading>
        <FormattedMessage
          id="xpack.idxMgmt.componentTemplateEdit.loadingDescription"
          defaultMessage="Loading component template…"
        />
      </PageLoading>
    );
  }

  if (error) {
    return (
      <PageError
        title={
          <FormattedMessage
            id="xpack.idxMgmt.componentTemplateEdit.loadComponentTemplateError"
            defaultMessage="Error loading component template"
          />
        }
        error={error as Error}
        data-test-subj="loadComponentTemplateError"
      />
    );
  }

  return (
    <>
      <AppHeader
        title={i18n.translate('xpack.idxMgmt.componentTemplateEdit.editPageTitle', {
          defaultMessage: "Edit component template ''{name}''",
          values: { name: decodedName },
        })}
        back="/app/management/data/index_management/component_templates"
        padding={{ bleed: 'l' }}
      />

      <EuiPageSection restrictWidth style={{ width: '100%' }} paddingSize="none">
        <EuiSpacer size="l" />

        {componentTemplate?.deprecated && (
          <>
            <EuiCallOut
              announceOnMount
              title={
                <FormattedMessage
                  id="xpack.idxMgmt.componentTemplateEdit.deprecatedTemplateWarningTitle"
                  defaultMessage="This component template is deprecated"
                />
              }
              iconType="warning"
              color="warning"
              data-test-subj="deprecatedTemplateCallout"
            >
              <FormattedMessage
                id="xpack.idxMgmt.componentTemplateEdit.deprecatedTemplateWarningDescription"
                defaultMessage="This component template is no longer supported and might be removed in a future release. Instead, use one of the other component templates available or create a new one."
              />
            </EuiCallOut>
            <EuiSpacer size="l" />
          </>
        )}

        <ComponentTemplateForm
          defaultValue={componentTemplate!}
          dataStreams={dataStreams}
          canRollover={canRollover}
          defaultActiveWizardSection={defaultActiveStep}
          onStepChange={updateStep}
          onSave={onSave}
          isSaving={isSaving}
          saveError={saveError}
          clearSaveError={clearSaveError}
          isEditing={true}
        />
      </EuiPageSection>
    </>
  );
};
