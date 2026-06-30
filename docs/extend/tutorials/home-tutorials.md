---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/add-data-tutorials.html
---

# Add data tutorials [add-data-tutorials]

`Add Data` in the {{kib}} Home application contains tutorials for setting up data flows in the Elastic stack.

Each tutorial provides three sets of instructions for setting up data flows based on your deployment:

* `On Premise:` Both {{kib}} and {{es}} running on premise.
* `On Premise Elastic Cloud:` {{kib}} on premise, {{es}} on Elastic Cloud.
* `Elastic Cloud:` Both {{kib}} and {{es}} running on Elastic Cloud.


## Creating a new tutorial [_creating_a_new_tutorial]

1. Create a new directory in the [tutorials directory](https://github.com/elastic/kibana/tree/main/src/platform/plugins/shared/home/server/tutorials).
2. In the new directory, create a file called `index.ts` that exports a function. The function must return a function object that conforms to the [TutorialSchema interface](https://github.com/elastic/kibana/tree/master/src/platform/plugins/shared/home/server/services/tutorials/lib/tutorial_schema.ts).
3. Register the tutorial in [register.ts](https://github.com/elastic/kibana/tree/master/src/platform/plugins/shared/home/server/tutorials/register.ts) by adding it to the `builtInTutorials`.
4. Add image assets to the `tutorial_resources` directory.
5. Run {{kib}} locally to preview the tutorial.
6. Create a PR and go through the review process to get the changes approved.

If you are creating a new plugin and the tutorial is only related to that plugin, you can also place the `TutorialSchema` object into your plugin folder. Add `home` to the `requiredPlugins` list in your `kibana.json` file. Then register the tutorial object by calling `home.tutorials.registerTutorial(tutorialObject)` in the `setup` lifecycle of your server plugin.


### Variables [_variables]

String values can contain variables that are substituted when rendered. Variables are specified by `{}`. For example: `{config.docs.version}` is rendered as `6.2` when running the tutorial in {{kib}} 6.2.

[Provided variables](https://github.com/elastic/kibana/tree/master/src/platform/plugins/shared/home/public/application/components/tutorial/replace_template_strings.js)


### Markdown [_markdown]

String values can contain limited Markdown syntax.

[Enabled Markdown grammars](https://elastic.github.io/eui/#/editors-syntax/markdown-format)

