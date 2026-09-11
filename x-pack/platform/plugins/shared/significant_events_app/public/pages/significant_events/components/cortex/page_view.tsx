/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiMarkdownFormat,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { css } from '@emotion/css';
import { FormattedMessage, FormattedRelative } from '@kbn/i18n-react';
import { getCortexEntityTypeLabel, getCortexStatusLabel } from './entity_type_labels';
import { useCortexPage } from './use_cortex';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const contentWithoutDuplicateTitle = (title: string, content: string): string =>
  content.replace(new RegExp(`^#{1,3}\\s*${escapeRegExp(title)}\\s*\\n+`, 'i'), '');

interface CortexPageViewProps {
  pageId: string;
}

export function CortexPageView({ pageId }: CortexPageViewProps) {
  const { data, isLoading, isError } = useCortexPage(pageId);
  const page = data?.page;

  if (isLoading) {
    return <EuiLoadingSpinner size="l" data-test-subj="nightshiftCortexPageLoading" />;
  }

  if (isError || !page) {
    return (
      <EuiEmptyPrompt
        iconType="alert"
        title={
          <h2>
            <FormattedMessage
              id="xpack.significantEventsApp.cortex.pageNotFoundTitle"
              defaultMessage="Page not found"
            />
          </h2>
        }
        body={
          <p>
            <FormattedMessage
              id="xpack.significantEventsApp.cortex.pageNotFoundDescription"
              defaultMessage="This Cortex page could not be loaded."
            />
          </p>
        }
      />
    );
  }

  return (
    <div data-test-subj="nightshiftCortexPageView">
      <EuiTitle size="m">
        <h2>{page.title}</h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="s" alignItems="center" wrap>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">{getCortexEntityTypeLabel(page.entity_type)}</EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={page.status === 'established' ? 'success' : 'hollow'}>
            {getCortexStatusLabel(page.status)}
          </EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <FormattedMessage
              id="xpack.significantEventsApp.cortex.pageCorroborationsLabel"
              defaultMessage="{count, plural, one {# corroboration} other {# corroborations}}"
              values={{ count: page.corroborations }}
            />
            {' · '}
            <FormattedMessage
              id="xpack.significantEventsApp.cortex.pageUpdatedLabel"
              defaultMessage="Updated {when}"
              values={{ when: <FormattedRelative value={page.updated_at} /> }}
            />
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      {page.description !== undefined && page.description.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiText color="subdued">
            <p>{page.description}</p>
          </EuiText>
        </>
      )}
      <EuiSpacer />
      {page.content.length > 0 ? (
        <div
          className={css`
            .euiMarkdownFormat :not(pre) > code {
              background: transparent;
              padding: 0;
              border-radius: 0;
              box-shadow: none;
            }
          `}
        >
          <EuiMarkdownFormat>
            {contentWithoutDuplicateTitle(page.title, page.content)}
          </EuiMarkdownFormat>
        </div>
      ) : (
        <EuiText color="subdued">
          <FormattedMessage
            id="xpack.significantEventsApp.cortex.pageEmptyContentDescription"
            defaultMessage="This page has no content yet."
          />
        </EuiText>
      )}
    </div>
  );
}
