/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiCodeBlock,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { Feature, StreamQuery } from '@kbn/streams-schema';
import { COMPUTED_FEATURE_TYPES } from '@kbn/streams-schema';
import React, { useMemo } from 'react';
import { SeverityBadge } from '../../significant_events_discovery/components/severity_badge/severity_badge';
import { InfoPanel } from '../../../info_panel';
import { SparkPlot } from '../../../spark_plot';

const COMPUTED_FEATURE_TYPE_SET = new Set<string>(COMPUTED_FEATURE_TYPES);

interface Props {
  query: StreamQuery;
  occurrences?: Array<{ x: number; y: number }>;
  streamFeatures?: Feature[];
}

export function KnowledgeIndicatorQueryDetailsContent({
  query,
  occurrences,
  streamFeatures = [],
}: Props) {
  const featureIdSet = useMemo(() => new Set(streamFeatures.map((f) => f.id)), [streamFeatures]);

  const inferredFeatureIds = useMemo(
    () =>
      (query.features ?? [])
        .map((f) => f.id)
        .filter((id) => !COMPUTED_FEATURE_TYPE_SET.has(id) && featureIdSet.has(id)),
    [query.features, featureIdSet]
  );
  const hasFeatureIds = inferredFeatureIds.length > 0;

  const listItems = [
    {
      title: DETAILS_TYPE_LABEL,
      description: <EuiBadge color="hollow">{QUERY_BADGE_LABEL}</EuiBadge>,
    },
    {
      title: DETAILS_QUERY_LABEL,
      description: (
        <EuiCodeBlock language="esql" paddingSize="none" transparentBackground>
          {query.esql?.query ?? EMPTY_VALUE}
        </EuiCodeBlock>
      ),
    },
    {
      title: DETAILS_DESCRIPTION_LABEL,
      description: <EuiText size="s">{query.description || EMPTY_VALUE}</EuiText>,
    },
    {
      title: DETAILS_SEVERITY_LABEL,
      description: <SeverityBadge score={query.severity_score} />,
    },
  ];

  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      <EuiFlexItem>
        <InfoPanel title={GENERAL_INFORMATION_LABEL}>
          {listItems.map((item, index) => (
            <React.Fragment key={item.title}>
              <EuiDescriptionList
                type="column"
                columnWidths={[1, 2]}
                compressed
                listItems={[item]}
              />
              {index < listItems.length - 1 && <EuiHorizontalRule margin="m" />}
            </React.Fragment>
          ))}
        </InfoPanel>
      </EuiFlexItem>
      {hasFeatureIds && (
        <EuiFlexItem>
          <InfoPanel title={SOURCE_FEATURES_LABEL}>
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {inferredFeatureIds.map((featureId) => (
                <EuiFlexItem grow={false} key={featureId}>
                  <EuiBadge color="hollow">{featureId}</EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </InfoPanel>
        </EuiFlexItem>
      )}
      {occurrences ? (
        <EuiFlexItem>
          <InfoPanel title={OCCURRENCES_LABEL}>
            <EuiSpacer size="s" />
            <SparkPlot
              id={`knowledge-indicator-details-${query.id}`}
              name={OCCURRENCES_LABEL}
              type="bar"
              timeseries={occurrences}
              annotations={[]}
              height={160}
            />
          </InfoPanel>
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  );
}

const GENERAL_INFORMATION_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetails.generalInformationLabel',
  {
    defaultMessage: 'General information',
  }
);

const DETAILS_TYPE_LABEL = i18n.translate('xpack.streams.knowledgeIndicatorDetails.typeLabel', {
  defaultMessage: 'Type',
});

const DETAILS_QUERY_LABEL = i18n.translate('xpack.streams.knowledgeIndicatorDetails.queryLabel', {
  defaultMessage: 'Query',
});

const DETAILS_SEVERITY_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetails.severityLabel',
  {
    defaultMessage: 'Severity',
  }
);

const DETAILS_DESCRIPTION_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetails.descriptionLabel',
  {
    defaultMessage: 'Description',
  }
);

const OCCURRENCES_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetails.occurrencesLabel',
  {
    defaultMessage: 'Occurrences',
  }
);

const QUERY_BADGE_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetails.queryBadgeLabel',
  {
    defaultMessage: 'Query',
  }
);

const EMPTY_VALUE = i18n.translate('xpack.streams.knowledgeIndicatorDetails.emptyValue', {
  defaultMessage: '-',
});

const SOURCE_FEATURES_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorDetails.sourceFeaturesLabel',
  { defaultMessage: 'Source KI features' }
);
