/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
  EuiToolTip,
  EuiLink,
  EuiIcon,
  useEuiTheme,
  useEuiFontSize,
} from '@elastic/eui';
import type { IconType } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { memo, useMemo } from 'react';

interface SectionPanelLink {
  /** Callback when the title link is clicked */
  callback: () => void;
  /** Tooltip for the title link */
  tooltip: React.ReactNode;
}

interface SectionPanelProps {
  /** Content rendered below the header */
  children: React.ReactNode;
  /** Header title content */
  title: React.ReactNode;
  /** Highlights title in primary color */
  highlightTitle?: boolean;
  /** Optional leading icon in the header */
  icon?: React.ReactNode;
  /** Optional link to make the title clickable (e.g. open left panel) */
  link?: SectionPanelLink;
  /** Optional icon type for the link (e.g. 'chevronLimitLeft') */
  linkIconType?: IconType;
  /** Optional data-test-subj for the panel */
  'data-test-subj'?: string;
}

export const SectionPanel = memo(
  ({
    children,
    title,
    highlightTitle,
    icon,
    link,
    linkIconType,
    'data-test-subj': dataTestSubj = 'sectionPanel',
  }: SectionPanelProps) => {
    const { euiTheme } = useEuiTheme();
    const fontSize = useEuiFontSize('s').fontSize;

    const styles = useMemo(() => {
      return {
        panel: css`
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: thin;
        `,
        header: css`
          border-bottom: 1px solid ${euiTheme.colors.borderBaseSubdued};
          padding: ${euiTheme.size.m} ${euiTheme.size.base};
        `,
        title: css`
          font-weight: ${euiTheme.font.weight.bold};
        `,
        titleLink: css`
          font-size: ${fontSize};
          font-weight: ${euiTheme.font.weight.bold};
        `,
      };
    }, [euiTheme, fontSize]);

    const titleContent = useMemo(() => {
      if (link?.callback) {
        return (
          <EuiToolTip content={link.tooltip}>
            <EuiLink
              css={styles.titleLink}
              data-test-subj={`${dataTestSubj}TitleLink`}
              onClick={link.callback}
              color={highlightTitle ? 'primary' : 'text'}
            >
              {title}
            </EuiLink>
          </EuiToolTip>
        );
      }
      return (
        <EuiText
          color={highlightTitle ? euiTheme.colors.primary : 'default'}
          css={styles.title}
          size="s"
          data-test-subj={`${dataTestSubj}TitleText`}
        >
          {title}
        </EuiText>
      );
    }, [
      link?.callback,
      link?.tooltip,
      highlightTitle,
      euiTheme.colors.primary,
      styles.title,
      styles.titleLink,
      dataTestSubj,
      title,
    ]);

    return (
      <EuiPanel data-test-subj={dataTestSubj} css={styles.panel} hasBorder paddingSize="none">
        <EuiFlexGroup css={styles.header}>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              {icon && (
                <EuiFlexItem data-test-subj={`${dataTestSubj}Icon`} grow={false}>
                  {icon}
                </EuiFlexItem>
              )}
              {linkIconType && link?.callback && (
                <EuiFlexItem grow={false}>
                  <EuiIcon
                    color="primary"
                    type={linkIconType}
                    aria-hidden={true}
                    css={css`
                      margin: ${euiTheme.size.s} 0;
                    `}
                    data-test-subj={`${dataTestSubj}LinkIcon`}
                  />
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>{titleContent}</EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>

        {children}
      </EuiPanel>
    );
  }
);

SectionPanel.displayName = 'SectionPanel';
