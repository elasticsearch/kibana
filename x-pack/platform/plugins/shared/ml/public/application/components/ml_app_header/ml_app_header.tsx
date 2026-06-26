/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useContext } from 'react';
import { EuiSpacer } from '@elastic/eui';
import { AppHeader } from '@kbn/app-header';
import type {
  AppHeaderBack,
  AppHeaderBadge,
  AppHeaderMetadataItems,
  AppHeaderPadding,
  AppHeaderTab,
  AppHeaderTitle,
  AppHeaderMenu,
} from '@kbn/app-header';
import { MlPageControlsContext } from '../ml_page/ml_page';
import { MlDatePickerBar } from './ml_date_picker_bar';

export interface MlAppHeaderProps {
  title: AppHeaderTitle;
  back?: AppHeaderBack;
  menu?: AppHeaderMenu;
  tabs?: AppHeaderTab[];
  badges?: AppHeaderBadge[];
  metadata?: AppHeaderMetadataItems;
  showDatePicker?: boolean;
  padding?: AppHeaderPadding;
  docLink?: string;
}

export const MlAppHeader: FC<MlAppHeaderProps> = ({
  title,
  back,
  menu,
  tabs,
  badges,
  metadata,
  showDatePicker = false,
  padding,
  docLink,
}) => {
  const { isManagementMode } = useContext(MlPageControlsContext);
  const resolvedPadding = padding ?? (isManagementMode ? 'm' : { bleed: 'l' });

  return (
    <>
      <AppHeader
        title={title}
        back={back}
        menu={menu}
        tabs={tabs}
        badges={badges}
        metadata={metadata}
        padding={resolvedPadding}
        docLink={docLink}
        sticky={false}
      />
      {showDatePicker ? (
        <>
          <EuiSpacer size="s" />
          <MlDatePickerBar />
        </>
      ) : null}
    </>
  );
};
