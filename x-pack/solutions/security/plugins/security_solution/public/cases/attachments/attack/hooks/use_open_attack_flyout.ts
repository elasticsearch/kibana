/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { AttackDetailsRightPanelKey } from '../../../../flyout/attack_details/constants/panel_keys';
import { FLYOUT_ORIGIN } from '../../../../common/lib/telemetry';
import { useIsNewFlyoutEnabled } from '../../../../common/hooks/use_is_new_flyout_enabled';
import { useFlyoutApi } from '../../../../flyout_v2/use_flyout_api';
import { toReadableAttackIndexPattern } from '../utils';

export interface UseOpenAttackFlyoutParams {
  /** The attack document `_id`, saved as the attachment id. */
  attackId: string;
  /** The index the attack lives in, taken from the attachment metadata. */
  indexName: string;
  /** The attack title, used to label the flyout history entry. */
  attackTitle?: string;
}

/**
 * Opens the attack flyout on an attached attack, from either the new flyout or the legacy
 * expandable one.
 *
 * Shared by the row's "Show attack details" action and its title link, which open the same
 * flyout for the same reason a rule name and its row action both open the rule.
 */
export const useOpenAttackFlyout = ({
  attackId,
  indexName,
  attackTitle,
}: UseOpenAttackFlyoutParams): (() => void) => {
  const enableNewFlyout = useIsNewFlyoutEnabled();
  const { openAttackFlyout } = useFlyoutApi();
  const { openFlyout } = useExpandableFlyoutApi();

  // The flyout looks the attack up by id against this index, so it needs a pattern the user can
  // read — not the concrete backing index the attachment snapshotted. See
  // {@link toReadableAttackIndexPattern}.
  const flyoutIndexName = useMemo(() => toReadableAttackIndexPattern(indexName), [indexName]);

  return useCallback(() => {
    if (enableNewFlyout) {
      openAttackFlyout({
        attackId,
        indexName: flyoutIndexName,
        attackTitle,
        origin: FLYOUT_ORIGIN.CASE_ATTACHMENT,
      });
      return;
    }

    // Legacy expandable flyout path. No telemetry here — the new-flyout path reports telemetry
    // internally via openAttackFlyout, and the legacy path is being deprecated.
    openFlyout({
      right: {
        id: AttackDetailsRightPanelKey,
        params: { attackId, indexName: flyoutIndexName },
      },
    });
  }, [attackId, attackTitle, enableNewFlyout, flyoutIndexName, openAttackFlyout, openFlyout]);
};
