/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FormattedMessage } from '@kbn/i18n-react';
import React from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiPageTemplate,
  EuiIcon,
  EuiSpacer,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { DocLinksStart } from '@kbn/core-doc-links-browser';

export const EmptyConnectorsPrompt = ({
  onCTAClicked,
  docLinks,
}: {
  onCTAClicked: () => void;
  docLinks: DocLinksStart;
}) => {
  const { euiTheme } = useEuiTheme();
  const emptyConnectorsLogoCss = css`
    margin-left: ${euiTheme.size.base};
  `;

  return (
    <EuiPageTemplate.EmptyPrompt
      data-test-subj="createFirstConnectorEmptyPrompt"
      title={
        <>
          <EuiIcon
            type="logoSlack"
            size="xl"
            className="actEmptyConnectorsPrompt__logo"
            css={emptyConnectorsLogoCss}
            aria-hidden={true}
          />
          <EuiIcon
            type="logoGmail"
            size="xl"
            className="actEmptyConnectorsPrompt__logo"
            css={emptyConnectorsLogoCss}
            aria-hidden={true}
          />
          <EuiIcon
            type="logoWebhook"
            size="xl"
            className="actEmptyConnectorsPrompt__logo"
            css={emptyConnectorsLogoCss}
            aria-hidden={true}
          />
          <EuiSpacer size="s" />
          <EuiTitle size="m">
            <h2>
              <FormattedMessage
                id="xpack.triggersActionsUI.components.emptyConnectorsPrompt.addConnectorEmptyTitle"
                defaultMessage="Create your first connector"
              />
            </h2>
          </EuiTitle>
        </>
      }
      body={
        <p>
          <FormattedMessage
            id="xpack.triggersActionsUI.components.emptyConnectorsPrompt.addConnectorEmptyBody"
            defaultMessage="Configure various third-party services to Kibana."
          />
        </p>
      }
      actions={
        <>
          <EuiButton
            data-test-subj="createFirstActionButton"
            key="create-action"
            fill
            iconType="plusCircle"
            iconSide="left"
            onClick={onCTAClicked}
          >
            <FormattedMessage
              id="xpack.triggersActionsUI.components.emptyConnectorsPrompt.addConnectorButtonLabel"
              defaultMessage="Create connector"
            />
          </EuiButton>
          <br />
          <EuiButtonEmpty
            data-test-subj="documentationButton"
            key="documentation-button"
            target="_blank"
            href={docLinks.links.alerting.connectors}
            iconType="question"
          >
            <FormattedMessage
              id="xpack.triggersActionsUI.sections.actionsConnectorsList.documentationButtonLabel"
              defaultMessage="Documentation"
            />
          </EuiButtonEmpty>
        </>
      }
    />
  );
};
