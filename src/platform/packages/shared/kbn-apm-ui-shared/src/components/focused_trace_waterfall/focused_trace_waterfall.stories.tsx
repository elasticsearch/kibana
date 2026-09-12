/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { FocusedTraceWaterfall } from '.';

interface StoryArgs {
  engine?: 'dom' | 'charts';
}

const stories: Meta<StoryArgs> = {
  title: 'shared/TraceWaterfall/FocusedTraceWaterfall',
  component: FocusedTraceWaterfall,
  argTypes: {
    engine: {
      control: 'radio',
      options: ['dom', 'charts'],
      description: 'Rendering engine — DOM (default) or elastic-charts canvas (spike)',
    },
  },
  args: {
    engine: 'dom',
  },
};
export default stories;

export const FocusedIdIsRoot: StoryFn<StoryArgs> = ({ engine }) => {
  return (
    <FocusedTraceWaterfall
      engine={engine}
      items={{
        traceItems: {
          rootDoc: {
            id: 'foo',
            timestampUs: new Date('2025-05-21T18:35:26.179Z').getTime() * 1000,
            name: 'root',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 50000,
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 3, outgoing: 5 },
            docType: 'transaction',
          },

          focusedTraceDoc: {
            id: 'foo',
            timestampUs: new Date('2025-05-21T18:35:26.179Z').getTime() * 1000,
            name: 'root',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 5000,
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 3, outgoing: 5 },
            docType: 'transaction',
          },
          focusedTraceTree: [
            {
              traceDoc: {
                id: '41b4177551ba7b6d',
                timestampUs: new Date('2025-05-21T18:35:26.190Z').getTime() * 1000,
                name: 'child',
                traceId: '01d9ebaca760279d6d68d29ea5283c58',
                duration: 5000,
                errors: [],
                parentId: 'foo',
                serviceName: 'flagd',
                spanLinksCount: { incoming: 0, outgoing: 0 },
                docType: 'span',
              },
              children: [],
            },
          ],
        },
        summary: { services: 2, traceEvents: 2, errors: 0 },
      }}
    />
  );
};

export const ParentIdIsRoot: StoryFn<StoryArgs> = ({ engine }) => {
  return (
    <FocusedTraceWaterfall
      engine={engine}
      items={{
        traceItems: {
          rootDoc: {
            id: 'foo',
            timestampUs: new Date('2025-05-21T18:35:26.179Z').getTime() * 1000,
            name: 'root',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 50000,
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 0, outgoing: 0 },
            docType: 'transaction',
          },
          parentDoc: {
            id: 'foo',
            timestampUs: new Date('2025-05-21T18:35:26.179Z').getTime() * 1000,
            name: 'root',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 50000,
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 0, outgoing: 0 },
            docType: 'transaction',
          },
          focusedTraceDoc: {
            id: 'bar',
            timestampUs: new Date('2025-05-21T18:35:26.200Z').getTime() * 1000,
            name: 'focused',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 4000,
            parentId: 'foo',
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 0, outgoing: 0 },
            docType: 'span',
          },
          focusedTraceTree: [
            {
              traceDoc: {
                id: '41b4177551ba7b6d',
                timestampUs: new Date('2025-05-21T18:35:26.202Z').getTime() * 1000,
                name: 'child',
                traceId: '01d9ebaca760279d6d68d29ea5283c58',
                duration: 1000,
                errors: [],
                parentId: 'bar',
                serviceName: 'flagd',
                spanLinksCount: { incoming: 0, outgoing: 0 },
                docType: 'span',
              },
              children: [],
            },
          ],
        },
        summary: { services: 2, traceEvents: 2, errors: 0 },
      }}
    />
  );
};

export const FocusedWithParent: StoryFn<StoryArgs> = ({ engine }) => {
  return (
    <FocusedTraceWaterfall
      engine={engine}
      items={{
        traceItems: {
          rootDoc: {
            id: 'foo',
            timestampUs: new Date('2025-05-21T18:35:26.179Z').getTime() * 1000,
            name: 'root',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 50000,
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 0, outgoing: 0 },
            docType: 'transaction',
          },
          parentDoc: {
            id: 'parent',
            timestampUs: new Date('2025-05-21T18:35:26.190Z').getTime() * 1000,
            name: 'Parent',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 30000,
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 0, outgoing: 0 },
            docType: 'span',
          },
          focusedTraceDoc: {
            id: 'bar',
            timestampUs: new Date('2025-05-21T18:35:26.195Z').getTime() * 1000,
            name: 'focused',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 25000,
            parentId: 'foo',
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 0, outgoing: 0 },
            docType: 'span',
          },
          focusedTraceTree: [
            {
              traceDoc: {
                id: '41b4177551ba7b6d',
                timestampUs: new Date('2025-05-21T18:35:26.200Z').getTime() * 1000,
                name: 'child',
                traceId: '01d9ebaca760279d6d68d29ea5283c58',
                duration: 10000,
                errors: [],
                parentId: 'bar',
                serviceName: 'flagd',
                spanLinksCount: { incoming: 0, outgoing: 0 },
                docType: 'span',
              },
              children: [],
            },
          ],
        },
        summary: { services: 2, traceEvents: 2, errors: 0 },
      }}
    />
  );
};

export const FocusedWithMultipleChildren: StoryFn<StoryArgs> = ({ engine }) => {
  return (
    <FocusedTraceWaterfall
      engine={engine}
      items={{
        traceItems: {
          rootDoc: {
            id: 'foo',
            timestampUs: new Date('2025-05-21T18:35:26.179Z').getTime() * 1000,
            name: 'root',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 50000,
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 0, outgoing: 0 },
            docType: 'transaction',
          },
          parentDoc: {
            id: 'parent',
            timestampUs: new Date('2025-05-21T18:35:26.185Z').getTime() * 1000,
            name: 'Parent',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 40000,
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 0, outgoing: 0 },
            docType: 'span',
          },
          focusedTraceDoc: {
            id: 'bar',
            timestampUs: new Date('2025-05-21T18:35:26.185Z').getTime() * 1000,
            name: 'focused',
            traceId: '01d9ebaca760279d6d68d29ea5283c58',
            duration: 30000,
            parentId: 'foo',
            errors: [],
            serviceName: 'recommendation',
            spanLinksCount: { incoming: 0, outgoing: 0 },
            docType: 'span',
          },
          focusedTraceTree: [
            {
              traceDoc: {
                id: 'child1',
                timestampUs: new Date('2025-05-21T18:35:26.190Z').getTime() * 1000,
                name: 'child',
                traceId: '01d9ebaca760279d6d68d29ea5283c58',
                duration: 10000,
                errors: [],
                parentId: 'bar',
                serviceName: 'flagd',
                spanLinksCount: { incoming: 0, outgoing: 0 },
                docType: 'span',
              },
              children: [
                {
                  traceDoc: {
                    id: 'child2',
                    timestampUs: new Date('2025-05-21T18:35:26.195Z').getTime() * 1000,
                    name: 'child_2',
                    traceId: '01d9ebaca760279d6d68d29ea5283c58',
                    duration: 2000,
                    errors: [],
                    parentId: 'child1',
                    serviceName: 'flagd',
                    spanLinksCount: { incoming: 0, outgoing: 0 },
                    docType: 'span',
                  },
                },
              ],
            },
          ],
        },
        summary: { services: 2, traceEvents: 2, errors: 0 },
      }}
    />
  );
};
