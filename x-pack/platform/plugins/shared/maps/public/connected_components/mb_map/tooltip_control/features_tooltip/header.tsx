/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { Component, Fragment } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiTextColor,
  EuiToolTip,
} from '@elastic/eui';
import type { IVectorLayer } from '../../../../classes/layers/vector_layer';

interface Props {
  findLayerById: (layerId: string) => IVectorLayer | undefined;
  isLocked: boolean;
  layerId: string;
  onClose: () => void;
}

interface State {
  layerName: string | null;
}

export class Header extends Component<Props, State> {
  private _isMounted = false;
  state: State = {
    layerName: null,
  };

  componentDidMount() {
    this._isMounted = true;
    this._loadLayerState();
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  async _loadLayerState() {
    const layer = this.props.findLayerById(this.props.layerId);
    if (!layer) {
      return;
    }
    const layerName = await layer.getDisplayName();
    if (this._isMounted) {
      this.setState({ layerName });
    }
  }

  render() {
    const items: ReactNode[] = [];

    if (this.state.layerName) {
      items.push(
        <EuiFlexItem grow={true} key="layerName" className="eui-textTruncate">
          <EuiTextColor>
            <h4 className="eui-textTruncate" title={this.state.layerName}>
              {this.state.layerName}
            </h4>
          </EuiTextColor>
        </EuiFlexItem>
      );
    }

    if (this.props.isLocked) {
      // When close button is the only item, add empty FlexItem to push close button to right
      if (items.length === 0) {
        items.push(<EuiFlexItem key="spacer" />);
      }

      items.push(
        <EuiFlexItem grow={false} key="closeButton">
          <EuiToolTip
            content={i18n.translate('xpack.maps.tooltip.closeAriaLabel', {
              defaultMessage: 'Close tooltip',
            })}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              onClick={this.props.onClose}
              iconType="cross"
              aria-label={i18n.translate('xpack.maps.tooltip.closeAriaLabel', {
                defaultMessage: 'Close tooltip',
              })}
              data-test-subj="mapTooltipCloseButton"
            />
          </EuiToolTip>
        </EuiFlexItem>
      );
    }

    return items.length ? (
      <Fragment>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          {items}
        </EuiFlexGroup>
        <EuiHorizontalRule margin="xs" />
      </Fragment>
    ) : null;
  }
}
