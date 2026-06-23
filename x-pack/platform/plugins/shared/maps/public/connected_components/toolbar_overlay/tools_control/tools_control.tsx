/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Component } from 'react';
import type { GeoShapeRelation } from '@elastic/elasticsearch/lib/api/types';
import {
  EuiButton,
  EuiButtonIcon,
  EuiContextMenu,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ActionExecutionContext, Action } from '@kbn/ui-actions-plugin/public';
import type { ES_GEO_FIELD_TYPE } from '../../../../common/constants';
import { DRAW_SHAPE } from '../../../../common/constants';
import { GeometryFilterForm } from '../../../components/draw_forms/geometry_filter_form/geometry_filter_form';
import { DistanceFilterForm } from '../../../components/draw_forms/distance_filter_form';
import type { DrawState } from '../../../../common/descriptor_types';

const DRAW_SHAPE_LABEL = i18n.translate('xpack.maps.toolbarOverlay.drawShapeLabel', {
  defaultMessage: 'Draw shape to filter data',
});

const DRAW_BOUNDS_LABEL = i18n.translate('xpack.maps.toolbarOverlay.drawBoundsLabel', {
  defaultMessage: 'Draw bounds to filter data',
});

const DRAW_DISTANCE_LABEL = i18n.translate('xpack.maps.toolbarOverlay.drawDistanceLabel', {
  defaultMessage: 'Draw distance to filter data',
});

const DRAW_SHAPE_LABEL_SHORT = i18n.translate('xpack.maps.toolbarOverlay.drawShapeLabelShort', {
  defaultMessage: 'Draw shape',
});

const DRAW_BOUNDS_LABEL_SHORT = i18n.translate('xpack.maps.toolbarOverlay.drawBoundsLabelShort', {
  defaultMessage: 'Draw bounds',
});

const DRAW_DISTANCE_LABEL_SHORT = i18n.translate(
  'xpack.maps.toolbarOverlay.drawDistanceLabelShort',
  {
    defaultMessage: 'Draw distance',
  }
);

export interface Props {
  cancelDraw: () => void;
  filterModeActive: boolean;
  getFilterActions?: () => Promise<Action[]>;
  getActionContext?: () => ActionExecutionContext;
  initiateDraw: (drawState: DrawState) => void;
  disableToolsControl: boolean;
}

interface State {
  isPopoverOpen: boolean;
}

export class ToolsControl extends Component<Props, State> {
  state: State = {
    isPopoverOpen: false,
  };

  _togglePopover = () => {
    this.setState((prevState) => ({
      isPopoverOpen: !prevState.isPopoverOpen,
    }));
  };

  _closePopover = () => {
    this.setState({ isPopoverOpen: false });
    if (this.props.filterModeActive) {
      this.props.cancelDraw();
    }
  };

  _initiateShapeDraw = (options: {
    actionId: string;
    geometryLabel?: string;
    indexPatternId?: string;
    geoFieldName?: string;
    geoFieldType?: ES_GEO_FIELD_TYPE;
    relation?: GeoShapeRelation;
  }) => {
    this.props.initiateDraw({
      drawShape: DRAW_SHAPE.POLYGON,
      ...options,
    });
    this._closePopover();
  };

  _initiateBoundsDraw = (options: {
    actionId: string;
    geometryLabel?: string;
    indexPatternId?: string;
    geoFieldName?: string;
    geoFieldType?: ES_GEO_FIELD_TYPE;
    relation?: GeoShapeRelation;
  }) => {
    this.props.initiateDraw({
      drawShape: DRAW_SHAPE.BOUNDS,
      ...options,
    });
    this._closePopover();
  };

  _initiateDistanceDraw = (options: { actionId: string; filterLabel: string }) => {
    this.props.initiateDraw({
      drawShape: DRAW_SHAPE.DISTANCE,
      ...options,
    });
    this._closePopover();
  };

