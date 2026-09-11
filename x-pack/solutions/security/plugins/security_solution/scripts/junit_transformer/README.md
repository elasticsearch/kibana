The failed test reporter creates github issues based on junit reports. Github workflows, and kibanamachine workflows, allow the Kibana Operations team to track and triage flaky tests. These workflows rely on those github issues, specifically their titles, to work. The titles of the github issues contain an encoded version of the file path that contains the failing test. 

This process is facilitated by custom mocha/junit reporters written for the functional test runner and jest. These reporters encode the file name of each spec file and include it in an attribute on elements in the junit report.

There is no such custom mocha reporter for Cypress, and due to the architecture of Cypress, reusing the existing custom mocha reports, or any of their existing code, is not feasible. Cypress runs in its own process, with its own version of node, and that environment is incompatible with running `@kbn/swc-register`. This means we cannot easily interpret the code that implements the existing custom mocha reporters from within Cypress.

We could compile a library using the code from those custom junit reporters, but there is no established pattern or tooling for doing that.

For there reasons, our approach is to transform the junit report created by Cypress into a format consumable by the failed test reporter and the kibana operations triage scripts. This script does that.
