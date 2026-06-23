/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InactivityTimeouts } from './build_status_runtime_field';
import { _buildStatusRuntimeField } from './build_status_runtime_field';

describe('buildStatusRuntimeField', () => {
  const now = 1234567890123;
  beforeAll(() => {
    global.Date.now = jest.fn(() => now);
  });
  it('should build the correct runtime field if there are no inactivity timeouts', () => {
    const inactivityTimeouts: InactivityTimeouts = [];
    const runtimeField = _buildStatusRuntimeField({ inactivityTimeouts });
    expect(runtimeField).toMatchInlineSnapshot(`
      Object {
        "status": Object {
          "script": Object {
            "lang": "painless",
            "source": " long lastCheckinMillis = doc.containsKey('last_checkin') && doc['last_checkin'].size() > 0 ? doc['last_checkin'].value.toInstant().toEpochMilli() : ( doc['enrolled_at'].size() > 0 ? doc['enrolled_at'].value.toInstant().toEpochMilli() : -1 ); if (!doc.containsKey('active') || (doc['active'].size() > 0 && doc['active'].value == false)) { emit('unenrolled'); } else if (doc.containsKey('audit_unenrolled_reason') && doc['audit_unenrolled_reason'].size() > 0 && doc['audit_unenrolled_reason'].value == 'uninstall'){emit('uninstalled');} else if (doc.containsKey('audit_unenrolled_reason') && doc['audit_unenrolled_reason'].size() > 0 && doc['audit_unenrolled_reason'].value == 'orphaned'){emit('orphaned');} else if ( lastCheckinMillis > 0 && lastCheckinMillis < 1234567530123L ) { emit('offline'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'disconnected' ) { emit('offline'); } else if ( doc['policy_revision_idx'].size() == 0 || ( doc['upgrade_started_at'].size() > 0 && doc['upgraded_at'].size() == 0 ) ) { emit('updating'); } else if (doc['last_checkin'].size() == 0) { emit('enrolling'); } else if (doc['unenrollment_started_at'].size() > 0) { emit('unenrolling'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'error' ) { emit('error'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'degraded' ) { emit('degraded'); } else { emit('online'); }",
          },
          "type": "keyword",
        },
      }
    `);
  });
  it('should build the correct runtime field if there are no inactivity timeouts (prefix)', () => {
    const inactivityTimeouts: InactivityTimeouts = [];
    const runtimeField = _buildStatusRuntimeField({ inactivityTimeouts, pathPrefix: 'my.prefix.' });
    expect(runtimeField).toMatchInlineSnapshot(`
      Object {
        "status": Object {
          "script": Object {
            "lang": "painless",
            "source": " long lastCheckinMillis = doc.containsKey('my.prefix.last_checkin') && doc['my.prefix.last_checkin'].size() > 0 ? doc['my.prefix.last_checkin'].value.toInstant().toEpochMilli() : ( doc['my.prefix.enrolled_at'].size() > 0 ? doc['my.prefix.enrolled_at'].value.toInstant().toEpochMilli() : -1 ); if (!doc.containsKey('my.prefix.active') || (doc['my.prefix.active'].size() > 0 && doc['my.prefix.active'].value == false)) { emit('unenrolled'); } else if (doc.containsKey('audit_unenrolled_reason') && doc['my.prefix.audit_unenrolled_reason'].size() > 0 && doc['my.prefix.audit_unenrolled_reason'].value == 'uninstall'){emit('uninstalled');} else if (doc.containsKey('audit_unenrolled_reason') && doc['my.prefix.audit_unenrolled_reason'].size() > 0 && doc['my.prefix.audit_unenrolled_reason'].value == 'orphaned'){emit('orphaned');} else if ( lastCheckinMillis > 0 && lastCheckinMillis < 1234567530123L ) { emit('offline'); } else if ( doc['my.prefix.last_checkin_status'].size() > 0 && doc['my.prefix.last_checkin_status'].value.toLowerCase() == 'disconnected' ) { emit('offline'); } else if ( doc['my.prefix.policy_revision_idx'].size() == 0 || ( doc['my.prefix.upgrade_started_at'].size() > 0 && doc['my.prefix.upgraded_at'].size() == 0 ) ) { emit('updating'); } else if (doc['my.prefix.last_checkin'].size() == 0) { emit('enrolling'); } else if (doc['my.prefix.unenrollment_started_at'].size() > 0) { emit('unenrolling'); } else if ( doc['my.prefix.last_checkin_status'].size() > 0 && doc['my.prefix.last_checkin_status'].value.toLowerCase() == 'error' ) { emit('error'); } else if ( doc['my.prefix.last_checkin_status'].size() > 0 && doc['my.prefix.last_checkin_status'].value.toLowerCase() == 'degraded' ) { emit('degraded'); } else { emit('online'); }",
          },
          "type": "keyword",
        },
      }
    `);
  });
  it('should build the correct runtime field if there is one inactivity timeout', () => {
    const inactivityTimeouts: InactivityTimeouts = [
      {
        inactivityTimeout: 300,
        policyIds: ['policy-1'],
      },
    ];
    const runtimeField = _buildStatusRuntimeField({ inactivityTimeouts });
    expect(runtimeField).toMatchInlineSnapshot(`
      Object {
        "status": Object {
          "script": Object {
            "lang": "painless",
            "source": " long lastCheckinMillis = doc.containsKey('last_checkin') && doc['last_checkin'].size() > 0 ? doc['last_checkin'].value.toInstant().toEpochMilli() : ( doc['enrolled_at'].size() > 0 ? doc['enrolled_at'].value.toInstant().toEpochMilli() : -1 ); if (!doc.containsKey('active') || (doc['active'].size() > 0 && doc['active'].value == false)) { emit('unenrolled'); } else if (lastCheckinMillis > 0 && doc.containsKey('policy_id') && doc['policy_id'].size() > 0 && (['policy-1'].contains(doc['policy_id'].value) && lastCheckinMillis < 1234567590123L)) {emit('inactive');} else if (doc.containsKey('audit_unenrolled_reason') && doc['audit_unenrolled_reason'].size() > 0 && doc['audit_unenrolled_reason'].value == 'uninstall'){emit('uninstalled');} else if (doc.containsKey('audit_unenrolled_reason') && doc['audit_unenrolled_reason'].size() > 0 && doc['audit_unenrolled_reason'].value == 'orphaned'){emit('orphaned');} else if ( lastCheckinMillis > 0 && lastCheckinMillis < 1234567530123L ) { emit('offline'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'disconnected' ) { emit('offline'); } else if ( doc['policy_revision_idx'].size() == 0 || ( doc['upgrade_started_at'].size() > 0 && doc['upgraded_at'].size() == 0 ) ) { emit('updating'); } else if (doc['last_checkin'].size() == 0) { emit('enrolling'); } else if (doc['unenrollment_started_at'].size() > 0) { emit('unenrolling'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'error' ) { emit('error'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'degraded' ) { emit('degraded'); } else { emit('online'); }",
          },
          "type": "keyword",
        },
      }
    `);
  });
  it('should build the correct runtime field if there are multiple inactivity timeouts with same timeout', () => {
    const inactivityTimeouts: InactivityTimeouts = [
      {
        inactivityTimeout: 300,
        policyIds: ['policy-1', 'policy-2'],
      },
    ];
    const runtimeField = _buildStatusRuntimeField({ inactivityTimeouts });
    expect(runtimeField).toMatchInlineSnapshot(`
      Object {
        "status": Object {
          "script": Object {
            "lang": "painless",
            "source": " long lastCheckinMillis = doc.containsKey('last_checkin') && doc['last_checkin'].size() > 0 ? doc['last_checkin'].value.toInstant().toEpochMilli() : ( doc['enrolled_at'].size() > 0 ? doc['enrolled_at'].value.toInstant().toEpochMilli() : -1 ); if (!doc.containsKey('active') || (doc['active'].size() > 0 && doc['active'].value == false)) { emit('unenrolled'); } else if (lastCheckinMillis > 0 && doc.containsKey('policy_id') && doc['policy_id'].size() > 0 && (['policy-1','policy-2'].contains(doc['policy_id'].value) && lastCheckinMillis < 1234567590123L)) {emit('inactive');} else if (doc.containsKey('audit_unenrolled_reason') && doc['audit_unenrolled_reason'].size() > 0 && doc['audit_unenrolled_reason'].value == 'uninstall'){emit('uninstalled');} else if (doc.containsKey('audit_unenrolled_reason') && doc['audit_unenrolled_reason'].size() > 0 && doc['audit_unenrolled_reason'].value == 'orphaned'){emit('orphaned');} else if ( lastCheckinMillis > 0 && lastCheckinMillis < 1234567530123L ) { emit('offline'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'disconnected' ) { emit('offline'); } else if ( doc['policy_revision_idx'].size() == 0 || ( doc['upgrade_started_at'].size() > 0 && doc['upgraded_at'].size() == 0 ) ) { emit('updating'); } else if (doc['last_checkin'].size() == 0) { emit('enrolling'); } else if (doc['unenrollment_started_at'].size() > 0) { emit('unenrolling'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'error' ) { emit('error'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'degraded' ) { emit('degraded'); } else { emit('online'); }",
          },
          "type": "keyword",
        },
      }
    `);
  });
  it('should not perform inactivity check if there are too many agent policies with an inactivity timeout', () => {
    const inactivityTimeouts: InactivityTimeouts = [
      {
        inactivityTimeout: 300,
        // default max is 750
        policyIds: new Array(1000).fill(0).map((_, i) => `policy-${i}`),
      },
    ];

    const runtimeField = _buildStatusRuntimeField({ inactivityTimeouts });

    expect(runtimeField).not.toContain('policy-');
    expect(runtimeField).toMatchInlineSnapshot(`
      Object {
        "status": Object {
          "script": Object {
            "lang": "painless",
            "source": " long lastCheckinMillis = doc.containsKey('last_checkin') && doc['last_checkin'].size() > 0 ? doc['last_checkin'].value.toInstant().toEpochMilli() : ( doc['enrolled_at'].size() > 0 ? doc['enrolled_at'].value.toInstant().toEpochMilli() : -1 ); if (!doc.containsKey('active') || (doc['active'].size() > 0 && doc['active'].value == false)) { emit('unenrolled'); } else if (doc.containsKey('audit_unenrolled_reason') && doc['audit_unenrolled_reason'].size() > 0 && doc['audit_unenrolled_reason'].value == 'uninstall'){emit('uninstalled');} else if (doc.containsKey('audit_unenrolled_reason') && doc['audit_unenrolled_reason'].size() > 0 && doc['audit_unenrolled_reason'].value == 'orphaned'){emit('orphaned');} else if ( lastCheckinMillis > 0 && lastCheckinMillis < 1234567530123L ) { emit('offline'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'disconnected' ) { emit('offline'); } else if ( doc['policy_revision_idx'].size() == 0 || ( doc['upgrade_started_at'].size() > 0 && doc['upgraded_at'].size() == 0 ) ) { emit('updating'); } else if (doc['last_checkin'].size() == 0) { emit('enrolling'); } else if (doc['unenrollment_started_at'].size() > 0) { emit('unenrolling'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'error' ) { emit('error'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'degraded' ) { emit('degraded'); } else { emit('online'); }",
          },
          "type": "keyword",
        },
      }
    `);
  });
  it('should build the correct runtime field if there are multiple inactivity timeouts with different timeout', () => {
    const inactivityTimeouts: InactivityTimeouts = [
      {
        inactivityTimeout: 300,
        policyIds: ['policy-1', 'policy-2'],
      },
      {
        inactivityTimeout: 400,
        policyIds: ['policy-3'],
      },
    ];
    const runtimeField = _buildStatusRuntimeField({ inactivityTimeouts });
    expect(runtimeField).toMatchInlineSnapshot(`
      Object {
        "status": Object {
          "script": Object {
            "lang": "painless",
            "source": " long lastCheckinMillis = doc.containsKey('last_checkin') && doc['last_checkin'].size() > 0 ? doc['last_checkin'].value.toInstant().toEpochMilli() : ( doc['enrolled_at'].size() > 0 ? doc['enrolled_at'].value.toInstant().toEpochMilli() : -1 ); if (!doc.containsKey('active') || (doc['active'].size() > 0 && doc['active'].value == false)) { emit('unenrolled'); } else if (lastCheckinMillis > 0 && doc.containsKey('policy_id') && doc['policy_id'].size() > 0 && (['policy-1','policy-2'].contains(doc['policy_id'].value) && lastCheckinMillis < 1234567590123L || ['policy-3'].contains(doc['policy_id'].value) && lastCheckinMillis < 1234567490123L)) {emit('inactive');} else if (doc.containsKey('audit_unenrolled_reason') && doc['audit_unenrolled_reason'].size() > 0 && doc['audit_unenrolled_reason'].value == 'uninstall'){emit('uninstalled');} else if (doc.containsKey('audit_unenrolled_reason') && doc['audit_unenrolled_reason'].size() > 0 && doc['audit_unenrolled_reason'].value == 'orphaned'){emit('orphaned');} else if ( lastCheckinMillis > 0 && lastCheckinMillis < 1234567530123L ) { emit('offline'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'disconnected' ) { emit('offline'); } else if ( doc['policy_revision_idx'].size() == 0 || ( doc['upgrade_started_at'].size() > 0 && doc['upgraded_at'].size() == 0 ) ) { emit('updating'); } else if (doc['last_checkin'].size() == 0) { emit('enrolling'); } else if (doc['unenrollment_started_at'].size() > 0) { emit('unenrolling'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'error' ) { emit('error'); } else if ( doc['last_checkin_status'].size() > 0 && doc['last_checkin_status'].value.toLowerCase() == 'degraded' ) { emit('degraded'); } else { emit('online'); }",
          },
          "type": "keyword",
        },
      }
    `);
  });
  it('should build the same runtime field if path ends with. or not', () => {
    const inactivityTimeouts: InactivityTimeouts = [];
    const runtimeFieldWithDot = _buildStatusRuntimeField({
      inactivityTimeouts,
      pathPrefix: 'my.prefix.',
    });
    const runtimeFieldNoDot = _buildStatusRuntimeField({
      inactivityTimeouts,
      pathPrefix: 'my.prefix',
    });
    expect(runtimeFieldWithDot).toEqual(runtimeFieldNoDot);
  });
});
