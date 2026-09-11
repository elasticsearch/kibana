/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import React, { useEffect, useState } from 'react';

import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiImage,
  EuiSpacer,
  EuiSplitPanel,
  EuiText,
  EuiTextColor,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { layoutAutoGridCss, layoutRowOrStackCss } from '@kbn/css-utils/public/layout_css';
import { docLinks } from '../../../common/doc_links';
import { useAssetBasePath } from '../../hooks/use_asset_base_path';
import { useKibana } from '../../hooks/use_kibana';

/** Width a card needs to keep its icon beside its text, and the grid's ideal track width. */
const CARD_MIN_WIDTH = '30rem';

interface ResourceCardProps {
  title: string;
  icon: (assetBasePath: string) => string;
  description: string;
  actionHref: string;
  actionText: string;
  dataTestSubj: string;
}

const ResourceCard = ({
  title,
  icon,
  description,
  actionHref,
  actionText,
  dataTestSubj,
}: ResourceCardProps) => {
  const assetBasePath = useAssetBasePath();
  const { euiTheme, highContrastMode } = useEuiTheme();

  // `EuiSplitPanel` draws the high-contrast divider implied by `direction` and the
  // `responsive` prop, but `layoutRowOrStackCss` is driving responsiveness.
  // This is a trick to have the high-contrast divider on either layout.
  const outerDividerCss = highContrastMode
    ? css({ gap: euiTheme.border.width.thin, backgroundColor: euiTheme.border.color })
    : undefined;
  // `&&` doubles specificity to beat EUI's own `:not(:last-child)` divider rule.
  const innerDividerCss = highContrastMode ? css({ '&&': { border: 'none' } }) : undefined;

  return (
    <EuiSplitPanel.Outer
      direction="row"
      responsive={false}
      data-test-subj={dataTestSubj}
      css={[
        layoutRowOrStackCss({ threshold: CARD_MIN_WIDTH }),
        css({ height: '100%' }),
        outerDividerCss,
      ]}
    >
      <EuiSplitPanel.Inner paddingSize="none" color="subdued" css={innerDividerCss}>
        <EuiFlexGroup
          justifyContent="center"
          alignItems="center"
          css={css({
            height: '100%',
            padding: `${euiTheme.size.xxl} 0`,
          })}
        >
          <EuiImage size={euiTheme.base * 5} src={icon(assetBasePath)} alt="" />
        </EuiFlexGroup>
      </EuiSplitPanel.Inner>
      <EuiSplitPanel.Inner paddingSize="l" color="plain" css={innerDividerCss}>
        <EuiFlexItem grow={5}>
          <EuiTitle size="xs">
            <h4>{title}</h4>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            <p>{description}</p>
          </EuiText>
          <EuiSpacer size="xs" />

          <div>
            <EuiButtonEmpty
              iconSide="left"
              iconType="sortRight"
              color="text"
              data-test-subj="searchHomepageSearchCloudResourceCardAction"
              href={actionHref}
              target="_blank"
              flush="both"
            >
              {actionText}
            </EuiButtonEmpty>
          </div>
        </EuiFlexItem>
      </EuiSplitPanel.Inner>
    </EuiSplitPanel.Outer>
  );
};

