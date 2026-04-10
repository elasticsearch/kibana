/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCard, EuiFlexGrid, EuiFlexItem, EuiIcon } from '@elastic/eui';
import type { TutorialDefinition, TutorialSlug } from '../../../hooks/use_tutorial_content';

export interface TutorialSelectorProps {
  tutorials: TutorialDefinition[];
  onSelect: (slug: TutorialSlug) => void;
}

export const TutorialSelector: React.FC<TutorialSelectorProps> = ({ tutorials, onSelect }) => {
  return (
    <EuiFlexGrid columns={3} gutterSize="l">
      {tutorials.map((tutorial) => (
        <EuiFlexItem key={tutorial.slug}>
          <EuiCard
            hasBorder
            icon={<EuiIcon type="documentation" size="xl" aria-hidden={true} />}
            title={tutorial.title}
            titleSize="xs"
            description={tutorial.description}
            onClick={() => onSelect(tutorial.slug)}
            data-test-subj={`tutorialCard-${tutorial.slug}`}
          />
        </EuiFlexItem>
      ))}
    </EuiFlexGrid>
  );
};
