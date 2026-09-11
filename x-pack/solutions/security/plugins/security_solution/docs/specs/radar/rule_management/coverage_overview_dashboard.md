# Coverage Overview Dashboard

This is a test plan for the Mitre Att&ck coverage overview dashboard

Status: `in progress`. The current test plan matches `Milestone 1 - MVP` of the [Protections/Detections Coverage Overview Page](https://github.com/elastic/security-team/issues/2905) epic. The plan will be built upon further as more feature are added in later milestones.

## Useful information

### Tickets

- [Protections/Detections Coverage Overview Page](https://github.com/elastic/security-team/issues/2905) epic
- [Add test coverage for Protections/Detections Coverage Overview](https://github.com/elastic/kibana/issues/162250)
- [Write a test plan for Protections/Detections Coverage Overview](https://github.com/elastic/kibana/issues/162248)

### Terminology

- **MITRE ATT&CK**: The [3rd party framework](https://attack.mitre.org/) the dashboard is built upon. It is a knowledge base of attack tactics and techniques adversaries use in real world applications.

- **Tactic**: A generalized category or process that adversaries use to attack a system. Envelops many relevant Mitre Att&ck techniques

- **Technique**: A specific technique adversaries use to attack a system. Can belong to one or more different Mitre Tactics and can potentially contain one or more sub-techniques further describing the process.

- **Rule Activity**: The filter type defining rule status, current options are `enabled` and `disabled`.

- **Rule Source**: The filter type defining rule type, current options are `prebuilt`(from elastic prebuilt rules package) and `custom`(created by user)

- **Initial filter state**: The filters present on initial page load. Rule activity will be set to `enabled`, rule source will be set to `prebuilt` and `custom` simultaneously.

- **Dashboard containing the rule data**: The normal render of the coverage overview dashboard. Any returned rule data mapped correctly to the tile layout of all the MITRE data in a colored grid

### Assumptions

- Currently all scenarios below only apply to rules that have correctly mapped `threat` fields (unmapped fields or `threat` fields that don't contain current versioned Mitre Att&ck data will not be displayed in the dashboard)
- The feature is available under the Basic license
- "Rules" will be referring to Security rules only (unless stated otherwise)
- Page always loads with initial filter state

### Non-functional requirements

- Number of rules needs to be under 10k due to [an issue](https://github.com/elastic/kibana/issues/160698)

## Scenarios

### Coverage overview workflow: base cases

#### **Scenario: No rules installed**

**Automation**: 1 e2e test + 1 unit test + 1 integration test.

```Gherkin
Given no rules installed/created
When user navigates to Coverage Overview page
Then an empty grid of all Mitre tactics and techniques is displayed
```

#### **Scenario: Rules installed**

**Automation**: 1 e2e test + 2 integration test

```Gherkin
Given prebuilt rules installed and/or custom rules created
And rules enabled
When user navigates to Coverage Overview page
Then page should render all rule data in grid
And color tiles according to filters and dashboard legend

CASE: Test case should work with non-security rules both present and not present in system
```

#### **Scenario: User clicks on tile**

**Automation**: 1 e2e test + 1 unit test.

```Gherkin
Given prebuilt rules installed and/or custom rules created
And rules enabled
When user navigates to Coverage Overview page
And clicks on technique tile with non zero rules
Then the popover should display the same number of rule names under their corresponding rule activity section
And each name should link to its own rule details page
And popover title should link to corresponding MITRE technique definition
```

#### **Scenario: User clicks on expand/collapse cells button**

**Automation**: 1 unit test.

```Gherkin
Given prebuilt rules installed and/or custom rules created
And rules enabled
When user navigates to Coverage Overview page
And clicks on expand cells
Then the grid should display expanded cell view for each tile
And each tile should contain the correct number for enabled/disabled rule count display
```

#### **Scenario: User updates from 7.x to 8.x**

**Automation**: Manual testing.

```Gherkin
Given user is on `7.x` version of kibana
And has prebuilt rules installed and/or custom rules created
When user upgrades to `8.x` version of kibana
And navigates to the coverage overview page
Then no errors should be thrown when displaying the dashboard containing the rule data
```

### Coverage overview workflow: filters

#### **Scenario: No filters are present**

**Automation**: 1 integration test.

```Gherkin
Given coverage overview page is loaded with rule data
When no filters or search term are present
Then the dashboard is rendered according to the rule data
```

#### **Scenario: Users enables filters**

**Automation**: integration tests + e2e tests.

```Gherkin
Given coverage overview page is loaded with rule data
When filter(s) is/are enabled
Then all filtered rule data is fetched and dashboard containing the rule data is rendered

CASE: Filtering should work for all permutations of activity and source filters

Examples:
  | type                   |
  | enabled                |
  | disabled               |
  | prebuilt               |
  | custom                 |
  | enabled and disabled   |
  | prebuilt and custom    |
  | all                    |
```

#### **Scenario: Search term filter present**

**Automation**: 1 integration test + 1 e2e test.

```Gherkin
Given coverage overview page is loaded with rule data
When search term filter is present in search box
And user submits the search
Then only search-filtered rule data is fetched and rendered
```

### Coverage overview workflow: rule enabling

#### **Scenario: User can't enable all rules when no disabled rules**

**Automation**: 1 unit test.

```Gherkin
Given coverage overview page is loaded with rule data
When user clicks on a technique tile with no disabled rules
Then "enable all disabled" button should be disabled
```

#### **Scenario: User enables all rules for technique**

**Automation**: 1 e2e test.

```Gherkin
Given coverage overview page is loaded with rule data
When user clicks on a technique tile with X disabled rules
And clicks "enable all disabled" button
Then all X disabled rules hould be enabled
And user should see success toast message for X rules enabled
And page should update data
```

#### **Scenario: User can't enable rules when they don't have CRUD privileges**

**Automation**: 1 unit test.

```Gherkin
Given coverage overview page is loaded with rule data
And user that doesn't have CRUD permissions
When user clicks on a technique tile with disabled rules
Then "enable all disabled" button should be disabled
```

### Error handling

#### **Scenario: Error is handled when API error is returned**

**Automation**: 2 e2e test.

```Gherkin
Given a user navigates to coverage overview page
And any error is returned from coverage overview API
Then error is handled and displayed via a toast

CASE: Should work for valid and invalid API body
```
