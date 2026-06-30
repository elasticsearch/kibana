/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiThemeComputed } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiDragDropContext,
  EuiDroppable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css, Global } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useCallback, useEffect, useState } from 'react';
import type { NavigationItemInfo } from '../types';
import { DraggableItem } from './draggable_item';
import { EmptyDropPlaceholder } from './empty_drop_placeholder';
import { useItemList, HIDDEN_DROPPABLE_ID, VISIBLE_DROPPABLE_ID } from './use_item_list';

const modalCss = css`
  width: 576px;
`;

const headerCss = (euiTheme: EuiThemeComputed) => css`
  padding-bottom: ${euiTheme.size.s};
`;

const modalBodyCss = (euiTheme: EuiThemeComputed) => css`
  .euiModalBody__overflow {
    padding-block: ${euiTheme.size.s};
  }
`;

interface Props {
  items: NavigationItemInfo[];
  onSave: (order: string[], hiddenIds: string[]) => void;
  onReset: () => Promise<NavigationItemInfo[]>;
  onChange: (order: string[], hiddenIds: string[]) => void;
  onClose: () => void;
}

export const CustomizeNavigationModal = ({
  items: initialItems,
  onSave,
  onReset,
  onChange,
  onClose,
}: Props) => {
  const { euiTheme } = useEuiTheme();
  const modalTitleId = useGeneratedHtmlId();
  const {
    items,
    setItems,
    visibleItems,
    hiddenItems,
    hasChanges,
    handleDragEnd,
    toggleItemVisibility,
  } = useItemList(initialItems);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const order = items.map((item) => item.id);
    const hiddenIds = items.filter((item) => item.hidden).map((item) => item.id);
    onChange(order, hiddenIds);
  }, [items, onChange]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSave = useCallback(() => {
    setIsSaving(true);

    const order = items.map((item) => item.id);
    const hiddenIds = items.filter((item) => item.hidden).map((item) => item.id);
    onSave(order, hiddenIds);

    setIsSaving(false);
  }, [items, onSave]);

  const handleReset = useCallback(async () => {
    setItems(await onReset());
  }, [onReset, setItems]);

  return (
    <EuiModal
      onClose={handleClose}
      aria-labelledby={modalTitleId}
      css={modalCss}
      data-test-subj="customizeNavigationModal"
    >
      <Global
        styles={{
          '.euiOverlayMask:has([data-test-subj="customizeNavigationModal"])': {
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
          },
        }}
      />
      <EuiModalHeader css={headerCss(euiTheme)}>
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiModalHeaderTitle id={modalTitleId}>
            <FormattedMessage
              id="navigationCustomizationComponents.modalTitle"
              defaultMessage="Customize navigation"
            />
          </EuiModalHeaderTitle>
          <EuiText size="s" color="subdued">
            <FormattedMessage
              id="navigationCustomizationComponents.spaceDescription"
              defaultMessage="Reorder or hide apps in this space without affecting other users."
            />
          </EuiText>
        </EuiFlexGroup>
      </EuiModalHeader>
      <EuiModalBody css={modalBodyCss(euiTheme)}>
        <EuiDragDropContext onDragEnd={handleDragEnd}>
          <EuiDroppable droppableId={VISIBLE_DROPPABLE_ID} spacing="none">
            {visibleItems.length > 0 ? (
              visibleItems.map((item, index) => (
                <DraggableItem
                  key={item.id}
                  item={item}
                  index={index}
                  toggleItemVisibility={toggleItemVisibility}
                />
              ))
            ) : (
              <EmptyDropPlaceholder
                message={i18n.translate('navigationCustomizationComponents.emptyVisibleList', {
                  defaultMessage: 'Drag an item here to show it in the navigation.',
                })}
              />
            )}
          </EuiDroppable>
          <EuiSpacer size="m" />
          <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <h4>
                  <FormattedMessage
                    id="navigationCustomizationComponents.moreLabel"
                    defaultMessage="Hide under More"
                  />
                </h4>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiIconTip
                color="subdued"
                content={i18n.translate('navigationCustomizationComponents.moreTooltip', {
                  defaultMessage:
                    'With limited screen space, visible items may appear under More too',
                })}
                position="right"
                type="info"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer css={css({ blockSize: euiTheme.size.m })} />
          <EuiDroppable droppableId={HIDDEN_DROPPABLE_ID} spacing="none">
            {hiddenItems.length > 0 ? (
              hiddenItems.map((item, index) => (
                <DraggableItem
                  key={item.id}
                  item={item}
                  index={index}
                  toggleItemVisibility={toggleItemVisibility}
                />
              ))
            ) : (
              <EmptyDropPlaceholder
                message={i18n.translate('navigationCustomizationComponents.emptyHiddenList', {
                  defaultMessage: 'Drag an item here to hide it under More.',
                })}
              />
            )}
          </EuiDroppable>
        </EuiDragDropContext>
      </EuiModalBody>
      <EuiModalFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="undo"
              color="danger"
              onClick={() => {
                void handleReset();
              }}
              disabled={isSaving}
            >
              <FormattedMessage
                id="navigationCustomizationComponents.resetButtonText"
                defaultMessage="Reset to default"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              {hasChanges && (
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty onClick={handleClose}>
                    <FormattedMessage
                      id="navigationCustomizationComponents.cancelButtonText"
                      defaultMessage="Cancel"
                    />
                  </EuiButtonEmpty>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  onClick={handleSave}
                  isLoading={isSaving}
                  disabled={!hasChanges}
                  data-test-subj="customizeNavigationSaveButton"
                >
                  <FormattedMessage
                    id="navigationCustomizationComponents.applyButtonText"
                    defaultMessage="Apply"
                  />
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiModalFooter>
    </EuiModal>
  );
};
