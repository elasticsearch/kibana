/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC } from 'react';
import React from 'react';
import { EuiScreenReaderOnly, useEuiTheme } from '@elastic/eui';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { FormattedMessage } from '@kbn/i18n-react';
import { layoutAutoGridCss } from '@kbn/css-utils/public/layout_css';
import { SolutionPanel } from './solution_panel';
import type { FeatureCatalogueEntry, FeatureCatalogueSolution } from '../../..';

const sortByOrder = (
  { order: orderA = 0 }: FeatureCatalogueSolution | FeatureCatalogueEntry,
  { order: orderB = 0 }: FeatureCatalogueSolution | FeatureCatalogueEntry
) => orderA - orderB;

interface Props {
  addBasePath: (path: string) => string;
  solutions: FeatureCatalogueSolution[];
}

export const SolutionsSection: FC<Props> = ({ addBasePath, solutions }) => {
  const { euiTheme } = useEuiTheme();

  if (!solutions.length) {
    return null;
  }

  const sortedSolutions = [...solutions].sort(sortByOrder);

  return (
    <KibanaPageTemplate.Section
      bottomBorder
      paddingSize="xl"
      aria-labelledby="homeSolutions__title"
    >
      <EuiScreenReaderOnly>
        <h2 id="homeSolutions__title">
          <FormattedMessage
            id="home.solutionsSection.sectionTitle"
            defaultMessage="Pick your solution"
          />
        </h2>
      </EuiScreenReaderOnly>

      <div css={layoutAutoGridCss({ minItemWidth: '15rem', gap: euiTheme.size.base })}>
        {sortedSolutions.map((solution) => (
          <SolutionPanel addBasePath={addBasePath} key={solution.id} solution={solution} />
        ))}
      </div>
    </KibanaPageTemplate.Section>
  );
};
