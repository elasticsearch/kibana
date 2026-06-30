/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { EuiSelectableOption } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonIcon,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { useDebouncedValue } from '@kbn/react-hooks';
import { useQueryClient } from '@kbn/react-query';
import { type Streams } from '@kbn/streams-schema';
import {
  SignificantEventsWorkflowStatus,
  type SignificantEventsWorkflowStatusResult,
  type KIsOnboardingStatusResult,
} from '@kbn/significant-events-schema';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import React, { useCallback, useMemo, useState } from 'react';
import useInterval from 'react-use/lib/useInterval';
import { DISCOVERY_QUERIES_QUERY_KEY } from '../../../hooks/significant_events/use_fetch_discovery_queries';
import { RUNNING_POLL_INTERVAL_MS } from '../constants';
import { useSignificantEventsAvailability } from '../../../hooks/significant_events/use_significant_events_availability';
import { useKibana } from '../../../hooks/use_kibana';
import { SignificantEventsNotEnabledPrompt } from '../significant_events_not_enabled_prompt';
import { EmptyState } from './empty_state';
import { useFetchKnowledgeIndicators } from './hooks/use_knowledge_indicators_data';
import { KnowledgeIndicatorsTable } from './knowledge_indicators_table';
import { KnowledgeIndicatorDetailsFlyout } from './knowledge_indicator_details_flyout';
import { useKnowledgeIndicatorsOnboarding } from './hooks/use_knowledge_indicators_onboarding';
import { KnowledgeIndicatorRulesSelector } from './knowledge_indicator_rules_selector';
import { KnowledgeIndicatorsStatusFilter } from './knowledge_indicators_status_filter';
import { KnowledgeIndicatorsTypeFilter } from './knowledge_indicators_type_filter';
import { RulesTable } from './rules_table';
import { LoadingPanel } from '../../loading_panel';
import { getKnowledgeIndicatorItemId } from './utils/get_knowledge_indicator_item_id';
import { getFeaturesFromKIs } from './utils/get_features_from_kis';

const SEARCH_DEBOUNCE_MS = 300;

interface Props {
  definition: Streams.all.GetResponse;
}

