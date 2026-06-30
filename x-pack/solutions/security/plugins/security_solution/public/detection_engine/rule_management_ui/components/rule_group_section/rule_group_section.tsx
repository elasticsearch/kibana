/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useMemo } from 'react';
import {
  EuiAccordion,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiText,
  EuiTitle,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { IconType } from '@elastic/eui';

export interface SectionStat {
  label: string;
  value: string | number;
}

interface RuleGroupSectionProps {
  title: string;
  titleIcon?: IconType;
  stats: SectionStat[];
  defaultOpen?: boolean;
  isLoading?: boolean;
  onToggle?: (isOpen: boolean) => void;
  children: React.ReactNode;
  'data-test-subj'?: string;
}

const SectionTitle = ({
  title,
  titleIcon,
}: {
  title: string;
  titleIcon?: IconType;
}) => (
  <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
    {titleIcon && (
      <EuiFlexItem grow={false}>
        <EuiIcon type={titleIcon} size="l" />
      </EuiFlexItem>
    )}
    <EuiFlexItem grow={false} className="eui-textTruncate">
      <EuiTitle size="xxs">
        <h4 className="eui-textTruncate" title={title}>
          {title}
        </h4>
      </EuiTitle>
    </EuiFlexItem>
  </EuiFlexGroup>
);

const Separator = () => {
  const { euiTheme } = useEuiTheme();
  return (
    <EuiFlexItem
      grow={false}
      role="separator"
      css={css`
        align-self: center;
        height: 16px;
        border-right: ${euiTheme.border.thin};
      `}
    />
  );
};

const SectionStats = ({ stats }: { stats: SectionStat[] }) => {
  const { euiTheme } = useEuiTheme();

  const items = useMemo(
    () =>
      stats.map((stat) => (
        <EuiFlexItem grow={false} key={stat.label}>
          <EuiText
            size="xs"
            css={css`
              white-space: nowrap;
            `}
            data-test-subj={`ruleGroupStat-${stat.label}`}
          >
            <span
              css={css`
                color: ${euiTheme.colors.textSubdued};
              `}
            >
              {stat.label}:
            </span>{' '}
            <strong>{stat.value}</strong>
          </EuiText>
        </EuiFlexItem>
      )),
    [stats, euiTheme]
  );

  return (
    <EuiFlexGroup gutterSize="m" alignItems="center" data-test-subj="ruleGroupStats">
      {items.map((item, index, { length }) => (
        <Fragment key={index}>
          {item}
          {index < length - 1 && <Separator />}
        </Fragment>
      ))}
    </EuiFlexGroup>
  );
};

export const RuleGroupSection = React.memo<RuleGroupSectionProps>(
  ({
    title,
    titleIcon,
    stats,
    defaultOpen = false,
    isLoading = false,
    onToggle,
    children,
    'data-test-subj': dataTestSubj,
  }) => {
    const accordionId = useGeneratedHtmlId({ prefix: 'ruleGroupSection' });

    return (
      <EuiPanel paddingSize="none" hasBorder data-test-subj={dataTestSubj}>
        <EuiAccordion
          id={accordionId}
          buttonContent={<SectionTitle title={title} titleIcon={titleIcon} />}
          buttonElement="div"
          extraAction={<SectionStats stats={stats} />}
          initialIsOpen={defaultOpen}
          isLoading={isLoading}
          onToggle={onToggle}
          paddingSize="m"
          css={css`
            .euiAccordion__triggerWrapper {
              padding: 12px 16px;
            }
          `}
        >
          {children}
        </EuiAccordion>
      </EuiPanel>
    );
  }
);

RuleGroupSection.displayName = 'RuleGroupSection';
