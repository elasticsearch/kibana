/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useParams } from 'react-router-dom';

export const useMonitorId = (): string => {
  const { monitorId } = useParams<{ monitorId: string }>();

  // decode 64 base string, it was decoded to make it a valid url, since monitor id can be a url
  // The id is base64-encoded when monitor links are generated, but a hand-typed, bookmarked, or
  // externally-linked URL may contain a raw (unencoded) id that is not valid base64. In that case
  // `atob` throws `InvalidCharacterError` during render, which crashes the app via the React error
  // boundary. Fall back to the raw param so the page can handle a missing/invalid monitor gracefully.
  try {
    return atob(monitorId || '');
  } catch {
    return monitorId || '';
  }
};