export function StreamDetailSignificantEventsView({ definition }: Props) {
  const {
    core: {
      notifications: { toasts },
    },
  } = useKibana();
  const queryClient = useQueryClient();
  const { availability, isLoading: isAvailabilityLoading } = useSignificantEventsAvailability();
  // Only fetch features and queries once availability has resolved and is not
  // explicitly unavailable (stays fail-open while the probe result is unknown).
  const shouldFetchKnowledgeIndicators =
    !isAvailabilityLoading && availability?.available !== false;
  const [tableSearchValue, setTableSearchValue] = useState('');
  const debouncedTableSearchValue = useDebouncedValue(tableSearchValue, SEARCH_DEBOUNCE_MS)
    .trim()
    .toLowerCase();
  const [knowledgeIndicatorStatusFilter, setKnowledgeIndicatorStatusFilter] = useState<
    'active' | 'excluded'
  >('active');
  const [selectedKnowledgeIndicator, setSelectedKnowledgeIndicator] =
    useState<KnowledgeIndicator | null>(null);
  const [selectedKnowledgeIndicatorTypes, setSelectedKnowledgeIndicatorTypes] = useState<string[]>(
    []
  );
  const [typeFilterOptions, setTypeFilterOptions] = useState<EuiSelectableOption[]>([
    {
      key: 'knowledge_indicator',
      checked: 'on',
      label: KNOWLEDGE_INDICATORS_FILTER_LABEL,
    },
    {
      key: 'rule',
      label: RULES_FILTER_LABEL,
    },
  ]);
  const {
    knowledgeIndicators,
    occurrencesByQueryId,
    isLoading: isKnowledgeIndicatorsLoading,
    isEmpty,
    refetch,
  } = useFetchKnowledgeIndicators({ definition, enabled: shouldFetchKnowledgeIndicators });
  const onKnowledgeIndicatorsOnboardingComplete = useCallback(
    (
      completedState: Extract<
        KIsOnboardingStatusResult,
        { status: SignificantEventsWorkflowStatus.Completed }
      >
    ) => {
      const { features, queries } = completedState;

      const count = features.discovered.length + queries.persisted.length;

      toasts.addSuccess({
        title: i18n.translate(
          'xpack.streams.significantEventsTable.generateMoreSuccessToastTitle',
          {
            defaultMessage:
              '{count, plural, one {Generated # knowledge indicator} other {Generated # knowledge indicators}}',
            values: { count },
          }
        ),
        text: features.skipped
          ? i18n.translate('xpack.streams.significantEventsTable.featuresSkippedToastText', {
              defaultMessage: 'Feature identification was skipped.',
            })
          : undefined,
      });

      void Promise.all([
        queryClient.invalidateQueries({ queryKey: DISCOVERY_QUERIES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['features', definition.stream.name] }),
        queryClient.invalidateQueries({
          queryKey: ['knowledgeIndicatorsOnboardingStatus', definition.stream.name],
        }),
      ]);
    },
    [definition.stream.name, queryClient, toasts]
  );

  const onKnowledgeIndicatorsOnboardingError = useCallback(
    (
      failedState: Extract<
        SignificantEventsWorkflowStatusResult,
        { status: SignificantEventsWorkflowStatus.Failed }
      >
    ) => {
      toasts.addDanger({
        title: KNOWLEDGE_INDICATORS_ONBOARDING_FAILED_TOAST_TITLE,
        text: failedState.error,
      });
    },
    [toasts]
  );

  const {
    isPending: isKnowledgeIndicatorsGenerationPending,
    onboardingState: knowledgeIndicatorsOnboardingState,
    scheduleKnowledgeIndicatorsOnboarding,
    cancelKnowledgeIndicatorsOnboarding,
  } = useKnowledgeIndicatorsOnboarding({
    streamName: definition.stream.name,
    onComplete: onKnowledgeIndicatorsOnboardingComplete,
    onError: onKnowledgeIndicatorsOnboardingError,
  });

  useInterval(
    refetch,
    knowledgeIndicatorsOnboardingState?.status === SignificantEventsWorkflowStatus.InProgress
      ? RUNNING_POLL_INTERVAL_MS
      : null
  );

  const ruleKnowledgeIndicators = useMemo(
    () =>
      knowledgeIndicators.filter(
        (knowledgeIndicator) =>
          knowledgeIndicator.kind === 'query' && knowledgeIndicator.rule.backed
      ),
    [knowledgeIndicators]
  );

  const features = useMemo(() => getFeaturesFromKIs(knowledgeIndicators), [knowledgeIndicators]);

  const selectedKnowledgeIndicatorId = selectedKnowledgeIndicator
    ? getKnowledgeIndicatorItemId(selectedKnowledgeIndicator)
    : undefined;

  const closeFlyout = useCallback(() => {
    setSelectedKnowledgeIndicator(null);
  }, []);

  const toggleSelectedKnowledgeIndicator = useCallback((knowledgeIndicator: KnowledgeIndicator) => {
    setSelectedKnowledgeIndicator((currentKnowledgeIndicator) => {
      if (!currentKnowledgeIndicator) {
        return knowledgeIndicator;
      }

      const currentId = getKnowledgeIndicatorItemId(currentKnowledgeIndicator);
      const nextId = getKnowledgeIndicatorItemId(knowledgeIndicator);

      return currentId === nextId ? null : knowledgeIndicator;
    });
  }, []);

  const isRulesSelected = useMemo(
    () => typeFilterOptions.some((option) => option.key === 'rule' && option.checked === 'on'),
    [typeFilterOptions]
  );
  const isKnowledgeIndicatorsGenerationCanceling =
    knowledgeIndicatorsOnboardingState?.status === SignificantEventsWorkflowStatus.BeingCanceled;
  const isGenerateButtonDisabled =
    knowledgeIndicatorsOnboardingState === null || isKnowledgeIndicatorsGenerationPending;

  if (isAvailabilityLoading) {
    return <LoadingPanel size="xxl" />;
  }

  if (availability && !availability.available) {
    return <SignificantEventsNotEnabledPrompt reason={availability.reason} />;
  }

  if (isKnowledgeIndicatorsLoading) {
    return <LoadingPanel size="xxl" />;
  }

  if (isEmpty) {
    return (
      <EmptyState
        isGenerating={isKnowledgeIndicatorsGenerationPending}
        isCanceling={isKnowledgeIndicatorsGenerationCanceling}
        isGenerateDisabled={isGenerateButtonDisabled}
        onGenerateSuggestionsClick={scheduleKnowledgeIndicatorsOnboarding}
        onCancelGenerationClick={cancelKnowledgeIndicatorsOnboarding}
      />
    );
  }

  return (
    <>
      <EuiFlexGroup direction="column" gutterSize="l">
        <EuiFlexItem grow={false}>
          <EuiPanel hasBorder={false} hasShadow={true}>
            <EuiFlexGroup
              gutterSize="s"
              alignItems="center"
              responsive={false}
              css={css`
                width: 100%;
                min-height: 44px;
              `}
            >
              <EuiFlexItem grow={false}>
                <KnowledgeIndicatorRulesSelector
                  options={typeFilterOptions}
                  onChange={setTypeFilterOptions}
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFieldSearch
                  fullWidth
                  value={tableSearchValue}
                  onChange={(event) => setTableSearchValue(event.target.value)}
                  placeholder={
                    isRulesSelected
                      ? RULES_SEARCH_PLACEHOLDER
                      : KNOWLEDGE_INDICATORS_SEARCH_PLACEHOLDER
                  }
                  aria-label={
                    isRulesSelected
                      ? RULES_SEARCH_ARIA_LABEL
                      : KNOWLEDGE_INDICATORS_SEARCH_ARIA_LABEL
                  }
                />
              </EuiFlexItem>
              {!isRulesSelected ? (
                <EuiFlexItem grow={false}>
                  <KnowledgeIndicatorsStatusFilter
                    knowledgeIndicators={knowledgeIndicators}
                    searchTerm={debouncedTableSearchValue}
                    selectedTypes={selectedKnowledgeIndicatorTypes}
                    statusFilter={knowledgeIndicatorStatusFilter}
                    onStatusFilterChange={setKnowledgeIndicatorStatusFilter}
                  />
                </EuiFlexItem>
              ) : null}
              {!isRulesSelected ? (
                <EuiFlexItem grow={false}>
                  <KnowledgeIndicatorsTypeFilter
                    knowledgeIndicators={knowledgeIndicators}
                    searchTerm={debouncedTableSearchValue}
                    statusFilter={knowledgeIndicatorStatusFilter}
                    selectedTypes={selectedKnowledgeIndicatorTypes}
                    onSelectedTypesChange={setSelectedKnowledgeIndicatorTypes}
                  />
                </EuiFlexItem>
              ) : null}
              {!isRulesSelected ? (
                <EuiFlexItem grow={false}>
                  <KnowledgeIndicatorsGenerationControls
                    isGenerating={isKnowledgeIndicatorsGenerationPending}
                    isCanceling={isKnowledgeIndicatorsGenerationCanceling}
                    isGenerateDisabled={isGenerateButtonDisabled}
                    onGenerateSuggestionsClick={scheduleKnowledgeIndicatorsOnboarding}
                    onCancelGenerationClick={cancelKnowledgeIndicatorsOnboarding}
                  />
                </EuiFlexItem>
              ) : null}
            </EuiFlexGroup>
            <EuiSpacer size="m" />
            {isRulesSelected ? (
              <RulesTable
                rules={ruleKnowledgeIndicators}
                occurrencesByQueryId={occurrencesByQueryId}
                searchTerm={debouncedTableSearchValue}
                selectedKnowledgeIndicatorId={selectedKnowledgeIndicatorId}
                onViewDetails={toggleSelectedKnowledgeIndicator}
              />
            ) : (
              <KnowledgeIndicatorsTable
                definition={definition.stream}
                knowledgeIndicators={knowledgeIndicators}
                occurrencesByQueryId={occurrencesByQueryId}
                searchTerm={debouncedTableSearchValue}
                selectedTypes={selectedKnowledgeIndicatorTypes}
                statusFilter={knowledgeIndicatorStatusFilter}
                selectedKnowledgeIndicatorId={selectedKnowledgeIndicatorId}
                onViewDetails={toggleSelectedKnowledgeIndicator}
              />
            )}
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
      {selectedKnowledgeIndicator ? (
        <KnowledgeIndicatorDetailsFlyout
          knowledgeIndicator={selectedKnowledgeIndicator}
          occurrencesByQueryId={occurrencesByQueryId}
          onClose={closeFlyout}
          features={features}
        />
      ) : null}
    </>
  );
}

