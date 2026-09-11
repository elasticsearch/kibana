/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBadgeGroup,
  EuiButtonIcon,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiIcon,
  EuiNotificationBadge,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { getEbtProps } from '@kbn/ebt-click';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import {
  EvidenceList,
  type InvestigationDiscoverParams,
  type InvestigationStatus,
} from '@kbn/investigation-output';
import { DISCOVER_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import type { DiscoverAppLocatorParams } from '@kbn/discover-plugin/common';
import type {
  InvestigationState,
  SignificantEventInvestigation,
} from '@kbn/significant-events-schema';
import { AiButton } from '@kbn/shared-ux-ai-components';
import { InvestigationCanvas } from '@kbn/investigation-canvas';
import { useKibana } from '../hooks/use_kibana';
import { buildInvestigationConversationChatOptions } from '../chat/open_significant_event_in_chat';
import {
  buildHypothesisChatOptions,
  buildRecommendationChatOptions,
} from './open_investigation_item_in_chat';
import { BlindSpotsTable } from './blind_spots_table';
import {
  InvestigationFormattedText,
  NIGHTSHIFT_INLINE_CODE_FONT_SIZE,
} from './investigation_formatted_text';
import { TruncatableSummary } from '../common/truncatable_summary';
import { truncateTextPreview } from '../common/truncate_text_preview';
import { FlyoutSectionTitle } from '../common/flyout_section_title';
import {
  NIGHTSHIFT_EBT_ACTIONS,
  NIGHTSHIFT_EBT_DETAILS,
  NIGHTSHIFT_EBT_ELEMENTS,
} from '../common/ebt_constants';
import {
  GradientOutlinedStatusBadge,
  InvestigationCompleteCheckIcon,
  InvestigationGradientLabel,
  InvestigatingStatusDots,
} from './investigation_status_badge';
import { InvestigationItemChatButton } from './investigation_item_chat_button';
import { InvestigationRowHoverAction } from './investigation_row_hover_action';
import {
  nightshiftBackgroundTransition,
  nightshiftReducedMotionStyles,
  nightshiftTransformTransition,
} from '../common/transition';
import {
  getConclusionText,
  getHypothesisStatusLabel,
  getInvestigationHeadline,
  getInvestigationCompleteStatusLabel,
  getInvestigationTimeLabel,
  parseInvestigationRecommendations,
  sortInvestigationHypotheses,
  type RecommendationItem,
} from './investigation_presentation';

export type InvestigationFlyoutTabId = 'recommendations' | 'blindSpots' | 'hypotheses';

type CompletedTabId = InvestigationFlyoutTabId;

const recommendationChatTooltip = i18n.translate(
  'xpack.nightshift.investigation.recommendationChatTooltip',
  {
    defaultMessage: 'Ask agent about this recommendation',
  }
);

const hypothesisChatTooltip = i18n.translate(
  'xpack.nightshift.investigation.hypothesisChatTooltip',
  {
    defaultMessage: 'Ask agent about this hypothesis',
  }
);

const hypothesisConfirmedAriaLabel = i18n.translate(
  'xpack.nightshift.investigation.hypothesisConfirmedAriaLabel',
  {
    defaultMessage: 'Hypothesis confirmed',
  }
);

const INVESTIGATION_FLYOUT_BODY_FONT_SIZE = '14px';

const flyoutBodyTextCss = css`
  font-size: ${INVESTIGATION_FLYOUT_BODY_FONT_SIZE};
  line-height: 1.5;
`;

const flyoutCodeBlockCss = css`
  font-size: ${NIGHTSHIFT_INLINE_CODE_FONT_SIZE};
  line-height: 1.5;
`;

/** ~2 lines of 14px body text in the investigation flyout recommendations list. */
const RECOMMENDATION_TITLE_PREVIEW_MAX_LENGTH = 100;

function FlyoutFormattedText(
  props: Omit<React.ComponentProps<typeof InvestigationFormattedText>, 'textSize' | 'fontSize'>
): React.ReactElement {
  return <InvestigationFormattedText fontSize={INVESTIGATION_FLYOUT_BODY_FONT_SIZE} {...props} />;
}

function InvestigationFlyoutListPanel({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiPanel
      hasBorder
      paddingSize="none"
      css={css`
        background: ${euiTheme.colors.backgroundBasePlain};
        transition: ${nightshiftBackgroundTransition(euiTheme)};

        &:hover {
          background: ${euiTheme.colors.backgroundBaseSubdued};
        }
      `}
    >
      {children}
    </EuiPanel>
  );
}

function InvestigationFlyoutRow({
  testSubj,
  expandableContent,
  action,
  showExpandedSeparator = false,
  showToggle,
  isToggleDisabled = false,
  children,
}: {
  testSubj?: string;
  expandableContent?: React.ReactNode;
  action?: React.ReactNode;
  showExpandedSeparator?: boolean;
  showToggle?: boolean;
  isToggleDisabled?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const { euiTheme } = useEuiTheme();
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useGeneratedHtmlId({ prefix: 'nightshiftInvestigationFlyoutRow' });
  const isExpandable = expandableContent != null;
  const canToggle = isExpandable && !isToggleDisabled;
  const shouldShowToggle = (showToggle ?? isExpandable) && canToggle;
  const expandRowLabel = isOpen
    ? i18n.translate('xpack.nightshift.investigation.collapseRow', {
        defaultMessage: 'Collapse row',
      })
    : i18n.translate('xpack.nightshift.investigation.expandRow', {
        defaultMessage: 'Expand row',
      });

  return (
    <div
      data-test-subj={testSubj}
      css={css`
        padding: ${euiTheme.size.m};
      `}
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        {shouldShowToggle && (
          <EuiFlexItem grow={false}>
            <EuiToolTip content={canToggle ? expandRowLabel : undefined} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="chevronSingleRight"
                aria-label={canToggle ? expandRowLabel : undefined}
                aria-expanded={canToggle ? isOpen : false}
                aria-controls={canToggle ? contentId : undefined}
                color="text"
                disabled={!canToggle}
                data-test-subj={testSubj ? `${testSubj}Toggle` : undefined}
                onClick={() => {
                  if (canToggle) {
                    setIsOpen((open) => !open);
                  }
                }}
                css={css`
                  transform: rotate(${isOpen ? '90deg' : '0deg'});
                  transition: ${nightshiftTransformTransition(euiTheme)};
                  ${nightshiftReducedMotionStyles}
                `}
              />
            </EuiToolTip>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow>
          <InvestigationRowHoverAction action={action}>{children}</InvestigationRowHoverAction>
        </EuiFlexItem>
      </EuiFlexGroup>
      {isExpandable && canToggle && isOpen && (
        <>
          <EuiSpacer size="s" />
          {showExpandedSeparator && <EuiHorizontalRule margin="none" />}
          <EuiSpacer size="s" />
          <div
            id={contentId}
            css={css`
              padding-left: calc(${euiTheme.size.l} + ${euiTheme.size.s});
            `}
          >
            {expandableContent}
          </div>
        </>
      )}
    </div>
  );
}

function InvestigationFlyoutBadge(): React.ReactElement {
  return (
    <GradientOutlinedStatusBadge
      label={getInvestigationCompleteStatusLabel()}
      testSubj="nightshiftInvestigationFlyoutCompleteBadge"
    />
  );
}

function RecommendationRow({
  recommendation,
  index,
  onOpenInChat,
}: {
  recommendation: RecommendationItem;
  index: number;
  onOpenInChat: () => void;
}): React.ReactElement {
  const { preview: titlePreview, isTruncated: isTitleTruncated } = useMemo(
    () => truncateTextPreview(recommendation.title, RECOMMENDATION_TITLE_PREVIEW_MAX_LENGTH),
    [recommendation.title]
  );
  const hasDetails = Boolean(recommendation.description || recommendation.code);
  const canExpand = isTitleTruncated || hasDetails;

  const expandableContent = useMemo(() => {
    if (!canExpand) {
      return undefined;
    }

    return (
      <>
        <FlyoutFormattedText text={recommendation.title} />
        {recommendation.description && (
          <>
            <EuiSpacer size="s" />
            <FlyoutFormattedText text={recommendation.description} />
          </>
        )}
        {recommendation.code && (
          <>
            <EuiSpacer size="s" />
            <EuiCodeBlock language="shell" isCopyable fontSize="s" css={flyoutCodeBlockCss}>
              {recommendation.code}
            </EuiCodeBlock>
          </>
        )}
      </>
    );
  }, [canExpand, recommendation.code, recommendation.description, recommendation.title]);

  return (
    <InvestigationFlyoutRow
      testSubj={`nightshiftInvestigationFlyoutRecommendation-${index}`}
      showToggle
      isToggleDisabled={!canExpand}
      showExpandedSeparator
      expandableContent={expandableContent}
      action={
        <InvestigationItemChatButton
          ebtElement={NIGHTSHIFT_EBT_ELEMENTS.INVESTIGATION_FLYOUT}
          tooltip={recommendationChatTooltip}
          testSubj={`nightshiftInvestigationFlyoutRecommendationChatButton-${index}`}
          onClick={onOpenInChat}
        />
      }
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow>
          <FlyoutFormattedText text={titlePreview} bold />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={recommendation.confidence >= 0.9 ? 'success' : 'hollow'}>
            <FormattedMessage
              id="xpack.nightshift.investigation.recommendationConfidence"
              defaultMessage="{confidence, number, percent}"
              values={{ confidence: recommendation.confidence }}
            />
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
    </InvestigationFlyoutRow>
  );
}

function HypothesisStatusRow({
  status,
}: {
  status: InvestigationState['hypotheses'][number]['status'];
}): React.ReactElement {
  const iconSlotCss = css`
    align-items: center;
    display: inline-flex;
    flex-shrink: 0;
    height: 16px;
    justify-content: center;
    width: 16px;

    .euiIcon,
    .euiLoadingSpinner {
      height: 16px;
      width: 16px;
    }
  `;

  return (
    <div
      css={css`
        align-items: center;
        display: inline-flex;
        gap: 6px;
      `}
    >
      {status === 'investigating' ? (
        <span css={iconSlotCss}>
          <InvestigatingStatusDots testSubj="nightshiftInvestigationFlyoutHypothesisCheckingDots" />
        </span>
      ) : status === 'confirmed' ? (
        <InvestigationCompleteCheckIcon
          ariaLabel={hypothesisConfirmedAriaLabel}
          testSubj="nightshiftInvestigationFlyoutHypothesisConfirmedIcon"
          size="compact"
        />
      ) : status === 'dismissed' ? (
        <span css={iconSlotCss}>
          <EuiIcon
            type="trash"
            size="s"
            color="subdued"
            aria-hidden={true}
            data-test-subj="nightshiftInvestigationFlyoutHypothesisRejectedIcon"
            css={css`
              height: 16px;
              width: 16px;
            `}
          />
        </span>
      ) : null}
      {status === 'confirmed' ? (
        <InvestigationGradientLabel testSubj="nightshiftInvestigationFlyoutHypothesisConfirmedLabel">
          {getHypothesisStatusLabel(status)}
        </InvestigationGradientLabel>
      ) : (
        <EuiText
          size="xs"
          color="subdued"
          css={css`
            line-height: 1;
          `}
        >
          {getHypothesisStatusLabel(status)}
        </EuiText>
      )}
    </div>
  );
}

function HypothesisRow({
  candidate,
  confidence,
  status,
  reason,
  evidence,
  index,
  isConfidenceWinner,
  onOpenInChat,
  getQueryHref,
}: {
  candidate: string;
  confidence: number;
  status: InvestigationState['hypotheses'][number]['status'];
  reason?: string;
  evidence?: InvestigationState['hypotheses'][number]['evidence'];
  index: number;
  isConfidenceWinner: boolean;
  onOpenInChat: () => void;
  getQueryHref: (params: InvestigationDiscoverParams) => string | undefined;
}): React.ReactElement {
  const hasEvidence = Boolean(evidence?.length);
  const expandableContent =
    reason || hasEvidence ? (
      <>
        {reason ? <FlyoutFormattedText text={reason} /> : null}
        {evidence?.length ? (
          <>
            {reason ? <EuiSpacer size="s" /> : null}
            <EvidenceList evidence={evidence} getQueryHref={getQueryHref} />
          </>
        ) : null}
      </>
    ) : undefined;

  return (
    <InvestigationFlyoutRow
      testSubj={`nightshiftInvestigationFlyoutHypothesis-${index}`}
      showExpandedSeparator={Boolean(reason) || hasEvidence}
      expandableContent={expandableContent}
      action={
        <InvestigationItemChatButton
          ebtElement={NIGHTSHIFT_EBT_ELEMENTS.INVESTIGATION_FLYOUT}
          tooltip={hypothesisChatTooltip}
          testSubj={`nightshiftInvestigationFlyoutHypothesisChatButton-${index}`}
          onClick={onOpenInChat}
        />
      }
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow>
          <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <FlyoutFormattedText text={candidate} bold />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <HypothesisStatusRow status={status} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={isConfidenceWinner ? 'success' : 'default'}>
            <FormattedMessage
              id="xpack.nightshift.investigation.hypothesisConfidence"
              defaultMessage="{confidence, number, percent}"
              values={{ confidence }}
            />
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
    </InvestigationFlyoutRow>
  );
}

export interface InvestigationFlyoutProps {
  eventTitle: string;
  investigation: SignificantEventInvestigation;
  status: InvestigationStatus;
  state?: InvestigationState;
  conversationId?: string;
  initialTab?: InvestigationFlyoutTabId;
  /** Bump when the parent re-requests a tab (e.g. More recommendations while open). */
  tabRequestId?: number;
  onClose: () => void;
}

export function InvestigationFlyout({
  eventTitle,
  investigation,
  status,
  state,
  conversationId,
  initialTab = 'recommendations',
  tabRequestId = 0,
  onClose,
}: InvestigationFlyoutProps): React.ReactElement {
  const { euiTheme } = useEuiTheme();
  const { agentBuilder, share } = useKibana().services;
  const [selectedTab, setSelectedTab] = useState<CompletedTabId>(initialTab);

  const discoverLocator = share.url.locators.get<DiscoverAppLocatorParams>(DISCOVER_APP_LOCATOR);
  const getQueryHref = useCallback(
    (params: InvestigationDiscoverParams) => discoverLocator?.getRedirectUrl(params),
    [discoverLocator]
  );

  useEffect(() => {
    setSelectedTab(initialTab);
  }, [initialTab, tabRequestId]);

  const headline = getInvestigationHeadline({ eventTitle, state, status });
  const conclusionBody = getConclusionText(state);
  const recommendations = useMemo(() => parseInvestigationRecommendations(state), [state]);
  const blindSpots = useMemo(() => state?.blind_spots ?? [], [state?.blind_spots]);
  const hypotheses = useMemo(
    () => sortInvestigationHypotheses(state?.hypotheses ?? []),
    [state?.hypotheses]
  );
  const topHypothesisConfidence = hypotheses[0]?.confidence ?? 0;
  const timeLabel = getInvestigationTimeLabel({
    startedAt: investigation.started_at,
    endedAt: investigation.completed_at,
    isRunning: false,
  });

  const handleOpenInChat = useCallback(() => {
    if (!conversationId) {
      return;
    }
    agentBuilder?.openChat(buildInvestigationConversationChatOptions(conversationId));
  }, [agentBuilder, conversationId]);

  const investigationChatUnavailableLabel = i18n.translate(
    'xpack.nightshift.flyout.openInChatInvestigationUnavailable',
    {
      defaultMessage: 'Investigation chat is still loading',
    }
  );

  const openInChatLabel = i18n.translate('xpack.nightshift.flyout.openInChatButtonLabel', {
    defaultMessage: 'Open in chat',
  });

  const openRecommendationInChat = useCallback(
    (recommendation: RecommendationItem, index: number) => {
      agentBuilder?.openChat(
        buildRecommendationChatOptions(recommendation, `nightshift-flyout-recommendation-${index}`)
      );
    },
    [agentBuilder]
  );

  const openHypothesisInChat = useCallback(
    (hypothesis: InvestigationState['hypotheses'][number], index: number) => {
      agentBuilder?.openChat(
        buildHypothesisChatOptions(hypothesis, `nightshift-flyout-hypothesis-${index}`)
      );
    },
    [agentBuilder]
  );

  const tabs = [
    {
      id: 'recommendations' as const,
      name: i18n.translate('xpack.nightshift.investigation.recommendationsTab', {
        defaultMessage: 'Recommendations',
      }),
      count: recommendations.length,
    },
    {
      id: 'blindSpots' as const,
      name: i18n.translate('xpack.nightshift.investigation.blindSpotsTab', {
        defaultMessage: 'Blind spots',
      }),
      count: blindSpots.length,
    },
    {
      id: 'hypotheses' as const,
      name: i18n.translate('xpack.nightshift.investigation.hypothesesTab', {
        defaultMessage: 'Hypotheses',
      }),
      count: hypotheses.length,
    },
  ];

  return (
    <EuiFlyout
      onClose={onClose}
      size="s"
      session="inherit"
      type="push"
      hasAnimation={false}
      resizable
      data-test-subj="nightshiftInvestigationFlyout"
      aria-labelledby="nightshiftInvestigationFlyoutTitle"
      closeButtonProps={{
        'data-test-subj': 'euiFlyoutCloseButton',
        ...getEbtProps({
          action: NIGHTSHIFT_EBT_ACTIONS.CLOSE_FLYOUT,
          element: NIGHTSHIFT_EBT_ELEMENTS.INVESTIGATION_FLYOUT,
        }),
      }}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="s">
          <h2 id="nightshiftInvestigationFlyoutTitle">{headline}</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiBadgeGroup gutterSize="xs">
          <EuiBadge color="default" data-test-subj="nightshiftInvestigationFlyoutTypeBadge">
            {i18n.translate('xpack.nightshift.investigation.flyoutBadge', {
              defaultMessage: 'Investigation',
            })}
          </EuiBadge>
          <InvestigationFlyoutBadge />
        </EuiBadgeGroup>
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued" data-test-subj="nightshiftInvestigationFlyoutTimeLabel">
          {timeLabel}
        </EuiText>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <>
          <FlyoutSectionTitle>
            {i18n.translate('xpack.nightshift.investigation.conclusionTitle', {
              defaultMessage: 'Conclusion',
            })}
          </FlyoutSectionTitle>
          <EuiSpacer size="s" />
          {conclusionBody ? (
            <TruncatableSummary
              summary={conclusionBody}
              testSubj="nightshiftInvestigationFlyoutConclusion"
              fontSize={INVESTIGATION_FLYOUT_BODY_FONT_SIZE}
            />
          ) : (
            <EuiText
              color="subdued"
              data-test-subj="nightshiftInvestigationFlyoutConclusion"
              css={flyoutBodyTextCss}
            >
              {eventTitle}
            </EuiText>
          )}
          <EuiSpacer size="l" />
          {state?.canvas && (
            <>
              <FlyoutSectionTitle>Canvas</FlyoutSectionTitle>
              <EuiSpacer size="s" />
              <InvestigationCanvas canvas={state.canvas} />
              <EuiSpacer size="l" />
            </>
          )}
          <EuiTabs data-test-subj="nightshiftInvestigationFlyoutTabs">
            {tabs.map((tab) => (
              <EuiTab
                key={tab.id}
                isSelected={selectedTab === tab.id}
                onClick={() => setSelectedTab(tab.id)}
                data-test-subj={`nightshiftInvestigationFlyoutTab-${tab.id}`}
                append={
                  <EuiNotificationBadge color="subdued" aria-hidden={true}>
                    {tab.count}
                  </EuiNotificationBadge>
                }
              >
                {tab.name}
              </EuiTab>
            ))}
          </EuiTabs>
          <EuiSpacer size="m" />
          {selectedTab === 'recommendations' && (
            <EuiFlexGroup
              direction="column"
              gutterSize="s"
              data-test-subj="nightshiftInvestigationFlyoutRecommendations"
            >
              {recommendations.map((recommendation, index) => (
                <EuiFlexItem key={`${recommendation.title}-${index}`} grow={false}>
                  <InvestigationFlyoutListPanel>
                    <RecommendationRow
                      recommendation={recommendation}
                      index={index}
                      onOpenInChat={() => openRecommendationInChat(recommendation, index)}
                    />
                  </InvestigationFlyoutListPanel>
                </EuiFlexItem>
              ))}
              {recommendations.length === 0 && (
                <EuiFlexItem grow={false}>
                  <EuiText color="subdued" css={flyoutBodyTextCss}>
                    {i18n.translate('xpack.nightshift.investigation.flyout.emptyRecommendations', {
                      defaultMessage: 'No recommendations were produced for this investigation.',
                    })}
                  </EuiText>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          )}
          {selectedTab === 'blindSpots' &&
            (blindSpots.length > 0 ? (
              <BlindSpotsTable
                items={blindSpots}
                testSubj="nightshiftInvestigationFlyoutBlindSpots"
                bodyFontSize={INVESTIGATION_FLYOUT_BODY_FONT_SIZE}
                chatAttachmentIdPrefix="nightshift-flyout-blind-spot"
              />
            ) : (
              <EuiText color="subdued" css={flyoutBodyTextCss}>
                {i18n.translate('xpack.nightshift.investigation.flyout.emptyBlindSpots', {
                  defaultMessage: 'No blind spots were identified for this investigation.',
                })}
              </EuiText>
            ))}
          {selectedTab === 'hypotheses' && (
            <EuiFlexGroup
              direction="column"
              gutterSize="s"
              data-test-subj="nightshiftInvestigationFlyoutHypotheses"
            >
              {hypotheses.map((hypothesis, index) => (
                <EuiFlexItem key={`hypothesis-${index}-${hypothesis.candidate}`} grow={false}>
                  <InvestigationFlyoutListPanel>
                    <HypothesisRow
                      candidate={hypothesis.candidate}
                      confidence={hypothesis.confidence}
                      status={hypothesis.status}
                      reason={hypothesis.reason}
                      evidence={hypothesis.evidence}
                      index={index}
                      isConfidenceWinner={hypothesis.confidence === topHypothesisConfidence}
                      onOpenInChat={() => openHypothesisInChat(hypothesis, index)}
                      getQueryHref={getQueryHref}
                    />
                  </InvestigationFlyoutListPanel>
                </EuiFlexItem>
              ))}
              {hypotheses.length === 0 && (
                <EuiFlexItem grow={false}>
                  <EuiText color="subdued" css={flyoutBodyTextCss}>
                    {i18n.translate('xpack.nightshift.investigation.flyout.emptyHypotheses', {
                      defaultMessage: 'No hypotheses were recorded for this investigation.',
                    })}
                  </EuiText>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          )}
        </>
      </EuiFlyoutBody>

      {agentBuilder && (
        <EuiFlyoutFooter
          css={css`
            background: ${euiTheme.colors.backgroundBasePlain};
            border-top: ${euiTheme.border.thin};
          `}
        >
          <EuiFlexGroup justifyContent="flexEnd" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={conversationId ? undefined : investigationChatUnavailableLabel}>
                <span tabIndex={conversationId ? undefined : 0}>
                  <AiButton
                    variant="empty"
                    size="s"
                    iconType="productAgent"
                    iconSide="left"
                    data-test-subj="nightshiftInvestigationFlyoutChatButton"
                    disabled={!conversationId}
                    onClick={handleOpenInChat}
                    {...getEbtProps({
                      action: NIGHTSHIFT_EBT_ACTIONS.OPEN_IN_CHAT,
                      element: NIGHTSHIFT_EBT_ELEMENTS.INVESTIGATION_FLYOUT,
                      detail: NIGHTSHIFT_EBT_DETAILS.EXISTING_CONVERSATION,
                    })}
                  >
                    {openInChatLabel}
                  </AiButton>
                </span>
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      )}
    </EuiFlyout>
  );
}
