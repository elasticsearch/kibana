/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { VFC } from 'react';
import React, { memo } from 'react';
import { EuiFlexGroup } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ShareUrlIconButton } from '../../../shared/components/share_url_icon_button';
import { useGetFlyoutLink } from '../hooks/use_get_flyout_link';
import { useBasicDataFromDetailsData } from '../../shared/hooks/use_basic_data_from_details_data';
import { useDocumentDetailsContext } from '../../shared/context';
import { SHARE_BUTTON_TEST_ID } from './test_ids';

/**
 * Actions displayed in the header menu in the right section of alerts flyout
 */
export const HeaderActions: VFC = memo(() => {
  const { dataFormattedForFieldBrowser, eventId, indexName } = useDocumentDetailsContext();
  const { isAlert, timestamp } = useBasicDataFromDetailsData(dataFormattedForFieldBrowser);

  const alertDetailsLink = useGetFlyoutLink({
    eventId,
    indexName,
    timestamp,
  });

  return (
    <EuiFlexGroup
      direction="row"
      justifyContent="flexEnd"
      alignItems="center"
      gutterSize="none"
      responsive={false}
    >
      <ShareUrlIconButton
        url={isAlert ? alertDetailsLink : null}
        tooltip={i18n.translate('xpack.securitySolution.flyout.right.header.shareButtonToolTip', {
          defaultMessage: 'Copy link to alert',
        })}
        ariaLabel={i18n.translate(
          'xpack.securitySolution.flyout.right.header.shareButtonAriaLabel',
          {
            defaultMessage: 'Copy link to alert',
          }
        )}
        dataTestSubj={SHARE_BUTTON_TEST_ID}
      />
    </EuiFlexGroup>
  );
});

HeaderActions.displayName = 'HeaderActions';
