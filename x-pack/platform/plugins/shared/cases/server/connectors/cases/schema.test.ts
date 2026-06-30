/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  MAX_ALERTS_PER_CASE,
  MAX_DOCS_PER_PAGE,
  ABSOLUTE_MAX_CASES_PER_RUN,
} from '../../../common/constants';
import { CasesConnectorRunParamsSchema } from './schema';

describe('CasesConnectorRunParamsSchema', () => {
  const getParams = (overrides = {}) => ({
    alerts: [{ _id: 'alert-id', _index: 'alert-index' }],
    groupingBy: ['host.name'],
    rule: { id: 'rule-id', name: 'Test rule', tags: [], ruleUrl: 'https://example.com' },
    owner: 'cases',
    ...overrides,
  });

  it('accepts valid params', () => {
    expect(CasesConnectorRunParamsSchema.validate(getParams())).toMatchInlineSnapshot(`
      Object {
        "alerts": Array [
          Object {
            "_id": "alert-id",
            "_index": "alert-index",
          },
        ],
        "autoPushCase": null,
        "groupedAlerts": null,
        "groupingBy": Array [
          "host.name",
        ],
        "internallyManagedAlerts": null,
        "maximumCasesToOpen": 5,
        "owner": "cases",
        "reopenClosedCases": false,
        "rule": Object {
          "id": "rule-id",
          "name": "Test rule",
          "ruleUrl": "https://example.com",
          "tags": Array [],
        },
        "templateId": null,
        "templateVersion": null,
        "timeWindow": "7d",
      }
    `);
  });

  describe('alerts', () => {
    it('throws if the alerts do not contain _id and _index', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ alerts: [{ foo: 'bar' }] }))
      ).toThrow();
    });
  });

  describe('groupingBy', () => {
    it('accept an empty groupingBy array', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ groupingBy: [] }))
      ).not.toThrow();
    });

    it('does not accept more than one groupingBy key', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(
          getParams({ groupingBy: ['host.name', 'source.ip'] })
        )
      ).toThrow();
    });
  });

  describe('rule', () => {
    it('accept empty tags', () => {
      const params = getParams();

      expect(() =>
        CasesConnectorRunParamsSchema.validate({ ...params, rule: { ...params.rule, tags: [] } })
      ).not.toThrow();
    });

    it('does not accept an empty tag', () => {
      const params = getParams();

      expect(() =>
        CasesConnectorRunParamsSchema.validate({
          ...params,
          rule: { ...params.rule, tags: '' },
        })
      ).toThrow();
    });
  });

  describe('timeWindow', () => {
    it('throws if the first digit starts with zero', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: '0d' }))
      ).toThrow();
    });

    it('throws if the timeWindow does not start with a number', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: 'd1' }))
      ).toThrow();
    });

    it('should fail for valid date math but not valid time window', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: '10d+3d' }))
      ).toThrow();
    });

    it('throws if the timeWindow is less than 5 minutes', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: '3m' }))
      ).toThrow();
    });

    it('throws if there is a non valid letter at the end', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: '10d#' }))
      ).toThrow();
    });

    it('throws if there is a valid letter at the end', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: '10dd' }))
      ).toThrow();
    });

    it('throws if there is a digit at the end', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: '10d2' }))
      ).toThrow();
    });

    it('throws if there are two valid formats in sequence', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: '1d2d' }))
      ).toThrow();
    });

    it('accepts double digit numbers', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: '10d' }))
      ).not.toThrow();
    });

    it.each(['s', 'y', 'M', 'H'])('does not allow time unit %s', (unit) => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: `5${unit}` }))
      ).toThrow();
    });

    it.each(['d', 'w', 'h', 'm'])('allows time unit %s', (unit) => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ timeWindow: `5${unit}` }))
      ).not.toThrow();
    });

    it('defaults the timeWindow to 7d', () => {
      expect(CasesConnectorRunParamsSchema.validate(getParams()).timeWindow).toBe('7d');
    });
  });

  describe('reopenClosedCases', () => {
    it('defaults the reopenClosedCases to false', () => {
      expect(CasesConnectorRunParamsSchema.validate(getParams()).reopenClosedCases).toBe(false);
    });
  });

  describe('maximumCasesToOpen', () => {
    it('defaults the maximumCasesToOpen to 5', () => {
      expect(CasesConnectorRunParamsSchema.validate(getParams()).maximumCasesToOpen).toBe(5);
    });

    it('sets the maximumCasesToOpen correctly', () => {
      expect(
        CasesConnectorRunParamsSchema.validate(getParams({ maximumCasesToOpen: 3 }))
          .maximumCasesToOpen
      ).toBe(3);
    });

    it('does not accept maximumCasesToOpen to be zero', () => {
      const params = getParams();

      expect(() =>
        CasesConnectorRunParamsSchema.validate({
          ...params,
          maximumCasesToOpen: 0,
        })
      ).toThrow();
    });

    it('accepts maximumCasesToOpen values above the default maximum', () => {
      expect(
        CasesConnectorRunParamsSchema.validate(getParams({ maximumCasesToOpen: 21 }))
          .maximumCasesToOpen
      ).toBe(21);
    });

    it('does not accept maximumCasesToOpen above ABSOLUTE_MAX_CASES_PER_RUN', () => {
      expect(() =>
        CasesConnectorRunParamsSchema.validate(
          getParams({ maximumCasesToOpen: ABSOLUTE_MAX_CASES_PER_RUN + 1 })
        )
      ).toThrow();
    });
  });

  describe('templateId', () => {
    it('defaults the templateId to null', () => {
      expect(CasesConnectorRunParamsSchema.validate(getParams()).templateId).toBe(null);
    });

    it('accepts templateId as string', () => {
      expect(
        CasesConnectorRunParamsSchema.validate(getParams({ templateId: 'case_template_key' }))
          .templateId
      ).toBe('case_template_key');
    });
  });

  describe('templateVersion', () => {
    it('defaults the templateVersion to null', () => {
      expect(CasesConnectorRunParamsSchema.validate(getParams()).templateVersion).toBe(null);
    });

    it('accepts templateVersion as a string', () => {
      expect(
        CasesConnectorRunParamsSchema.validate(getParams({ templateVersion: '1' })).templateVersion
      ).toBe('1');
    });

    it('accepts templateVersion as null', () => {
      expect(
        CasesConnectorRunParamsSchema.validate(getParams({ templateVersion: null })).templateVersion
      ).toBe(null);
    });
  });

  describe('groupedAlerts', () => {
    it('defaults the groupedAlerts to null', () => {
      expect(CasesConnectorRunParamsSchema.validate(getParams()).groupedAlerts).toBe(null);
    });

    it('accept empty groupedAlerts', () => {
      expect(
        CasesConnectorRunParamsSchema.validate(getParams({ groupedAlerts: [] })).groupedAlerts
      ).toEqual([]);
    });

    it('accepts valid groupedAlerts', () => {
      const groupedAlerts = [
        {
          alerts: [{ _id: 'alert-id-1', _index: 'alert-index-2' }],
          comments: ['comment-1'],
          grouping: { field_name: 'field_value' },
          title: 'custom-title',
        },
      ];
      expect(CasesConnectorRunParamsSchema.validate(getParams({ groupedAlerts })).groupedAlerts)
        .toMatchInlineSnapshot(`
        Array [
          Object {
            "alerts": Array [
              Object {
                "_id": "alert-id-1",
                "_index": "alert-index-2",
              },
            ],
            "comments": Array [
              "comment-1",
            ],
            "grouping": Object {
              "field_name": "field_value",
            },
            "title": "custom-title",
          },
        ]
      `);
    });

    it('does not accept undefined `grouping` field', () => {
      const groupedAlerts = [
        {
          alerts: [{ _id: 'alert-id-1', _index: 'alert-index-2' }],
          comments: ['comment-1'],
          title: 'custom-title',
        },
      ];
      expect(() => CasesConnectorRunParamsSchema.validate(getParams({ groupedAlerts }))).toThrow();
    });

    it('does not accept undefined `alerts` field', () => {
      const groupedAlerts = [
        {
          comments: ['comment-1'],
          grouping: { field_name: 'field_value' },
          title: 'custom-title',
        },
      ];
      expect(() => CasesConnectorRunParamsSchema.validate(getParams({ groupedAlerts }))).toThrow();
    });

    it('does not accept more than `MAX_ALERTS_PER_CASE` items in `alerts` field', () => {
      const groupedAlerts = [
        {
          alerts: new Array(MAX_ALERTS_PER_CASE + 1).fill({
            _id: 'alert-id-1',
            _index: 'alert-index-2',
          }),
          comments: ['comment-1'],
          grouping: { field_name: 'field_value' },
          title: 'custom-title',
        },
      ];
      expect(() => CasesConnectorRunParamsSchema.validate(getParams({ groupedAlerts }))).toThrow();
    });

    it('does not accept more than `MAX_DOCS_PER_PAGE / 2` items in `comments` field', () => {
      const groupedAlerts = [
        {
          alerts: [{ _id: 'alert-id-1', _index: 'alert-index-2' }],
          comments: new Array(MAX_DOCS_PER_PAGE / 2 + 1).fill('comment-1'),
          grouping: { field_name: 'field_value' },
          title: 'custom-title',
        },
      ];
      expect(() => CasesConnectorRunParamsSchema.validate(getParams({ groupedAlerts }))).toThrow();
    });

    it('accept undefined `comments` field', () => {
      const groupedAlerts = [
        {
          alerts: [{ _id: 'alert-id-1', _index: 'alert-index-2' }],
          grouping: { field_name: 'field_value' },
          title: 'custom-title',
        },
      ];
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ groupedAlerts }))
      ).not.toThrow();
    });

    it('accept undefined `title` field', () => {
      const groupedAlerts = [
        {
          alerts: [{ _id: 'alert-id-1', _index: 'alert-index-2' }],
          comments: ['comment-1'],
          grouping: { field_name: 'field_value' },
        },
      ];
      expect(() =>
        CasesConnectorRunParamsSchema.validate(getParams({ groupedAlerts }))
      ).not.toThrow();
    });
  });

  describe('internallyManagedAlerts', () => {
    it('defaults the internallyManagedAlerts to null', () => {
      expect(CasesConnectorRunParamsSchema.validate(getParams()).internallyManagedAlerts).toBe(
        null
      );
    });
  });
});
