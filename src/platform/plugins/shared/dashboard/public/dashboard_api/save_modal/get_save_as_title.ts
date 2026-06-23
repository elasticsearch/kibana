/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { extractTitleAndCount } from '../../utils/extract_title_and_count';
import { dashboardClient } from '../../dashboard_client';

export const computeSaveAsTitle = (title: string, existingTitles: string[]): string => {
  const [baseTitle, baseCount] = extractTitleAndCount(title);

  let saveAsTitle = `${baseTitle} (${baseCount + 1})`;

  const hasTitleDuplicate = existingTitles.some((existingTitle) => existingTitle === title);

  if (hasTitleDuplicate) {
    const [largestDuplicationId] = existingTitles
      .map((existingTitle) => extractTitleAndCount(existingTitle)[1])
      .sort((a, b) => b - a);
    saveAsTitle = `${baseTitle} (${largestDuplicationId + 1})`;
  }

  return saveAsTitle;
};

export const getSaveAsTitle = async (title: string) => {
  const [baseTitle] = extractTitleAndCount(title);
  const { dashboards } = await dashboardClient.search({
    query: baseTitle,
    per_page: 20,
  });

  return computeSaveAsTitle(
    title,
    dashboards.map(({ data }) => data.title)
  );
};
