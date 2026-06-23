/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Component } from 'react';
import classNames from 'classnames';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import type { Adapters } from '@kbn/inspector-plugin/common/adapters';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiConfirmModal,
  EuiIcon,
  EuiToolTip,
  htmlIdGenerator,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { TOCEntryActionsPopover } from './toc_entry_actions_popover';
import {
  getVisibilityToggleIcon,
  getVisibilityToggleLabel,
  EDIT_LAYER_SETTINGS_LABEL,
  FIT_TO_DATA_LABEL,
} from './action_labels';
import { LegendDetails } from './legend_details';
import type { ILayer } from '../../../../../classes/layers/layer';
import { isLayerGroup } from '../../../../../classes/layers/layer_group';

function escapeLayerName(name: string) {
  return name.split(' ').join('_');
}

export interface ReduxStateProps {
  inspectorAdapters: Adapters;
  isReadOnly: boolean;
  zoom: number;
  selectedLayer: ILayer | undefined;
  hasDirtyStateSelector: boolean;
  isLegendDetailsOpen: boolean;
  isEditButtonDisabled: boolean;
  isFeatureEditorOpenForLayer: boolean;
}

export interface ReduxDispatchProps {
  fitToBounds: (layerId: string) => void;
  openLayerPanel: (layerId: string) => Promise<void>;
  hideTOCDetails: (layerId: string) => void;
  showTOCDetails: (layerId: string) => void;
  toggleVisible: (layerId: string) => void;
  cancelEditing: () => void;
}

export interface OwnProps {
  depth: number;
  layer: ILayer;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  isDragging?: boolean;
  isDraggingOver?: boolean;
  isCombineLayer?: boolean;
}

type Props = ReduxStateProps & ReduxDispatchProps & OwnProps;

interface State {
  displayName: string;
  hasLegendDetails: boolean;
  shouldShowModal: boolean;
  supportsFitToBounds: boolean;
}

export class TOCEntry extends Component<Props, State> {
  private _isMounted = false;
  state: State = {
    displayName: '',
    hasLegendDetails: false,
    shouldShowModal: false,
    supportsFitToBounds: false,
  };

