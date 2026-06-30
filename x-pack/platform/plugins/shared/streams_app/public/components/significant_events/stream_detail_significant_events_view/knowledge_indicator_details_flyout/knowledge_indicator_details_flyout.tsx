/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHealth,
  EuiPopover,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import { isComputedFeature } from '@kbn/significant-events-schema';
import type { Feature } from '@kbn/significant-events-schema';
import { upperFirst } from 'lodash';
import React, { useCallback, useMemo, useState } from 'react';
import { getConfidenceColor } from '../utils/get_confidence_color';
import { FlyoutMetadataCard } from '../../../flyout_components/flyout_metadata_card';
import { FlyoutToolbarHeader } from '../../../flyout_components/flyout_toolbar_header';
import { SeverityBadge } from '../../significant_events_discovery/components/severity_badge/severity_badge';
import { useStreamKnowledgeIndicatorsBulkDelete } from '../hooks/use_stream_knowledge_indicators_bulk_delete';
import { useRulesDemote } from '../hooks/use_queries_bulk_delete';
import {
  useKnowledgeIndicatorActions,
  DELETE_LABEL,
  EXCLUDE_LABEL,
  RESTORE_LABEL,
  PROMOTE_LABEL,
} from '../hooks/use_knowledge_indicator_actions';
import { DeleteTableItemsModal } from '../delete_table_items_modal';
import { getKnowledgeIndicatorStreamName } from '../utils/get_knowledge_indicator_stream_name';
import { KnowledgeIndicatorFeatureDetailsContent } from './knowledge_indicator_feature_details_content';
import { KnowledgeIndicatorQueryDetailsContent } from './knowledge_indicator_query_details_content';

interface Props {
  knowledgeIndicator: KnowledgeIndicator;
  occurrencesByQueryId: Record<string, Array<{ x: number; y: number }>>;
  onClose: () => void;
  features: Feature[];
}

