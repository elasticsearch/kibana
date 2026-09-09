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
import { ShareUrlIconButton } from '../../shared/components/share_url_icon_button';
import { useAttackDetailsContext } from '../context';
import { useHeaderData } from '../hooks/use_header_data';
import { useGetAttackFlyoutLink } from '../hooks/use_get_attack_flyout_link';
import { HEADER_SHARE_BUTTON_TEST_ID } from '../constants/test_ids';

/**
 * Actions displayed in the navigation header of the attack details flyout
 */
export const AttackHeaderActions: VFC = memo(() => {
  const { attackId, indexName } = useAttackDetailsContext();
  const { timestamp } = useHeaderData();

  const attackDetailsLink = useGetAttackFlyoutLink({
    attackId,
    indexName,
    timestamp: timestamp ?? undefined,
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
        url={attackDetailsLink}
        tooltip={i18n.translate(
          'xpack.securitySolution.attackDetailsFlyout.header.shareButtonToolTip',
          {
            defaultMessage: 'Copy link to attack',
          }
        )}
        ariaLabel={i18n.translate(
          'xpack.securitySolution.attackDetailsFlyout.header.shareButtonAriaLabel',
          {
            defaultMessage: 'Copy link to attack',
          }
        )}
        dataTestSubj={HEADER_SHARE_BUTTON_TEST_ID}
      />
    </EuiFlexGroup>
  );
});

AttackHeaderActions.displayName = 'AttackHeaderActions';
