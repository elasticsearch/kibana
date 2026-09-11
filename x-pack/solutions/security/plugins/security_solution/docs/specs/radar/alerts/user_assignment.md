# Alert User Assignment

This is a test plan for the Alert User Assignment feature

Status: `in progress`. The current test plan covers functionality described in [Alert User Assignment](https://github.com/elastic/security-team/issues/2504) epic.

## Useful information

### Tickets

- [Alert User Assignment](https://github.com/elastic/security-team/issues/2504) epic
- [Add test coverage for Alert User Assignment](https://github.com/elastic/kibana/issues/171307)
- [Write a test plan for Alert User Assignment](https://github.com/elastic/kibana/issues/171306)

### Terminology

- **Assignee**: The user assigned to an alert.

- **Assignees field**: The alert's `kibana.alert.workflow_assignee_ids` field which contains an array of assignees IDs. These ids conrespond to [User Profiles](https://www.elastic.co/guide/en/elasticsearch/reference/current/user-profile.html) endpoint.

- **Assignee's avatar**: The avatar of an assignee. Can be either user profile picture if uploaded by the user or initials of the user.

- **Assignees count badge**: The badge with the number of assignees.

### Assumptions

- The feature is **NOT** available under the Basic license
- Assignees are stored as an array of users IDs in alert's `kibana.alert.workflow_assignee_ids` field
- There are multiple (five or more) available users which could be assigned to alerts
- User need to have editor or higher privileges to assign users to alerts
- Mixed states are not supported by the current version of User Profiles component
- "Displayed/Shown in UI" refers to "Alerts Table" and "Alert's Details Flyout"

## Scenarios

### Basic rendering

#### **Scenario: No assignees**

**Automation**: 2 e2e test + 2 unit test.

```Gherkin
Given an alert doesn't have assignees
Then no assignees' (represented by avatars) should be displayed in UI
```

#### **Scenario: With assignees**

**Automation**: 2 e2e test + 2 unit test.

```Gherkin
Given an alert has assignees
Then assignees' (represented by avatars) for each assignee should be shown in UI
```

#### **Scenario: Many assignees (Badge)**

**Automation**: 2 e2e test + 2 unit test.

```Gherkin
Given an alert has more assignees than maximum number allowed to display
Then assignees count badge is displayed in UI
```

### Updating assignees (single alert)

#### **Scenario: Add new assignees**

**Automation**: 3 e2e test + 1 unit test + 1 integration test.

```Gherkin
Given an alert
When user adds new assignees
Then assignees field should be updated
And newly added assignees should be present
```

#### **Scenario: Update assignees**

**Automation**: 3 e2e test + 1 unit test + 1 integration test.

```Gherkin
Given an alert with assignees
When user removes some of (or all) current assignees and adds new assignees
Then assignees field should be updated
And removed assignees should be absent
And newly added assignees should be present
```

#### **Scenario: Unassign alert**

**Automation**: 2 e2e test + 1 unit test.

```Gherkin
Given an alert with assignees
When user triggers "Unassign alert" action
Then assignees field should be updated
And assignees field should be empty
```

### Updating assignees (bulk actions)

#### **Scenario: Add new assignees**

**Automation**: 1 e2e test + 1 unit test + 1 integration test.

```Gherkin
Given multiple alerts
When user adds new assignees
Then assignees fields of all involved alerts should be updated
And newly added assignees should be present
```

#### **Scenario: Update assignees**

**Automation**: 1 e2e test + 1 unit test + 1 integration test.

```Gherkin
Given multiple alerts with assignees
When user removes some of (or all) current assignees and adds new assignees
Then assignees fields of all involved alerts should be updated
And removed assignees should be absent
And newly added assignees should be present
```

#### **Scenario: Unassign alert**

**Automation**: 1 e2e test + 1 unit test.

```Gherkin
Given multiple alerts with assignees
When user triggers "Unassign alert" action
Then assignees fields of all involved alerts should be updated
And assignees fields should be empty
```

### Alerts filtering

#### **Scenario: By one assignee**

**Automation**: 1 e2e test + 1 unit test.

```Gherkin
Given multiple alerts with and without assignees
When user filters by one of the assignees
Then only alerts with selected assignee in assignees field are displayed
```

#### **Scenario: By multiple assignees**

**Automation**: 1 e2e test + 1 unit test.

```Gherkin
Given multiple alerts with and without assignees
When user filters by multiple assignees
Then all alerts with either of selected assignees in assignees fields are displayed
```

#### **Scenario: "No assignees" option**

**Automation**: 1 e2e test + 1 unit test.

```Gherkin
Given filter by assignees UI is available
Then there should be an option to filter alerts to see those which are not assigned to anyone
```

#### **Scenario: By "No assignees"**

**Automation**: 1 e2e test + 1 unit test.

```Gherkin
Given multiple alerts with and without assignees
When user filters by "No assignees" option
Then all alerts with empty assignees fields are displayed
```

#### **Scenario: By assignee and alert status**

**Automation**: 1 e2e test + 1 unit test.

```Gherkin
Given multiple alerts with and without assignees
When user filters by one of the assignees
AND alert's status
Then only alerts with selected assignee in assignees field AND selected alert's status are displayed
```

### Authorization / RBAC

#### **Scenario: Viewer role**

**Automation**: 1 e2e test + 1 unit test + 1 integration test.

```Gherkin
Given user has "viewer/readonly" role
Then there should not be a way to update assignees field for an alert
```

#### **Scenario: Serverless roles**

**Automation**: 1 e2e test + 1 unit test + 1 integration test.

```Gherkin
Given users 't1_analyst', 't2_analyst', 't3_analyst', 'rule_author', 'soc_manager', 'detections_admin', 'platform_engineer' roles
Then update assignees functionality should be available
```

#### **Scenario: Basic license**

**Automation**: 1 e2e test + 1 unit test + 1 integration test.

```Gherkin
Given user runs Kibana under the Basic license
Then update assignees functionality should not be available
```
