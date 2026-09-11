/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButton, EuiButtonIcon, EuiText, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { layoutRowCss } from '@kbn/css-utils/public/layout_css';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useMemo } from 'react';

import { FormInfoField } from '@kbn/search-shared-ui';
import { openWiredConnectionDetails } from '@kbn/cloud/connection_details';
import { useSearchApiKey, Status } from '@kbn/search-api-keys-components';
import { useElasticsearchUrl } from '../../hooks/use_elasticsearch_url';

export const ConnectToElasticsearch = () => {
  const elasticsearchUrl = useElasticsearchUrl();
  const { euiTheme } = useEuiTheme();

  const { status } = useSearchApiKey();
  const hasAPIKeyManagePermissions = useMemo(() => {
    return status !== Status.showUserPrivilegesError;
  }, [status]);

  return (
    <div css={layoutRowCss({ gap: euiTheme.size.s, shrinkItems: false })}>
      <EuiText color="subdued" size="s">
        <p>
          {i18n.translate('xpack.searchHomepage.connectToElasticsearch.p.endpointLabel', {
            defaultMessage: 'Elasticsearch:',
          })}
        </p>
      </EuiText>
      <FormInfoField
        value={elasticsearchUrl}
        copyValue={elasticsearchUrl}
        dataTestSubj="endpointValueField"
        copyValueDataTestSubj="copyEndpointButton"
      />
      <EuiButton
        data-test-subj="searchHomepageConnectToElasticsearchApiKeysButton"
        color="text"
        iconType="plusCircle"
        size="s"
        onClick={() =>
          openWiredConnectionDetails({
            props: { options: { defaultTabId: 'apiKeys' } },
          })
        }
        disabled={!hasAPIKeyManagePermissions}
      >
        <FormattedMessage
          id="xpack.searchHomepage.connectToElasticsearch.apiKeysButtonEmptyLabel"
          defaultMessage="API keys"
        />
      </EuiButton>
      <EuiToolTip
        content={i18n.translate(
          'xpack.searchHomepage.searchHomepagePage.euiButtonIcon.connectionDetailsPressToLabel',
          {
            defaultMessage: 'Show connection details for connecting to the Elasticsearch API',
          }
        )}
        disableScreenReaderOutput
      >
        <EuiButtonIcon
          display="base"
          size="s"
          iconSize="m"
          iconType="plugs"
          onClick={() => openWiredConnectionDetails()}
          data-test-subj="searchHomepageConnectToElasticsearchConnectionDetailsButton"
          color="text"
          aria-label={i18n.translate(
            'xpack.searchHomepage.searchHomepagePage.euiButtonIcon.connectionDetailsPressToLabel',
            {
              defaultMessage: 'Show connection details for connecting to the Elasticsearch API',
            }
          )}
        />
      </EuiToolTip>
    </div>
  );
};
