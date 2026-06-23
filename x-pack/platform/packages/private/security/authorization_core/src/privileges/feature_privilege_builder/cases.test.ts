/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeatureKibanaPrivileges } from '@kbn/features-plugin/server';
import { KibanaFeature } from '@kbn/features-plugin/server';

import { FeaturePrivilegeCasesBuilder } from './cases';
import { Actions } from '../../actions';

describe(`cases`, () => {
  describe(`feature_privilege_builder`, () => {
    it('grants no privileges by default', () => {
      const actions = new Actions();
      const casesFeaturePrivileges = new FeaturePrivilegeCasesBuilder(actions);

      const privilege: FeatureKibanaPrivileges = {
        savedObject: {
          all: [],
          read: [],
        },
        ui: [],
      };

      const feature = new KibanaFeature({
        id: 'my-feature',
        name: 'my-feature',
        app: [],
        category: { id: 'foo', label: 'foo' },
        privileges: {
          all: privilege,
          read: privilege,
        },
      });

      expect(casesFeaturePrivileges.getActions(privilege, feature)).toEqual([]);
    });

    describe(`within feature`, () => {
      it.each([
        ['all', 'observability'],
        ['push', 'obs'],
        ['create', 'securitySolution'],
        ['read', 'observability'],
        ['update', 'observability'],
        ['delete', 'securitySolution'],
        ['settings', 'observability'],
        ['createComment', 'securitySolution'],
        ['reopenCase', 'observability'],
        ['manageTemplates', 'securitySolution'],
      ])('grants %s privileges under feature with id %s', (operation, featureID) => {
        const actions = new Actions();
        const casesFeaturePrivilege = new FeaturePrivilegeCasesBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          cases: {
            [operation]: [featureID],
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(casesFeaturePrivilege.getActions(privilege, feature)).toMatchSnapshot();
      });

      it('grants all privileges under feature', () => {
        const actions = new Actions();
        const casesFeaturePrivilege = new FeaturePrivilegeCasesBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          cases: {
            all: ['security'],
            create: ['security'],
            update: ['obs'],
            delete: ['security'],
            read: ['obs'],
            settings: ['security'],
            createComment: ['security'],
            reopenCase: ['security'],
            manageTemplates: ['security'],
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(casesFeaturePrivilege.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "cases:security/pushCase",
            "cases:security/createCase",
            "cases:security/getCase",
            "cases:security/getComment",
            "cases:security/getTags",
            "cases:security/getReporters",
            "cases:security/getUserActions",
            "cases:security/findConfigurations",
            "cases:security/getFieldDefinitions",
            "cases:security/updateCase",
            "cases:security/updateComment",
            "cases:security/deleteCase",
            "cases:security/deleteComment",
            "cases:security/createConfiguration",
            "cases:security/updateConfiguration",
            "cases:security/createComment",
            "cases:security/reopenCase",
            "cases:security/assignCase",
            "cases:obs/getCase",
            "cases:obs/getComment",
            "cases:obs/getTags",
            "cases:obs/getReporters",
            "cases:obs/getUserActions",
            "cases:obs/findConfigurations",
            "cases:obs/getFieldDefinitions",
            "cases:obs/updateCase",
            "cases:obs/updateComment",
            "cases:security/manageTemplate",
          ]
        `);
      });

      it('grants both `all` and `read` privileges under feature with multiple values in cases array', () => {
        const actions = new Actions();
        const casesFeaturePrivilege = new FeaturePrivilegeCasesBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          cases: {
            all: ['security', 'other-security'],
            read: ['obs', 'other-obs'],
            manageTemplates: ['security'],
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(casesFeaturePrivilege.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "cases:security/pushCase",
            "cases:security/createCase",
            "cases:security/getCase",
            "cases:security/getComment",
            "cases:security/getTags",
            "cases:security/getReporters",
            "cases:security/getUserActions",
            "cases:security/findConfigurations",
            "cases:security/getFieldDefinitions",
            "cases:security/updateCase",
            "cases:security/updateComment",
            "cases:security/deleteCase",
            "cases:security/deleteComment",
            "cases:security/createConfiguration",
            "cases:security/updateConfiguration",
            "cases:security/createComment",
            "cases:security/reopenCase",
            "cases:security/assignCase",
            "cases:other-security/pushCase",
            "cases:other-security/createCase",
            "cases:other-security/getCase",
            "cases:other-security/getComment",
            "cases:other-security/getTags",
            "cases:other-security/getReporters",
            "cases:other-security/getUserActions",
            "cases:other-security/findConfigurations",
            "cases:other-security/getFieldDefinitions",
            "cases:other-security/updateCase",
            "cases:other-security/updateComment",
            "cases:other-security/deleteCase",
            "cases:other-security/deleteComment",
            "cases:other-security/createConfiguration",
            "cases:other-security/updateConfiguration",
            "cases:other-security/createComment",
            "cases:other-security/reopenCase",
            "cases:other-security/assignCase",
            "cases:obs/getCase",
            "cases:obs/getComment",
            "cases:obs/getTags",
            "cases:obs/getReporters",
            "cases:obs/getUserActions",
            "cases:obs/findConfigurations",
            "cases:obs/getFieldDefinitions",
            "cases:other-obs/getCase",
            "cases:other-obs/getComment",
            "cases:other-obs/getTags",
            "cases:other-obs/getReporters",
            "cases:other-obs/getUserActions",
            "cases:other-obs/findConfigurations",
            "cases:other-obs/getFieldDefinitions",
            "cases:security/manageTemplate",
          ]
        `);
      });
    });
  });
});
