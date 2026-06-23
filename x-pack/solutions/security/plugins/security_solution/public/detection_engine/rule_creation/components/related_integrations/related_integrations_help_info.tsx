/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import useToggle from 'react-use/lib/useToggle';
import { EuiButtonIcon, EuiLink, EuiPopover, EuiText, EuiToolTip } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '../../../../common/lib/kibana';
import { RELATED_INTEGRATIONS_HELP_ARIA_LABEL } from './translations';

/**
 * Theme doesn't expose width variables. Using provided size variables will require
 * multiplying it by another magic constant.
 *
 * 320px width looks
 * like a [commonly used width in EUI](https://github.com/search?q=repo%3Aelastic%2Feui%20320&type=code).
 */
const POPOVER_WIDTH = 320;

export function RelatedIntegrationsHelpInfo(): JSX.Element {
  const [isPopoverOpen, togglePopover] = useToggle(false);
  const { docLinks } = useKibana().services;

  const button = (
    <EuiToolTip content={RELATED_INTEGRATIONS_HELP_ARIA_LABEL} disableScreenReaderOutput>
      <EuiButtonIcon
        iconType="question"
        onClick={togglePopover}
        aria-label={RELATED_INTEGRATIONS_HELP_ARIA_LABEL}
      />
    </EuiToolTip>
  );

  return (
    <EuiPopover
      button={button}
      isOpen={isPopoverOpen}
      closePopover={togglePopover}
      aria-label={RELATED_INTEGRATIONS_HELP_ARIA_LABEL}
    >
      <EuiText css={{ width: POPOVER_WIDTH }} size="s">
        <FormattedMessage
          id="xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.fieldRelatedIntegrationsHelpText"
          defaultMessage="Choose the {integrationsDocLink} this rule depends on, and correct if necessary each integration’s version constraint in {semverLink} range format. Supported examples: ^1.2.3, ~1.2.3, 1.2.3, >=1.2.3, or ^1.2.3 || ^2.0.0."
          values={{
            integrationsDocLink: (
              <EuiLink href={docLinks.links.securitySolution.createDetectionRules} target="_blank">
                <FormattedMessage
                  id="xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.integrationsLink"
                  defaultMessage="integrations"
                />
              </EuiLink>
            ),
            semverLink: (
              <EuiLink href="https://semver.org/" target="_blank">
                <FormattedMessage
                  id="xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.semanticVersionLink"
                  defaultMessage="semantic version"
                />
              </EuiLink>
            ),
          }}
        />
      </EuiText>
    </EuiPopover>
  );
}
