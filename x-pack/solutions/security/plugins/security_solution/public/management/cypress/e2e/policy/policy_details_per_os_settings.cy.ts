/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IndexedFleetEndpointPolicyResponse } from '../../../../../common/endpoint/data_loaders/index_fleet_endpoint_policy';
import type { PolicyData } from '../../../../../common/endpoint/types';
import { getPolicySettingsFormTestSubjects } from '../../../pages/policy/view/policy_settings_form/mocks';
import { savePolicyForm } from '../../screens/policy_details';
import { createAgentPolicyTask, getEndpointIntegrationVersion } from '../../tasks/fleet';
import { login } from '../../tasks/login';
import { loadPage } from '../../tasks/common';

const formTestSubj = getPolicySettingsFormTestSubjects('endpointPolicyForm');
const perOsMalware = formTestSubj.perOsMalware;
const DETECT_LABEL = 'Detect';

const loadSettingsUrl = (policyId: string) =>
  loadPage(`/app/security/administration/policy/${policyId}/settings`);

const selectOsProtectionMode = (modeSelectTestSubj: string, label: string) => {
  cy.getByTestSubj(modeSelectTestSubj).click();
  cy.get('[role="option"]')
    .contains(new RegExp(`^${label}$`))
    .click();
};

const expectModeSelectValue = (modeSelectTestSubj: string, label: string) => {
  cy.getByTestSubj(modeSelectTestSubj).should(($el) => {
    expect($el.text().trim()).to.eq(label);
  });
};

describe(
  'Policy Details - Per-OS policy settings',
  {
    env: {
      ftrConfig: {
        kbnServerArgs: [
          `--xpack.securitySolution.enableExperimental=${JSON.stringify(['perOsPolicySettings'])}`,
        ],
      },
    },
    tags: ['@ess', '@serverless', '@skipInServerlessMKI'],
  },
  () => {
    let indexedPolicy: IndexedFleetEndpointPolicyResponse;
    let policy: PolicyData;

    beforeEach(() => {
      login();
      getEndpointIntegrationVersion().then((version) => {
        createAgentPolicyTask(version).then((data) => {
          indexedPolicy = data;
          policy = indexedPolicy.integrationPolicies[0];
        });
      });
    });

    afterEach(() => {
      if (indexedPolicy) {
        cy.task('deleteIndexedFleetEndpointPolicies', indexedPolicy);
      }
    });

    // The other three Cypress cases live in RTL: per_os/per_os_malware_protections_card.test.tsx
    // (cross-OS isolation) and per_os/per_os_ransomware_protection_card.test.tsx (no Linux row).
    // This one stays because save-plus-reload persistence needs a real stack.
    it('persists Windows Detect across save and reload without changing other OSs', () => {
      loadSettingsUrl(policy.id);
      cy.getByTestSubj(perOsMalware.mac.modeSelect)
        .invoke('text')
        .then((macBefore) => {
          cy.getByTestSubj(perOsMalware.linux.modeSelect)
            .invoke('text')
            .then((linuxBefore) => {
              selectOsProtectionMode(perOsMalware.windows.modeSelect, DETECT_LABEL);
              savePolicyForm();
              loadSettingsUrl(policy.id);
              expectModeSelectValue(perOsMalware.windows.modeSelect, DETECT_LABEL);
              cy.getByTestSubj(perOsMalware.mac.modeSelect).should(($el) => {
                expect($el.text().trim()).to.eq(macBefore.trim());
              });
              cy.getByTestSubj(perOsMalware.linux.modeSelect).should(($el) => {
                expect($el.text().trim()).to.eq(linuxBefore.trim());
              });
            });
        });
    });
  }
);
