/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validateAlertWorkflowTargets, validateEventWorkflowTargets } from './workflow_validation';

describe('attachment workflow validation', () => {
  it('accepts alert targets that match the selected alert inputs', () => {
    expect(() =>
      validateAlertWorkflowTargets({
        targets: [{ id: 'alert-1' }, { id: 'alert-2' }],
        inputs: {
          event: {
            alertIds: [{ _id: 'alert-2' }, { _id: 'alert-1' }],
          },
        },
      })
    ).not.toThrow();
  });

  it('rejects alert targets that do not match the selected alerts', () => {
    expect(() =>
      validateAlertWorkflowTargets({
        targets: [{ id: 'alert-1' }],
        inputs: { event: { alertIds: [{ _id: 'alert-2' }] } },
      })
    ).toThrow('Alert workflow origin targets must match the selected alerts.');
  });

  it('rejects event targets without document inputs', () => {
    expect(() =>
      validateEventWorkflowTargets({
        targets: [{ id: 'event-1' }],
        inputs: {},
      })
    ).toThrow('Event attachment workflow origins require selected document inputs.');
  });
});
