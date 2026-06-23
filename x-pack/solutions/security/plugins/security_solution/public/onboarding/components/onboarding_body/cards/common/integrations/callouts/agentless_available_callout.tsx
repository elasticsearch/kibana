/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiIcon, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';

import { useKibana } from '../../../../../../../common/lib/kibana';
import { LinkAnchor } from '../../../../../../../common/components/links';
import { CardCallOut } from '../../card_callout';
import { TELEMETRY_AGENTLESS_LEARN_MORE } from '../constants';
import { useIntegrationContext } from '../../../../../../../common/lib/integrations/hooks/integration_context';

export const AgentlessAvailableCallout = React.memo(() => {
  const { euiTheme } = useEuiTheme();
  const { docLinks } = useKibana().services;
  const {
    telemetry: { reportLinkClick },
  } = useIntegrationContext();

  const onClick = useCallback(() => {
    reportLinkClick?.(TELEMETRY_AGENTLESS_LEARN_MORE);
  }, [reportLinkClick]);

  /* @ts-expect-error: add the blog link to `packages/kbn-doc-links/src/get_doc_links.ts` when it is ready and remove this exit condition*/
  if (!docLinks.links.fleet.agentlessBlog) {
    return null;
  }

  return (
    <CardCallOut
      color="danger"
      text={
        <FormattedMessage
          id="xpack.securitySolution.onboarding.integrationsCard.callout.agentLessAvailableLabel"
          defaultMessage={`{icon} {new} {text} {link}`}
          values={{
            icon: <EuiIcon type="popper" size="m" aria-hidden={true} />,
            new: (
              <b
                css={css`
                  font-weight: ${euiTheme.font.weight.bold};
                `}
              >
                <FormattedMessage
                  id="xpack.securitySolution.onboarding.integrationsCard.callout.agentLessAvailableNewLabel"
                  defaultMessage="NEW"
                />
              </b>
            ),
            text: (
              <FormattedMessage
                id="xpack.securitySolution.onboarding.integrationsCard.callout.agentLessAvailableText"
                defaultMessage="Identify configuration risks in your cloud account with new and simplified agentless configuration"
              />
            ),
            link: (
              <LinkAnchor
                /* @ts-expect-error-next-line */
                href={docLinks.links.fleet.agentlessBlog}
                onClick={onClick}
                data-test-subj="agentlessLearnMoreLink"
                external={true}
                target="_blank"
              >
                <FormattedMessage
                  id="xpack.securitySolution.onboarding.integrationsCard.button.agentlessLearnMoreLink"
                  defaultMessage="Learn more"
                />
              </LinkAnchor>
            ),
          }}
        />
      }
    />
  );
});

AgentlessAvailableCallout.displayName = 'AgentlessAvailableCallout';
