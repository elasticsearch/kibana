/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type ReactNode, useMemo } from 'react';
import {
  EuiScreenReaderOnly,
  euiShadow,
  EuiSplitPanel,
  useEuiTheme,
  useGeneratedHtmlId,
  type UseEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { layoutVar, SIDE_PANEL_CONTENT_GAP } from '@kbn/ui-chrome-layout-constants';

import type { MenuItem } from '../../../types';
import { SIDE_PANEL_WIDTH } from '../../hooks/use_layout_width';
import { getFocusableElements } from '../../utils/get_focusable_elements';
import { handleRovingIndex } from '../../utils/handle_roving_index';
import { updateTabIndices } from '../../utils/update_tab_indices';
import { useScroll } from '../../hooks/use_scroll';
import { NAVIGATION_SELECTOR_PREFIX } from '../../constants';
import { getHighContrastBorder } from '../../hooks/use_high_contrast_mode_styles';

const getSidePanelWrapperStyles = (euiThemeContext: UseEuiTheme) => css`
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  width: ${SIDE_PANEL_WIDTH - SIDE_PANEL_CONTENT_GAP}px;
  margin-top: ${layoutVar('application.marginTop', '0px')};
  margin-bottom: ${layoutVar('application.marginBottom', '0px')};
  background-color: ${euiThemeContext.euiTheme.colors.backgroundBasePlain};
  border-radius: ${euiThemeContext.euiTheme.border.radius.medium};

  // use outline for consistency with the application layout style
  outline: ${getHighContrastBorder(euiThemeContext)};

  ${euiShadow(euiThemeContext, 'xs', { border: 'none' })};
`;

export interface SidePanelIds {
  secondaryNavigationInstructionsId: string;
}

export type SidePanelChildren = ReactNode | ((ids: SidePanelIds) => ReactNode);

export interface SidePanelProps {
  children: SidePanelChildren;
  footer?: ReactNode;
  openerNode: MenuItem;
}

/**
 * Side navigation panel that opens on mouse click if the primary menu item contains a submenu.
 * Shows only in expanded mode.
 */
export const SidePanel = ({ children, footer, openerNode }: SidePanelProps): JSX.Element => {
  const euiThemeContext = useEuiTheme();
  const scrollStyles = useScroll();
  const wrapperStyles = useMemo(
    () => getSidePanelWrapperStyles(euiThemeContext),
    [euiThemeContext]
  );
  const secondaryNavigationInstructionsId = useGeneratedHtmlId({
    prefix: 'secondary-navigation-instructions',
  });

  const panelRef = (ref: HTMLDivElement) => {
    if (ref) {
      const elements = getFocusableElements(ref);
      updateTabIndices(elements);
    }
  };

  const navigationPanelStyles = useMemo(
    () => css`
      ${scrollStyles}
    `,
    [scrollStyles]
  );

  const sidePanelClassName = `${NAVIGATION_SELECTOR_PREFIX}-sidePanel`;

  const renderChildren = () => {
    if (typeof children === 'function') {
      return children({ secondaryNavigationInstructionsId });
    }
    return children;
  };

  return (
    <>
      <EuiScreenReaderOnly>
        <p id={secondaryNavigationInstructionsId}>
          {i18n.translate('kbnUI.sideNavigation.sidePanelInstructions', {
            defaultMessage:
              'You are in the {label} secondary menu side panel. Use Up and Down arrow keys to navigate the menu.',
            values: {
              label: openerNode.secondaryMenuTitle ?? openerNode.label,
            },
          })}
        </p>
      </EuiScreenReaderOnly>
      <EuiSplitPanel.Outer
        aria-label={i18n.translate('kbnUI.sideNavigation.sidePanelAriaLabel', {
          defaultMessage: `Side panel for {label}`,
          values: {
            label: openerNode.secondaryMenuTitle ?? openerNode.label,
          },
        })}
        aria-describedby={secondaryNavigationInstructionsId}
        borderRadius="none"
        className={sidePanelClassName} // Used in Storybook to limit the height of the panel
        css={wrapperStyles}
        data-test-subj={`${sidePanelClassName} ${sidePanelClassName}_${openerNode.id}`}
        hasShadow={false}
        role="region"
        color="transparent"
      >
        <EuiSplitPanel.Inner
          color="transparent"
          css={navigationPanelStyles}
          data-test-subj={`${NAVIGATION_SELECTOR_PREFIX}-panelContent`}
          onKeyDown={handleRovingIndex}
          panelRef={panelRef}
          paddingSize="none"
        >
          {renderChildren()}
        </EuiSplitPanel.Inner>
        <EuiSplitPanel.Inner
          color="transparent"
          data-test-subj={`${NAVIGATION_SELECTOR_PREFIX}-panelFooter`}
          paddingSize="none"
          grow={false}
        >
          {footer}
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>
    </>
  );
};
