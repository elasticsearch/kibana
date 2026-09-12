/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useMemo } from 'react';

import { EuiButtonGroup } from '@elastic/eui';
import type { EuiButtonGroupOptionProps, UseEuiTheme, IconType } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import { EuiIconLegend } from '@kbn/chart-icons';

import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import type { VisualizationToolbarProps } from '@kbn/lens-common';
import { FlyoutContainer } from './flyout_container';
import { usePanelSettingsToolbarAction } from './panel_settings_toolbar_context';

type ContentOptions = 'legend' | 'style' | 'filters';
type Options = ContentOptions | 'panelSettings';

type ToolbarOption = EuiButtonGroupOptionProps & { id: Options; label: string };
const baseToolbarOptions: Array<EuiButtonGroupOptionProps & { id: ContentOptions; label: string }> = [
  {
    id: 'legend',
    label: i18n.translate('xpack.lens.flyoutToolbar.legend.title', {
      defaultMessage: 'Legend',
    }),
    iconType: EuiIconLegend as IconType,
    toolTipContent: i18n.translate('xpack.lens.flyoutToolbar.legend.tooltip', {
      defaultMessage: 'Legend',
    }),
  },
  {
    id: 'style',
    label: i18n.translate('xpack.lens.flyoutToolbar.style.title', {
      defaultMessage: 'Style',
    }),
    iconType: 'brush',
    toolTipContent: i18n.translate('xpack.lens.flyoutToolbar.style.tooltip', {
      defaultMessage: 'Style',
    }),
  },
  // {
  //   id: 'filters',
  //   label: i18n.translate('xpack.lens.flyoutToolbar.filtersTitle', {
  //     defaultMessage: 'Filters',
  //   }),
  //   iconType: 'filter',
  //   toolTipContent: i18n.translate('xpack.lens.flyoutToolbar.filtersOptionTooltip', {
  //     defaultMessage: 'Filters',
  //   }),
  // },
];

export interface ToolbarContentMap<S> {
  style?: React.ComponentType<VisualizationToolbarProps<S>>;
  legend?: React.ComponentType<VisualizationToolbarProps<S>>;
  filters?: React.ComponentType<VisualizationToolbarProps<S>>;
}

export function FlyoutToolbar<S>({
  contentMap,
  isInlineEditing = false,
  ...flyoutContentProps
}: VisualizationToolbarProps<S> & {
  contentMap: ToolbarContentMap<S>;
  isInlineEditing: boolean;
}) {
  const [isFlyoutVisible, setFlyoutVisible] = useState(false);
  const [idSelected, setIdSelected] = useState<Options | ''>('');
  const panelSettingsAction = usePanelSettingsToolbarAction();

  // Filter out toolbar options that don't have corresponding content components
  const toolbarOptions = useMemo(() => {
    const options: ToolbarOption[] = baseToolbarOptions.filter((option) => !!contentMap[option.id]);
    if (panelSettingsAction) {
      options.push({
        id: 'panelSettings',
        label: panelSettingsAction.label,
        iconType: 'gear',
        toolTipContent: panelSettingsAction.label,
      });
    }
    return options;
  }, [contentMap, panelSettingsAction]);

  const flyoutToolbarStyles = useMemoCss(styles);

  const flyoutTitle = idSelected
    ? toolbarOptions.find((toolbarOption) => toolbarOption.id === idSelected)?.label || ''
    : '';

  const handleOptionChange = (id: string) => {
    if (id === 'panelSettings') {
      panelSettingsAction?.onOpen();
      return;
    }
    setIdSelected(id as Options);
    setFlyoutVisible(true);
  };

  const FlyoutContent = idSelected && idSelected !== 'panelSettings' ? contentMap[idSelected] : null;

  if (toolbarOptions.length === 0) {
    return null;
  }

  return (
    <div
      css={css`
        // NOTE: Override euiAccordion styles added in LensConfigurationFlyout
        .euiAccordion {
          display: block;
        }
      `}
    >
      <EuiButtonGroup
        legend={i18n.translate('xpack.lens.flyoutToolbar.buttonGroup.legend', {
          defaultMessage: 'Toolbar options',
        })}
        options={toolbarOptions}
        onChange={handleOptionChange}
        idSelected={idSelected}
        isIconOnly
      />
      <FlyoutContainer
        isFullscreen={false}
        label={flyoutTitle}
        isInlineEditing={isInlineEditing}
        isOpen={isFlyoutVisible}
        handleClose={() => {
          setIdSelected('');
          setFlyoutVisible(false);
        }}
        overrideContainerCss={flyoutToolbarStyles.dialog}
      >
        {FlyoutContent ? (
          <div id={idSelected} css={flyoutToolbarStyles.flyoutContent}>
            <FlyoutContent {...flyoutContentProps} />
          </div>
        ) : null}
      </FlyoutContainer>
    </div>
  );
}

const styles = {
  dialog: ({ euiTheme }: UseEuiTheme) =>
    css`
      z-index: ${euiTheme.levels.menu};
    `,
  flyoutContent: ({ euiTheme }: UseEuiTheme) =>
    css({
      padding: euiTheme.size.base,
      height: '100%',
    }),
};
