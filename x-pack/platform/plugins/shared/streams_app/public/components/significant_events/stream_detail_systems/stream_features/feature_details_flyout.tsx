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
  EuiIcon,
  EuiPopover,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { Feature } from '@kbn/significant-events-schema';
import { useBoolean } from '@kbn/react-hooks';
import { upperFirst } from 'lodash';
import React from 'react';
import { FlyoutMetadataCard } from '../../../flyout_components/flyout_metadata_card';
import { FlyoutToolbarHeader } from '../../../flyout_components/flyout_toolbar_header';
import { KnowledgeIndicatorFeatureDetailsContent } from '../../stream_detail_significant_events_view/knowledge_indicator_details_flyout';
import { DeleteFeatureModal } from './delete_feature_modal';
import { getConfidenceColor } from '../../stream_detail_significant_events_view/utils/get_confidence_color';

interface FeatureDetailsFlyoutProps {
  feature: Feature;
  onClose: () => void;
  onDelete?: () => Promise<void>;
  isDeleting?: boolean;
  onExclude?: () => Promise<void>;
  isExcluding?: boolean;
  onRestore?: () => Promise<void>;
  isRestoring?: boolean;
}

export function FeatureDetailsFlyout({
  feature,
  onClose,
  onDelete,
  isDeleting = false,
  onExclude,
  isExcluding = false,
  onRestore,
  isRestoring = false,
}: FeatureDetailsFlyoutProps) {
  const { euiTheme } = useEuiTheme();
  const flyoutTitleId = useGeneratedHtmlId({
    prefix: 'featureDetailsFlyoutTitle',
  });
  const [isActionsPopoverOpen, { off: closeActionsPopover, toggle: toggleActionsPopover }] =
    useBoolean(false);
  const [isDeleteModalVisible, { on: showDeleteModal, off: hideDeleteModal }] = useBoolean(false);

  const handleDeleteClick = () => {
    closeActionsPopover();
    showDeleteModal();
  };

  const handleExcludeClick = () => {
    closeActionsPopover();
    onExclude?.();
  };

  const handleRestoreClick = () => {
    closeActionsPopover();
    onRestore?.();
  };

  const displayTitle = feature.title ?? feature.id;
  return (
    <EuiFlyout
      onClose={onClose}
      aria-labelledby={flyoutTitleId}
      type="push"
      ownFocus={false}
      size="40%"
      hideCloseButton
    >
      {/* First header: minimal toolbar with actions and close */}
      <FlyoutToolbarHeader>
        {(onDelete || onExclude || onRestore) && (
          <EuiFlexItem grow={false}>
            <EuiPopover
              aria-label={ACTIONS_BUTTON_ARIA_LABEL}
              button={
                <EuiToolTip content={ACTIONS_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
                  <EuiButtonIcon
                    data-test-subj="streamsAppFeatureDetailsFlyoutActionsButton"
                    iconType="boxesVertical"
                    aria-label={ACTIONS_BUTTON_ARIA_LABEL}
                    onClick={toggleActionsPopover}
                    isLoading={isExcluding || isRestoring}
                  />
                </EuiToolTip>
              }
              isOpen={isActionsPopoverOpen}
              closePopover={closeActionsPopover}
              panelPaddingSize="none"
              anchorPosition="downRight"
            >
              <EuiContextMenuPanel
                items={[
                  ...(onRestore
                    ? [
                        <EuiContextMenuItem
                          key="restore"
                          icon={<EuiIcon type="eye" color="primary" aria-hidden={true} />}
                          css={css`
                            color: ${euiTheme.colors.primary};
                          `}
                          onClick={handleRestoreClick}
                          data-test-subj="streamsAppFeatureDetailsFlyoutRestoreAction"
                        >
                          {RESTORE_ACTION_LABEL}
                        </EuiContextMenuItem>,
                      ]
                    : []),
                  ...(onExclude
                    ? [
                        <EuiContextMenuItem
                          key="exclude"
                          icon={<EuiIcon type="eyeClosed" color="warning" aria-hidden={true} />}
                          css={css`
                            color: ${euiTheme.colors.warning};
                          `}
                          onClick={handleExcludeClick}
                          data-test-subj="streamsAppFeatureDetailsFlyoutExcludeAction"
                        >
                          {EXCLUDE_ACTION_LABEL}
                        </EuiContextMenuItem>,
                      ]
                    : []),
                  ...(onDelete
                    ? [
                        <EuiContextMenuItem
                          key="delete"
                          icon={<EuiIcon type="trash" color="danger" aria-hidden={true} />}
                          css={css`
                            color: ${euiTheme.colors.danger};
                          `}
                          onClick={handleDeleteClick}
                          data-test-subj="streamsAppFeatureDetailsFlyoutDeleteAction"
                        >
                          {DELETE_ACTION_LABEL}
                        </EuiContextMenuItem>,
                      ]
                    : []),
                ]}
              />
            </EuiPopover>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiToolTip content={CLOSE_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
            <EuiButtonIcon
              data-test-subj="streamsAppFeatureDetailsFlyoutCloseButton"
              iconType="cross"
              aria-label={CLOSE_BUTTON_ARIA_LABEL}
              onClick={onClose}
            />
          </EuiToolTip>
        </EuiFlexItem>
      </FlyoutToolbarHeader>

      {/* Second header: title and metadata cards */}
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="s">
          <h2 id={flyoutTitleId}>{displayTitle}</h2>
        </EuiTitle>
        <EuiSpacer size="m" />
        <EuiFlexGroup gutterSize="s" responsive={false} wrap>
          <EuiFlexItem>
            <FlyoutMetadataCard title={CONFIDENCE_LABEL}>
              <EuiHealth color={getConfidenceColor(feature.confidence)}>
                {feature.confidence}
              </EuiHealth>
            </FlyoutMetadataCard>
          </EuiFlexItem>
          <EuiFlexItem>
            <FlyoutMetadataCard title={TYPE_LABEL}>
              <EuiBadge color="hollow">{upperFirst(feature.type)}</EuiBadge>
            </FlyoutMetadataCard>
          </EuiFlexItem>
          <EuiFlexItem>
            <FlyoutMetadataCard title={STREAM_LABEL}>
              <EuiBadge color="hollow" iconType="productStreamsClassic" iconSide="left">
                {feature.stream_name}
              </EuiBadge>
            </FlyoutMetadataCard>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <KnowledgeIndicatorFeatureDetailsContent feature={feature} />
      </EuiFlyoutBody>
      {isDeleteModalVisible && onDelete && (
        <DeleteFeatureModal
          features={[feature]}
          isLoading={isDeleting}
          onCancel={hideDeleteModal}
          onConfirm={onDelete}
        />
      )}
    </EuiFlyout>
  );
}

const CONFIDENCE_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.confidenceLabel', {
  defaultMessage: 'Confidence',
});

const TYPE_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.typeLabel', {
  defaultMessage: 'Type',
});

const STREAM_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.streamLabel', {
  defaultMessage: 'Stream',
});

const ACTIONS_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.streams.featureDetailsFlyout.actionsButtonAriaLabel',
  { defaultMessage: 'Actions' }
);

const RESTORE_ACTION_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.restoreAction', {
  defaultMessage: 'Restore',
});

const EXCLUDE_ACTION_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.excludeAction', {
  defaultMessage: 'Exclude',
});

const DELETE_ACTION_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.deleteAction', {
  defaultMessage: 'Delete',
});

const CLOSE_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.streams.featureDetailsFlyout.closeButtonAriaLabel',
  { defaultMessage: 'Close' }
);
