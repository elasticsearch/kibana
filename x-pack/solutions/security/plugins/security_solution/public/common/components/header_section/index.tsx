/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiTitleSize } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import React, { useCallback } from 'react';
import { css } from '@emotion/react';

import classnames from 'classnames';
import { InspectButton } from '../inspect';

import { Subtitle } from '../subtitle';
import * as i18n from '../../containers/query_toggle/translations';

const useStyles = (border?: boolean, height?: number) => {
  const { euiTheme } = useEuiTheme();

  return {
    header: css`
      margin-bottom: 0;
      user-select: text;
      ${height ? `height: ${height}px;` : ''}
      ${border ? `border-bottom: ${euiTheme.border.thin}; padding-bottom: ${euiTheme.size.l};` : ''}

      &.toggle-expand {
        margin-bottom: ${euiTheme.size.l};
      }

      .no-margin {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }
    `,
  };
};

export interface HeaderSectionProps {
  alignHeader?: 'center' | 'baseline' | 'stretch' | 'flexStart' | 'flexEnd';
  children?: React.ReactNode;
  outerDirection?: 'row' | 'rowReverse' | 'column' | 'columnReverse' | undefined;
  growLeftSplit?: boolean;
  headerFilters?: string | React.ReactNode;
  border?: boolean;
  height?: number;
  hideSubtitle?: boolean;
  id?: string;
  inspectMultiple?: boolean;
  isInspectDisabled?: boolean;
  showInspectButton?: boolean;
  split?: boolean;
  stackHeader?: boolean;
  subtitle?: string | React.ReactNode;
  toggleQuery?: (status: boolean) => void;
  toggleStatus?: boolean;
  title: string | React.ReactNode;
  inspectTitle?: React.ReactNode;
  titleSize?: EuiTitleSize;
  tooltip?: string;
  tooltipTitle?: string;
  toggleAriaLabel?: string;
}

export const getHeaderAlignment = ({
  alignHeader,
  stackHeader,
}: {
  alignHeader?: 'center' | 'baseline' | 'stretch' | 'flexStart' | 'flexEnd';
  stackHeader?: boolean;
}) => {
  if (alignHeader != null) {
    return alignHeader;
  } else if (stackHeader) {
    return undefined;
  } else {
    return 'center';
  }
};

const tooltipIconProps = {
  'data-test-subj': 'header-section-tooltip-icon',
};

const HeaderSectionComponent: React.FC<HeaderSectionProps> = ({
  alignHeader,
  border,
  children,
  outerDirection = 'column',
  growLeftSplit = true,
  headerFilters,
  height,
  hideSubtitle = false,
  id,
  inspectMultiple = false,
  inspectTitle,
  isInspectDisabled,
  showInspectButton = true,
  split,
  stackHeader,
  subtitle,
  title,
  titleSize = 'l',
  toggleQuery,
  toggleStatus = true,
  tooltip,
  tooltipTitle,
  toggleAriaLabel,
}) => {
  const styles = useStyles(border, height);
  const toggle = useCallback(() => {
    if (toggleQuery) {
      toggleQuery(!toggleStatus);
    }
  }, [toggleQuery, toggleStatus]);

  const classNames = classnames({
    'toggle-expand': toggleStatus,
    siemHeaderSection: true,
  });

  return (
    <header css={styles.header} data-test-subj="header-section" className={classNames}>
      <EuiFlexGroup
        data-test-subj="headerSectionOuterFlexGroup"
        direction={outerDirection}
        gutterSize="xs"
        responsive={false}
      >
        <EuiFlexItem grow={growLeftSplit}>
          <EuiFlexGroup
            alignItems={getHeaderAlignment({ alignHeader, stackHeader })}
            data-test-subj="headerSectionInnerFlexGroup"
            direction={stackHeader ? 'column' : 'row'}
            gutterSize="s"
          >
            <EuiFlexItem grow={growLeftSplit} className={toggleStatus ? '' : 'no-margin'}>
              <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
                <EuiFlexItem>
                  <EuiFlexGroup
                    responsive={false}
                    gutterSize={'none'}
                    className="header-section-titles"
                  >
                    {toggleQuery && (
                      <EuiFlexItem grow={false}>
                        <EuiToolTip
                          content={i18n.QUERY_BUTTON_TITLE(toggleStatus)}
                          disableScreenReaderOutput
                        >
                          <EuiButtonIcon
                            data-test-subj="query-toggle-header"
                            aria-label={[toggleAriaLabel, i18n.QUERY_BUTTON_TITLE(toggleStatus)]
                              .filter(Boolean) // remove undefined, empty string, null
                              .join(' ')}
                            color="text"
                            display="empty"
                            iconType={toggleStatus ? 'chevronSingleDown' : 'chevronSingleRight'}
                            onClick={toggle}
                            size="s"
                          />
                        </EuiToolTip>
                      </EuiFlexItem>
                    )}
                    <EuiFlexItem>
                      <EuiTitle size={titleSize}>
                        <h2 data-test-subj="header-section-title">
                          <span className="eui-textBreakNormal">{title}</span>
                          {tooltip && (
                            <>
                              <EuiIconTip
                                color="subdued"
                                title={tooltipTitle}
                                content={tooltip}
                                iconProps={tooltipIconProps}
                                size="l"
                                type="info"
                              />
                            </>
                          )}
                        </h2>
                      </EuiTitle>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>

                {id && toggleStatus && (
                  <EuiFlexItem grow={false}>
                    <InspectButton
                      isDisabled={isInspectDisabled}
                      queryId={id}
                      multiple={inspectMultiple}
                      showInspectButton={showInspectButton}
                      title={inspectTitle ?? title}
                    />
                  </EuiFlexItem>
                )}

                {headerFilters && toggleStatus && (
                  <EuiFlexItem data-test-subj="header-section-filters" grow={false}>
                    {headerFilters}
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>

            {children && toggleStatus && (
              <EuiFlexItem data-test-subj="header-section-supplements" grow={split ? true : false}>
                {children}
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
        {!hideSubtitle && toggleStatus && (
          <EuiFlexItem>
            <Subtitle data-test-subj="header-section-subtitle" items={subtitle} />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </header>
  );
};

export const HeaderSection = React.memo(HeaderSectionComponent);
