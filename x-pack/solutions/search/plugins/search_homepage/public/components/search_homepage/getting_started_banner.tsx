/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';

import { EuiIllustration } from '@elastic/eui';
import { featurePackedBox } from '@elastic/eui-illustrations';
import React from 'react';
import { AnnouncementBanner } from '@kbn/announcement-banner';
import { useKibana } from '../../hooks/use_kibana';

export const GettingStartedBanner = () => {
  const {
    services: { application },
  } = useKibana();

  return (
    <AnnouncementBanner
      data-test-subj="searchHomepageGettingStartedBanner"
      title={i18n.translate(
        'xpack.searchHomepage.gettingStartedBanner.h4.exploreAPITutorialsAndLabel',
        {
          defaultMessage: 'Explore API tutorials and connect Elasticsearch to your application.',
        }
      )}
      headingElement="h4"
      media={<EuiIllustration type={featurePackedBox} alt="" />}
      color="plain"
      actionProps={{
        primary: {
          children: i18n.translate(
            'xpack.searchHomepage.gettingStartedBanner.getStartedWithElasticsearchButtonLabel',
            { defaultMessage: 'Get started with Elasticsearch' }
          ),
          iconType: 'rocket',
          onClick: () => application.navigateToApp('searchGettingStarted'),
          'data-test-subj': 'searchHomepageGettingStartedBannerGetStartedWithElasticsearchButton',
        },
      }}
    />
  );
};
