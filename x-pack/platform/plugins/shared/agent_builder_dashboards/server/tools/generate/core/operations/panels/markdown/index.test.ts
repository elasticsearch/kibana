/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { markdownByValueStateSchema } from '@kbn/dashboard-markdown/server';
import { markdownPanelConfigSchema } from '.';

/**
 * Drift guard: the markdown by-value config the tool accepts is a hand-maintained
 * copy of the dashboard-markdown embeddable's by-value state. Every config that
 * passes the tool's input schema must also be accepted by the real embeddable
 * schema, otherwise the tool would persist panels the dashboard cannot render.
 * If the embeddable contract changes, these assertions fail instead of shipping
 * broken dashboards.
 */
describe('markdownPanelConfigSchema parity with the embeddable by-value state', () => {
  it.each([
    { content: 'hello' },
    { content: 'hello', settings: {} },
    { content: 'hello', settings: { open_links_in_new_tab: true } },
    { content: 'hello', settings: { open_links_in_new_tab: false } },
  ])('produces embeddable-valid by-value state for %j', (input) => {
    const parsed = markdownPanelConfigSchema.parse(input);

    expect(() => markdownByValueStateSchema.validate(parsed)).not.toThrow();
  });

  it('relies on the embeddable to default open_links_in_new_tab to true when settings is omitted', () => {
    const parsed = markdownPanelConfigSchema.parse({ content: 'hello' });

    expect(markdownByValueStateSchema.validate(parsed)).toEqual({
      content: 'hello',
      settings: { open_links_in_new_tab: true },
    });
  });
});
