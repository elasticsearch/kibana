/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, type FC } from 'react';

import { EuiFormRow, EuiSelect, EuiSpacer, EuiSwitch } from '@elastic/eui';

import { i18n } from '@kbn/i18n';

import type { PostTransformsPreviewRequestSchema } from '../../../../../server/routes/api_schemas/transforms';
import { isLatestTransform, isPivotTransform } from '../../../../../common/types/transform';
import { getErrorMessage } from '../../../../../common/utils/errors';

import { useToastNotifications } from '../../../app_dependencies';
import { useGetTransformsPreview } from '../../../hooks';
import { useToastNotificationText } from '../../../components';

import {
  useEditTransformFlyoutActions,
  useEditTransformFlyoutContext,
} from '../state_management/edit_transform_flyout_state';
import { useFormSections } from '../state_management/selectors/form_sections';
import { useRetentionPolicyField } from '../state_management/selectors/retention_policy_field';

import { EditTransformFlyoutFormTextInput } from './edit_transform_flyout_form_text_input';

export const EditTransformRetentionPolicy: FC = () => {
  const toastNotifications = useToastNotifications();
  const getToastNotificationText = useToastNotificationText();

  const { config, dataViewId } = useEditTransformFlyoutContext();
  const formSections = useFormSections();
  const retentionPolicyField = useRetentionPolicyField();
  const { setFormField, setFormSection } = useEditTransformFlyoutActions();

  const previewRequest: PostTransformsPreviewRequestSchema = useMemo(() => {
    return {
      source: config.source,
      ...(isPivotTransform(config) ? { pivot: config.pivot } : {}),
      ...(isLatestTransform(config) ? { latest: config.latest } : {}),
    };
  }, [config]);

  const { error: transformsPreviewError, data: transformPreview } =
    useGetTransformsPreview(previewRequest);

  const destIndexAvailableTimeFields = useMemo<string[]>(() => {
    if (transformPreview?.generated_dest_index) {
      const properties = transformPreview.generated_dest_index.mappings.properties;
      const timeFields: string[] = Object.keys(properties).filter(
        (col) => properties[col].type === 'date'
      );

      return timeFields;
    }
    return [];
  }, [transformPreview]);

  useEffect(() => {
    if (transformsPreviewError !== null) {
      toastNotifications.addDanger({
        title: i18n.translate('xpack.transform.transformList.errorGettingTransformPreview', {
          defaultMessage: 'An error occurred fetching the transform preview',
        }),
        ...getToastNotificationText(getErrorMessage(transformsPreviewError)),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transformsPreviewError]);

  const isRetentionPolicyAvailable = destIndexAvailableTimeFields.length > 0;
  const retentionDateFieldOptions = useMemo(() => {
    return Array.isArray(destIndexAvailableTimeFields)
      ? destIndexAvailableTimeFields.map((text: string) => ({ text, value: text }))
      : [];
  }, [destIndexAvailableTimeFields]);

  return (
    <>
      <EuiFormRow
        helpText={
          isRetentionPolicyAvailable === false
            ? i18n.translate('xpack.transform.transformList.editFlyoutFormEetentionPolicyError', {
                defaultMessage:
                  'Retention policy settings are not available for indices without date fields.',
              })
            : ''
        }
      >
        <EuiSwitch
          name="transformEditRetentionPolicySwitch"
          label={i18n.translate(
            'xpack.transform.transformList.editFlyoutFormRetentionPolicySwitchLabel',
            {
              defaultMessage: 'Retention policy',
            }
          )}
          checked={formSections.retentionPolicy.enabled}
          onChange={(e) =>
            setFormSection({
              section: 'retentionPolicy',
              enabled: e.target.checked,
            })
          }
          disabled={!isRetentionPolicyAvailable}
          data-test-subj="transformEditRetentionPolicySwitch"
        />
      </EuiFormRow>
      {formSections.retentionPolicy.enabled && (
        <div data-test-subj="transformEditRetentionPolicyContent">
          <EuiSpacer size="m" />
          {
            // If data view or date fields info not available
            // gracefully defaults to text input
            dataViewId ? (
              <EuiFormRow
                label={i18n.translate(
                  'xpack.transform.transformList.editFlyoutFormRetentionPolicyFieldLabel',
                  {
                    defaultMessage: 'Field',
                  }
                )}
                isInvalid={retentionPolicyField.errorMessages.length > 0}
                error={retentionPolicyField.errorMessages}
                helpText={i18n.translate(
                  'xpack.transform.transformList.editFlyoutFormRetentionPolicyDateFieldHelpText',
                  {
                    defaultMessage:
                      'Select the date field that can be used to identify out of date documents in the destination index.',
                  }
                )}
              >
                <EuiSelect
                  isInvalid={retentionPolicyField.errorMessages.length > 0}
                  aria-label={i18n.translate(
                    'xpack.transform.transformList.editFlyoutFormRetentionPolicyFieldSelectAriaLabel',
                    {
                      defaultMessage: 'Date field to set retention policy',
                    }
                  )}
                  data-test-subj="transformEditFlyoutRetentionPolicyFieldSelect"
                  options={retentionDateFieldOptions}
                  value={retentionPolicyField.value}
                  onChange={(e) =>
                    setFormField({ field: 'retentionPolicyField', value: e.target.value })
                  }
                  hasNoInitialSelection={
                    !retentionDateFieldOptions
                      .map((d) => d.text)
                      .includes(retentionPolicyField.value)
                  }
                />
              </EuiFormRow>
            ) : (
              <EditTransformFlyoutFormTextInput
                field="retentionPolicyField"
                label={i18n.translate(
                  'xpack.transform.transformList.editFlyoutFormRetentionPolicyFieldLabel',
                  {
                    defaultMessage: 'Field',
                  }
                )}
              />
            )
          }
          <EditTransformFlyoutFormTextInput
            field="retentionPolicyMaxAge"
            label={i18n.translate(
              'xpack.transform.transformList.editFlyoutFormRetentionPolicyMaxAgeLabel',
              {
                defaultMessage: 'Max age',
              }
            )}
          />
        </div>
      )}
    </>
  );
};
