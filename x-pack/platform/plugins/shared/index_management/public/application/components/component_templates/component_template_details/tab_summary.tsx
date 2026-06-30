/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';

import {
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiCodeBlock,
  EuiTitle,
  EuiCallOut,
  EuiSpacer,
  EuiLink,
} from '@elastic/eui';

import { formatDlmLifecycleSummary } from '../../../lib/data_streams';
import type { ComponentTemplateDeserialized } from '../shared_imports';
import { useAppContext } from '../../../app_context';
import { useComponentTemplatesContext } from '../component_templates_context';

interface Props {
  componentTemplateDetails: ComponentTemplateDeserialized;
  showCallToAction?: boolean;
}

export const TabSummary: React.FunctionComponent<Props> = ({
  componentTemplateDetails,
  showCallToAction,
}) => {
  const { getUrlForApp } = useComponentTemplatesContext();
  const {
    config: { isServerless },
  } = useAppContext();
  const dlmTiersLayoutEnabled = !isServerless;

  const { version, _meta, _kbnMeta, template } = componentTemplateDetails;

  const { usedBy } = _kbnMeta;
  const templateIsInUse = usedBy.length > 0;

  return (
    <>
      {/* Callout when component template is not in use */}
      {!templateIsInUse && (
        <>
          <EuiCallOut
            announceOnMount
            title={
              <FormattedMessage
                id="xpack.idxMgmt.componentTemplateDetails.summaryTab.notInUseTitle"
                defaultMessage="This component template is not in use by any index templates."
              />
            }
            iconType="pin"
            data-test-subj="notInUseCallout"
            size="s"
          >
            {showCallToAction && (
              <p>
                <FormattedMessage
                  id="xpack.idxMgmt.componentTemplateDetails.summaryTab.notInUseDescription"
                  defaultMessage="{createLink} an index template or {editLink} an existing one."
                  values={{
                    createLink: (
                      <EuiLink
                        href={getUrlForApp('management', {
                          path: '/data/index_management/create_template',
                        })}
                      >
                        <FormattedMessage
                          id="xpack.idxMgmt.componentTemplateDetails.summaryTab.createTemplateLink"
                          defaultMessage="Create"
                        />
                      </EuiLink>
                    ),
                    editLink: (
                      <EuiLink
                        href={getUrlForApp('management', {
                          path: '/data/index_management/templates',
                        })}
                      >
                        <FormattedMessage
                          id="xpack.idxMgmt.componentTemplateDetails.summaryTab.updateTemplateLink"
                          defaultMessage="update"
                        />
                      </EuiLink>
                    ),
                  }}
                />
              </p>
            )}
          </EuiCallOut>
          <EuiSpacer />
        </>
      )}

      {/* Summary description list */}
      <EuiDescriptionList textStyle="reverse" data-test-subj="summaryTabContent">
        {/* Used by templates */}
        {templateIsInUse && (
          <>
            <EuiDescriptionListTitle data-test-subj="usedByTitle">
              <FormattedMessage
                id="xpack.idxMgmt.componentTemplateDetails.summaryTab.usedByDescriptionListTitle"
                defaultMessage="Used by"
              />
            </EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              <ul>
                {usedBy.map((templateName: string) => (
                  <li key={templateName}>
                    <EuiTitle size="xs">
                      <span>{templateName}</span>
                    </EuiTitle>
                  </li>
                ))}
              </ul>
            </EuiDescriptionListDescription>
          </>
        )}

        {template.lifecycle && (
          <>
            <EuiDescriptionListTitle data-test-subj="dataLifecycleTitle">
              <FormattedMessage
                id="xpack.idxMgmt.componentTemplateDetails.summaryTab.dataLifecycleDescriptionListTitle"
                defaultMessage="Data lifecycle"
              />
            </EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              {formatDlmLifecycleSummary(template.lifecycle, {
                includePhaseCount: dlmTiersLayoutEnabled,
              })}
            </EuiDescriptionListDescription>
          </>
        )}

        {/* Version (optional) */}
        {typeof version !== 'undefined' && (
          <>
            <EuiDescriptionListTitle data-test-subj="versionTitle">
              <FormattedMessage
                id="xpack.idxMgmt.componentTemplateDetails.summaryTab.versionDescriptionListTitle"
                defaultMessage="Version"
              />
            </EuiDescriptionListTitle>
            <EuiDescriptionListDescription>{version}</EuiDescriptionListDescription>
          </>
        )}

        {/* Metadata (optional) */}
        {_meta && (
          <>
            <EuiDescriptionListTitle data-test-subj="metaTitle">
              <FormattedMessage
                id="xpack.idxMgmt.componentTemplateDetails.summaryTab.metaDescriptionListTitle"
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
