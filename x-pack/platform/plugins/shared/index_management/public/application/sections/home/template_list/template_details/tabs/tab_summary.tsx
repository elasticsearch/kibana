/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiLink,
  EuiText,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCodeBlock,
  EuiSpacer,
} from '@elastic/eui';
import type { IndexManagementLocatorParams } from '@kbn/index-management-shared-types';
import { useAppContext } from '../../../../../app_context';
import {
  formatDlmLifecycleSummary,
  resolveLifecycleForSummary,
} from '../../../../../lib/data_streams';
import type { TemplateDeserialized } from '../../../../../../../common';
import { ILM_PAGES_POLICY_EDIT, INGEST_PIPELINES_EDIT } from '../../../../../constants';
import { useIlmLocator } from '../../../../../services/use_ilm_locator';
import { useIngestPipelinesLocator } from '../../../../../services/use_ingest_pipeline_locator';
import { allowAutoCreateRadioIds } from '../../../../../../../common/constants';
import { indexModeLabels } from '../../../../../lib/index_mode_labels';
import { INDEX_MANAGEMENT_LOCATOR_ID } from '../../../../../..';

interface Props {
  templateDetails: TemplateDeserialized;
}

const i18nTexts = {
  yes: i18n.translate('xpack.idxMgmt.templateDetails.summaryTab.yesDescriptionText', {
    defaultMessage: 'Yes',
  }),
  no: i18n.translate('xpack.idxMgmt.templateDetails.summaryTab.noDescriptionText', {
    defaultMessage: 'No',
  }),
  none: i18n.translate('xpack.idxMgmt.templateDetails.summaryTab.noneDescriptionText', {
    defaultMessage: 'None',
  }),
};

