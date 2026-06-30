/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import { EuiPageSection, EuiSpacer } from '@elastic/eui';

import { AppHeader } from '@kbn/app-header';
import { useRedirectPath } from '../../../../hooks/redirect_path';
import { breadcrumbService, IndexManagementBreadcrumb } from '../../../../services/breadcrumbs';
import type { ComponentTemplateDeserialized } from '../../shared_imports';
import { useComponentTemplatesContext } from '../../component_templates_context';
import { useUpdateAssociatedDsMappings } from '../component_template_ds_mappings/use_update_associated_ds_mappings';
import { ComponentTemplateForm } from '../component_template_form';
import { useStepFromQueryString } from '../use_step_from_query_string';

interface Props {
  /**
   * This value may be passed in to prepopulate the creation form (e.g., to clone a template)
   */
  sourceComponentTemplate?: any;
}

export const ComponentTemplateCreate: React.FunctionComponent<RouteComponentProps & Props> = ({
  history,
  sourceComponentTemplate,
}) => {
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<any>(null);
  const redirectTo = useRedirectPath(history);
  const [currentStep, setCurrentStep] = useState<string>('logistics');
  const [componentName, setComponentName] = useState<string | undefined>();
  const [canRollover, setCanRollover] = useState<boolean>(false);

  const { api } = useComponentTemplatesContext();
  const { activeStep: defaultActiveStep, updateStep } = useStepFromQueryString(history);

  const locationSearchParams = useMemo(() => {
    return new URLSearchParams(history.location.search);
  }, [history.location.search]);

  // Effect for computing if we should allow the user to rollover attached datastreams
  useEffect(() => {
    async function computeCanRollover() {
      // When the current step is not logistics, we have an available component template
      // name that we can use to query the referenced index template.
      if (currentStep !== 'logistics') {
        // If the component template is referenced by an index template that is part of
        // a package and is managed we can allow the user to roll it over if possible.
        const { data: refIndexTemplate } = await api.getReferencedIndexTemplateMeta(
          componentName as string
        );

        setCanRollover(Boolean(refIndexTemplate?.managed_by && refIndexTemplate?.package));
      }

      setCanRollover(false);
    }

    computeCanRollover();
  }, [api, currentStep, componentName, setCanRollover]);

  const defaultValue = useMemo(() => {
    if (sourceComponentTemplate) {
      return sourceComponentTemplate;
    }

    const name = locationSearchParams.get('name') ?? '';
    const managedBy = locationSearchParams.get('managed_by');

    return {
      name,
      template: {},
      _meta: managedBy ? { managed_by: managedBy } : {},
      _kbnMeta: {
        usedBy: [],
        isManaged: false,
      },
    };
  }, [locationSearchParams, sourceComponentTemplate]);

  const { updateAssociatedDsMappings } = useUpdateAssociatedDsMappings();

  const onSave = async (componentTemplate: ComponentTemplateDeserialized) => {
    const { name } = componentTemplate;

    setIsSaving(true);
    setSaveError(null);

    const { error } = await api.createComponentTemplate(componentTemplate);

    setIsSaving(false);

    if (error) {
      setSaveError(error);
      return;
    }

    // Update mappings from template for associated data streams for @custom templates or when
    // the component template is referenced by a managed package index template. Each data stream
    // updates its mappings from its index template. If updating fails, a modal prompts to rollover.
    if (componentTemplate.name.endsWith('@custom') || canRollover) {
      await updateAssociatedDsMappings(componentTemplate.name);
    }

    redirectTo(encodeURI(`/component_templates/${encodeURIComponent(name)}`));
  };

  const clearSaveError = () => {
    setSaveError(null);
  };

  const isCloning = Boolean(sourceComponentTemplate);
  useEffect(() => {
    if (isCloning) {
      breadcrumbService.setBreadcrumbs(IndexManagementBreadcrumb.componentTemplateClone);
    } else {
      breadcrumbService.setBreadcrumbs(IndexManagementBreadcrumb.componentTemplateCreate);
    }
  }, [isCloning]);

  return (
    <>
      <AppHeader
        title={
          isCloning
            ? i18n.translate('xpack.idxMgmt.cloneComponentTemplate.pageTitle', {
                defaultMessage: 'Clone component template',
              })
            : i18n.translate('xpack.idxMgmt.createComponentTemplate.pageTitle', {
                defaultMessage: 'Create component template',
              })
        }
        back="/app/management/data/index_management/component_templates"
        padding={{ bleed: 'l' }}
      />

      <EuiPageSection restrictWidth style={{ width: '100%' }} paddingSize="none">
        <EuiSpacer size="l" />

        <ComponentTemplateForm
          defaultActiveWizardSection={defaultActiveStep}
          onStepChange={(step) => {
            setCurrentStep(step);
            updateStep(step);
          }}
          defaultValue={defaultValue}
          onSave={onSave}
          isSaving={isSaving}
          saveError={saveError}
          setComponentName={setComponentName}
          clearSaveError={clearSaveError}
        />
      </EuiPageSection>
    </>
  );
};
