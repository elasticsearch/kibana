/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { i18n } from '@kbn/i18n';

import { HelpMenu } from '../../../components/help_menu';
import { useMlKibana } from '../../../contexts/kibana';
import { MlAppHeader } from '../../../components/ml_app_header';
import { SourceSelection } from '../analytics_management/components/source_selection';

export const Page: FC = () => {
  const {
    services: { docLinks },
  } = useMlKibana();
  const helpLink = docLinks.links.ml.dataFrameAnalytics;

  return (
    <>
      <MlAppHeader
        title={i18n.translate('xpack.ml.dataframe.analyticsSourceSelection.title', {
          defaultMessage: 'New analytics job / Choose a source data view',
        })}
      />

      <SourceSelection />
      <HelpMenu docLink={helpLink} />
    </>
  );
};
