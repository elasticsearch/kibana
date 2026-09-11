/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';

import { EuiText, EuiLink, EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { APM_HOST_TROUBLESHOOTING_LINK } from '../constants';
import { Popover } from '../tabs/common/popover';
import { useMetadataStateContext } from '../hooks/use_metadata_state';

export const PageTitleWithPopover = ({
  name,
  includeTitle = true,
}: {
  name: string;
  includeTitle?: boolean;
}) => {
  const { metadata, loading } = useMetadataStateContext();
  const showApmPopover = !loading && !metadata?.hasSystemIntegration;

  if (!includeTitle && !loading && !showApmPopover) {
    return null;
  }

  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
      {includeTitle ? <EuiFlexItem grow={false}>{name}</EuiFlexItem> : null}
      {loading ? (
        <EuiLoadingSpinner size="m" />
      ) : (
        showApmPopover && (
          <EuiFlexItem grow={false}>
            <Popover
              icon="question"
              data-test-subj="assetDetailsTitleHasSystemMetricsPopover"
              aria-label={i18n.translate('xpack.infra.assetDetails.title.tooltip.ariaLabel', {
                defaultMessage: 'Host detected by APM',
              })}
            >
              <EuiText size="xs">
                <p>
                  <FormattedMessage
                    id="xpack.infra.assetDetails.title.tooltip.apmHostMessage"
                    defaultMessage="This host has been detected by {apm}"
                    values={{
                      apm: (
                        <EuiLink
                          data-test-subj="assetDetailsTitleTooltipApmDocumentationLink"
                          href=" https://www.elastic.co/guide/en/observability/current/apm.html"
                          target="_blank"
                        >
                          <FormattedMessage
                            id="xpack.infra.assetDetails.title.tooltip.apmHostMessage.apmDocumentationLink"
                            defaultMessage="APM"
                          />
                        </EuiLink>
                      ),
                    }}
                  />
                </p>
                <p>
                  <EuiLink
                    data-test-subj="assetDetailsTitleHasSystemMetricsLearnMoreLink"
                    href={APM_HOST_TROUBLESHOOTING_LINK}
                    target="_blank"
                  >
                    <FormattedMessage
                      id="xpack.infra.assetDetails.title.tooltip.learnMoreLink"
                      defaultMessage="Learn more"
                    />
                  </EuiLink>
                </p>
              </EuiText>
            </Popover>
          </EuiFlexItem>
        )
      )}
    </EuiFlexGroup>
  );
};
