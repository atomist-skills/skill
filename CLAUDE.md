# CLAUDE.md - skill

## Overview

`@atomist/skill` is the core TypeScript/JavaScript SDK library for building Atomist Skills. It provides the API surface for defining skills, handling events, interacting with GraphQL, managing secrets, working with Git/GitHub, sending Slack messages, and more.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js (>=8.2.0)
- **Test Framework**: Mocha with power-assert
- **Linting**: ESLint + Prettier
- **Build**: tsc, npm-run-all
- **GraphQL**: graphql-codegen for type generation

## Project Structure

```
index.ts              # Main entry point, re-exports all public APIs
lib/
  action.ts           # GitHub Actions integration
  bundle.ts           # Skill bundling
  child_process.ts    # Child process utilities
  context.ts          # Skill execution context
  datalog.ts          # Datalog query support
  definition/         # Skill definition types (parameters, resource providers, etc.)
  docker.ts           # Docker registry interactions
  entry_point.ts      # GCF entry point
  git.ts              # Git operations
  github.ts           # GitHub API client (Octokit)
  graphql.ts          # GraphQL client
  handler/            # Event and command handler framework
  http.ts             # HTTP client
  jose.ts             # JWT/JOSE token handling
  log.ts              # Logging
  message.ts          # Slack message client
  payload.ts          # Event payload handling
  policy.ts           # Policy evaluation
  project.ts          # Project/repo utilities
  prompt.ts           # LLM prompt utilities
  pubsub.ts           # Google PubSub integration
  script/             # Skill run scripts
  secret.ts           # Secret management
  slack.ts            # Slack formatting utilities
  state.ts            # State management
  status.ts           # Skill execution status
  storage/            # GCS storage and caching
  template.ts         # Handlebars templating
  test/               # Test assertion helpers
  util.ts             # General utilities
bin/
  start.ts            # CLI entry point (atm-skill)
datalog/subscription/ # Datalog subscription definitions (.edn)
graphql/              # GraphQL schemas and subscriptions
test/                 # Test files
```

## Key Commands

```bash
npm install           # Install dependencies
npm run build         # Full build: clean, compile, test, lint, doc
npm run compile       # Compile TypeScript
npm test              # Run tests (mocha)
npm run lint          # Run ESLint + Prettier checks
npm run lint:fix      # Auto-fix lint issues
```

## Key Patterns

- The library exports a comprehensive public API through `index.ts`
- Skills are defined using the `skill()` function from `lib/definition/skill.ts`
- Event handling uses a middleware pattern (handler chains)
- GraphQL codegen generates TypeScript types from `.graphql` files
- Datalog subscriptions are defined in `.edn` files under `datalog/subscription/`
- The `atm-skill` CLI binary is provided for running skills locally
