/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React, { useMemo, useState, useCallback } from 'react';
import type { EuiPanelProps, IconType } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiSplitPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiIcon,
  EuiLink,
  EuiTitle,
  EuiText,
  useEuiTheme,
  EuiToolTip,
  EuiSkeletonText,
  useEuiFontSize,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';

export interface ExpandablePanelPanelProps {
  header: {
    /**
     * String value of the title to be displayed in the header of panel
     */
    title: string | React.ReactNode;
    link?: {
      /**
       * Callback function to be called when the title is clicked
       */
      callback?: () => void;
      /**
       * Tooltip text to be displayed around the title link
       */
      tooltip: React.ReactNode;
    };
    /**
     * Icon string for displaying the specified icon in the header
     */
    iconType?: IconType;
    /**
     * Optional content and actions to be displayed next to header or on the right side of header
     */
    headerContent?: React.ReactNode;
  };
  content?: {
    /**
     * Renders a loading spinner if true
     */
    loading?: boolean;
    /**
     * Returns a null component if true
     */
    error?: boolean;
    /**
     * Content's padding size
     */
    paddingSize?: EuiPanelProps['paddingSize'];
  };
  expand?: {
    /**
     * Boolean to determine the panel to be collapsable (with toggle)
     */
    expandable?: boolean;
    /**
     * Boolean to allow the component to be expanded or collapsed on first render
     */
    expandedOnFirstRender?: boolean;
  };
  /**
  Data test subject string for testing
  */
  ['data-test-subj']?: string;
}

/**
 * Wrapper component that is composed of a header section and a content section.
 * The header can display an icon, a title (that can be a link), and an optional content section on the right.
 * The content section can display a loading spinner, an error message, or any other content.
 * The component can be expanded or collapsed by clicking on the chevron icon on the left of the title.
 */
export const ExpandablePanel: FC<PropsWithChildren<ExpandablePanelPanelProps>> = ({
  header: { title, link, iconType, headerContent },
  content: { loading, error, paddingSize: contentPaddingSize } = {
    loading: false,
    error: false,
    paddingSize: 'm',
  },
  expand: { expandable, expandedOnFirstRender } = {
    expandable: false,
    expandedOnFirstRender: false,
  },
  'data-test-subj': dataTestSubj,
  children,
}) => {
  const [toggleStatus, setToggleStatus] = useState(expandedOnFirstRender);
  const toggleQuery = useCallback(() => {
    setToggleStatus(!toggleStatus);
  }, [setToggleStatus, toggleStatus]);

  const toggleIcon = useMemo(
    () => (
      <EuiToolTip
        content={i18n.translate(
          'xpack.securitySolution.flyout.shared.ExpandablePanelButtonIconAriaLabel',
          {
            defaultMessage: 'Expandable panel toggle',
          }
        )}
        disableScreenReaderOutput
      >
        <EuiButtonIcon
          data-test-subj={`${dataTestSubj}ToggleIcon`}
          aria-label={i18n.translate(
            'xpack.securitySolution.flyout.shared.ExpandablePanelButtonIconAriaLabel',
            {
              defaultMessage: 'Expandable panel toggle',
            }
          )}
          color="text"
          display="empty"
          iconType={toggleStatus ? 'chevronSingleDown' : 'chevronSingleRight'}
          onClick={toggleQuery}
          size="xs"
        />
      </EuiToolTip>
    ),
    [dataTestSubj, toggleStatus, toggleQuery]
  );

  const { euiTheme } = useEuiTheme();
  const xsFontSize = useEuiFontSize('xs').fontSize;

  const headerLeftSection = useMemo(
    () => (
      <EuiFlexItem
        grow={false}
        css={css`
          min-height: ${euiTheme.size.xl};
        `}
      >
        <EuiFlexGroup
          alignItems="center"
          gutterSize="s"
          responsive={false}
          data-test-subj={`${dataTestSubj}LeftSection`}
        >
          <EuiFlexItem grow={false}>{expandable && children && toggleIcon}</EuiFlexItem>
          {iconType && (
            <EuiFlexItem grow={false}>
              <EuiIcon
                color={link?.callback ? 'primary' : 'text'}
                type={iconType}
                css={css`
                  margin: ${euiTheme.size.s} 0;
                `}
                data-test-subj={`${dataTestSubj}TitleIcon`}
                aria-hidden={true}
              />
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            {link?.callback ? (
              <EuiToolTip content={link?.tooltip}>
                <EuiLink
                  css={css`
                    font-size: ${xsFontSize};
                    font-weight: ${euiTheme.font.weight.bold};
                  `}
                  data-test-subj={`${dataTestSubj}TitleLink`}
                  onClick={link?.callback}
                >
                  {title}
                </EuiLink>
              </EuiToolTip>
            ) : (
              <EuiTitle size="xxxs">
                <EuiText data-test-subj={`${dataTestSubj}TitleText`}>{title}</EuiText>
              </EuiTitle>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    ),
    [
      euiTheme.size.xl,
      euiTheme.size.s,
      euiTheme.font.weight.bold,
      dataTestSubj,
      expandable,
      children,
      toggleIcon,
      iconType,
      link?.callback,
      link?.tooltip,
      xsFontSize,
      title,
    ]
  );

  const headerRightSection = useMemo(
    () =>
      headerContent && (
        <EuiFlexItem
          grow={false}
          css={css`
            margin-right: ${euiTheme.size.m};
          `}
          data-test-subj={`${dataTestSubj}RightSection`}
        >
          {headerContent}
        </EuiFlexItem>
      ),
    [dataTestSubj, euiTheme.size.m, headerContent]
  );

  const showContent = useMemo(() => {
    if (!children) {
      return false;
    }
    return !expandable || (expandable && toggleStatus);
  }, [children, expandable, toggleStatus]);

  const content = loading ? (
    <EuiSkeletonText
      data-test-subj={`${dataTestSubj}Loading`}
      contentAriaLabel={i18n.translate(
        'xpack.securitySolution.flyout.shared.expandablePanelLoadingAriaLabel',
        { defaultMessage: 'expandable panel' }
      )}
    />
  ) : error ? null : (
    children
  );

  return (
    <EuiSplitPanel.Outer grow hasBorder>
      <EuiSplitPanel.Inner grow={false} color="subdued" paddingSize={'xs'}>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          {headerLeftSection}
          {headerRightSection}
        </EuiFlexGroup>
      </EuiSplitPanel.Inner>
      {showContent && (
        <EuiSplitPanel.Inner paddingSize="none">
          <EuiPanel paddingSize={contentPaddingSize} data-test-subj={`${dataTestSubj}Content`}>
            {content}
          </EuiPanel>
        </EuiSplitPanel.Inner>
      )}
    </EuiSplitPanel.Outer>
  );
};

ExpandablePanel.displayName = 'ExpandablePanel';
