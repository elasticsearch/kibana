---
navigation_title: "Set up a Development Environment"
description: "Learn how to setup a development environment for contributing to the Kibana repository"
---

# Set up a Development Environment

Kibana development is supported on Linux and macOS. We also support Windows development [using WSL](./wsl-on-windows-development.md), but native Windows development is not supported.

## Get the code

Start by forking [the Kibana repository](https://github.com/elastic/kibana) on Github so that you have a place to stage pull requests and create branches for development.

Then clone the repository to your machine:

```bash
git clone https://github.com/[YOUR_USERNAME]/kibana.git kibana
cd kibana
```

## Install dependencies

Install the version of Node.js listed in the `.node-version` file. This can be automated with tools such as [nvm](https://github.com/creationix/nvm). As we also include a `.nvmrc` file you can switch to the correct version when using nvm by running:

```sh
nvm use
```

Then, install the latest version of yarn using:

```sh
npm install -g yarn
```

Finally, bootstrap Kibana and install all of the remaining dependencies:

```sh
yarn kbn bootstrap
```

## Run Elasticsearch

In order to start Kibana you need to run a local version of Elasticsearch. You can startup and initialize the latest Elasticsearch snapshot of the correct version for Kibana by running the following in a new terminal tab/window:

```sh
yarn es snapshot [--license trial]
```

You can pass `--license trial` to start Elasticsearch with a trial license, or use the Kibana UI to switch the local version to a trial version which includes all features.

Read about more options for [Running Elasticsearch during development](https://www.elastic.co/guide/en/kibana/current/running-elasticsearch.html), like connecting to a remote host, running from source, preserving data inbetween runs, running remote cluster, etc.

## Run Kibana

In another terminal tab/window you can start Kibana.

```sh
yarn start
```

Include developer [examples](https://github.com/elastic/kibana/tree/main/examples) by adding an optional `--run-examples` flag. You will find the development server running on (http://localhost:5601) - and you can log in with the `elastic:changeme` credential pair.

### Customizing `config/kibana.dev.yml`

The `config/kibana.yml` file stores user configuration directives. Since this file is checked into source control, developer preferences can't be saved without the risk of accidentally committing the modified version. To make customizing configuration easier during development, the {{kib}} CLI will look for a `config/kibana.dev.yml` file if run with the `--dev` flag. This file behaves just like the non-dev version and accepts any of the [standard settings](/reference/configuration-reference/general-settings.md).

To run Kibana with an alternate yml file entirely, use the `--config` option: `yarn start --config=config/my_config.yml`

### SSL

{{kib}} includes self-signed certificates that can be used for development purposes in the browser and for communicating with {{es}}: `yarn start --ssl` & `yarn es snapshot --ssl`.

### Base path

In dev mode, {{kib}} by default runs behind a proxy which adds a random path component to its URL. To disable this, start {{kib}} with the `--no-base-path` flag:

```bash
yarn start --no-base-path
```

You can also set it explicitly via [`server.basePath`](/reference/configuration-reference/general-settings.md#server-basePath) and [`server.rewriteBasePath`](/reference/configuration-reference/general-settings.md#server-rewriteBasePath) in `config/kibana.dev.yml`.

### Stateful startup options

The following combinations cover the most common local development scenarios.

**Default** — both SAML and basic login are supported; SAML is the default:

```sh
yarn es snapshot
yarn start
```

**Without SAML login** — only basic login:

```sh
yarn es snapshot
yarn start --mockIdpPlugin.enabled=false
```

**Basic license** — only basic login is supported:

```sh
yarn es snapshot --license basic
yarn start --mockIdpPlugin.enabled=false
```

**No base path** — basic license, basic login, no random dev basepath:

```sh
yarn es snapshot --license basic
yarn start --mockIdpPlugin.enabled=false --no-base-path
```

**Custom base path** — both SAML and basic login are supported; SAML is the default.

```sh
yarn es snapshot --kibanaUrl http://localhost:5601/your_path
yarn start --server.basePath=/your_path
```

**No base path with SAML** — both SAML and basic login are supported; SAML is the default:

```sh
yarn es snapshot --kibanaUrl http://localhost:5601
yarn start --no-base-path
```

## Elasticians: Run in serverless mode

To develop against serverless projects, you need to start both Elasticsearch and Kibana in serverless mode with matching project types.

**Step 1:** Start Elasticsearch in serverless mode (in a separate terminal):

```sh
# Pick the project type that matches your work
yarn es serverless --projectType=oblt          
yarn es serverless --projectType=security 
yarn es serverless --projectType=es            
yarn es serverless --projectType=workplaceai  
```

**Step 2:** Start Kibana in the matching serverless mode:

```sh
yarn serverless-oblt         
yarn serverless-security     
yarn serverless-es           
yarn serverless-workplace-ai 
```

**Important:** The Kibana serverless mode must match the ES `--projectType` value. Mismatched modes will cause errors.

Login with `elastic_serverless` / `changeme` (or `system_indices_superuser` / `changeme`).

## Code away!

You are now ready to start developing. 
Changes to the source files should be picked up automatically and either cause the server to restart, or be served to the browser on the next page refresh.

## Install pre-commit hook (optional)

In case you want to run a couple of checks like linting or check the file casing of the files to commit, we provide a way to install a pre-commit hook. To configure it you just need to run the following:

```sh
node scripts/register_git_hook
```

After the script completes the pre-commit hook will be created within the file `.git/hooks/pre-commit`. If you choose to not install it, don’t worry, we still run a quick CI check to provide feedback earliest as we can about the same checks.

## Using the Kibana Dev Container (optional)

Kibana also supports using a [dev container](https://containers.dev/) which can integrate with various editors and tools [(supported tools)](https://containers.dev/supporting). The dev container provides a consistent development environment across different machines and setups. The only prerequisite is having [Docker](https://www.docker.com/) installed locally. VS Code is the recommended editor and will be used for these instructions because it is the most mature, but it is not required.

### Setting up the Dev Container

1. Make a copy of [`<repo_root>/.devcontainer/.env.template`](https://github.com/elastic/kibana/blob/main/.devcontainer/.env.template) and rename it to `<repo_root>/.devcontainer/.env`. Edit any values you're interested in.
1. There are three options for mounting the Kibana repo into the container:
    - **Local Filesystem**: Clone the repo locally, or use an existing copy, and open it in VS Code. When prompted, select "Reopen in Dev Container". This uses a bind mount, allowing the container to access and modify files directly on your local filesystem. Your git credentials should be automatically mounted in the container as well. 
    - **Docker Repo Volume**: Use the `Dev Containers: Clone Repository in Named Container Volume...` command from the Command Palette (`F1`). This clones the repo into a Docker volume, isolating it from your local filesystem. You will need to configure your git credentials manually in this isolated environment.
    - **Docker PR Volume**: Use the `Dev Containers: Clone GitHub Pull Request in Named Container Volume...` command from the Command Palette (`F1`). This is the same as the previous option, but can be useful for testing a PR in insolation of your local filesystem.
1. VS Code will then build the container, this will take a few minutes the first time, but subsequent builds will utilize Docker caching and be much faster.
1. Once the container is built and started, it will automatically run `yarn kbn bootstrap`.
1. You should see the Kibana repo and your terminal will be inside the container. You can develop as normal now, including running `yarn es` from inside the container.

### Customizing the Dev Container

Installing any extra extensions or making adjustments to the OS environment inside the container will not have an effect on your local OS or VS Code installation. Editing the `devcontainer.json` or `.devcontainer/Dockerfile` should be reserved for changes to all dev environments.

### FIPS Mode

The dev container is pre-configured to run Kibana in FIPS mode if needed. Simply change the `.env` file to `FIPS=1` and reopen your terminal. There should be a log message in your terminal which indicates `FIPS mode enabled`.

### Troubleshooting

- Sometimes when rebuilding the container, there will be an error message that it failed. Usually hitting retry will fix this, and is only related to VS Code trying to reconnect to the container too quickly.

### Limitations

- Git worktrees are not supported when using the repo from the Local Filesystem. [VSCode issue](https://github.com/microsoft/vscode/issues/68038) for tracking, and a possible workaround though it is untested.