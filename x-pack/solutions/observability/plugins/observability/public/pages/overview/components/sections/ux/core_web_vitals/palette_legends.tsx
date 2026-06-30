/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  euiPaletteForStatus,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import styled from 'styled-components';
import { FormattedMessage } from '@kbn/i18n-react';
import { euiLightVars, euiDarkVars } from '@kbn/ui-theme';
import { useKibanaIsDarkMode } from '@kbn/react-kibana-context-theme';
import type { Thresholds } from './core_vital_item';
import { getCoreVitalTooltipMessage } from './core_vital_item';
import {
  LEGEND_NEEDS_IMPROVEMENT_LABEL,
  LEGEND_GOOD_LABEL,
  LEGEND_POOR_LABEL,
} from './translations';

const PaletteLegend = styled(EuiHealth)`
  &:hover {
    cursor: pointer;
    text-decoration: underline;
  }
`;

const StyledSpan = styled.span<{
  darkMode: boolean;
}>`
  &:hover {
    background-color: ${(props) =>
      props.darkMode ? euiDarkVars.euiColorLightestShade : euiLightVars.euiColorLightestShade};
  }
`;

interface Props {
  onItemHover: (ind: number | null) => void;
  ranks: number[];
  thresholds: Thresholds;
  title: string;
  isCls?: boolean;
}

export function PaletteLegends({ ranks, title, onItemHover, thresholds, isCls }: Props) {
  const darkMode = useKibanaIsDarkMode();
  const palette = euiPaletteForStatus(3);
  const labels = [LEGEND_GOOD_LABEL, LEGEND_NEEDS_IMPROVEMENT_LABEL, LEGEND_POOR_LABEL];

  return (
    <EuiFlexGroup responsive={false} gutterSize="s">
      {palette.map((color, ind) => (
        <EuiFlexItem
          key={ind}
          grow={false}
          onMouseEnter={() => {
            onItemHover(ind);
          }}
          onMouseLeave={() => {
            onItemHover(null);
          }}
        >
          <EuiToolTip
            content={getCoreVitalTooltipMessage(thresholds, ind, title, ranks[ind], isCls)}
            position="bottom"
          >
            <StyledSpan darkMode={darkMode} tabIndex={0}>
              <PaletteLegend color={color}>
                <EuiText size="xs" data-test-subj={`${labels[ind]}-${ranks?.[ind]}`}>
                  <FormattedMessage
                    id="xpack.observability.ux.coreVitals.paletteLegend.rankPercentage"
                    defaultMessage="{labelsInd} ({ranksInd}%)"
                    values={{
                      labelsInd: labels[ind],
                      ranksInd: ranks?.[ind],
                    }}
                  />
                </EuiText>
              </PaletteLegend>
            </StyledSpan>
          </EuiToolTip>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
}