function KnowledgeIndicatorsGenerationControls({
  isGenerating,
  isCanceling,
  isGenerateDisabled,
  onGenerateSuggestionsClick,
  onCancelGenerationClick,
}: {
  isGenerating: boolean;
  isCanceling: boolean;
  isGenerateDisabled: boolean;
  onGenerateSuggestionsClick: () => void;
  onCancelGenerationClick: () => void;
}) {
  const { euiTheme } = useEuiTheme();
  return (
    <EuiFlexGroup gutterSize="none" alignItems="center" responsive={false}>
      {isGenerating ? (
        <>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={CANCEL_GENERATION_BUTTON_TOOLTIP}>
              <EuiButtonIcon
                size="m"
                aria-label={CANCEL_GENERATION_BUTTON_ARIA_LABEL}
                iconType="stop"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.currentTarget.blur();
                  onCancelGenerationClick();
                }}
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem
            grow={false}
            css={css`
              width: 1px;
              align-self: stretch;
              background-color: currentColor;
              opacity: 0.15;
              margin: 0 ${euiTheme.size.s};
            `}
          />
        </>
      ) : null}
      <EuiFlexItem grow={false}>
        <EuiButton
          color="primary"
          isLoading={isGenerating}
          isDisabled={isGenerateDisabled}
          onClick={onGenerateSuggestionsClick}
        >
          {isGenerating
            ? isCanceling
              ? CANCELING_BUTTON_LABEL
              : GENERATING_BUTTON_LABEL
            : GENERATE_MORE_BUTTON_LABEL}
        </EuiButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}