  componentDidMount() {
    this._isMounted = true;
    this._updateDisplayName();
    this._loadHasLegendDetails();
    this._loadSupportsFitToBounds();
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  componentDidUpdate() {
    this._updateDisplayName();
    this._loadHasLegendDetails();
  }

  _toggleLayerDetailsVisibility = () => {
    if (this.props.isLegendDetailsOpen) {
      this.props.hideTOCDetails(this.props.layer.getId());
    } else {
      this.props.showTOCDetails(this.props.layer.getId());
    }
  };

  async _loadSupportsFitToBounds() {
    const supportsFitToBounds = await this.props.layer.supportsFitToBounds();
    if (this._isMounted) {
      this.setState({ supportsFitToBounds });
    }
  }

  async _loadHasLegendDetails() {
    const hasLegendDetails =
      ((await this.props.layer.hasLegendDetails()) ||
        this.props.layer.hasErrors() ||
        this.props.layer.hasWarnings()) &&
      this.props.layer.isVisible() &&
      this.props.layer.showAtZoomLevel(this.props.zoom);
    if (this._isMounted && hasLegendDetails !== this.state.hasLegendDetails) {
      this.setState({ hasLegendDetails });
    }
  }

  async _updateDisplayName() {
    const displayName = await this.props.layer.getDisplayName();
    if (this._isMounted && displayName !== this.state.displayName) {
      this.setState({ displayName });
    }
  }

  _openLayerPanelWithCheck = () => {
    const { selectedLayer, hasDirtyStateSelector } = this.props;
    if (selectedLayer && selectedLayer.getId() === this.props.layer.getId()) {
      return;
    }

    if (hasDirtyStateSelector) {
      this.setState({
        shouldShowModal: true,
      });
      return;
    }

    this.props.openLayerPanel(this.props.layer.getId());
  };

  _fitToBounds = () => {
    this.props.fitToBounds(this.props.layer.getId());
  };

  _toggleVisible = () => {
    this.props.toggleVisible(this.props.layer.getId());
  };

  _renderCancelModal() {
    if (!this.state.shouldShowModal) {
      return null;
    }

    const confirmModalTitleId = htmlIdGenerator()('confirmModalTitle');

    const closeModal = () => {
      this.setState({
        shouldShowModal: false,
      });
    };

    const openPanel = () => {
      closeModal();
      this.props.openLayerPanel(this.props.layer.getId());
    };

    return (
      <EuiConfirmModal
        aria-labelledby={confirmModalTitleId}
        title="Discard changes"
        titleProps={{ id: confirmModalTitleId }}
        onCancel={closeModal}
        onConfirm={openPanel}
        cancelButtonText="Do not proceed"
        confirmButtonText="Proceed and discard changes"
        buttonColor="danger"
        defaultFocusedButton="cancel"
      >
        <p>There are unsaved changes to your layer.</p>
        <p>Are you sure you want to proceed?</p>
      </EuiConfirmModal>
    );
  }

  _renderQuickActions() {
    const quickActions = [
      <EuiToolTip
        content={getVisibilityToggleLabel(this.props.layer.isVisible())}
        disableScreenReaderOutput
      >
        <EuiButtonIcon
          key="toggleVisiblity"
          iconType={getVisibilityToggleIcon(this.props.layer.isVisible())}
          aria-label={getVisibilityToggleLabel(this.props.layer.isVisible())}
          onClick={this._toggleVisible}
        />
      </EuiToolTip>,
    ];

    if (this.state.supportsFitToBounds) {
      quickActions.push(
        <EuiToolTip content={FIT_TO_DATA_LABEL} disableScreenReaderOutput>
          <EuiButtonIcon
            key="fitToBounds"
            iconType="maximize"
            aria-label={FIT_TO_DATA_LABEL}
            onClick={this._fitToBounds}
          />
        </EuiToolTip>
      );
    }

    if (!this.props.isReadOnly) {
      quickActions.push(
        <EuiToolTip content={EDIT_LAYER_SETTINGS_LABEL} disableScreenReaderOutput>
          <EuiButtonIcon
            key="settings"
            isDisabled={this.props.isEditButtonDisabled}
            iconType="pencil"
            aria-label={EDIT_LAYER_SETTINGS_LABEL}
            onClick={this._openLayerPanelWithCheck}
          />
        </EuiToolTip>
      );
      quickActions.push(
        <EuiToolTip
          content={i18n.translate('xpack.maps.layerControl.tocEntry.grabButtonTitle', {
            defaultMessage: 'Reorder layer',
          })}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            key="reorder"
            iconType="dragVertical"
            aria-label={i18n.translate('xpack.maps.layerControl.tocEntry.grabButtonAriaLabel', {
              defaultMessage: 'Reorder layer',
            })}
            className="mapTocEntry__grab"
            {...this.props.dragHandleProps}
          />
        </EuiToolTip>
      );
    }

    return <div className="mapTocEntry__layerIcons">{quickActions}</div>;
  }

  _renderDetailsToggle() {
    if (this.props.isDragging || !this.state.hasLegendDetails) {
      return null;
    }

    const { isLegendDetailsOpen } = this.props;
    return (
      <span className="mapTocEntry__detailsToggle">
        <button
          className="mapTocEntry__detailsToggleButton"
          aria-label={
            isLegendDetailsOpen
              ? i18n.translate('xpack.maps.layerControl.tocEntry.hideDetailsButtonAriaLabel', {
                  defaultMessage: 'Hide layer details',
                })
              : i18n.translate('xpack.maps.layerControl.tocEntry.showDetailsButtonAriaLabel', {
                  defaultMessage: 'Show layer details',
                })
          }
          title={
            isLegendDetailsOpen
              ? i18n.translate('xpack.maps.layerControl.tocEntry.hideDetailsButtonTitle', {
                  defaultMessage: 'Hide layer details',
                })
              : i18n.translate('xpack.maps.layerControl.tocEntry.showDetailsButtonTitle', {
                  defaultMessage: 'Show layer details',
                })
          }
          onClick={this._toggleLayerDetailsVisibility}
        >
          <EuiIcon
            className="eui-alignBaseline"
            type={isLegendDetailsOpen ? 'chevronSingleUp' : 'chevronSingleDown'}
            size="s"
            aria-hidden={true}
          />
        </button>
      </span>
    );
  }

  _renderLayerHeader() {
    const { layer, zoom } = this.props;
    return (
      <div
        className={
          layer.isVisible() && layer.showAtZoomLevel(zoom)
            ? 'mapTocEntry-visible'
            : 'mapTocEntry-notVisible'
        }
      >
        <TOCEntryActionsPopover
          layer={layer}
          displayName={this.state.displayName}
          escapedDisplayName={escapeLayerName(this.state.displayName)}
          openLayerSettings={this._openLayerPanelWithCheck}
          isEditButtonDisabled={this.props.isEditButtonDisabled}
          supportsFitToBounds={this.state.supportsFitToBounds}
        />

        {this._renderQuickActions()}
      </div>
    );
  }

  _hightlightAsSelectedLayer() {
    if (this.props.isCombineLayer) {
      return false;
    }

    if (this.props.layer.isPreviewLayer()) {
      return true;
    }

    return (
      this.props.selectedLayer && this.props.selectedLayer.getId() === this.props.layer.getId()
    );
  }

  render() {
    const classes = classNames('mapTocEntry', {
      'mapTocEntry-isDragging': this.props.isDragging,
      'mapTocEntry-isDraggingOver': this.props.isDraggingOver,
      'mapTocEntry-isCombineLayer': this.props.isCombineLayer,
      'mapTocEntry-isSelected': this._hightlightAsSelectedLayer(),
      'mapTocEntry-isInEditingMode': this.props.isFeatureEditorOpenForLayer,
    });

    const depthStyle =
      this.props.depth > 0 ? { paddingLeft: `${8 + this.props.depth * 24}px` } : {};

    return (
      <div style={depthStyle} className={classes} data-layerid={this.props.layer.getId()}>
        {this._renderLayerHeader()}

        {this.props.isLegendDetailsOpen &&
        this.state.hasLegendDetails &&
        !isLayerGroup(this.props.layer) ? (
          <div
            className="mapTocEntry__layerDetails"
            data-test-subj={`mapLayerTOCDetails${escapeLayerName(this.state.displayName)}`}
          >
            <LegendDetails
              inspectorAdapters={this.props.inspectorAdapters}
              layer={this.props.layer}
            />
          </div>
        ) : null}

        {this._renderDetailsToggle()}

        {this._renderCancelModal()}

        {this.props.isFeatureEditorOpenForLayer && (
          <div className="mapTocEntry-isInEditingMode__row">
            <EuiIcon type="vectorSquare" size="s" aria-hidden={true} />
            <span className="mapTocEntry-isInEditingMode__editFeatureText">
              <FormattedMessage
                id="xpack.maps.layerControl.tocEntry.EditFeatures"
                defaultMessage="Edit features"
              />
            </span>
            <EuiButtonEmpty size="xs" flush="both" onClick={this.props.cancelEditing}>
              <FormattedMessage
                id="xpack.maps.layerControl.tocEntry.exitEditModeAriaLabel"
                defaultMessage="Exit"
              />
            </EuiButtonEmpty>
          </div>
        )}
      </div>
    );
  }
}
