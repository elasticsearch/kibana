/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiLink, EuiSpacer } from '@elastic/eui';
import { SecurityPageName } from '@kbn/security-solution-navigation';
import { KNOWLEDGE_BASE_TAB } from '@kbn/elastic-assistant/impl/assistant/settings/const';
import { SecuritySolutionLinkButton } from '../../../../../common/components/links';
import { OnboardingCardId } from '../../../../constants';
import type { OnboardingCardComponent } from '../../../../types';
import { OnboardingCardContentAssetPanel } from '../common/card_content_asset_panel';
import { CardCallOut } from '../common/card_callout';

import { CardSubduedText } from '../common/card_subdued_text';
import * as i18n from './translations';
import type { CardSelectorListItem } from '../common/card_selector_list';
import { CardSelectorList } from '../common/card_selector_list';
import { useOnboardingContext } from '../../../onboarding_context';
import {
  KNOWLEDGE_SOURCE_CARD_ITEMS_BY_ID,
  KNOWLEDGE_SOURCE_CARD_ITEMS,
} from './knowledge_source_card_config';
import { DEFAULT_KNOWLEDGE_SOURCE_CARD_ITEM_SELECTED } from './constants';
import type { CardSelectorAssetListItem } from '../types';
import { useStoredSelectedCardItemId } from '../../../hooks/use_stored_state';

export const KnowledgeSourceCard: OnboardingCardComponent = ({
  isCardComplete,
  setExpandedCardId,
  isCardAvailable,
}) => {
  const { spaceId } = useOnboardingContext();

  const [selectedRuleId, setSelectedRuleId] = useStoredSelectedCardItemId(
    'knowledgeSource',
    spaceId,
    DEFAULT_KNOWLEDGE_SOURCE_CARD_ITEM_SELECTED.id
  );
  const selectedCardItem = useMemo<CardSelectorAssetListItem>(
    () => KNOWLEDGE_SOURCE_CARD_ITEMS_BY_ID[selectedRuleId],
    [selectedRuleId]
  );

  const isIntegrationsCardComplete = useMemo(
    () => isCardComplete(OnboardingCardId.integrationsSearchAILake),
    [isCardComplete]
  );

  const isIntegrationsCardAvailable = useMemo(
    () => isCardAvailable(OnboardingCardId.integrationsSearchAILake),
    [isCardAvailable]
  );

  const expandIntegrationsCard = useCallback(() => {
    setExpandedCardId(OnboardingCardId.integrationsSearchAILake, { scroll: true });
  }, [setExpandedCardId]);

  const onSelectCard = useCallback(
    (item: CardSelectorListItem) => {
      setSelectedRuleId(item.id);
    },
    [setSelectedRuleId]
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
          <CardSubduedText data-test-subj="knowledgeSourceCardDescription" size="s">
            {i18n.KNOWLEDGE_SOURCE_CARD_DESCRIPTION}
          </CardSubduedText>
          <EuiSpacer />
          <CardSelectorList
            title={i18n.KNOWLEDGE_SOURCE_CARD_STEP_SELECTOR_TITLE}
            items={KNOWLEDGE_SOURCE_CARD_ITEMS}
            onSelect={onSelectCard}
            selectedItem={selectedCardItem}
            cardId={OnboardingCardId.knowledgeSource}
          />
          {isIntegrationsCardAvailable && !isIntegrationsCardComplete && (
            <>
              <EuiSpacer size="m" />
              <CardCallOut
                color="primary"
                icon="info"
                text={i18n.KNOWLEDGE_SOURCE_CARD_CALLOUT_INTEGRATIONS_TEXT}
                action={
                  <EuiLink onClick={expandIntegrationsCard}>
                    <EuiFlexGroup direction="row" gutterSize="xs" alignItems="center">
                      <EuiFlexItem>
                        {i18n.KNOWLEDGE_SOURCE_CARD_CALLOUT_INTEGRATIONS_BUTTON}
                      </EuiFlexItem>
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
        <EuiFlexItem data-test-subj="knowledgeSourceCardButton" grow={false}>
          <SecuritySolutionLinkButton
            deepLinkId={SecurityPageName.configurationsAiSettings}
            path={`?tab=${KNOWLEDGE_BASE_TAB}`}
            fill
            isDisabled={isIntegrationsCardAvailable && !isIntegrationsCardComplete}
          >
            {i18n.KNOWLEDGE_SOURCE_CARD_ADD_BUTTON}
          </SecuritySolutionLinkButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </OnboardingCardContentAssetPanel>
  );
};

// eslint-disable-next-line import/no-default-export
export default KnowledgeSourceCard;
