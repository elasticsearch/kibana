/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { EuiCallOut, EuiLink, EuiSpacer } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { MITRE_ATTACK_VERSION } from '../../../../../../common/detection_engine/mitre/mitre_version';
import {
  NEW_FEATURES_TOUR_STORAGE_KEYS,
  SecurityPageName,
} from '../../../../../../common/constants';
import { useKibana } from '../../../../../common/lib/kibana';
import { useGetSecuritySolutionUrl } from '../../../../../common/components/link_to';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import {
  MITRE_VERSION_UPGRADED_CALLOUT_TITLE,
  MITRE_VERSION_UPGRADED_CALLOUT_LEARN_MORE,
} from './translations';

const DISMISSAL_STORAGE_KEY = NEW_FEATURES_TOUR_STORAGE_KEYS.MITRE_VERSION_UPGRADED_CALLOUT;

/**
 * One-time notice shown on the Rules Management page to
 * inform users that the bundled MITRE ATT&CK dataset was upgraded. The
 * dismissal key is keyed to `MITRE_ATTACK_VERSION` via
 * `NEW_FEATURES_TOUR_STORAGE_KEYS.MITRE_VERSION_UPGRADED_CALLOUT`, so the next
 * dataset bump automatically re-surfaces the callout for everyone.
 */
export const MitreVersionUpgradedCallout = React.memo(() => {
  const isMitreAttackUpdatesUIEnabled = useIsExperimentalFeatureEnabled(
    'mitreAttackUpdatesUIEnabled'
  );
  const { docLinks } = useKibana().services;
  const getSecuritySolutionUrl = useGetSecuritySolutionUrl();
  const coverageOverviewHref = getSecuritySolutionUrl({
    deepLinkId: SecurityPageName.coverageOverview,
  });
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    setIsDismissed(localStorage.getItem(DISMISSAL_STORAGE_KEY) === 'true');
  }, []);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSAL_STORAGE_KEY, 'true');
    setIsDismissed(true);
  }, []);

  if (!isMitreAttackUpdatesUIEnabled || isDismissed) {
    return null;
  }

  return (
    <>
      <EuiCallOut
        announceOnMount={false}
        data-test-subj="mitreVersionUpgradedCallout"
        title={MITRE_VERSION_UPGRADED_CALLOUT_TITLE(MITRE_ATTACK_VERSION)}
        color="primary"
        iconType="info"
        onDismiss={handleDismiss}
      >
        <p>
          <FormattedMessage
            id="xpack.securitySolution.rulesManagement.mitreVersionUpgradedCallout.body"
            defaultMessage="The MITRE ATT&CK® dataset bundled with Kibana was updated to {version}. Rules that reference IDs no longer present in {version} are flagged on the {coverageLink} and on the rule edit form. {learnMoreLink}"
            values={{
              version: MITRE_ATTACK_VERSION,
              coverageLink: (
                <EuiLink
                  href={coverageOverviewHref}
                  data-test-subj="mitreVersionUpgradedCalloutCoverageLink"
                >
                  <FormattedMessage
                    id="xpack.securitySolution.rulesManagement.mitreVersionUpgradedCallout.coverageLink"
                    defaultMessage="MITRE ATT&CK® coverage page"
                  />
                </EuiLink>
              ),
              learnMoreLink: (
                <EuiLink
                  href={docLinks.links.siem.mitreCoverage}
                  target="_blank"
                  data-test-subj="mitreVersionUpgradedCalloutLearnMoreLink"
                >
                  {MITRE_VERSION_UPGRADED_CALLOUT_LEARN_MORE}
                </EuiLink>
              ),
            }}
          />
        </p>
      </EuiCallOut>
      <EuiSpacer size="s" />
    </>
  );
});
MitreVersionUpgradedCallout.displayName = 'MitreVersionUpgradedCallout';