export const TabSummary: React.FunctionComponent<Props> = ({ templateDetails }) => {
  const {
    core,
    url,
    config: { isServerless },
  } = useAppContext();
  const dlmTiersLayoutEnabled = !isServerless;
  const {
    version,
    priority,
    composedOf,
    order,
    indexPatterns = [],
    indexMode,
    ilmPolicy,
    _meta,
    _kbnMeta: { isLegacy, hasDatastream },
    allowAutoCreate,
  } = templateDetails;

  const numIndexPatterns = indexPatterns.length;

  const ilmPolicyLink = useIlmLocator(ILM_PAGES_POLICY_EDIT, ilmPolicy?.name);
  const locator = url.locators.get<IndexManagementLocatorParams>(INDEX_MANAGEMENT_LOCATOR_ID);

  // Compute the linked ingest pipeline URL
  const linkedIngestPipeline = templateDetails?.template?.settings?.index?.default_pipeline;
  const linkedIngestPipelineUrl = useIngestPipelinesLocator(
    INGEST_PIPELINES_EDIT,
    linkedIngestPipeline
  );

  const lifecycle = resolveLifecycleForSummary(templateDetails.template?.lifecycle, {
    hasDataStream: hasDatastream,
  });

  return (
    <>
      <EuiFlexGroup data-test-subj="summaryTab">
        <EuiFlexItem>
          <EuiDescriptionList textStyle="reverse">
            {/* Index patterns */}
            <EuiDescriptionListTitle>
              <FormattedMessage
                id="xpack.idxMgmt.templateDetails.summaryTab.indexPatternsDescriptionListTitle"
                defaultMessage="Index {numIndexPatterns, plural, one {pattern} other {patterns}}"
                values={{ numIndexPatterns }}
              />
            </EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              {numIndexPatterns > 1 ? (
                <EuiText>
                  <ul>
                    {indexPatterns.map((indexName: string, i: number) => {
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
                indexPatterns.toString()
              )}
            </EuiDescriptionListDescription>

            {/* Priority / Order */}
            {isLegacy !== true ? (
              <>
                <EuiDescriptionListTitle>
                  <FormattedMessage
                    id="xpack.idxMgmt.templateDetails.summaryTab.priorityDescriptionListTitle"
                    defaultMessage="Priority"
                  />
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  {priority || priority === 0 ? priority : i18nTexts.none}
                </EuiDescriptionListDescription>
              </>
            ) : (
              <>
                <EuiDescriptionListTitle>
                  <FormattedMessage
                    id="xpack.idxMgmt.templateDetails.summaryTab.orderDescriptionListTitle"
                    defaultMessage="Order"
                  />
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  {order || order === 0 ? order : i18nTexts.none}
                </EuiDescriptionListDescription>
              </>
            )}

            {/* Components */}
            {isLegacy !== true && (
              <>
                <EuiDescriptionListTitle data-test-subj="componentsTitle">
                  <FormattedMessage
                    id="xpack.idxMgmt.templateDetails.summaryTab.componentsDescriptionListTitle"
                    defaultMessage="Component templates"
                  />
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  {composedOf && composedOf.length > 0 ? (
                    <ul>
                      {composedOf.map((component) => (
                        <li key={component}>
                          <EuiLink
                            href={
                              locator?.getRedirectUrl({
                                page: 'component_template',
                                componentTemplate: component,
                              }) || ''
                            }
                          >
                            <span>{component}</span>
                          </EuiLink>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    i18nTexts.none
                  )}
                </EuiDescriptionListDescription>
              </>
            )}

            {linkedIngestPipeline && (
              <>
                <EuiDescriptionListTitle>
                  <FormattedMessage
                    id="xpack.idxMgmt.templateDetails.summaryTab.linkedIngestPipelineDescriptionListTitle"
                    defaultMessage="Default pipeline"
                  />
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  <EuiLink
                    onClick={() => core.application.navigateToUrl(linkedIngestPipelineUrl)}
                    data-test-subj="linkedIngestPipeline"
                  >
                    {linkedIngestPipeline}
                  </EuiLink>
                </EuiDescriptionListDescription>
              </>
            )}
          </EuiDescriptionList>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiDescriptionList textStyle="reverse">
            {/* ILM Policy (only for legacy as composable template could have ILM policy
              inside one of their components) */}
            {isLegacy && (
              <>
                <EuiDescriptionListTitle>
                  <FormattedMessage
                    id="xpack.idxMgmt.templateDetails.summaryTab.ilmPolicyDescriptionListTitle"
                    defaultMessage="ILM policy"
                  />
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  {ilmPolicy?.name && ilmPolicyLink ? (
                    <EuiLink onClick={() => core.application.navigateToUrl(ilmPolicyLink)}>
                      {ilmPolicy!.name}
                    </EuiLink>
                  ) : (
                    ilmPolicy?.name || i18nTexts.none
                  )}
                </EuiDescriptionListDescription>
              </>
            )}

            {/* Has data stream? (only for composable template) */}
            {isLegacy !== true && (
              <>
                <EuiDescriptionListTitle>
                  <FormattedMessage
                    id="xpack.idxMgmt.templateDetails.summaryTab.dataStreamDescriptionListTitle"
                    defaultMessage="Data stream"
                  />
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  {hasDatastream ? i18nTexts.yes : i18nTexts.no}
                </EuiDescriptionListDescription>
              </>
            )}

            {/* Version */}
            <EuiDescriptionListTitle>
              <FormattedMessage
                id="xpack.idxMgmt.templateDetails.summaryTab.versionDescriptionListTitle"
                defaultMessage="Version"
              />
            </EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              {version || version === 0 ? version : i18nTexts.none}
            </EuiDescriptionListDescription>

            {/* Data lifecycle */}
            {hasDatastream && lifecycle?.enabled && (
              <>
                <EuiDescriptionListTitle>
                  <FormattedMessage
                    id="xpack.idxMgmt.templateDetails.summaryTab.lifecycleDescriptionListTitle"
                    defaultMessage="Data lifecycle"
                  />
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  {formatDlmLifecycleSummary(lifecycle, {
                    includePhaseCount: dlmTiersLayoutEnabled,
                  })}
                </EuiDescriptionListDescription>
              </>
            )}

            {/* Index mode */}
            {indexMode && (
              <>
                <EuiDescriptionListTitle>
                  <FormattedMessage
                    id="xpack.idxMgmt.templateDetails.stepReview.summaryTab.indexModeLabel"
                    defaultMessage="Index mode"
                  />
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription data-test-subj="indexModeValue">
                  {indexModeLabels[indexMode]}
                </EuiDescriptionListDescription>
              </>
            )}

            {/* Allow auto create */}
            {isLegacy !== true &&
              allowAutoCreate !== allowAutoCreateRadioIds.NO_OVERWRITE_RADIO_OPTION && (
                <>
                  <EuiDescriptionListTitle>
                    <FormattedMessage
                      id="xpack.idxMgmt.templateDetails.summaryTab.allowAutoCreateDescriptionListTitle"
                      defaultMessage="Allow auto create"
                    />
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription>
                    {allowAutoCreate === allowAutoCreateRadioIds.TRUE_RADIO_OPTION
                      ? i18nTexts.yes
                      : i18nTexts.no}
                  </EuiDescriptionListDescription>
                </>
              )}
          </EuiDescriptionList>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiDescriptionList textStyle="reverse">
        {/* Metadata (optional) */}
        {isLegacy !== true && _meta && (
          <>
            <EuiDescriptionListTitle data-test-subj="metaTitle">
              <FormattedMessage
                id="xpack.idxMgmt.templateDetails.summaryTab.metaDescriptionListTitle"
                defaultMessage="Metadata"
              />
            </EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              <EuiCodeBlock language="json">{JSON.stringify(_meta, null, 2)}</EuiCodeBlock>
            </EuiDescriptionListDescription>
          </>
        )}
      </EuiDescriptionList>
    </>
  );
};
