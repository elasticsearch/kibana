/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { EuiButtonGroup, EuiFormRow, htmlIdGenerator } from '@elastic/eui';
import type { CustomPaletteParams, PaletteOutput, PaletteRegistry } from '@kbn/coloring';
import { CustomizablePalette, applyPaletteParams } from '@kbn/coloring';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { ColorMode } from '@kbn/charts-plugin/common';
import { css } from '@emotion/react';
import type { LegacyMetricState, VisualizationDimensionEditorProps } from '@kbn/lens-common';
import { getLegacyMetricDataBounds } from '@kbn/expression-legacy-metric-vis-plugin/public';
import { isNumericFieldForDatatable } from '../../../common/expressions/impl/datatable/utils';
import { PalettePanelContainer } from '../../shared_components';
import { defaultPaletteParams } from './palette_config';

const idPrefix = htmlIdGenerator()();

export function MetricDimensionEditor(
  props: VisualizationDimensionEditorProps<LegacyMetricState> & {
    paletteService: PaletteRegistry;
  }
) {
  const { state, setState, frame, accessor, isInlineEditing } = props;

  const currentData = frame.activeData?.[state.layerId];
  const [firstRow] = currentData?.rows || [];

  if (accessor == null || firstRow == null || !isNumericFieldForDatatable(currentData, accessor)) {
    return null;
  }
  const currentColorMode = state?.colorMode || ColorMode.None;
  const hasDynamicColoring = currentColorMode !== ColorMode.None;

  const currentMinMax = getLegacyMetricDataBounds(accessor, currentData);

  const activePalette =
    state?.palette ||
    ({
      type: 'palette',
      name: defaultPaletteParams.name,
      params: {
        ...defaultPaletteParams,
        stops: undefined,
        colorStops: undefined,
      },
    } satisfies PaletteOutput<CustomPaletteParams>);

  const stops = applyPaletteParams(props.paletteService, activePalette, currentMinMax);

  return (
    <div className="lnsIndexPatternDimensionEditor--padded">
      <EuiFormRow
        display="columnCompressed"
        fullWidth
        label={i18n.translate('xpack.lens.legacyMetric.dynamicColoring.label', {
          defaultMessage: 'Color by value',
        })}
      >
        <EuiButtonGroup
          isFullWidth
          legend={i18n.translate('xpack.lens.legacyMetric.dynamicColoring.label', {
            defaultMessage: 'Color by value',
          })}
          data-test-subj="lnsLegacyMetric_dynamicColoring_groups"
          buttonSize="compressed"
          options={[
            {
              id: `${idPrefix}None`,
              label: i18n.translate('xpack.lens.legacyMetric.dynamicColoring.none', {
                defaultMessage: 'None',
              }),
              'data-test-subj': 'lnsLegacyMetric_dynamicColoring_groups_none',
            },
            {
              id: `${idPrefix}Background`,
              label: i18n.translate('xpack.lens.legacyMetric.dynamicColoring.background', {
                defaultMessage: 'Fill',
              }),
              'data-test-subj': 'lnsLegacyMetric_dynamicColoring_groups_background',
            },
            {
              id: `${idPrefix}Labels`,
              label: i18n.translate('xpack.lens.legacyMetric.dynamicColoring.text', {
                defaultMessage: 'Text',
              }),
              'data-test-subj': 'lnsLegacyMetric_dynamicColoring_groups_labels',
            },
          ]}
          idSelected={`${idPrefix}${currentColorMode}`}
          onChange={(id) => {
            const newMode = id.replace(idPrefix, '') as ColorMode;
            const params: Partial<LegacyMetricState> = {
              colorMode: newMode,
            };
            if (!state?.palette && newMode !== ColorMode.None) {
              params.palette = {
                ...activePalette,
                params: {
                  ...activePalette.params,
                  stops,
                },
              };
            }
            // clear up when switching to no coloring
            if (state?.palette && newMode === ColorMode.None) {
              params.palette = undefined;
            }
            setState({
              ...state,
              ...params,
            });
          }}
        />
      </EuiFormRow>
      {hasDynamicColoring && (
        <EuiFormRow
          display="columnCompressed"
          fullWidth
          label={i18n.translate('xpack.lens.paletteMetricGradient.label', {
            defaultMessage: 'Color mapping',
          })}
          css={css`
            align-items: center;
          `}
        >
          <PalettePanelContainer
            palette={stops.map(({ color }) => color)}
            siblingRef={props.panelRef}
            isInlineEditing={isInlineEditing}
            title={i18n.translate('xpack.lens.paletteMetricGradient.label', {
              defaultMessage: 'Color mapping',
            })}
          >
            <CustomizablePalette
              palettes={props.paletteService}
              activePalette={activePalette}
              dataBounds={currentMinMax}
              setPalette={(newPalette) => {
                setState({
                  ...state,
                  palette: newPalette,
                });
              }}
              showRangeTypeSelector={false}
            />
          </PalettePanelContainer>
        </EuiFormRow>
      )}
    </div>
  );
}
