/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Component } from 'react';
import { EuiButtonIcon, EuiPanel, EuiPopover, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { MapCenter, MapSettings } from '../../../../common/descriptor_types';
import { SetViewForm } from './set_view_form';

export interface Props {
  settings: MapSettings;
  zoom: number;
  center: MapCenter;
  onSubmit: ({ lat, lon, zoom }: { lat: number; lon: number; zoom: number }) => void;
}

interface State {
  isPopoverOpen: boolean;
}

export class SetViewControl extends Component<Props, State> {
  state: State = {
    isPopoverOpen: false,
  };

  _togglePopover = () => {
    this.setState((prevState) => ({
      isPopoverOpen: !prevState.isPopoverOpen,
    }));
  };

  _closePopover = () => {
    this.setState({
      isPopoverOpen: false,
    });
  };

  _onSubmit = (lat: number, lon: number, zoom: number) => {
    this._closePopover();
    this.props.onSubmit({ lat, lon, zoom });
  };

  render() {
    return (
      <EuiPopover
        anchorPosition="leftUp"
        panelPaddingSize="s"
        button={
          <EuiPanel paddingSize="none" className="mapToolbarOverlay__button">
            <EuiToolTip
              content={i18n.translate('xpack.maps.setViewControl.goToButtonLabel', {
                defaultMessage: 'Go to',
              })}
              anchorClassName="mapToolbarOverlay__buttonIcon-empty"
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                size="s"
                onClick={this._togglePopover}
                data-test-subj="toggleSetViewVisibilityButton"
                iconType="crosshair"
                color="text"
                aria-label={i18n.translate('xpack.maps.setViewControl.goToButtonLabel', {
                  defaultMessage: 'Go to',
                })}
              />
            </EuiToolTip>
          </EuiPanel>
        }
        isOpen={this.state.isPopoverOpen}
        closePopover={this._closePopover}
        aria-label={i18n.translate('xpack.maps.setViewControl.popoverAriaLabel', {
          defaultMessage: 'Set view',
        })}
      >
        <SetViewForm
          settings={this.props.settings}
          zoom={this.props.zoom}
          center={this.props.center}
          onSubmit={this._onSubmit}
        />
      </EuiPopover>
    );
  }
}
