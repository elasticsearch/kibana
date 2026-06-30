---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/uiactions-plugin.html
---

# UI Actions [uiactions-plugin]

UI Actions plugins provides API to manage **triggers** and **actions**.

**Trigger** is an abstract description of user’s intent to perform an action (like user clicking on a value inside chart). It allows us to do runtime binding between code from different plugins. For, example one such trigger is when somebody applies filters on dashboard; another one is when somebody opens a Dashboard panel context menu.

**Actions** are pieces of code that execute in response to a trigger. For example, to the dashboard filtering trigger multiple actions can be attached. Once a user filters on the dashboard all possible actions are displayed to the user in a popup menu and the user has to chose one.

In general this plugin provides:

- Creating custom functionality (actions).
- Creating custom user interaction events (triggers).
- Attaching and detaching actions to triggers.
- Emitting trigger events.
- Executing actions attached to a given trigger.
- Exposing a context menu for the user to choose the appropriate action when there are multiple actions attached to a single trigger.

## Basic usage [_basic_usage]

To get started, first you need to know a trigger you will attach your actions to. See `src/platform/plugins/shared/ui_actions/common/trigger_ids.ts` for a list of available triggers.

Now, when user clicks on a UI element you need to "trigger" your trigger and provide some context data:

```typescript
plugins.uiActions.executeTriggerActions('on_click_value', {
  /* Custom context data. */
});
```

Finally, your code or developers from other plugins can register UI actions that listen for the above trigger and execute some code when the trigger is triggered.

```typescript
plugins.uiActions.registerAction({
  id: 'DO_SOMETHING',
  isCompatible: async (context) => true,
  execute: async (context) => {
    // Do something.
  },
});
plugins.uiActions.attachAction('on_click_value', 'DO_SOMETHING');
```

Now your `DO_SOMETHING` action will automatically execute when `on_click_value` trigger is triggered; or, if more than one compatible action is attached to that trigger, user will be presented with a context menu popup to select one action to execute.

## Examples [_examples_9]

[TODO: Recreate a new UI action example once the new post-trigger registry paradigm is finalized]
