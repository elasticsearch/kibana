/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPopover,
  EuiPopoverFooter,
  EuiPopoverTitle,
  EuiText,
  useGeneratedHtmlId,
} from '@elastic/eui';

import type { ObservabilityOnboardingLocatorParams } from '@kbn/deeplinks-observability';
import { OBSERVABILITY_ONBOARDING_LOCATOR } from '@kbn/deeplinks-observability';
import { i18n } from '@kbn/i18n';
import { useBoolean } from '@kbn/react-hooks';

import { useKibanaContextForPlugin } from '../../../../../hooks/use_kibana';
import { APM_HOST_TROUBLESHOOTING_LINK } from '../../../../../components/asset_details/constants';

const popoverContent = {
  title: i18n.translate('xpack.infra.addDataPopover.wantToSeeMorePopoverTitleLabel', {
    defaultMessage: 'Want to see more?',
  }),
  content: i18n.translate('xpack.infra.addDataPopover.understandHostPerformanceByTextLabel', {
    defaultMessage: 'Understand host performance by collecting more metrics.',
  }),
  button: i18n.translate('xpack.infra.addDataPopover.understandHostPerformanceByTextLabel', {
    defaultMessage: 'Add data',
  }),
  link: i18n.translate('xpack.infra.addDataPopover.troubleshootingLinkLabel', {
    defaultMessage: 'Troubleshooting',
  }),
};

const badgeContent = i18n.translate('xpack.infra.addDataPopover.naBadgeLabel', {
  defaultMessage: 'N/A',
});

export const AddDataTroubleshootingPopover = () => {
  const [isPopoverOpen, { off: closePopover, toggle: togglePopover }] = useBoolean(false);
  const popoverTitleId = useGeneratedHtmlId();

  const {
    services: { share },
  } = useKibanaContextForPlugin();
  const addDataLinkHref = share.url.locators
    .get<ObservabilityOnboardingLocatorParams>(OBSERVABILITY_ONBOARDING_LOCATOR)
    ?.getRedirectUrl({ category: 'host' });

  const onButtonClick = () => togglePopover();

  return (
    <EuiPopover
      aria-labelledby={popoverTitleId}
      button={
        <EuiBadge
          color="hollow"
          iconType="info"
          iconSide="left"
          onClick={onButtonClick}
          onClickAriaLabel={popoverContent.title}
        >
          {badgeContent}
        </EuiBadge>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
    >
      <EuiPopoverTitle id={popoverTitleId}>{popoverContent.title}</EuiPopoverTitle>
      <EuiText size="s" style={{ width: 300 }}>
        {popoverContent.content}
      </EuiText>
      <EuiPopoverFooter>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButton
              size="s"
              href={addDataLinkHref}
              data-test-subj="infraHostsTableWithoutSystemMetricsPopoverAddMoreButton"
            >
              {popoverContent.button}
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <EuiLink
                href={APM_HOST_TROUBLESHOOTING_LINK}
                target="_blank"
                data-test-subj="infraHostsTableWithoutSystemMetricsPopoverTroubleshootingLink"
                external
              >
                {popoverContent.link}
              </EuiLink>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPopoverFooter>
    </EuiPopover>
  );
};
