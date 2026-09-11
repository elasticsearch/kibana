/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiFlexGroup,
  EuiTitle,
  EuiFlexItem,
  EuiSpacer,
  EuiTabbedContent,
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiText,
  EuiCodeBlock,
  EuiLoadingSpinner,
} from '@elastic/eui';
import { KbnWarningCallout } from '@kbn/ui-callout';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DataStreamOptions } from '../../../../../common/types/data_streams';
import { indexModeLabels } from '../../../lib/index_mode_labels';
import { allowAutoCreateRadioIds, LOOKUP_INDEX_MODE } from '../../../../../common/constants';
import { serializers } from '../../../../shared_imports';

import { serializeLegacyTemplate, serializeTemplate } from '../../../../../common/lib';
import type { TemplateDeserialized, Aliases } from '../../../../../common';
import { getTemplateParameter } from '../../../../../common';
import { SimulateTemplate } from '../../index_templates';
import type { WizardSection } from '../template_form';
import { formatDlmLifecycleSummary, resolveLifecycleForSummary } from '../../../lib/data_streams';
import { hasIlmPolicySetting } from '../../../lib/has_ilm_policy_setting';
import { LookupLifecycleWarningCallout } from '../../shared';
import { useAppContext } from '../../../app_context';
import { simulateIndexTemplate } from '../../../services';
const { stripEmptyFields } = serializers;

const NoneDescriptionText = () => (
  <FormattedMessage
    id="xpack.idxMgmt.templateForm.stepReview.summaryTab.noneDescriptionText"
    defaultMessage="None"
  />
);

const getDescriptionText = (data: Aliases | boolean | undefined) => {
  const hasEntries = typeof data === 'boolean' ? data : data && Object.entries(data).length > 0;

  return hasEntries ? (
    <FormattedMessage
      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.yesDescriptionText"
      defaultMessage="Yes"
    />
  ) : (
    <FormattedMessage
      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.noDescriptionText"
      defaultMessage="No"
    />
  );
};

interface Props {
  template: TemplateDeserialized;
  navigateToStep: (stepId: WizardSection) => void;
  dataStreamOptions?: DataStreamOptions;
  onSaveBlockedChange?: (isBlocked: boolean) => void;
}

interface SimulatedTemplate {
  settings?: NonNullable<TemplateDeserialized['template']>['settings'];
  lifecycle?: { enabled?: boolean };
}

const PreviewTab = ({ template }: { template: { [key: string]: any } }) => {
  return (
    <div data-test-subj="previewTab">
      <EuiSpacer size="m" />

      <EuiText>
        <p>
          <FormattedMessage
            id="xpack.idxMgmt.templateForm.stepReview.previewTab.descriptionText"
            defaultMessage="This is the final template that will be applied to matching indices. Component templates are applied in the order specified. Explicit mappings, settings, and aliases override the component templates."
          />
        </p>
      </EuiText>

      <EuiSpacer size="m" />

      <SimulateTemplate template={template} />
    </div>
  );
};

