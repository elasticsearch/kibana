/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { CanvasTextUtils, useEuiTheme } from '@elastic/eui';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TabItem, TabsSizeConfig } from '../../types';

export const useTabLabelWidth = ({
  item,
  tabsSizeConfig,
  fontWeight,
}: {
  item: TabItem;
  tabsSizeConfig: TabsSizeConfig;
  fontWeight: CSSProperties['fontWeight'];
}) => {
  const { euiTheme } = useEuiTheme();
  const tabLabelRef = useRef<HTMLDivElement | null>(null);
  const [textUtils, setTextUtils] = useState<CanvasTextUtils>();

  const { tabLabelWidth, tabLabelTextWidth } = useMemo(() => {
    if (!textUtils) {
      return { tabLabelWidth: 0, tabLabelTextWidth: 0 };
    }

    textUtils.setTextToCheck(item.label);

    const textWidth = Math.ceil(textUtils.textWidth);
    const indicatorWidth = euiTheme.base * 1.25;
    const textWithIndicatorWidth = textWidth + indicatorWidth;
    const tabPaddingWidth = euiTheme.base;
    const maxLabelWidth = tabsSizeConfig.regularTabMaxWidth - tabPaddingWidth;
    const minLabelWidth = tabsSizeConfig.regularTabMinWidth - tabPaddingWidth;
    const resolvedLabelWidth = Math.max(
      Math.min(textWithIndicatorWidth, maxLabelWidth),
      minLabelWidth
    );

    return {
      tabLabelWidth: resolvedLabelWidth,
      tabLabelTextWidth: resolvedLabelWidth - indicatorWidth,
    };
  }, [
    euiTheme.base,
    item.label,
    tabsSizeConfig.regularTabMaxWidth,
    tabsSizeConfig.regularTabMinWidth,
    textUtils,
  ]);

  // Re-create the measurer whenever the rendered font weight changes so it reads the
  // container's current computed font (which mirrors the selected/unselected weight).
  useEffect(() => {
    if (!tabLabelRef.current) {
      return;
    }

    setTextUtils(new CanvasTextUtils({ container: tabLabelRef.current }));
  }, [fontWeight]);

  return { tabLabelRef, tabLabelWidth, tabLabelTextWidth };
};
