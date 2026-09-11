/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonIcon,
  EuiPopover,
  EuiIcon,
  EuiContextMenu,
  EuiContextMenuItem,
  EuiText,
  EuiFlexItem,
  EuiFlexGroup,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type { EventAnnotationServiceType } from '@kbn/event-annotation-plugin/public';
import { css } from '@emotion/react';
import type { AddLayerFunction, VisualizationLayerDescription } from '@kbn/lens-common';
import { LoadAnnotationLibraryFlyout } from './load_annotation_library_flyout';
import type { ExtraAppendLayerArg } from './visualization';
import type { SeriesType, XYVisualizationState } from './types';
import { visualizationTypes } from './types';
import { isHorizontalChart, isHorizontalSeries, isPercentageSeries } from './state_helpers';
import { getDataLayers } from './visualization_helpers';
import { ExperimentalBadge } from '../../shared_components';

export interface AddLayerButtonProps {
  state: XYVisualizationState;
  supportedLayers: VisualizationLayerDescription[];
  addLayer: AddLayerFunction<ExtraAppendLayerArg>;
  eventAnnotationService: EventAnnotationServiceType;
  isInlineEditing?: boolean;
  /** Hides the annotation library option (ES|QL charts do not support data-view-based library groups) */
  hideAnnotationLibrary?: boolean;
}

export enum AddLayerPanelType {
  main = 'main',
  selectAnnotationMethod = 'selectAnnotationMethod',
  compatibleVisualizationTypes = 'compatibleVisualizationTypes',
}

