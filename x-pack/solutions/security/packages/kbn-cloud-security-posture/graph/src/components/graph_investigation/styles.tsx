/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import styled from '@emotion/styled';
import { euiCanAnimate, useEuiTheme } from '@elastic/eui';

export const useBorder = () => {
  const { euiTheme } = useEuiTheme();
  return `1px solid ${euiTheme.colors.borderBasePlain}`;
};

export const AnimatedSearchBarContainer = styled.div`
  display: grid;
  grid-template-rows: 1fr;
  /**
   * Constrain the implicit grid column to the parent width. Grid items default to
   * \`min-width: auto\` (min-content), so a single long filter chip would otherwise force
   * the cell — and the SearchBar inside it — to grow past the panel, pushing the date
   * pickers, time-range selector and refresh button out of the viewport. \`minmax(0, 1fr)\`
   * gives the column a finite width so EUI's \`whiteSpace: normal\` on \`.globalFilterItem\`
   * can wrap long chip values onto multiple lines (matching Timeline's behavior).
   */
  grid-template-columns: minmax(0, 1fr);
  border-top: ${() => useBorder()};
  padding: 16px 8px;

  &.toggled-off {
    padding: 0;
    border-top: none;
    transform: translateY(-100%);
    grid-template-rows: 0fr;
  }

  ${euiCanAnimate} {
    ${() => {
      const { euiTheme } = useEuiTheme();
      return `transition: transform ${euiTheme.animation.normal} ease,
      grid-template-rows ${euiTheme.animation.normal} ease;
    `;
    }}
  }

  & > div {
    padding: 0;

    ${euiCanAnimate} {
      ${() => {
        const { euiTheme } = useEuiTheme();
        return `transition: padding ${euiTheme.animation.normal} ease;`;
      }}
    }
  }

  /* Clip the inner div only while toggled-off (the collapse animation needs
     it). In the expanded state we must NOT clip, so the upstream KQL
     textarea overlay design works: the textarea wrap is z-indexed above
     siblings and has overflow: visible !important, so a long query grows
     beyond the search bar row and overlays the content below it without
     pushing the row's controls — same behavior as the Alerts page. */
  &.toggled-off > div {
    overflow: hidden;
    padding: 0;
  }
`;
