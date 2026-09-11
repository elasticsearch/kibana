/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiText,
  EuiTextColor,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { layoutRowOrStackCss } from '@kbn/css-utils/public/layout_css';
import { docLinks } from '../../../common/doc_links';

interface BodyLink {
  category?: string;
  title: string;
  description: string;
  link:
    | {
        href: string;
        text: string;
      }
    | Array<{ text: string; href: string }>;
}

const BodyLink: React.FC<BodyLink> = ({ title, description, link, category }: BodyLink) => {
  return (
    <EuiFlexGroup direction="column">
      {category && (
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h4>
              <EuiTextColor color="success">{category}</EuiTextColor>
            </h4>
          </EuiTitle>
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h4>{title}</h4>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText color="subdued" size="s">
              <p>{description}</p>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        {Array.isArray(link) ? (
          <EuiFlexGroup responsive={false}>
            {link.map((l, index) => (
              <EuiFlexItem grow={false} key={`body-link-map-${index}`}>
                <EuiLink
                  data-test-subj="searchHomepageBodyLinkLink"
                  external
                  href={l.href}
                  target="_blank"
                >
                  {l.text}
                </EuiLink>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        ) : (
          <EuiLink
            data-test-subj="searchHomepageBodyLinkLink"
            external
            href={link.href}
            target="_blank"
          >
            {link.text}
          </EuiLink>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const BodyLinks = () => {
  const { euiTheme } = useEuiTheme();
  const BODY_LINKS: BodyLink[] = [
    {
      title: i18n.translate('xpack.searchHomepage.bodyLinks.askAnExpert.title', {
        defaultMessage: 'Ask an Elastic Expert',
      }),
      description: i18n.translate('xpack.searchHomepage.bodyLinks.askAnExpert.description', {
        defaultMessage:
          'Our team of customer engineers to discuss your specific needs and offer personalized guidance to help make the most of your Elastic trial.',
      }),
      link: {
        href: docLinks.customerEngineerRequestForm,
        text: i18n.translate('xpack.searchHomepage.bodyLinks.askAnExpert.link.text', {
          defaultMessage: 'Contact customer engineering',
        }),
      },
    },
    {
      title: i18n.translate('xpack.searchHomepage.bodyLinks.elasticTraining.title', {
        defaultMessage: 'Certified mastery of Elastic',
      }),
      description: i18n.translate('xpack.searchHomepage.bodyLinks.elasticTraining.description', {
        defaultMessage:
          'Unlock the full potential of Elastic through expert-led training, interactive labs, comprehensive certification programs, and flexible on-demand learning.',
      }),
      link: {
        href: docLinks.elasticTraining,
        text: i18n.translate('xpack.searchHomepage.bodyLinks.elasticTraining.linkText', {
          defaultMessage: 'Elastic Training',
        }),
      },
    },
    {
      title: i18n.translate('xpack.searchHomepage.bodyLinks.elasticDocumentation.title', {
        defaultMessage: 'Elasticsearch Documentation',
      }),
      description: i18n.translate(
        'xpack.searchHomepage.bodyLinks.elasticDocumentation.description',
        {
          defaultMessage:
            'A range of executable Python notebooks available to easily test features in a virtual environment.',
        }
      ),
      link: {
        href: docLinks.elasticsearchDocs,
        text: i18n.translate('xpack.searchHomepage.bodyLinks.elasticDocumentation.link.text', {
          defaultMessage: 'View documentation',
        }),
      },
    },
  ];

  return (
    <div css={layoutRowOrStackCss({ threshold: '70ch', gap: euiTheme.size.xl })}>
      {BODY_LINKS.map((bodyLink, index) => (
        <BodyLink key={`bodylink-${index}`} {...bodyLink} />
      ))}
    </div>
  );
};
