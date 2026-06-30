/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiSpacer, EuiCallOut } from '@elastic/eui';

import type { ComponentTemplateDeserialized, CommonWizardSteps } from '../../shared_imports';
import {
  serializers,
  Forms,
  StepSettingsContainer,
  StepMappingsContainer,
  StepAliasesContainer,
} from '../../shared_imports';
import {
  serializeAsESLifecycle,
  deserializeESLifecycle,
  resolveLogisticsLifecycle,
} from '../../../../../../common/lib';
import { useComponentTemplatesContext } from '../../component_templates_context';
import { StepLogisticsContainer, StepReviewContainer } from './steps';

const { stripEmptyFields } = serializers;
const { FormWizard, FormWizardStep } = Forms;

export interface WizardContent extends CommonWizardSteps {
  logistics: Omit<ComponentTemplateDeserialized, '_kbnMeta' | 'template'>;
}

export type WizardSection = keyof WizardContent | 'review';

interface Props {
  onSave: (componentTemplate: ComponentTemplateDeserialized) => void;
  clearSaveError: () => void;
  setComponentName?: (name: string) => void;
  isSaving: boolean;
  saveError: any;
  defaultValue?: ComponentTemplateDeserialized;
  isEditing?: boolean;
  defaultActiveWizardSection?: WizardSection;
  onStepChange?: (stepId: string) => void;
  dataStreams?: string[];
  canRollover?: boolean;
}

const wizardSections: { [id: string]: { id: WizardSection; label: string } } = {
  logistics: {
    id: 'logistics',
    label: i18n.translate('xpack.idxMgmt.componentTemplateForm.steps.logisticsStepName', {
      defaultMessage: 'Logistics',
    }),
  },
  settings: {
    id: 'settings',
    label: i18n.translate('xpack.idxMgmt.componentTemplateForm.steps.settingsStepName', {
      defaultMessage: 'Index settings',
    }),
  },
  mappings: {
    id: 'mappings',
    label: i18n.translate('xpack.idxMgmt.componentTemplateForm.steps.mappingsStepName', {
      defaultMessage: 'Mappings',
    }),
  },
  aliases: {
    id: 'aliases',
    label: i18n.translate('xpack.idxMgmt.componentTemplateForm.steps.aliasesStepName', {
      defaultMessage: 'Aliases',
    }),
  },
  review: {
    id: 'review',
    label: i18n.translate('xpack.idxMgmt.componentTemplateForm.steps.summaryStepName', {
      defaultMessage: 'Review',
    }),
  },
};