export function KnowledgeIndicatorDetailsFlyout({
  knowledgeIndicator,
  occurrencesByQueryId,
  onClose,
  features,
}: Props) {
  const flyoutTitleId = useGeneratedHtmlId({ prefix: 'knowledgeIndicatorDetailsFlyoutTitle' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

  const streamName = getKnowledgeIndicatorStreamName(knowledgeIndicator);

  const streamFeatures = useMemo(
    () => features.filter((f) => f.stream_name === streamName),
    [features, streamName]
  );

  const {
    excludeFeature,
    restoreFeature,
    promoteQuery,
    isMutating: isActionMutating,
  } = useKnowledgeIndicatorActions({ streamName, onSuccess: onClose });

  const { deleteKnowledgeIndicatorsInBulk, isDeleting: isKIDeleting } =
    useStreamKnowledgeIndicatorsBulkDelete({ streamName, onSuccess: onClose });

  const { demoteRules, isPending: isDemoting } = useRulesDemote({ onSuccess: onClose });

  const isDeleting = isKIDeleting || isDemoting;
  const isMutating = isActionMutating || isDeleting;

  const isRule = knowledgeIndicator.kind === 'query' && knowledgeIndicator.rule.backed;

  const handleDeleteConfirm = useCallback(async () => {
    setShowDeleteModal(false);
    if (knowledgeIndicator.kind === 'query' && knowledgeIndicator.rule.backed) {
      await demoteRules([knowledgeIndicator.query.id]);
    } else {
      await deleteKnowledgeIndicatorsInBulk([knowledgeIndicator]);
    }
  }, [knowledgeIndicator, demoteRules, deleteKnowledgeIndicatorsInBulk]);

  const featureActionItems = useMemo(() => {
    if (knowledgeIndicator.kind !== 'feature') {
      return [];
    }

    const items: React.ReactElement[] = [];
    const computed = isComputedFeature(knowledgeIndicator.feature);

    if (!computed) {
      if (knowledgeIndicator.feature.excluded) {
        items.push(
          <EuiContextMenuItem
            key="feature-restore"
            icon="eye"
            disabled={isMutating}
            onClick={() => {
              setIsActionsMenuOpen(false);
              restoreFeature(knowledgeIndicator.feature.uuid);
            }}
          >
            {RESTORE_LABEL}
          </EuiContextMenuItem>
        );
      } else {
        items.push(
          <EuiContextMenuItem
            key="feature-exclude"
            icon="eyeClosed"
            disabled={isMutating}
            onClick={() => {
              setIsActionsMenuOpen(false);
              excludeFeature(knowledgeIndicator.feature.uuid);
            }}
          >
            {EXCLUDE_LABEL}
          </EuiContextMenuItem>
        );
      }
    }

    items.push(
      <EuiContextMenuItem
        key="feature-delete"
        icon="trash"
        color="danger"
        disabled={isMutating}
        onClick={() => {
          setIsActionsMenuOpen(false);
          setShowDeleteModal(true);
        }}
      >
        {DELETE_LABEL}
      </EuiContextMenuItem>
    );

    return items;
  }, [excludeFeature, isMutating, knowledgeIndicator, restoreFeature]);

  const queryActionItems = useMemo(
    () =>
      knowledgeIndicator.kind === 'query'
        ? [
            ...(!knowledgeIndicator.rule.backed
              ? [
                  <EuiContextMenuItem
                    key="query-promote"
                    icon="plusCircle"
                    disabled={isMutating}
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      promoteQuery(knowledgeIndicator.query.id);
                    }}
                  >
                    {PROMOTE_LABEL}
                  </EuiContextMenuItem>,
                ]
              : []),
            <EuiContextMenuItem
              key="query-delete"
              icon="trash"
              color="danger"
              disabled={isMutating}
              onClick={() => {
                setIsActionsMenuOpen(false);
                setShowDeleteModal(true);
              }}
            >
              {DELETE_LABEL}
            </EuiContextMenuItem>,
          ]
        : [],
    [isMutating, knowledgeIndicator, promoteQuery]
  );

  const title =
    knowledgeIndicator.kind === 'feature'
      ? knowledgeIndicator.feature.title ?? knowledgeIndicator.feature.id
      : knowledgeIndicator.query.title ?? knowledgeIndicator.query.id;

  return (
    <>
      <EuiFlyout
        onClose={onClose}
        aria-labelledby={flyoutTitleId}
        type="push"
        ownFocus={false}
        size="40%"
        hideCloseButton
      >
        <FlyoutToolbarHeader>
          <EuiFlexItem grow={false}>
            <EuiPopover
              aria-label={ACTIONS_MENU_POPOVER_ARIA_LABEL}
              button={
                <EuiToolTip content={ACTIONS_MENU_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
                  <EuiButtonIcon
                    iconType="boxesVertical"
                    aria-label={ACTIONS_MENU_BUTTON_ARIA_LABEL}
                    isLoading={isMutating}
                    isDisabled={isMutating}
                    onClick={() => setIsActionsMenuOpen((open) => !open)}
                  />
                </EuiToolTip>
              }
              isOpen={isActionsMenuOpen}
              closePopover={() => setIsActionsMenuOpen(false)}
              panelPaddingSize="none"
              anchorPosition="downRight"
            >
              <EuiContextMenuPanel items={[...featureActionItems, ...queryActionItems]} />
            </EuiPopover>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={CLOSE_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="cross"
                aria-label={CLOSE_BUTTON_ARIA_LABEL}
                onClick={onClose}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </FlyoutToolbarHeader>

        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="s">
            <h2 id={flyoutTitleId}>{title}</h2>
          </EuiTitle>
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="s" responsive={false} wrap>
            {knowledgeIndicator.kind === 'feature' ? (
              <>
                <EuiFlexItem>
                  <FlyoutMetadataCard title={CONFIDENCE_LABEL}>
                    <EuiHealth color={getConfidenceColor(knowledgeIndicator.feature.confidence)}>
                      {knowledgeIndicator.feature.confidence}
                    </EuiHealth>
                  </FlyoutMetadataCard>
                </EuiFlexItem>
                <EuiFlexItem>
                  <FlyoutMetadataCard title={TYPE_LABEL}>
                    <EuiBadge color="hollow">
                      {upperFirst(knowledgeIndicator.feature.type)}
                    </EuiBadge>
                  </FlyoutMetadataCard>
                </EuiFlexItem>
              </>
            ) : (
              <>
                <EuiFlexItem>
                  <FlyoutMetadataCard title={SEVERITY_LABEL}>
                    <SeverityBadge score={knowledgeIndicator.query.severity_score} />
                  </FlyoutMetadataCard>
                </EuiFlexItem>
                <EuiFlexItem>
                  <FlyoutMetadataCard title={TYPE_LABEL}>
                    <EuiBadge color="hollow">{QUERY_TYPE_LABEL}</EuiBadge>
                  </FlyoutMetadataCard>
                </EuiFlexItem>
              </>
            )}
            <EuiFlexItem>
              <FlyoutMetadataCard title={STREAM_LABEL}>
                <EuiBadge color="hollow" iconType="productStreamsClassic" iconSide="left">
                  {streamName}
                </EuiBadge>
              </FlyoutMetadataCard>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          {knowledgeIndicator.kind === 'feature' ? (
            <KnowledgeIndicatorFeatureDetailsContent feature={knowledgeIndicator.feature} />
          ) : (
            <KnowledgeIndicatorQueryDetailsContent
              query={knowledgeIndicator.query}
              occurrences={occurrencesByQueryId[knowledgeIndicator.query.id]}
              streamFeatures={streamFeatures}
            />
          )}
        </EuiFlyoutBody>
      </EuiFlyout>
      {showDeleteModal ? (
        <DeleteTableItemsModal
          title={isRule ? DELETE_RULE_MODAL_TITLE : DELETE_KI_MODAL_TITLE}
          items={[knowledgeIndicator]}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteConfirm}
          isLoading={isDeleting}
        />
      ) : null}
    </>
  );
}

const CLOSE_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetailsFlyout.closeButtonAriaLabel',
  {
    defaultMessage: 'Close',
  }
);

const CONFIDENCE_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetailsFlyout.confidenceLabel',
  { defaultMessage: 'Confidence' }
);

const TYPE_LABEL = i18n.translate('xpack.streams.knowledgeIndicatorDetailsFlyout.typeLabel', {
  defaultMessage: 'Type',
});

const STREAM_LABEL = i18n.translate('xpack.streams.knowledgeIndicatorDetailsFlyout.streamLabel', {
  defaultMessage: 'Stream',
});

const SEVERITY_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetailsFlyout.severityLabel',
  { defaultMessage: 'Severity' }
);

const QUERY_TYPE_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetailsFlyout.queryTypeLabel',
  { defaultMessage: 'Query' }
);

const ACTIONS_MENU_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetailsFlyout.actionsMenuButtonAriaLabel',
  {
    defaultMessage: 'Actions',
  }
);

const ACTIONS_MENU_POPOVER_ARIA_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetailsFlyout.actionsMenuPopoverAriaLabel',
  {
    defaultMessage: 'Actions menu',
  }
);

const DELETE_KI_MODAL_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetailsFlyout.deleteKIModalTitle',
  {
    defaultMessage: 'Are you sure you want to delete this knowledge indicator?',
  }
);

const DELETE_RULE_MODAL_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetailsFlyout.deleteRuleModalTitle',
  {
    defaultMessage: 'Are you sure you want to delete this rule?',
  }
);
