/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { AVAILABLE_TUTORIALS, type TutorialSlug } from '../../../hooks/use_tutorial_content';
import { TutorialSelector } from './tutorial_selector';
import { TutorialRunner } from './tutorial_runner';

export const UpdatedTutorials: React.FC = () => {
  const [selectedSlug, setSelectedSlug] = useState<TutorialSlug | null>(null);

  const selectedTutorial = useMemo(
    () => AVAILABLE_TUTORIALS.find((t) => t.slug === selectedSlug) ?? null,
    [selectedSlug]
  );

  const handleBack = useCallback(() => setSelectedSlug(null), []);

  if (selectedTutorial) {
    return <TutorialRunner tutorial={selectedTutorial} onBack={handleBack} />;
  }

  return <TutorialSelector tutorials={AVAILABLE_TUTORIALS} onSelect={setSelectedSlug} />;
};
