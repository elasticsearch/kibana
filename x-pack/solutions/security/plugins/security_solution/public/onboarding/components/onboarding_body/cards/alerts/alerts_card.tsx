/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiLink, EuiSpacer } from '@elastic/eui';
import { SecurityPageName } from '@kbn/security-solution-navigation';
import { css } from '@emotion/css';
import { SecuritySolutionLinkButton } from '../../../../../common/components/links';
import { OnboardingCardId } from '../../../../constants';
import type { OnboardingCardComponent } from '../../../../types';
import { OnboardingCardContentAssetPanel } from '../common/card_content_asset_panel';
import { CardCallOut } from '../common/card_callout';
import { CardSubduedText } from '../common/card_subdued_text';
import * as i18n from './translations';
import type { CardSelectorListItem } from '../common/card_selector_list';
import { CardSelectorList } from '../common/card_selector_list';
import { ALERTS_CARD_ITEMS_BY_ID, ALERTS_CARD_ITEMS } from './alerts_card_config';
import { useOnboardingContext } from '../../../onboarding_context';
import { DEFAULT_ALERTS_CARD_ITEM_SELECTED } from './constants';
import { useStoredSelectedCardItemId } from '../../../hooks/use_stored_state';
import type { CardSelectorAssetListItem } from '../types';

export const AlertsCard: OnboardingCardComponent = ({
  isCardComplete,
  setExpandedCardId,
  setComplete,
  isCardAvailable,
}) => {
  const { spaceId } = useOnboardingContext();
  const [selectedAlertId, setSelectedAlertId] = useStoredSelectedCardItemId(
    'alerts',
    spaceId,
    DEFAULT_ALERTS_CARD_ITEM_SELECTED.id
  );
  const selectedCardItem = useMemo<CardSelectorAssetListItem>(
    () => ALERTS_CARD_ITEMS_BY_ID[selectedAlertId],
    [selectedAlertId]
  );

  const isIntegrationsCardComplete = useMemo(
    () => isCardComplete(OnboardingCardId.integrations),
    [isCardComplete]
  );

  const isIntegrationsCardAvailable = useMemo(
    () => isCardAvailable(OnboardingCardId.integrations),
    [isCardAvailable]
  );

  const expandIntegrationsCard = useCallback(() => {
    setExpandedCardId(OnboardingCardId.integrations, { scroll: true });
  }, [setExpandedCardId]);

  const onSelectCard = useCallback(
    (item: CardSelectorListItem) => {
      setSelectedAlertId(item.id);
    },
    [setSelectedAlertId]
  );

  return (
    <OnboardingCardContentAssetPanel asset={selectedCardItem.asset}>
      <EuiFlexGroup
        direction="column"
        gutterSize="xl"
        justifyContent="flexStart"
        alignItems="flexStart"
      >
        <EuiFlexItem
          className={css`
            width: 100%;
          `}
        >
          <CardSubduedText data-test-subj="alertsCardDescription" size="s">
            {i18n.ALERTS_CARD_DESCRIPTION}
          </CardSubduedText>
          <EuiSpacer />
          <CardSelectorList
            title={i18n.ALERTS_CARD_STEP_SELECTOR_TITLE}
            items={ALERTS_CARD_ITEMS}
            onSelect={onSelectCard}
            selectedItem={selectedCardItem}
            cardId={OnboardingCardId.alerts}
          />
          {isIntegrationsCardAvailable && !isIntegrationsCardComplete && (
            <>
              <EuiSpacer size="m" />
              <CardCallOut
                color="primary"
                icon="info"
                text={i18n.ALERTS_CARD_CALLOUT_INTEGRATIONS_TEXT}
                action={
                  <EuiLink onClick={expandIntegrationsCard}>
                    <EuiFlexGroup direction="row" gutterSize="xs" alignItems="center">
                      <EuiFlexItem>{i18n.ALERTS_CARD_CALLOUT_INTEGRATIONS_BUTTON}</EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiIcon
                          type="chevronSingleRight"
                          color="primary"
                          size="s"
                          aria-hidden={true}
                        />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiLink>
                }
              />
            </>
          )}
        </EuiFlexItem>
        <EuiFlexItem data-test-subj="alertsCardButton" grow={false}>
          <SecuritySolutionLinkButton
            onClick={() => setComplete(true)}
            deepLinkId={SecurityPageName.alerts}
            fill
            isDisabled={isIntegrationsCardAvailable && !isIntegrationsCardComplete}
          >
            {i18n.ALERTS_CARD_VIEW_ALERTS_BUTTON}
          </SecuritySolutionLinkButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </OnboardingCardContentAssetPanel>
  );
};

// eslint-disable-next-line import/no-default-export
export default AlertsCard;
