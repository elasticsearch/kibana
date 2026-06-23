/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

export const overviewTabTitle = (isAlert: boolean) =>
  i18n.translate('discover.profile.security.flyout.overviewTabTitle', {
    values: { isAlert },
    defaultMessage: '{isAlert, select, true {Alert} other {Event}} Overview',
  });

export const overviewExploreButtonLabel = (isAlert: boolean) =>
  i18n.translate('discover.profile.security.flyout.overviewExploreButtonLabel', {
    values: { isAlert },
    defaultMessage: 'Explore in {isAlert, select, true {Alerts} other {Timeline}}',
  });

export const noEcsDescriptionReason = i18n.translate(
  'discover.profile.security.flyout.noEventKindDescriptionMessage',
  {
    defaultMessage: "This field doesn't have a description because it's not part of ECS.",
  }
);

export const aboutSectionTitle = i18n.translate(
  'discover.profile.security.flyout.aboutSectionTitle',
  {
    defaultMessage: 'About',
  }
);

export const descriptionSectionTitle = i18n.translate(
  'discover.profile.security.flyout.descriptionSectionTitle',
  {
    defaultMessage: 'Description',
  }
);

export const reasonSectionTitle = i18n.translate(
  'discover.profile.security.flyout.reasonSectionTitle',
  {
    defaultMessage: 'Reason',
  }
);

export const ecsDescriptionLoadingAriaLable = i18n.translate(
  'discover.profile.security.flyout.ecsDescriptionLoadingAriaLabel',
  {
    defaultMessage: 'Loading ECS description',
  }
);

export const iocOverviewTabTitle = i18n.translate(
  'discover.profile.security.flyout.iocOverviewTabTitle',
  {
    defaultMessage: 'Indicator Overview',
  }
);

export const attackOverviewTabTitle = i18n.translate(
  'discover.profile.security.flyout.attackOverviewTabTitle',
  {
    defaultMessage: 'Attack Overview',
  }
);