export const CloudResources = () => {
  const { euiTheme } = useEuiTheme();
  const {
    services: { cloud },
  } = useKibana();
  const isServerless = cloud?.isServerlessEnabled;

  const [billingUrl, setBillingUrl] = useState<string>('');
  useEffect(() => {
    cloud?.getPrivilegedUrls().then((urls) => {
      if (urls.billingUrl) {
        setBillingUrl(urls.billingUrl);
      }
    });
  }, [cloud]);
  const SERVERLESS_CARDS: ResourceCardProps[] = [
    {
      icon: (assetBasePath: string) => `${assetBasePath}/search_value_calc.svg`,
      title: i18n.translate('xpack.searchHomepage.cloudResources.billing.title', {
        defaultMessage: 'Cloud Billing and Usage',
      }),
      description: i18n.translate('xpack.searchHomepage.cloudResources.billing.description', {
        defaultMessage:
          'Get a detailed breakdown of your organization’s cloud resource usage across your deployments.',
      }),
      actionText: i18n.translate('xpack.searchHomepage.cloudResources.billing.actionText', {
        defaultMessage: 'Go to Billing',
      }),
      actionHref: billingUrl,
      dataTestSubj: 'cloudResourceCard-billing',
    },
    {
      icon: (assetBasePath: string) => `${assetBasePath}/search_analytics.svg`,
      title: i18n.translate('xpack.searchHomepage.cloudResources.autoops.title', {
        defaultMessage: 'Cluster performance insights',
      }),
      description: i18n.translate('xpack.searchHomepage.cloudResources.autoops.description', {
        defaultMessage:
          'Enable AutoOps for performance recommendations, resource utilization, and cost insights.',
      }),
      actionText: i18n.translate('xpack.searchHomepage.cloudResources.autoops.actionText', {
        defaultMessage: 'AutoOps',
      }),
      actionHref: cloud?.performanceUrl || `https://cloud.elastic.co`,
      dataTestSubj: 'cloudResourceCard-autoops',
    },
  ];
  const HOSTED_CARDS: ResourceCardProps[] = [
    {
      icon: (assetBasePath: string) => `${assetBasePath}/search_cloud_deploy.svg`,
      title: i18n.translate('xpack.searchHomepage.cloudResources.cloudConnect.title', {
        defaultMessage: 'Cloud Connect',
      }),
      description: i18n.translate('xpack.searchHomepage.cloudResources.cloudConnect.description', {
        defaultMessage:
          'Use Elastic Cloud services like AutoOps and Elastic Inference Service in your self-managed clusters.',
      }),
      actionText: i18n.translate('xpack.searchHomepage.cloudResources.cloudConnect.actionText', {
        defaultMessage: 'Connect this cluster',
      }),
      actionHref: docLinks.cloudConnect,
      dataTestSubj: 'cloudResourceCard-cloudConnect',
    },
    {
      icon: (assetBasePath: string) => `${assetBasePath}/search_serverless.svg`,
      title: i18n.translate('xpack.searchHomepage.cloudResources.elasticCloud.title', {
        defaultMessage: 'Try managed Elastic',
      }),
      description: i18n.translate('xpack.searchHomepage.cloudResources.elasticCloud.description', {
        defaultMessage:
          'Deploy, scale and upgrade your stack faster with Elastic Cloud. We’ll help you quickly move your data.',
      }),
      actionText: i18n.translate('xpack.searchHomepage.cloudResources.elasticCloud.actionText', {
        defaultMessage: 'Elastic Cloud',
      }),
      actionHref: docLinks.elasticCloud,
      dataTestSubj: 'cloudResourceCard-serverless',
    },
  ];

  const cards = isServerless ? SERVERLESS_CARDS : HOSTED_CARDS;

  return (
    <EuiFlexGroup direction="column">
      <EuiFlexItem>
        <EuiTitle size="xxs">
          <h6>
            <EuiTextColor color="subdued">
              {i18n.translate('xpack.searchHomepage.cloudResources.h6.cloudResourcesLabel', {
                defaultMessage: 'Cloud resources',
              })}
            </EuiTextColor>
          </h6>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem>
        <div css={layoutAutoGridCss({ minItemWidth: CARD_MIN_WIDTH, gap: euiTheme.size.l })}>
          {cards.map((card, index) => (
            <ResourceCard
              key={`resource-${index}`}
              title={card.title}
              icon={card.icon}
              description={card.description}
              actionHref={card.actionHref}
              actionText={card.actionText}
              dataTestSubj={card.dataTestSubj}
            />
          ))}
        </div>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