export function AddLayerButton({
  state,
  supportedLayers,
  addLayer,
  eventAnnotationService,
  isInlineEditing,
  hideAnnotationLibrary,
}: AddLayerButtonProps) {
  const [showLayersChoice, toggleLayersChoice] = useState(false);

  const [isLoadLibraryVisible, setLoadLibraryFlyoutVisible] = useState(false);

  const annotationPanel = ({
    type,
    label,
    icon,
    disabled,
    toolTipContent,
  }: (typeof supportedLayers)[0]) => {
    return {
      // without the library option there is no annotation method to choose from,
      // so add a new annotation layer directly
      ...(hideAnnotationLibrary
        ? {
            onClick: () => {
              addLayer(LayerTypes.ANNOTATIONS);
              toggleLayersChoice(false);
            },
          }
        : { panel: AddLayerPanelType.selectAnnotationMethod }),
      toolTipContent,
      disabled,
      name: (
        <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
          <EuiFlexItem grow={true}>{label}</EuiFlexItem>
          <EuiFlexItem grow={false}>
            <ExperimentalBadge color={disabled ? 'subdued' : undefined} size="m" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
      icon: icon && <EuiIcon size="m" type={icon} aria-hidden={true} />,
      ['data-test-subj']: `lnsLayerAddButton-${type}`,
    };
  };

  const dataPanel = ({
    type,
    label,
    icon,
    disabled,
    toolTipContent,
  }: (typeof supportedLayers)[0]) => {
    return {
      panel: AddLayerPanelType.compatibleVisualizationTypes,
      toolTipContent,
      disabled,
      name: label,
      icon: icon && <EuiIcon size="m" type={icon} aria-hidden={true} />,
      ['data-test-subj']: `lnsLayerAddButton-${type}`,
    };
  };

  const horizontalOnly = isHorizontalChart(state.layers);

  const availableVisTypes = visualizationTypes.filter(
    (t) => isHorizontalSeries(t.id as SeriesType) === horizontalOnly
  );

  const currentLayerTypeIndex =
    availableVisTypes.findIndex((t) => t.id === getDataLayers(state.layers)?.[0]?.seriesType) || 0;

  const firstLayerSubtype = getDataLayers(state.layers)?.[0]?.seriesType;

  const buttonLabel = i18n.translate('xpack.lens.configPanel.addLayerButton', {
    defaultMessage: 'Add layer',
  });

  return (
    <div
      css={css`
        display: flex;
        align-items: center;
      `}
      key="lsnLayerAdd"
    >
      <EuiPopover
        aria-label={buttonLabel}
        data-test-subj="lnsConfigPanel__addLayerPopover"
        button={
          <EuiToolTip content={buttonLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              data-test-subj="lnsLayerAddButton"
              aria-label={buttonLabel}
              size="s"
              onClick={() => toggleLayersChoice(!showLayersChoice)}
              iconType="plus"
              color="text"
              display="base"
            />
          </EuiToolTip>
        }
        isOpen={showLayersChoice}
        closePopover={() => toggleLayersChoice(false)}
        panelPaddingSize="none"
      >
        <EuiContextMenu
          initialPanelId={AddLayerPanelType.main}
          panels={[
            {
              id: AddLayerPanelType.main,
              title: i18n.translate('xpack.lens.configPanel.selectLayerType', {
                defaultMessage: 'Select layer type',
              }),
              width: 300,
              items: supportedLayers.map((props) => {
                const { type, label, icon, disabled, toolTipContent } = props;
                if (type === LayerTypes.ANNOTATIONS) {
                  return annotationPanel(props);
                } else if (type === LayerTypes.DATA) {
                  if (horizontalOnly) {
                    return {
                      toolTipContent,
                      disabled,
                      name: label,
                      icon: icon && <EuiIcon size="m" type={icon} aria-hidden={true} />,
                      ['data-test-subj']: `lnsLayerAddButton-${type}`,
                      onClick: () => {
                        addLayer(type);
                        toggleLayersChoice(false);
                      },
                    };
                  }
                  return dataPanel(props);
                }
                return {
                  toolTipContent,
                  disabled,
                  name: label,
                  icon: icon && <EuiIcon size="m" type={icon} aria-hidden={true} />,
                  ['data-test-subj']: `lnsLayerAddButton-${type}`,
                  onClick: () => {
                    addLayer(type);
                    toggleLayersChoice(false);
                  },
                };
              }),
            },
            {
              id: AddLayerPanelType.selectAnnotationMethod,
              initialFocusedItemIndex: 0,
              title: i18n.translate('xpack.lens.configPanel.selectAnnotationMethod', {
                defaultMessage: 'Select annotation method',
              }),
              items: [
                {
                  name: i18n.translate('xpack.lens.configPanel.newAnnotation', {
                    defaultMessage: 'New annotation',
                  }),
                  icon: 'plusCircle',
                  onClick: () => {
                    addLayer(LayerTypes.ANNOTATIONS);
                    toggleLayersChoice(false);
                  },
                  'data-test-subj': 'lnsAnnotationLayer_new',
                },
                {
                  name: i18n.translate('xpack.lens.configPanel.loadFromLibrary', {
                    defaultMessage: 'Load from library',
                  }),
                  icon: 'folderOpen',
                  onClick: () => {
                    setLoadLibraryFlyoutVisible(true);
                    toggleLayersChoice(false);
                  },
                  'data-test-subj': 'lnsAnnotationLayer_addFromLibrary',
                },
              ],
            },
            {
              id: AddLayerPanelType.compatibleVisualizationTypes,
              initialFocusedItemIndex: currentLayerTypeIndex,
              title: i18n.translate('xpack.lens.layerPanel.compatibleVisualizationTypes', {
                defaultMessage: 'Compatible visualization types',
              }),
              width: 340,
              items: availableVisTypes.map((t) => {
                const canInitializeWithSubtype =
                  t.subtypes?.includes(firstLayerSubtype) && !isPercentageSeries(firstLayerSubtype);

                return {
                  renderItem: () => (
                    <EuiContextMenuItem
                      icon={<EuiIcon type={t.icon} aria-hidden={true} />}
                      data-test-subj={`lnsXY_seriesType-${t.id}`}
                      onClick={() => {
                        addLayer(
                          LayerTypes.DATA,
                          undefined,
                          undefined,
                          canInitializeWithSubtype
                            ? firstLayerSubtype
                            : (t.subtypes?.[0] as SeriesType)
                        );
                        toggleLayersChoice(false);
                      }}
                    >
                      <EuiText size="s" data-test-subj="lnsChartSwitch-option-label">
                        {t.label}
                      </EuiText>
                      <EuiText size="xs" color="subdued">
                        {t.description}
                      </EuiText>
                    </EuiContextMenuItem>
                  ),
                };
              }),
            },
          ]}
        />
      </EuiPopover>
      {isLoadLibraryVisible && (
        <LoadAnnotationLibraryFlyout
          isLoadLibraryVisible={isLoadLibraryVisible}
          setLoadLibraryFlyoutVisible={setLoadLibraryFlyoutVisible}
          eventAnnotationService={eventAnnotationService}
          isInlineEditing={isInlineEditing}
          addLayer={(extraArg) => {
            addLayer(LayerTypes.ANNOTATIONS, extraArg);
          }}
        />
      )}
    </div>
  );
}
