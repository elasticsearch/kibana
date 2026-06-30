/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type MouseEvent } from 'react';
import { EuiCallOut, EuiLink, EuiSpacer } from '@elastic/eui';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import type { VisualizeServices } from '../types';

const styles = {
  link: css`
    text-decoration: underline;
  `,
};

/**
 * Cross-promotion callout shown above the visualize listing when the user can
 * create new dashboards. Pointing users at the dashboard editor (where they
 * can author + place visualizations in one flow) instead of round-tripping
 * through the visualize library is a long-standing UX nudge.
 */
export const DashboardFlowCallout = () => {
  const linkStyles = useMemoCss(styles);
  const {
    services: { application, dashboardCapabilities },
  } = useKibana<VisualizeServices>();

  if (!dashboardCapabilities.createNew) {
    return null;
  }

  return (
    <>
      <EuiCallOut
        announceOnMount
        size="s"
        iconType="info"
        data-test-subj="visualize-dashboard-flow-prompt"
        title={
          <FormattedMessage
            id="visualizations.visualizeListingDashboardFlowDescription"
            defaultMessage="Building a dashboard? Create and add your visualizations right from the {dashboardApp}."
            values={{
              dashboardApp: (
                <EuiLink
                  className="visListingCallout__link"
                  css={linkStyles.link}
                  onClick={(event: MouseEvent) => {
                    event.preventDefault();
                    application.navigateToUrl(application.getUrlForApp('dashboards'));
                  }}
                >
                  <FormattedMessage
                    id="visualizations.visualizeListingDashboardAppName"
                    defaultMessage="Dashboard application"
                  />
                </EuiLink>
              ),
            }}
          />
        }
      />
      <EuiSpacer size="m" />
    </>
  );
};
