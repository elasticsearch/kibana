/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  EuiButtonEmpty,
  EuiSpacer,
  EuiFormRow,
  EuiText,
  EuiCode,
  EuiLink,
} from '@elastic/eui';
import { KbnWarningCallout } from '@kbn/ui-callout';
import { FormattedMessage } from '@kbn/i18n-react';
import { CodeEditor } from '@kbn/code-editor';

import { LOOKUP_INDEX_MODE } from '../../../../../../common/constants';
import { Forms, isJSON } from '../../../../../shared_imports';
import { useJsonStep } from './use_json_step';
import { documentationService } from '../../../mappings_editor/shared_imports';
import { indexModeLabels } from '../../../../lib/index_mode_labels';
import { hasIlmPolicySetting } from '../../../../lib/has_ilm_policy_setting';
import { LookupLifecycleWarningCallout } from '../lookup_lifecycle_warning_callout';
import type { IndexMode } from '../../../../../../common/types';

interface Props {
  onChange: (content: Forms.Content) => void;
  esDocsBase: string;
  defaultValue?: { [key: string]: any };
  indexMode?: IndexMode;
}

interface ParsedIndexSettings {
  index?: {
    mode?: IndexMode;
  };
  'index.mode'?: IndexMode;
  mode?: IndexMode;
}

// The value of the number_of_shards setting that is allowed for lookup index mode
const NUMBER_OF_SHARDS_LOOKUP_MODE = 1;

const getEffectiveIndexMode = (
  settings: ParsedIndexSettings | undefined,
  indexMode: IndexMode | undefined
): IndexMode | undefined =>
  indexMode ?? settings?.index?.mode ?? settings?.['index.mode'] ?? settings?.mode;

export const StepSettings: React.FunctionComponent<Props> = React.memo(
  ({ defaultValue = {}, onChange, esDocsBase, indexMode }) => {
    const { navigateToStep } = Forms.useFormWizardContext();
    const customValidate = useCallback(
      (json: string) => {
        if (!isJSON(json)) return null;
        const settings = JSON.parse(json);
        const numberOfShardsValue =
          settings['index.number_of_shards'] ?? settings?.index?.number_of_shards;
        if (
          numberOfShardsValue != null &&
          indexMode === LOOKUP_INDEX_MODE &&
          (isNaN(numberOfShardsValue) || numberOfShardsValue !== NUMBER_OF_SHARDS_LOOKUP_MODE)
        ) {
          return i18n.translate(
            'xpack.idxMgmt.formWizard.stepSettings.validations.lookupIndexModeNumberOfShardsError',
            {
              defaultMessage: 'Number of shards for lookup index mode can only be 1 or unset.',
            }
          );
        }
        return null;
      },
      [indexMode]
    );
    const { jsonContent, setJsonContent, error } = useJsonStep({
      defaultValue,
      onChange,
      customValidate,
    });
    const parsedSettings = useMemo(
      () => (isJSON(jsonContent) ? (JSON.parse(jsonContent) as ParsedIndexSettings) : undefined),
      [jsonContent]
    );
    const effectiveIndexMode = getEffectiveIndexMode(parsedSettings, indexMode);

    // ES accepts an ILM policy on lookup index templates but never applies it, so we warn without blocking.
    const showLookupLifecycleWarning = useMemo(
      () => effectiveIndexMode === LOOKUP_INDEX_MODE && hasIlmPolicySetting(parsedSettings),
      [effectiveIndexMode, parsedSettings]
    );

    return (
      <div data-test-subj="stepSettings">
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiTitle>
              <h2 data-test-subj="stepTitle">
                <FormattedMessage
                  id="xpack.idxMgmt.formWizard.stepSettings.stepTitle"
                  defaultMessage="Index settings (optional)"
                />
              </h2>
            </EuiTitle>

            <EuiSpacer size="s" />

            <EuiText>
              <p>
                <FormattedMessage
                  id="xpack.idxMgmt.formWizard.stepSettings.settingsDescription"
                  defaultMessage="Define the behavior of your indices."
                />
              </p>
            </EuiText>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="s"
              flush="right"
              href={documentationService.getSettingsDocumentationLink()}
              target="_blank"
              iconType="question"
            >
              <FormattedMessage
                id="xpack.idxMgmt.formWizard.stepSettings.docsButtonLabel"
                defaultMessage="Index settings docs"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        {indexMode && (
          <>
            <KbnWarningCallout
              announceOnMount
              title={
                <FormattedMessage
                  id="xpack.idxMgmt.formWizard.stepSettings.indexModeCallout.title"
                  defaultMessage="The {settingName} setting has been set to {indexMode} within the {logisticsLink}. Any changes to {settingName} set on this page will be overwritten by the Logistics selection."
                  values={{
                    settingName: (
                      <EuiCode>
                        {i18n.translate(
                          'xpack.idxMgmt.formWizard.stepSettings.indexModeCallout.indexModeSettingLabel',
                          {
                            defaultMessage: 'index.mode',
                          }
                        )}
                      </EuiCode>
                    ),
                    indexMode: indexModeLabels[indexMode],
                    logisticsLink: (
                      <EuiLink onClick={() => navigateToStep(0)}>
                        {i18n.translate(
                          'xpack.idxMgmt.formWizard.stepSettings.indexModeCallout.logisticsLinkLabel',
                          {
                            defaultMessage: 'Logistics step',
                          }
                        )}
                      </EuiLink>
                    ),
                  }}
                />
              }
              data-test-subj="indexModeCallout"
            />

            <EuiSpacer size="l" />
          </>
        )}

        {showLookupLifecycleWarning && (
          <>
            <LookupLifecycleWarningCallout
              description={
                <FormattedMessage
                  id="xpack.idxMgmt.formWizard.stepSettings.lookupLifecycleWarning.description"
                  defaultMessage="Elasticsearch does not apply index lifecycle management (ILM) policies to indices with the lookup index mode. The {settingName} setting is not applied to these indices."
                  values={{ settingName: <EuiCode>index.lifecycle.name</EuiCode> }}
                />
              }
            />

            <EuiSpacer size="l" />
          </>
        )}

        {/* Settings code editor */}
        <EuiFormRow
          label={
            <FormattedMessage
              id="xpack.idxMgmt.formWizard.stepSettings.fieldIndexSettingsLabel"
              defaultMessage="Index settings"
            />
          }
          helpText={
            <FormattedMessage
              id="xpack.idxMgmt.formWizard.stepSettings.settingsEditorHelpText"
              defaultMessage="Use JSON format: {code}"
              values={{
                code: <EuiCode>{JSON.stringify({ number_of_replicas: 1 })}</EuiCode>,
              }}
            />
          }
          isInvalid={Boolean(error)}
          error={error}
          fullWidth
        >
          <CodeEditor
            languageId="json"
            value={jsonContent}
            data-test-subj="settingsEditor"
            height={500}
            options={{
              lineNumbers: 'off',
              tabSize: 2,
              automaticLayout: true,
            }}
            aria-label={i18n.translate(
              'xpack.idxMgmt.formWizard.stepSettings.fieldIndexSettingsAriaLabel',
              {
                defaultMessage: 'Index settings editor',
              }
            )}
            onChange={setJsonContent}
          />
        </EuiFormRow>
      </div>
    );
  }
);
