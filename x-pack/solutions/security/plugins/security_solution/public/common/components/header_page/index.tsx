/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiProgress,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  useEuiTheme,
  euiFontSize,
} from '@elastic/eui';
import React from 'react';
import { css } from '@emotion/react';

import type { LinkIconProps } from '../link_icon';
import { LinkIcon } from '../link_icon';
import type { SubtitleProps } from '../subtitle';
import { Subtitle } from '../subtitle';
import { Title } from './title';
import type { BadgeOptions, TitleProp } from './types';
import { useFormatUrl } from '../link_to';
import type { SecurityPageName } from '../../../app/types';
import { useKibana } from '../../lib/kibana';
interface HeaderProps {
  border?: boolean;
  isLoading?: boolean;
}

function Divider(): JSX.Element {
  const { euiTheme } = useEuiTheme();

  return (
    <div
      css={css`
        border-bottom: ${euiTheme.border.thin};
      `}
    />
  );
}

interface BackOptions {
  pageId: SecurityPageName;
  text?: LinkIconProps['children'];
  path?: string;
  dataTestSubj?: string;
}

export interface HeaderPageProps extends HeaderProps {
  backOptions?: BackOptions;
  /** A component to be displayed as the back button. Used only if `backOption` is not defined */
  backComponent?: React.ReactNode;
  backInlined?: boolean;
  badgeOptions?: BadgeOptions;
  children?: React.ReactNode;
  rightSideItems?: React.ReactNode[];
  subtitle?: SubtitleProps['items'];
  subtitle2?: SubtitleProps['items'];
  title: TitleProp;
  titleNode?: React.ReactElement;
}

export const useHeaderLinkBackStyles = () => {
  const euiThemeContext = useEuiTheme();
  const fontSizeXs = euiFontSize(euiThemeContext, 'xs').fontSize;
  const lineHeightS = euiFontSize(euiThemeContext, 's').lineHeight;
  const { euiTheme } = euiThemeContext;

  return {
    linkBack: css`
      font-size: ${fontSizeXs};
      line-height: ${lineHeightS};
      margin-bottom: ${euiTheme.size.s};
    `,
    linkBackIconOnly: css`
      font-size: ${fontSizeXs};
    `,
  };
};

export const HeaderLinkBack: React.FC<{ backOptions: BackOptions }> = React.memo(
  ({ backOptions }) => {
    const styles = useHeaderLinkBackStyles();
    const { navigateToUrl } = useKibana().services.application;
    const { formatUrl } = useFormatUrl(backOptions.pageId);

    const backUrl = formatUrl(backOptions.path ?? '');
    return (
      <div
        css={backOptions.text ? styles.linkBack : styles.linkBackIconOnly}
        className="securitySolutionHeaderPage__linkBack"
      >
        <LinkIcon
          dataTestSubj={backOptions.dataTestSubj ?? 'link-back'}
          onClick={(ev: Event) => {
            ev.preventDefault();
            navigateToUrl(backUrl);
          }}
          href={backUrl}
          iconType="chevronSingleLeft"
        >
          {backOptions.text}
        </LinkIcon>
      </div>
    );
  }
);
HeaderLinkBack.displayName = 'HeaderLinkBack';

const headerPageStyles = {
  // Without  min-width: 0, as a flex child, it wouldn't shrink properly
  // and could overflow its parent.
  headerSection: css`
    min-width: 0;
    max-width: 100%;
  `,
};

const HeaderPageComponent: React.FC<HeaderPageProps> = ({
  backOptions,
  backComponent,
  backInlined,
  badgeOptions,
  border,
  children,
  isLoading,
  rightSideItems,
  subtitle,
  subtitle2,
  title,
  titleNode,
}) => {
  const backEl =
    backComponent ?? (backOptions ? <HeaderLinkBack backOptions={backOptions} /> : null);

  return (
    <div data-test-subj="header-page">
      <EuiPageHeader alignItems="center" rightSideItems={rightSideItems}>
        <EuiPageHeaderSection css={headerPageStyles.headerSection}>
          <EuiFlexGroup
            direction={backInlined ? 'row' : 'column'}
            alignItems={backInlined ? 'center' : 'flexStart'}
            gutterSize="s"
            responsive={false}
          >
            {backEl && <EuiFlexItem grow={false}>{backEl}</EuiFlexItem>}
            <EuiFlexItem grow={false}>
              {titleNode || <Title title={title} badgeOptions={badgeOptions} />}
            </EuiFlexItem>
          </EuiFlexGroup>

          {subtitle && (
            <>
              <EuiSpacer size="s" />
              <Subtitle data-test-subj="header-page-subtitle" items={subtitle} />
            </>
          )}
          {border && isLoading && <EuiProgress size="xs" color="accent" />}
        </EuiPageHeaderSection>

        {children && (
          <EuiPageHeaderSection data-test-subj="header-page-supplements">
            {children}
          </EuiPageHeaderSection>
        )}
      </EuiPageHeader>
      {subtitle2 && (
        <>
          <EuiSpacer size="xs" />
          <Subtitle data-test-subj="header-page-subtitle-2" items={subtitle2} />
        </>
      )}
      {border && (
        <>
          <EuiSpacer size="m" />
          <Divider />
        </>
      )}
      {/* Manually add a 'padding-bottom' to header */}
      <EuiSpacer size="l" />
    </div>
  );
};

export const HeaderPage = React.memo(HeaderPageComponent);
