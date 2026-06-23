/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiLink, EuiSpacer } from '@elastic/eui';
import { SecurityPageName } from '@kbn/security-solution-navigation';
import { OnboardingCardId } from '../../../../constants';
import type { OnboardingCardComponent } from '../../../../types';
import { OnboardingCardContentAssetPanel } from '../common/card_content_asset_panel';
import { CardCallOut } from '../common/card_callout';
import { CardLinkButton } from '../common/card_link_button';
import { CardSubduedText } from '../common/card_subdued_text';
import * as i18n from './translations';
import type { CardSelectorListItem } from '../common/card_selector_list';
import { CardSelectorList } from '../common/card_selector_list';
import { DASHBOARDS_CARD_ITEMS_BY_ID, DASHBOARDS_CARD_ITEMS } from './dashboards_card_config';
import { useOnboardingContext } from '../../../onboarding_context';
import { DEFAULT_DASHBOARDS_CARD_ITEM_SELECTED } from './constants';
import { useStoredSelectedCardItemId } from '../../../hooks/use_stored_state';
import type { CardSelectorAssetListItem } from '../types';

export const DashboardsCard: OnboardingCardComponent = ({
  isCardComplete,
  setComplete,
  setExpandedCardId,
  isCardAvailable,
}) => {
  const { spaceId } = useOnboardingContext();

  const [selectedDashboardId, setSelectedDashboardId] = useStoredSelectedCardItemId(
    'dashboards',
    spaceId,
    DEFAULT_DASHBOARDS_CARD_ITEM_SELECTED.id
  );
  const selectedCardItem = useMemo<CardSelectorAssetListItem>(
    () => DASHBOARDS_CARD_ITEMS_BY_ID[selectedDashboardId],
    [selectedDashboardId]
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
      setSelectedDashboardId(item.id);
    },
    [setSelectedDashboardId]
  );

  return (
    <OnboardingCardContentAssetPanel asset={selectedCardItem.asset}>
      <EuiFlexGroup
        direction="column"
        gutterSize="xl"
        justifyContent="flexStart"
        alignItems="flexStart"
      >
        <EuiFlexItem grow={false}>
          <CardSubduedText data-test-subj="dashboardsDescription" size="s">
            {i18n.DASHBOARDS_CARD_DESCRIPTION}
          </CardSubduedText>
          <EuiSpacer />
          <CardSelectorList
            title={i18n.DASHBOARDS_CARD_STEP_SELECTOR_TITLE}
            items={DASHBOARDS_CARD_ITEMS}
            onSelect={onSelectCard}
            selectedItem={selectedCardItem}
            cardId={OnboardingCardId.dashboards}
          />
          {isIntegrationsCardAvailable && !isIntegrationsCardComplete && (
            <>
              <EuiSpacer size="m" />
              <CardCallOut
                color="primary"
                icon="info"
                text={i18n.DASHBOARDS_CARD_CALLOUT_INTEGRATIONS_TEXT}
                action={
                  <EuiLink
                    data-test-subj="dashboardsCardCalloutLink"
                    onClick={expandIntegrationsCard}
                  >
                    <EuiFlexGroup direction="row" gutterSize="xs" alignItems="center">
                      <EuiFlexItem>{i18n.DASHBOARDS_CARD_CALLOUT_INTEGRATIONS_BUTTON}</EuiFlexItem>
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
        <EuiFlexItem data-test-subj="dashboardsCardButton" grow={false}>
          <CardLinkButton
            onClick={() => setComplete(true)}
            linkId="goToDashboardsButton"
            cardId={OnboardingCardId.dashboards}
            deepLinkId={SecurityPageName.dashboards}
            fill
            isDisabled={isIntegrationsCardAvailable && !isIntegrationsCardComplete}
          >
            {i18n.DASHBOARDS_CARD_GO_TO_DASHBOARDS_BUTTON}
          </CardLinkButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </OnboardingCardContentAssetPanel>
  );
};

// eslint-disable-next-line import/no-default-export
export default DashboardsCard;