export const StepReview: React.FunctionComponent<Props> = React.memo(
  ({ template, navigateToStep, dataStreamOptions, onSaveBlockedChange }) => {
    const {
      config: { isServerless },
    } = useAppContext();
    const dlmTiersLayoutEnabled = !isServerless;
    const {
      name,
      indexPatterns,
      indexMode,
      version,
      order,
      template: indexTemplate,
      priority,
      allowAutoCreate,
      composedOf,
      _meta,
      _kbnMeta: { isLegacy, hasDatastream },
    } = template!;

    const serializedTemplateJson = useMemo(
      () =>
        JSON.stringify(
          isLegacy
            ? serializeLegacyTemplate(
                stripEmptyFields(template!, {
                  types: ['string'],
                }) as TemplateDeserialized
              )
            : serializeTemplate(
                stripEmptyFields(template!, {
                  types: ['string'],
                }) as TemplateDeserialized,
                dataStreamOptions
              )
        ),
      [dataStreamOptions, isLegacy, template]
    );
    const serializedTemplate = useMemo(
      () =>
        JSON.parse(serializedTemplateJson) as
          | ReturnType<typeof serializeLegacyTemplate>
          | ReturnType<typeof serializeTemplate>,
      [serializedTemplateJson]
    );

    const [simulatedTemplate, setSimulatedTemplate] = useState<SimulatedTemplate>();
    const [simulationStatus, setSimulationStatus] = useState<
      'not-needed' | 'pending' | 'success' | 'error'
    >('not-needed');
    const [simulationRequest, setSimulationRequest] = useState(0);
    const hasComponentTemplates = Boolean(composedOf?.length);

    useEffect(() => {
      let isCurrent = true;

      if (isLegacy || !hasComponentTemplates) {
        setSimulatedTemplate(undefined);
        setSimulationStatus('not-needed');
        onSaveBlockedChange?.(false);
        return () => {
          isCurrent = false;
        };
      }

      setSimulatedTemplate(undefined);
      setSimulationStatus('pending');
      onSaveBlockedChange?.(true);
      simulateIndexTemplate({ template: serializedTemplate }).then(({ data, error }) => {
        if (isCurrent) {
          if (error || !data) {
            // The inherited-settings check is advisory, so a failed check must not leave the
            // template unsaveable (e.g. when the simulation conflicts with a same-priority template).
            setSimulationStatus('error');
            onSaveBlockedChange?.(false);
            return;
          }

          setSimulatedTemplate(data?.template as SimulatedTemplate | undefined);
          setSimulationStatus('success');
          onSaveBlockedChange?.(false);
        }
      });

      return () => {
        isCurrent = false;
      };
    }, [
      hasComponentTemplates,
      isLegacy,
      onSaveBlockedChange,
      serializedTemplate,
      simulationRequest,
    ]);

    const serializedMappings = getTemplateParameter(serializedTemplate, 'mappings');
    const serializedSettings = getTemplateParameter(serializedTemplate, 'settings');
    const serializedAliases = getTemplateParameter(serializedTemplate, 'aliases');
    const serializedLifecycle = isLegacy
      ? undefined
      : resolveLifecycleForSummary(indexTemplate?.lifecycle, {
          hasDataStream: hasDatastream ?? Boolean(template?.dataStream),
        });

    const numIndexPatterns = indexPatterns!.length;

    const hasWildCardIndexPattern = Boolean(indexPatterns!.find((pattern) => pattern === '*'));

    const effectiveSettings = simulatedTemplate?.settings ?? indexTemplate?.settings;
    const effectiveLifecycle = simulatedTemplate?.lifecycle ?? indexTemplate?.lifecycle;
    const effectiveIndexMode =
      simulatedTemplate?.settings?.index?.mode ??
      indexMode ??
      effectiveSettings?.index?.mode ??
      effectiveSettings?.['index.mode'] ??
      effectiveSettings?.mode;

    // ES accepts lifecycle settings on lookup index templates but does not apply them to lookup-mode indices, so we warn without blocking.
    const showLookupLifecycleWarning =
      effectiveIndexMode === LOOKUP_INDEX_MODE &&
      (Boolean(effectiveLifecycle?.enabled) || hasIlmPolicySetting(effectiveSettings));

    const SummaryTab = () => (
      <div data-test-subj="summaryTab">
        <EuiSpacer size="m" />

        {simulationStatus === 'pending' && (
          <>
            <EuiFlexGroup
              alignItems="center"
              gutterSize="s"
              responsive={false}
              data-test-subj="simulateIndexTemplateLoading"
            >
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="m" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s">
                  <p>
                    <FormattedMessage
                      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.simulateIndexTemplateLoading"
                      defaultMessage="Checking component template lifecycle settings…"
                    />
                  </p>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
          </>
        )}

        {simulationStatus === 'error' && (
          <>
            <KbnWarningCallout
              announceOnMount
              title={
                <FormattedMessage
                  id="xpack.idxMgmt.templateForm.stepReview.summaryTab.simulateIndexTemplateErrorTitle"
                  defaultMessage="Unable to check component template lifecycle settings"
                />
              }
              data-test-subj="simulateIndexTemplateError"
              text={
                <p>
                  <FormattedMessage
                    id="xpack.idxMgmt.templateForm.stepReview.summaryTab.simulateIndexTemplateErrorDescription"
                    defaultMessage="Lifecycle settings inherited from component templates were not checked. Retry the check, or save the index template without it."
                  />
                </p>
              }
              actionProps={{
                primary: {
                  onClick: () => setSimulationRequest((request) => request + 1),
                  children: (
                    <FormattedMessage
                      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.simulateIndexTemplateRetry"
                      defaultMessage="Retry"
                    />
                  ),
                },
              }}
            />
            <EuiSpacer size="m" />
          </>
        )}

        {showLookupLifecycleWarning && (
          <>
            <LookupLifecycleWarningCallout
              description={
                <FormattedMessage
                  id="xpack.idxMgmt.templateForm.stepReview.summaryTab.lookupLifecycleWarningDescription"
                  defaultMessage="Elasticsearch does not apply index lifecycle management (ILM) policies or data stream lifecycle settings to indices with the lookup index mode. The lifecycle settings in this template are not applied to these indices."
                />
              }
            />

            <EuiSpacer size="m" />
          </>
        )}

        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiDescriptionList textStyle="reverse">
              {/* Index patterns */}
              <EuiDescriptionListTitle>
                <FormattedMessage
                  id="xpack.idxMgmt.templateForm.stepReview.summaryTab.indexPatternsLabel"
                  defaultMessage="Index {numIndexPatterns, plural, one {pattern} other {patterns}}"
                  values={{ numIndexPatterns }}
                />
              </EuiDescriptionListTitle>
              <EuiDescriptionListDescription>
                {numIndexPatterns > 1 ? (
                  <EuiText>
                    <ul>
                      {indexPatterns!.map((indexName: string, i: number) => {
                        return (
                          <li key={`${indexName}-${i}`}>
                            <EuiTitle size="xs">
                              <span>{indexName}</span>
                            </EuiTitle>
                          </li>
                        );
                      })}
                    </ul>
                  </EuiText>
                ) : (
                  indexPatterns!.toString()
                )}
              </EuiDescriptionListDescription>

              {/* Priority / Order */}
              {isLegacy ? (
                <>
                  <EuiDescriptionListTitle>
                    <FormattedMessage
                      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.orderLabel"
                      defaultMessage="Order"
                    />
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription>
                    {order ? order : <NoneDescriptionText />}
                  </EuiDescriptionListDescription>
                </>
              ) : (
                <>
                  <EuiDescriptionListTitle>
                    <FormattedMessage
                      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.priorityLabel"
                      defaultMessage="Priority"
                    />
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription>
                    {priority ? priority : <NoneDescriptionText />}
                  </EuiDescriptionListDescription>
                </>
              )}

              {/* Version */}
              <EuiDescriptionListTitle>
                <FormattedMessage
                  id="xpack.idxMgmt.templateForm.stepReview.summaryTab.versionLabel"
                  defaultMessage="Version"
                />
              </EuiDescriptionListTitle>
              <EuiDescriptionListDescription>
                {version ? version : <NoneDescriptionText />}
              </EuiDescriptionListDescription>

              {/* Allow auto create */}
              {isLegacy !== true &&
                allowAutoCreate !== allowAutoCreateRadioIds.NO_OVERWRITE_RADIO_OPTION && (
                  <>
                    <EuiDescriptionListTitle>
                      <FormattedMessage
                        id="xpack.idxMgmt.templateForm.stepReview.summaryTab.allowAutoCreateLabel"
                        defaultMessage="Allow auto create"
                      />
                    </EuiDescriptionListTitle>
                    <EuiDescriptionListDescription>
                      {allowAutoCreate === allowAutoCreateRadioIds.TRUE_RADIO_OPTION ? (
                        <FormattedMessage
                          id="xpack.idxMgmt.templateForm.stepReview.summaryTab.yesDescriptionText"
                          defaultMessage="Yes"
                        />
                      ) : (
                        <FormattedMessage
                          id="xpack.idxMgmt.templateForm.stepReview.summaryTab.noDescriptionText"
                          defaultMessage="No"
                        />
                      )}
                    </EuiDescriptionListDescription>
                  </>
                )}

              {/* components */}
              {isLegacy !== true && (
                <>
                  <EuiDescriptionListTitle>
                    <FormattedMessage
                      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.componentsLabel"
                      defaultMessage="Component templates"
                    />
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription>
                    {composedOf && composedOf.length > 0 ? (
                      composedOf.length > 1 ? (
                        <EuiText>
                          <ul>
                            {composedOf.map((component: string, i: number) => {
                              return (
                                <li key={`${component}-${i}`}>
                                  <EuiTitle size="xs">
                                    <span>{component}</span>
                                  </EuiTitle>
                                </li>
                              );
                            })}
                          </ul>
                        </EuiText>
                      ) : (
                        composedOf.toString()
                      )
                    ) : (
                      <NoneDescriptionText />
                    )}
                  </EuiDescriptionListDescription>
                </>
              )}
            </EuiDescriptionList>
          </EuiFlexItem>

          <EuiFlexItem>
            <EuiDescriptionList textStyle="reverse">
              {/* Index settings */}
              <EuiDescriptionListTitle>
                <FormattedMessage
                  id="xpack.idxMgmt.templateForm.stepReview.summaryTab.settingsLabel"
                  defaultMessage="Index settings"
                />
              </EuiDescriptionListTitle>
              <EuiDescriptionListDescription>
                {getDescriptionText(serializedSettings)}
              </EuiDescriptionListDescription>

              {/* Index mode */}
              {indexMode && (
                <>
                  <EuiDescriptionListTitle data-test-subj="indexModeTitle">
                    <FormattedMessage
                      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.indexModeLabel"
                      defaultMessage="Index mode"
                    />
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription data-test-subj="indexModeValue">
                    {indexModeLabels[indexMode]}
                  </EuiDescriptionListDescription>
                </>
              )}

              {/* Mappings */}
              <EuiDescriptionListTitle>
                <FormattedMessage
                  id="xpack.idxMgmt.templateForm.stepReview.summaryTab.mappingLabel"
                  defaultMessage="Mappings"
                />
              </EuiDescriptionListTitle>
              <EuiDescriptionListDescription>
                {getDescriptionText(serializedMappings)}
              </EuiDescriptionListDescription>

              {/* Aliases */}
              <EuiDescriptionListTitle>
                <FormattedMessage
                  id="xpack.idxMgmt.templateForm.stepReview.summaryTab.aliasesLabel"
                  defaultMessage="Aliases"
                />
              </EuiDescriptionListTitle>
              <EuiDescriptionListDescription>
                {getDescriptionText(serializedAliases)}
              </EuiDescriptionListDescription>

              {isLegacy !== true && serializedLifecycle?.enabled && (
                <>
                  <EuiDescriptionListTitle data-test-subj="lifecycleTitle">
                    <FormattedMessage
                      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.lifecycleLabel"
                      defaultMessage="Data lifecycle"
                    />
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription data-test-subj="lifecycleValue">
                    {formatDlmLifecycleSummary(serializedLifecycle, {
                      includePhaseCount: dlmTiersLayoutEnabled,
                    })}
                  </EuiDescriptionListDescription>
                </>
              )}

              {/* Metadata (optional) */}
              {isLegacy !== true && _meta && (
                <>
                  <EuiDescriptionListTitle data-test-subj="metaTitle">
                    <FormattedMessage
                      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.metaLabel"
                      defaultMessage="Metadata"
                    />
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription>
                    <EuiCodeBlock language="json">{JSON.stringify(_meta, null, 2)}</EuiCodeBlock>
                  </EuiDescriptionListDescription>
                </>
              )}
            </EuiDescriptionList>
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    );

    const RequestTab = () => {
      const esApiEndpoint = isLegacy ? '_template' : '_index_template';
      const endpoint = `PUT ${esApiEndpoint}/${name || '<templateName>'}`;
      const templateString = JSON.stringify(serializedTemplate, null, 2);
      const request = `${endpoint}\n${templateString}`;

      // Beyond a certain point, highlighting the syntax will bog down performance to unacceptable
      // levels. This way we prevent that happening for very large requests.
      const language = request.length < 60000 ? 'json' : undefined;

      return (
        <div data-test-subj="requestTab">
          <EuiSpacer size="m" />

          <EuiText>
            <p>
              <FormattedMessage
                id="xpack.idxMgmt.templateForm.stepReview.requestTab.descriptionText"
                defaultMessage="This request will create the following index template."
              />
            </p>
          </EuiText>

          <EuiSpacer size="m" />

          <EuiCodeBlock language={language} isCopyable>
            {request}
          </EuiCodeBlock>
        </div>
      );
    };

    const tabs = [
      {
        id: 'summary',
        name: i18n.translate('xpack.idxMgmt.templateForm.stepReview.summaryTabTitle', {
          defaultMessage: 'Summary',
        }),
        content: <SummaryTab />,
      },
      {
        id: 'request',
        name: i18n.translate('xpack.idxMgmt.templateForm.stepReview.requestTabTitle', {
          defaultMessage: 'Request',
        }),
        content: <RequestTab />,
        'data-test-subj': 'stepReviewRequestTab',
      },
    ];

    if (!isLegacy) {
      tabs.splice(1, 0, {
        id: 'preview',
        name: i18n.translate('xpack.idxMgmt.templateForm.stepReview.previewTabTitle', {
          defaultMessage: 'Preview',
        }),
        content: <PreviewTab template={template} />,
        'data-test-subj': 'stepReviewPreviewTab',
      });
    }

    return (
      <div data-test-subj="stepSummary">
        <EuiTitle>
          <h2 data-test-subj="stepTitle">
            <FormattedMessage
              id="xpack.idxMgmt.templateForm.stepReview.stepTitle"
              defaultMessage="Review details for ''{templateName}''"
              values={{ templateName: name }}
            />
          </h2>
        </EuiTitle>

        <EuiSpacer size="l" />

        {hasWildCardIndexPattern ? (
          <Fragment>
            <KbnWarningCallout
              announceOnMount
              title={
                <FormattedMessage
                  id="xpack.idxMgmt.templateForm.stepReview.summaryTab.indexPatternsWarningTitle"
                  defaultMessage="This template uses a wildcard (*) as an index pattern."
                />
              }
              data-test-subj="indexPatternsWarning"
              text={
                <p data-test-subj="indexPatternsWarningDescription">
                  <FormattedMessage
                    id="xpack.idxMgmt.templateForm.stepReview.summaryTab.indexPatternsWarningDescription"
                    defaultMessage="All new indices that you create will use this template."
                  />
                </p>
              }
              actionProps={{
                primary: {
                  onClick: navigateToStep.bind(null, 'logistics'),
                  children: (
                    <FormattedMessage
                      id="xpack.idxMgmt.templateForm.stepReview.summaryTab.indexPatternsWarningLinkText"
                      defaultMessage="Edit index patterns."
                    />
                  ),
                },
              }}
            />
            <EuiSpacer size="m" />
          </Fragment>
        ) : null}

        <EuiTabbedContent data-test-subj="summaryTabContent" tabs={tabs} />
      </div>
    );
  }
);