const KNOWLEDGE_INDICATORS_FILTER_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.typeFilter.knowledgeIndicatorsLabel',
  {
    defaultMessage: 'Knowledge Indicators',
  }
);

const RULES_FILTER_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.typeFilter.rulesLabel',
  {
    defaultMessage: 'Rules',
  }
);

const KNOWLEDGE_INDICATORS_SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.streams.significantEventsTable.knowledgeIndicatorsSearchPlaceholder',
  {
    defaultMessage: 'Search knowledge indicators',
  }
);

const KNOWLEDGE_INDICATORS_SEARCH_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.knowledgeIndicatorsSearchAriaLabel',
  {
    defaultMessage: 'Search knowledge indicators',
  }
);

const RULES_SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.streams.significantEventsTable.rulesSearchPlaceholder',
  {
    defaultMessage: 'Search rules',
  }
);

const RULES_SEARCH_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.rulesSearchAriaLabel',
  {
    defaultMessage: 'Search rules',
  }
);

const GENERATE_MORE_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.generateMoreButtonLabel',
  {
    defaultMessage: 'Generate more',
  }
);

const GENERATING_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.generatingButtonLabel',
  {
    defaultMessage: 'Generating',
  }
);

const CANCELING_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.cancelingButtonLabel',
  {
    defaultMessage: 'Canceling',
  }
);

const CANCEL_GENERATION_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.cancelGenerationButtonAriaLabel',
  {
    defaultMessage: 'Cancel generation',
  }
);

const CANCEL_GENERATION_BUTTON_TOOLTIP = i18n.translate(
  'xpack.streams.significantEventsTable.cancelGenerationButtonTooltip',
  {
    defaultMessage: 'Stop this process',
  }
);

const KNOWLEDGE_INDICATORS_ONBOARDING_FAILED_TOAST_TITLE = i18n.translate(
  'xpack.streams.significantEventsTable.knowledgeIndicatorsTaskFailedToastTitle',
  {
    defaultMessage: 'Failed to generate knowledge indicators',
  }
);
