/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useContext, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiRangeProps } from '@elastic/eui';
import { EuiPanel, EuiIcon } from '@elastic/eui';
import { useSelector, useDispatch } from 'react-redux';
import { SideEffectContext } from '../side_effect_context';
import type { Vector2 } from '../../types';
import * as selectors from '../../store/selectors';
import { useColors } from '../use_colors';
import {
  userClickedZoomIn,
  userClickedZoomOut,
  userSetZoomLevel,
  userNudgedCamera,
  userSetPositionOfCamera,
} from '../../store/camera/action';
import type { State } from '../../../common/store/types';
import { SourcererButton } from './sourcerer_selection';
import { DateSelectionButton } from './date_picker';
import { StyledGraphControls, StyledGraphControlsColumn, StyledEuiRange } from './styles';
import { NodeLegend } from './legend';
import { SchemaInformation } from './schema';
import { ShowPanelButton } from './show_panel';

type PopoverType = null | 'schemaInfo' | 'nodeLegend' | 'sourcererSelection' | 'datePicker';

export const GraphControls = React.memo(
  ({
    id,
    className,
    onShowPanel,
  }: {
    /**
     * Id that identify the scope of analyzer
     */
    id: string;
    /**
     * A className string provided by `styled`
     */
    className?: string;
    /**
     * Callback for showing the analyzer details panel
     */
    onShowPanel: () => void;
  }) => {
    const dispatch = useDispatch();
    const scalingFactor = useSelector((state: State) =>
      selectors.scalingFactor(state.analyzer[id])
    );
    const { timestamp } = useContext(SideEffectContext);
    const [activePopover, setPopover] = useState<PopoverType>(null);
    const colorMap = useColors();

    const setActivePopover = useCallback(
      (value: PopoverType) => {
        if (value === activePopover) {
          setPopover(null);
        } else {
          setPopover(value);
        }
      },
      [setPopover, activePopover]
    );

    const closePopover = useCallback(() => setPopover(null), []);

    const handleZoomAmountChange = useCallback<NonNullable<EuiRangeProps['onChange']>>(
      (event) => {
        const valueAsNumber = parseFloat(
          (event as React.ChangeEvent<HTMLInputElement>).target.value
        );
        if (isNaN(valueAsNumber) === false) {
          dispatch(
            userSetZoomLevel({
              id,
              zoomLevel: valueAsNumber,
            })
          );
        }
      },
      [dispatch, id]
    );

    const handleCenterClick = useCallback(() => {
      dispatch(userSetPositionOfCamera({ id, cameraView: [0, 0] }));
    }, [dispatch, id]);

    const handleZoomOutClick = useCallback(() => {
      dispatch(userClickedZoomOut({ id }));
    }, [dispatch, id]);

    const handleZoomInClick = useCallback(() => {
      dispatch(userClickedZoomIn({ id }));
    }, [dispatch, id]);

    const [handleNorth, handleEast, handleSouth, handleWest] = useMemo(() => {
      const directionVectors: readonly Vector2[] = [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ];
      return directionVectors.map((direction) => {
        return () => {
          dispatch(userNudgedCamera({ id, direction, time: timestamp() }));
        };
      });
    }, [dispatch, timestamp, id]);

    /* eslint-disable react/button-has-type */
    return (
      <StyledGraphControls
        className={className}
        $iconColor={colorMap.graphControls}
        data-test-subj="resolver:graph-controls"
      >
        <StyledGraphControlsColumn>
          <SchemaInformation
            id={id}
            closePopover={closePopover}
            isOpen={activePopover === 'schemaInfo'}
            setActivePopover={setActivePopover}
          />
          <NodeLegend
            id={id}
            closePopover={closePopover}
            isOpen={activePopover === 'nodeLegend'}
            setActivePopover={setActivePopover}
          />
          <SourcererButton
            id={id}
            closePopover={closePopover}
            isOpen={activePopover === 'sourcererSelection'}
            setActivePopover={setActivePopover}
          />
          <DateSelectionButton
            id={id}
            closePopover={closePopover}
            isOpen={activePopover === 'datePicker'}
            setActivePopover={setActivePopover}
          />
          <ShowPanelButton onClick={onShowPanel} />
        </StyledGraphControlsColumn>
        <StyledGraphControlsColumn>
          <EuiPanel className="panning-controls" paddingSize="none" hasBorder>
            <div className="panning-controls-top">
              <button
                className="north-button"
                data-test-subj="resolver:graph-controls:north-button"
                title={i18n.translate('xpack.securitySolution.resolver.graphControls.north', {
                  defaultMessage: 'North',
                })}
                onClick={handleNorth}
              >
                <EuiIcon type="chevronSingleUp" aria-hidden={true} />
              </button>
            </div>
            <div className="panning-controls-middle">
              <button
                className="west-button"
                data-test-subj="resolver:graph-controls:west-button"
                title={i18n.translate('xpack.securitySolution.resolver.graphControls.west', {
                  defaultMessage: 'West',
                })}
                onClick={handleWest}
              >
                <EuiIcon type="chevronSingleLeft" aria-hidden={true} />
              </button>
              <button
                className="center-button"
                data-test-subj="resolver:graph-controls:center-button"
                title={i18n.translate('xpack.securitySolution.resolver.graphControls.center', {
                  defaultMessage: 'Center',
                })}
                onClick={handleCenterClick}
              >
                <EuiIcon type="bullseye" aria-hidden={true} />
              </button>
              <button
                className="east-button"
                data-test-subj="resolver:graph-controls:east-button"
                title={i18n.translate('xpack.securitySolution.resolver.graphControls.east', {
                  defaultMessage: 'East',
                })}
                onClick={handleEast}
              >
                <EuiIcon type="chevronSingleRight" aria-hidden={true} />
              </button>
            </div>
            <div className="panning-controls-bottom">
              <button
                className="south-button"
                data-test-subj="resolver:graph-controls:south-button"
                title={i18n.translate('xpack.securitySolution.resolver.graphControls.south', {
                  defaultMessage: 'South',
                })}
                onClick={handleSouth}
              >
                <EuiIcon type="chevronSingleDown" aria-hidden={true} />
              </button>
            </div>
          </EuiPanel>
          <EuiPanel className="zoom-controls" paddingSize="none" hasBorder>
            <button
              title={i18n.translate('xpack.securitySolution.resolver.graphControls.zoomIn', {
                defaultMessage: 'Zoom In',
              })}
              data-test-subj="resolver:graph-controls:zoom-in"
              onClick={handleZoomInClick}
            >
              <EuiIcon type="plusCircle" aria-hidden={true} />
            </button>
            <StyledEuiRange
              className="zoom-slider"
              data-test-subj="resolver:graph-controls:zoom-slider"
              min={0}
              max={1}
              step={0.01}
              value={scalingFactor}
              onChange={handleZoomAmountChange}
            />
            <button
              title={i18n.translate('xpack.securitySolution.resolver.graphControls.zoomOut', {
                defaultMessage: 'Zoom Out',
              })}
              data-test-subj="resolver:graph-controls:zoom-out"
              onClick={handleZoomOutClick}
            >
              <EuiIcon type="minusCircle" aria-hidden={true} />
            </button>
          </EuiPanel>
        </StyledGraphControlsColumn>
      </StyledGraphControls>
    );
  }
);

GraphControls.displayName = 'GraphControls';