export const ComponentTemplateForm = ({
  defaultValue = {
    name: '',
    template: {},
    _meta: {},
    _kbnMeta: {
      usedBy: [],
      isManaged: false,
    },
  },
  setComponentName,
  dataStreams,
  canRollover,
  isEditing,
  isSaving,
  saveError,
  clearSaveError,
  defaultActiveWizardSection,
  onSave,
  onStepChange,
}: Props) => {
  const {
    template: {
      settings,
      mappings: initialMappings,
      aliases,
      lifecycle,
      data_stream_options: dataStreamOptions,
    },
    ...logistics
  } = defaultValue;

  const { documentation } = useComponentTemplatesContext();

  const mappings = useMemo(() => {
    if (initialMappings && initialMappings._source && 'mode' in initialMappings._source) {
      const { mode, ...otherSource } = initialMappings._source;
      const newMappings = {
        ...initialMappings,
        _source: Object.keys(otherSource).length > 0 ? otherSource : undefined,
      };
      if (newMappings._source === undefined) {
        delete newMappings._source;
      }
      return Object.keys(newMappings).length > 0 ? newMappings : undefined;
    }
    return initialMappings;
  }, [initialMappings]);

  const wizardDefaultValue: WizardContent = {
    logistics: {
      ...logistics,
      ...(lifecycle ? { lifecycle: deserializeESLifecycle(lifecycle) } : {}),
    },
    settings,
    mappings,
    aliases,
  };

  const i18nTexts = {
    save: isEditing ? (
      <FormattedMessage
        id="xpack.idxMgmt.componentTemplateForm.saveButtonLabel"
        defaultMessage="Save component template"
      />
    ) : (
      <FormattedMessage
        id="xpack.idxMgmt.componentTemplateForm.createButtonLabel"
        defaultMessage="Create component template"
      />
    ),
  };

  const apiError = saveError ? (
    <>
      <EuiCallOut
        announceOnMount
        title={
          <FormattedMessage
            id="xpack.idxMgmt.componentTemplateForm.saveTemplateError"
            defaultMessage="Unable to create component template"
          />
        }
        color="danger"
        iconType="warning"
        data-test-subj="saveComponentTemplateError"
      >
        <div>{saveError.message || saveError.statusText}</div>
      </EuiCallOut>
      <EuiSpacer size="m" />
    </>
  ) : null;

  /**
   * If no mappings, settings or aliases are defined, it is better to not send an empty
   * object for those values.
   * @param componentTemplate The component template object to clean up
   */
  const cleanupComponentTemplateObject = (componentTemplate: ComponentTemplateDeserialized) => {
    const outputTemplate = { ...componentTemplate };

    if (outputTemplate.template.settings === undefined) {
      delete outputTemplate.template.settings;
    }

    if (outputTemplate.template.mappings === undefined) {
      delete outputTemplate.template.mappings;
    }

    if (outputTemplate.template.aliases === undefined) {
      delete outputTemplate.template.aliases;
    }

    if (outputTemplate.lifecycle) {
      delete outputTemplate.lifecycle;
    }

    return outputTemplate;
  };

  const buildComponentTemplateObject = useCallback(
    (initialTemplate: ComponentTemplateDeserialized) =>
      (wizardData: WizardContent): ComponentTemplateDeserialized => {
        const outputComponentTemplate = {
          ...initialTemplate,
          name: wizardData.logistics.name,
          version: wizardData.logistics.version,
          _meta: wizardData.logistics._meta,
          template: {
            settings: wizardData.settings,
            mappings: wizardData.mappings,
            aliases: wizardData.aliases,
            lifecycle: serializeAsESLifecycle(
              resolveLogisticsLifecycle(wizardData.logistics.lifecycle, {
                isDataStreamTemplate: true,
              })
            ),
          },
        };
        return cleanupComponentTemplateObject(
          outputComponentTemplate as ComponentTemplateDeserialized
        );
      },
    []
  );

  const onSaveComponentTemplate = useCallback(
    async (wizardData: WizardContent) => {
      const componentTemplate = buildComponentTemplateObject(defaultValue)(wizardData);

      // This will strip an empty string if "version" is not set, as well as an empty "_meta" object
      onSave(
        stripEmptyFields(componentTemplate, {
          types: ['string'],
        }) as ComponentTemplateDeserialized
      );

      clearSaveError();
    },
    [buildComponentTemplateObject, defaultValue, onSave, clearSaveError]
  );

  const defaultActiveStepIndex = useMemo(
    () =>
      Math.max(
        defaultActiveWizardSection
          ? Object.keys(wizardSections).indexOf(defaultActiveWizardSection)
          : 0,
        0
      ),
    [defaultActiveWizardSection]
  );

  return (
    <FormWizard<WizardContent>
      defaultValue={wizardDefaultValue}
      onSave={onSaveComponentTemplate}
      isEditing={isEditing}
      isSaving={isSaving}
      apiError={apiError}
      texts={i18nTexts}
      defaultActiveStep={defaultActiveStepIndex}
      onStepChange={onStepChange}
      onChange={(attrs) => {
        // Let the parent component know the name of the component template in the
        // form has changed, so that it can re-compute the canRollover prop.
        // This is needed for determinating if the user should see a rollover
        // attached datastreams modal or not.
        const data = attrs.getData();
        if (setComponentName) {
          setComponentName(data.logistics.name);
        }
      }}
    >
      <FormWizardStep
        id={wizardSections.logistics.id}
        label={wizardSections.logistics.label}
        isRequired
      >
        <StepLogisticsContainer isEditing={isEditing} />
      </FormWizardStep>

      <FormWizardStep id={wizardSections.settings.id} label={wizardSections.settings.label}>
        <StepSettingsContainer esDocsBase={documentation.esDocsBase} />
      </FormWizardStep>

      <FormWizardStep id={wizardSections.mappings.id} label={wizardSections.mappings.label}>
        <StepMappingsContainer esDocsBase={documentation.esDocsBase} />
      </FormWizardStep>

      <FormWizardStep id={wizardSections.aliases.id} label={wizardSections.aliases.label}>
        <StepAliasesContainer esDocsBase={documentation.esDocsBase} />
      </FormWizardStep>

      <FormWizardStep id={wizardSections.review.id} label={wizardSections.review.label}>
        <StepReviewContainer
          getComponentTemplateData={buildComponentTemplateObject(defaultValue)}
          dataStreams={dataStreams}
          canRollover={canRollover}
          dataStreamOptions={dataStreamOptions}
        />
      </FormWizardStep>
    </FormWizard>
  );
};
