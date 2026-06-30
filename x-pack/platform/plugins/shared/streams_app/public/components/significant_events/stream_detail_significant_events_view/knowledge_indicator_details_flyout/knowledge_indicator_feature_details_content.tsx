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
  EuiHealth,
  EuiHorizontalRule,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { Feature } from '@kbn/significant-events-schema';
import { upperFirst } from 'lodash';
import React, { useMemo } from 'react';
import { InfoPanel } from '../../../info_panel';
import { getConfidenceColor } from '../utils/get_confidence_color';

interface Props {
  feature: Feature;
}

export function KnowledgeIndicatorFeatureDetailsContent({ feature }: Props) {
  const listItems = useMemo(() => {
    const tags = feature.tags?.length ? feature.tags : [];

    return [
      {
        title: DETAILS_ID_LABEL,
        description: (
          <EuiText size="s" data-test-subj="streamsAppFeatureDetailsFlyoutId">
            {feature.id}
          </EuiText>
        ),
      },
      {
        title: DETAILS_TYPE_LABEL,
        description: <EuiBadge color="hollow">{upperFirst(feature.type)}</EuiBadge>,
      },
      {
        title: DETAILS_SUBTYPE_LABEL,
        description: <EuiBadge color="hollow">{feature.subtype ?? EMPTY_VALUE}</EuiBadge>,
      },
      {
        title: DETAILS_PROPERTIES_LABEL,
        description: (
          <EuiText size="s">
            {Object.entries(feature.properties)
              .filter(([, value]) => typeof value === 'string')
              .map(([key, value]) => (
                <EuiText size="s" key={key}>
                  <strong>{key}</strong> {value as string}
                </EuiText>
              ))}
          </EuiText>
        ),
      },
      {
        title: DETAILS_CONFIDENCE_LABEL,
        description: (
          <EuiHealth color={getConfidenceColor(feature.confidence)}>{feature.confidence}</EuiHealth>
        ),
      },
      {
        title: DETAILS_TAGS_LABEL,
        description:
          tags.length > 0 ? (
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {tags.map((tag) => (
                <EuiFlexItem key={tag} grow={false}>
                  <EuiBadge color="hollow">{tag}</EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          ) : (
            <EuiText size="s">{EMPTY_VALUE}</EuiText>
          ),
      },
      {
        title: DETAILS_UPDATED_AT_LABEL,
        description: <EuiText size="s">{feature.updated_at || EMPTY_VALUE}</EuiText>,
      },
    ];
  }, [feature]);

  const evidence = feature.evidence?.length ? feature.evidence : [];
  const hasMeta = Object.keys(feature.meta ?? {}).length > 0;

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
      <EuiFlexItem>
        <InfoPanel title={DESCRIPTION_LABEL}>
          <EuiText>{feature.description || NO_DESCRIPTION_AVAILABLE}</EuiText>
        </InfoPanel>
      </EuiFlexItem>
      <EuiFlexItem>
        <InfoPanel title={EVIDENCE_LABEL}>
          {evidence.length > 0 ? (
            evidence.map((item, index) => (
              <React.Fragment key={`${item}-${index}`}>
                <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiHealth color="subdued" />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="s">{item}</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
                {index < evidence.length - 1 && <EuiHorizontalRule margin="m" />}
              </React.Fragment>
            ))
          ) : (
            <EuiText size="s">{NO_EVIDENCE_AVAILABLE}</EuiText>
          )}
        </InfoPanel>
      </EuiFlexItem>
      <EuiFlexItem data-test-subj="streamsAppFeatureDetailsFlyoutMeta">
        <InfoPanel title={META_LABEL}>
          {hasMeta ? (
            <EuiCodeBlock language="json" paddingSize="s" fontSize="s" isCopyable>
              {JSON.stringify(feature.meta ?? {}, null, 2)}
            </EuiCodeBlock>
          ) : (
            <EuiText size="s">{NO_META_AVAILABLE}</EuiText>
          )}
        </InfoPanel>
      </EuiFlexItem>
      <EuiFlexItem data-test-subj="streamsAppFeatureDetailsFlyoutRawDocument">
        <InfoPanel title={RAW_DOCUMENT_LABEL}>
          <EuiCodeBlock language="json" paddingSize="s" fontSize="s" isCopyable>
            {JSON.stringify(feature, null, 2)}
          </EuiCodeBlock>
        </InfoPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}

const GENERAL_INFORMATION_LABEL = i18n.translate(
  'xpack.streams.featureDetailsFlyout.generalInformationLabel',
  {
    defaultMessage: 'General information',
  }
);

const DETAILS_TYPE_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.typeLabel', {
  defaultMessage: 'Type',
});

const DETAILS_ID_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.idLabel', {
  defaultMessage: 'ID',
});

const DETAILS_SUBTYPE_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.subtypeLabel', {
  defaultMessage: 'Subtype',
});

const DETAILS_PROPERTIES_LABEL = i18n.translate(
  'xpack.streams.featureDetailsFlyout.propertiesLabel',
  {
    defaultMessage: 'Properties',
  }
);

const DETAILS_CONFIDENCE_LABEL = i18n.translate(
  'xpack.streams.featureDetailsFlyout.confidenceLabel',
  {
    defaultMessage: 'Confidence',
  }
);

const DETAILS_TAGS_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.tagsLabel', {
  defaultMessage: 'Tags',
});

const DETAILS_UPDATED_AT_LABEL = i18n.translate(
  'xpack.streams.featureDetailsFlyout.updatedAtLabel',
  {
    defaultMessage: 'Updated',
  }
);

const DESCRIPTION_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.descriptionLabel', {
  defaultMessage: 'Description',
});

const NO_DESCRIPTION_AVAILABLE = i18n.translate(
  'xpack.streams.featureDetailsFlyout.noDescriptionAvailable',
  {
    defaultMessage: 'No description available',
  }
);

const EVIDENCE_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.evidenceLabel', {
  defaultMessage: 'Evidence',
});

const NO_EVIDENCE_AVAILABLE = i18n.translate(
  'xpack.streams.featureDetailsFlyout.noEvidenceAvailable',
  {
    defaultMessage: 'No evidence available',
  }
);

const META_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.metaLabel', {
  defaultMessage: 'Meta',
});

const NO_META_AVAILABLE = i18n.translate('xpack.streams.featureDetailsFlyout.noMetaAvailable', {
  defaultMessage: 'No meta information',
});

const RAW_DOCUMENT_LABEL = i18n.translate('xpack.streams.featureDetailsFlyout.rawDocumentLabel', {
  defaultMessage: 'Raw document',
});

const EMPTY_VALUE = i18n.translate('xpack.streams.featureDetailsFlyout.emptyValue', {
  defaultMessage: '-',
});
