/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useRef } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiButton, EuiPopover, EuiListGroup, EuiListGroupItem } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { NonEmptyString } from '@kbn/io-ts-utils';
import { useBoolean } from '@kbn/react-hooks';
import type {
  SavedViewState,
  SavedViewOperations,
  SavedViewItem,
  BasicAttributes,
} from '../../../common/saved_views';
import { ManageViewsFlyout } from './manage_views_flyout';
import { UpsertViewModal } from './upsert_modal';

interface Props<TSingleSavedViewState extends SavedViewItem, TViewState>
  extends SavedViewState<TSingleSavedViewState> {
  viewState?: TViewState & BasicAttributes;
  onCreateView: SavedViewOperations<TSingleSavedViewState>['createView'];
  onDeleteView: SavedViewOperations<TSingleSavedViewState>['deleteViewById'];
  onUpdateView: SavedViewOperations<TSingleSavedViewState>['updateViewById'];
  onLoadViews: SavedViewOperations<TSingleSavedViewState>['fetchViews'];
  onSetDefaultView: SavedViewOperations<TSingleSavedViewState>['setDefaultViewById'];
  onSwitchView: SavedViewOperations<TSingleSavedViewState>['switchViewById'];
}

export function SavedViewsToolbarControls<TSingleSavedViewState extends SavedViewItem, TViewState>(
  props: Props<TSingleSavedViewState, TViewState>
) {
  const {
    currentView,
    views,
    isFetchingViews,
    isFetchingCurrentView,
    isCreatingView,
    isUpdatingView,
    onCreateView,
    onDeleteView,
    onUpdateView,
    onLoadViews,
    onSetDefaultView,
    onSwitchView,
    viewState,
  } = props;

  const [isPopoverOpen, { off: closePopover, toggle: togglePopover }] = useBoolean(false);

  const [isManageFlyoutOpen, { on: openManageFlyout, off: closeManageFlyout }] = useBoolean(false);
  const [isCreateModalOpen, { on: openCreateModal, off: closeCreateModal }] = useBoolean(false);
  const [isUpdateModalOpen, { on: openUpdateModal, off: closeUpdateModal }] = useBoolean(false);

  const togglePopoverAndLoad = () => {
    if (!isPopoverOpen) {
      onLoadViews();
    }
    togglePopover();
  };

  const goToManageViews = () => {
    closePopover();
    openManageFlyout();
  };

  const goToCreateView = () => {
    closePopover();
    openCreateModal();
  };

  const goToUpdateView = () => {
    closePopover();
    openUpdateModal();
  };

  const handleCreateView = (name: NonEmptyString, shouldIncludeTime: boolean = false) => {
    const attributes = { ...viewState, name };

    if (!shouldIncludeTime) {
      delete attributes.time;
    }

    onCreateView(attributes).then(closeCreateModal);
  };

  const handleUpdateView = (name: NonEmptyString, shouldIncludeTime: boolean = false) => {
    if (!currentView) return;

    const attributes = { ...viewState, name };

    if (!shouldIncludeTime) {
      delete attributes.time;
    }

    onUpdateView({ id: currentView.id, attributes }).then(closeUpdateModal);
  };

  const openPopoverButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <EuiPopover
        data-test-subj="savedViews-popover"
        aria-label={i18n.translate('xpack.infra.savedView.popoverAriaLabel', {
          defaultMessage: 'Saved views',
        })}
        button={
          <EuiButton
            size="s"
            onClick={togglePopoverAndLoad}
            data-test-subj={`savedViews-openPopover-${
              isFetchingCurrentView ? 'loading' : 'loaded'
            }`}
            buttonRef={openPopoverButtonRef}
            iconType="chevronSingleDown"
            iconSide="right"
            color="text"
            isLoading={isFetchingCurrentView}
          >
            {currentView
              ? currentView.attributes.name
              : i18n.translate('xpack.infra.savedView.unknownView', {
                  defaultMessage: 'No view selected',
                })}
          </EuiButton>
        }
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        anchorPosition="leftCenter"
      >
        <EuiListGroup>
          <EuiListGroupItem
            data-test-subj="savedViews-manageViews"
            iconType="indexSettings"
            onClick={goToManageViews}
            label={i18n.translate('xpack.infra.savedView.manageViews', {
              defaultMessage: 'Manage views',
            })}
          />
          <EuiListGroupItem
            data-test-subj="savedViews-updateView"
            iconType="refresh"
            onClick={goToUpdateView}
            isDisabled={!currentView || currentView.attributes.isStatic}
            label={i18n.translate('xpack.infra.savedView.updateView', {
              defaultMessage: 'Update view',
            })}
          />
          <EuiListGroupItem
            data-test-subj="savedViews-saveNewView"
            iconType="save"
            onClick={goToCreateView}
            label={i18n.translate('xpack.infra.savedView.saveNewView', {
              defaultMessage: 'Save new view',
            })}
          />
        </EuiListGroup>
      </EuiPopover>
      {isCreateModalOpen && (
        <UpsertViewModal
          isSaving={isCreatingView}
          onClose={closeCreateModal}
          onSave={handleCreateView}
          title={
            <FormattedMessage
              defaultMessage="Save View"
              id="xpack.infra.waffle.savedView.createHeader"
            />
          }
        />
      )}
      {isUpdateModalOpen && (
        <UpsertViewModal
          isSaving={isUpdatingView}
          onClose={closeUpdateModal}
          onSave={handleUpdateView}
          initialName={currentView?.attributes.name}
          initialIncludeTime={Boolean(currentView?.attributes.time)}
          title={
            <FormattedMessage
              defaultMessage="Update View"
              id="xpack.infra.waffle.savedView.updateHeader"
            />
          }
        />
      )}
      {isManageFlyoutOpen && (
        <ManageViewsFlyout
          triggerRef={openPopoverButtonRef}
          loading={isFetchingViews}
          views={views}
          onMakeDefaultView={onSetDefaultView}
          onDeleteView={onDeleteView}
          onClose={closeManageFlyout}
          onSwitchView={onSwitchView}
        />
      )}
    </>
  );
}
