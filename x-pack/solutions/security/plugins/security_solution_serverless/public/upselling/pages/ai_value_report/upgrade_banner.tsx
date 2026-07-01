/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiIcon } from '@elastic/eui';
import { AnnouncementBanner } from '@kbn/announcement-banner';
import { ProductFeatureKey } from '@kbn/security-solution-features/keys';
import analyticsSpeedAcceleration from './analytics_speed_acceleration.svg';
import { useKibana } from '../../../common/services';
import { getProjectFeaturesUrl } from '../../../navigation/util';
import { getProductTypeByPLI } from '../../hooks/use_product_type_by_pli';
import * as i18n from './translations';

const requiredTier = getProductTypeByPLI(ProductFeatureKey.aiValueReport) ?? '';

export const AIValueReportUpgradeBanner: React.FC = () => {
  const { services } = useKibana();
  const upgradeHref = getProjectFeaturesUrl(services.cloud);

  return (
    <AnnouncementBanner
      data-test-subj="aiValueEssentialsUpgradeBanner"
      title={i18n.UPGRADE_TITLE(requiredTier)}
      headingElement="h3"
      text={i18n.UPGRADE_TEXT(requiredTier)}
      media={<EuiIcon type={analyticsSpeedAcceleration} size="original" aria-hidden={true} />}
      actionProps={{
        primary: {
          children: i18n.UPGRADE_CTA,
          ...(upgradeHref ? { href: upgradeHref } : {}),
          iconType: 'popout',
          iconSide: 'left' as const,
          target: '_blank',
          rel: 'noopener noreferrer',
          'data-test-subj': 'aiValueEssentialsUpgradeCtaButton',
        },
      }}
    />
  );
};