  _getDrawPanels() {
    const tools = [
      {
        name: DRAW_SHAPE_LABEL,
        panel: 1,
      },
      {
        name: DRAW_BOUNDS_LABEL,
        panel: 2,
      },
      {
        name: DRAW_DISTANCE_LABEL,
        panel: 3,
      },
    ];

    return [
      {
        id: 0,
        title: i18n.translate('xpack.maps.toolbarOverlay.tools.toolbarTitle', {
          defaultMessage: 'Tools',
        }),
        items: tools,
      },
      {
        id: 1,
        title: DRAW_SHAPE_LABEL_SHORT,
        content: (
          <GeometryFilterForm
            className="mapDrawControl__geometryFilterForm"
            buttonLabel={DRAW_SHAPE_LABEL_SHORT}
            getFilterActions={this.props.getFilterActions}
            getActionContext={this.props.getActionContext}
            intitialGeometryLabel={i18n.translate(
              'xpack.maps.toolbarOverlay.drawShape.initialGeometryLabel',
              {
                defaultMessage: 'shape',
              }
            )}
            onSubmit={this._initiateShapeDraw}
          />
        ),
      },
      {
        id: 2,
        title: DRAW_BOUNDS_LABEL_SHORT,
        content: (
          <GeometryFilterForm
            className="mapDrawControl__geometryFilterForm"
            buttonLabel={DRAW_BOUNDS_LABEL_SHORT}
            getFilterActions={this.props.getFilterActions}
            getActionContext={this.props.getActionContext}
            intitialGeometryLabel={i18n.translate(
              'xpack.maps.toolbarOverlay.drawBounds.initialGeometryLabel',
              {
                defaultMessage: 'bounds',
              }
            )}
            onSubmit={this._initiateBoundsDraw}
          />
        ),
      },
      {
        id: 3,
        title: DRAW_DISTANCE_LABEL_SHORT,
        content: (
          <DistanceFilterForm
            className="mapDrawControl__geometryFilterForm"
            buttonLabel={DRAW_DISTANCE_LABEL_SHORT}
            getFilterActions={this.props.getFilterActions}
            getActionContext={this.props.getActionContext}
            onSubmit={this._initiateDistanceDraw}
          />
        ),
      },
    ];
  }

  _renderToolsButton() {
    return (
      <EuiPanel paddingSize="none" className="mapToolbarOverlay__button">
        <EuiToolTip
          content={i18n.translate('xpack.maps.toolbarOverlay.toolsControlTitle', {
            defaultMessage: 'Tools',
          })}
          disableScreenReaderOutput
          anchorClassName="mapToolbarOverlay__buttonIcon-empty"
        >
          <EuiButtonIcon
            size="s"
            color="text"
            iconType="wrench"
            onClick={this._togglePopover}
            aria-label={i18n.translate('xpack.maps.toolbarOverlay.toolsControlTitle', {
              defaultMessage: 'Tools',
            })}
            isDisabled={this.props.disableToolsControl}
          />
        </EuiToolTip>
      </EuiPanel>
    );
  }

  render() {
    const toolsPopoverButton = (
      <EuiPopover
        id="toolsControlPopover"
        button={this._renderToolsButton()}
        isOpen={this.state.isPopoverOpen}
        closePopover={this._closePopover}
        panelPaddingSize="none"
        anchorPosition="leftUp"
        data-test-subj="mapToolsControlPopover"
        aria-label={i18n.translate('xpack.maps.toolbarOverlay.toolsControlPopoverAriaLabel', {
          defaultMessage: 'Tools',
        })}
      >
        <EuiContextMenu initialPanelId={0} panels={this._getDrawPanels()} />
      </EuiPopover>
    );

    if (!this.props.filterModeActive) {
      return toolsPopoverButton;
    }

    return (
      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem>{toolsPopoverButton}</EuiFlexItem>
        <EuiFlexItem>
          <EuiButton size="s" fill onClick={this.props.cancelDraw} autoFocus>
            <FormattedMessage
              id="xpack.maps.tooltip.toolsControl.cancelDrawButtonLabel"
              defaultMessage="Cancel"
            />
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
}
