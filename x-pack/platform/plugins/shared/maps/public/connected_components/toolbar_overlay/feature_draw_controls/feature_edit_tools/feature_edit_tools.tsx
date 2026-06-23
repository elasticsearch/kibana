/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import classNames from 'classnames';
import { EuiButtonIcon, EuiPanel, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { TrackApplicationView } from '@kbn/usage-collection-plugin/public';
import { DRAW_SHAPE } from '../../../../../common/constants';
import { VectorCircleIcon } from './vector_circle_icon';
import { VectorLineIcon } from './vector_line_icon';
import { VectorSquareIcon } from './vector_square_icon';

export interface ReduxStateProps {
  drawShape?: string;
}

export interface ReduxDispatchProps {
  setDrawShape: (shapeToDraw: DRAW_SHAPE | null) => void;
}

export interface OwnProps {
  pointsOnly?: boolean;
}

type Props = ReduxStateProps & ReduxDispatchProps & OwnProps;

export function FeatureEditTools(props: Props) {
  const drawLineSelected = props.drawShape === DRAW_SHAPE.LINE;
  const drawPolygonSelected = props.drawShape === DRAW_SHAPE.POLYGON;
  const drawCircleSelected = props.drawShape === DRAW_SHAPE.DISTANCE;
  const drawBBoxSelected = props.drawShape === DRAW_SHAPE.BOUNDS;
  const drawPointSelected = props.drawShape === DRAW_SHAPE.POINT;
  const deleteSelected = props.drawShape === DRAW_SHAPE.DELETE;
  const isWaiting = props.drawShape === DRAW_SHAPE.WAIT;

  function toggleDrawShape(mode: DRAW_SHAPE) {
    if (mode && props.drawShape === mode) {
      props.setDrawShape(null);
    } else {
      props.setDrawShape(mode);
    }
  }

  return (
    <TrackApplicationView viewId="featureEditTools">
      <EuiPanel
        paddingSize="none"
        className="mapToolbarOverlay__buttonGroup mapToolbarOverlay__buttonGroupAnimated"
      >
        {props.pointsOnly ? null : (
          <>
            <EuiToolTip
              content={i18n.translate('xpack.maps.toolbarOverlay.featureDraw.drawLineTitle', {
                defaultMessage: 'Draw line',
              })}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                className={classNames({
                  'mapToolbarOverlay__buttonIcon-empty': !drawLineSelected,
                })}
                key="line"
                size="s"
                onClick={() => toggleDrawShape(DRAW_SHAPE.LINE)}
                iconType={VectorLineIcon}
                aria-label={i18n.translate('xpack.maps.toolbarOverlay.featureDraw.drawLineLabel', {
                  defaultMessage: 'Draw line',
                })}
                aria-pressed={drawLineSelected}
                isSelected={drawLineSelected}
                display={drawLineSelected ? 'fill' : 'empty'}
                isDisabled={isWaiting}
              />
            </EuiToolTip>

            <EuiToolTip
              content={i18n.translate('xpack.maps.toolbarOverlay.featureDraw.drawPolygonTitle', {
                defaultMessage: 'Draw polygon',
              })}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                className={classNames({
                  'mapToolbarOverlay__buttonIcon-empty': !drawPolygonSelected,
                })}
                key="polygon"
                size="s"
                onClick={() => toggleDrawShape(DRAW_SHAPE.POLYGON)}
                iconType="vectorTriangle"
                aria-label={i18n.translate(
                  'xpack.maps.toolbarOverlay.featureDraw.drawPolygonLabel',
                  {
                    defaultMessage: 'Draw polygon',
                  }
                )}
                aria-pressed={drawPolygonSelected}
                isSelected={drawPolygonSelected}
                display={drawPolygonSelected ? 'fill' : 'empty'}
                isDisabled={isWaiting}
              />
            </EuiToolTip>
            <EuiToolTip
              content={i18n.translate('xpack.maps.toolbarOverlay.featureDraw.drawCircleTitle', {
                defaultMessage: 'Draw circle',
              })}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                className={classNames({
                  'mapToolbarOverlay__buttonIcon-empty': !drawCircleSelected,
                })}
                key="circle"
                size="s"
                onClick={() => toggleDrawShape(DRAW_SHAPE.DISTANCE)}
                iconType={VectorCircleIcon}
                aria-label={i18n.translate(
                  'xpack.maps.toolbarOverlay.featureDraw.drawCircleLabel',
                  {
                    defaultMessage: 'Draw circle',
                  }
                )}
                aria-pressed={drawCircleSelected}
                isSelected={drawCircleSelected}
                display={drawCircleSelected ? 'fill' : 'empty'}
                isDisabled={isWaiting}
              />
            </EuiToolTip>
            <EuiToolTip
              content={i18n.translate('xpack.maps.toolbarOverlay.featureDraw.drawBBoxTitle', {
                defaultMessage: 'Draw bounding box',
              })}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                className={classNames({
                  'mapToolbarOverlay__buttonIcon-empty': !drawBBoxSelected,
                })}
                key="boundingBox"
                size="s"
                onClick={() => toggleDrawShape(DRAW_SHAPE.BOUNDS)}
                iconType={VectorSquareIcon}
                aria-label={i18n.translate('xpack.maps.toolbarOverlay.featureDraw.drawBBoxLabel', {
                  defaultMessage: 'Draw bounding box',
                })}
                aria-pressed={drawBBoxSelected}
                isSelected={drawBBoxSelected}
                display={drawBBoxSelected ? 'fill' : 'empty'}
                isDisabled={isWaiting}
              />
            </EuiToolTip>
          </>
        )}
        <EuiToolTip
          content={i18n.translate('xpack.maps.toolbarOverlay.featureDraw.drawPointTitle', {
            defaultMessage: 'Draw point',
          })}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            className={classNames({
              'mapToolbarOverlay__buttonIcon-empty': !drawPointSelected,
            })}
            key="point"
            size="s"
            onClick={() => toggleDrawShape(DRAW_SHAPE.POINT)}
            iconType="dot"
            aria-label={i18n.translate('xpack.maps.toolbarOverlay.featureDraw.drawPointLabel', {
              defaultMessage: 'Draw point',
            })}
            aria-pressed={drawPointSelected}
            isSelected={drawPointSelected}
            display={drawPointSelected ? 'fill' : 'empty'}
            isDisabled={isWaiting}
          />
        </EuiToolTip>
        <EuiToolTip
          content={i18n.translate('xpack.maps.toolbarOverlay.featureDraw.deletePointOrShapeTitle', {
            defaultMessage: 'Delete point or shape',
          })}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            className={classNames({
              'mapToolbarOverlay__buttonIcon-empty': !deleteSelected,
            })}
            key="delete"
            size="s"
            onClick={() => toggleDrawShape(DRAW_SHAPE.DELETE)}
            iconType="trash"
            aria-label={i18n.translate(
              'xpack.maps.toolbarOverlay.featureDraw.deletePointOrShapeLabel',
              {
                defaultMessage: 'Delete point or shape',
              }
            )}
            aria-pressed={deleteSelected}
            isSelected={deleteSelected}
            display={deleteSelected ? 'fill' : 'empty'}
            isDisabled={isWaiting}
          />
        </EuiToolTip>
      </EuiPanel>
    </TrackApplicationView>
  );
}
