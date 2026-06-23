/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiLink } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { ContentListEmptyState } from '@kbn/content-list';

/**
 * Props for {@link GraphEmptyPrompt}, shared with {@link GraphContentListProps}
 * so the listing route can forward them without an extra wrapper.
 */
export interface GraphEmptyPromptProps {
  /** URL to the sample-data installer page. */
  sampleDataUrl: string;
  /** Called when the user clicks the "Create graph" button. */
  onCreateGraph: () => void;
  /** Whether the user has write access to graph workspaces. */
  canSave: boolean;
}

// `ContentListEmptyState` only wraps **string/number** titles in `<h2>` (see
// `kbn-content-list/.../content_list_empty_state.tsx`); a `FormattedMessage`
// element passes through as plain content and silently loses heading
// semantics. Pre-translate these titles so the empty-state heading is
// preserved for assistive tech.
const createGraphTitle = i18n.translate('xpack.graph.listing.createNewGraph.title', {
  defaultMessage: 'Create your first graph',
});

const noItemsTitle = i18n.translate('xpack.graph.listing.noItemsMessage', {
  defaultMessage: "Looks like you don't have any graphs.",
});

/**
 * Empty state for the graph content list.
 *
 * Shows a read-only message when the user lacks save permissions, or a
 * create-first prompt with a sample-data link when they can save.
 */
export const GraphEmptyPrompt = ({
  canSave,
  sampleDataUrl,
  onCreateGraph,
}: GraphEmptyPromptProps) => (
  <ContentListEmptyState
    iconType="graphApp"
    title={canSave ? createGraphTitle : noItemsTitle}
    {...(canSave && {
      body: (
        <>
          <p>
            <FormattedMessage
              id="xpack.graph.listing.createNewGraph.combineDataViewFromKibanaAppDescription"
              defaultMessage="Discover patterns and relationships in your Elasticsearch indices."
            />
          </p>
          <p>
            <FormattedMessage
              id="xpack.graph.listing.createNewGraph.newToKibanaDescription"
              defaultMessage="New to Kibana? Get started with {sampleDataInstallLink}."
              values={{
                sampleDataInstallLink: (
                  <EuiLink href={sampleDataUrl}>
                    <FormattedMessage
                      id="xpack.graph.listing.createNewGraph.sampleDataInstallLinkText"
                      defaultMessage="sample data"
                    />
                  </EuiLink>
                ),
              }}
            />
          </p>
        </>
      ),
      primaryAction: {
        label: (
          <FormattedMessage
            id="xpack.graph.listing.createNewGraph.createButtonLabel"
            defaultMessage="Create graph"
          />
        ),
        onClick: onCreateGraph,
        iconType: 'plusCircle',
        'data-test-subj': 'graphCreateGraphPromptButton',
      },
    })}
  />
);
