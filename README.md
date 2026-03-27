# skill

`@atomist/skill` is the core TypeScript/JavaScript SDK for building Atomist Skills. It provides APIs for defining skills, handling events (via GraphQL subscriptions and Datalog), interacting with GitHub, sending Slack messages, managing secrets, caching, and more.

## Tech Stack

- TypeScript / Node.js (>=8.2.0)
- Mocha (test framework)
- ESLint + Prettier (linting/formatting)
- GraphQL (with codegen for type generation)

## Building and Testing

```bash
npm install           # Install dependencies
npm run build         # Full build: clean, compile, test, lint, doc
npm run compile       # Compile TypeScript only
npm test              # Run tests
npm run lint          # Check linting
npm run lint:fix      # Auto-fix lint issues
```

## Key Notes

- Main entry point is `index.ts`, which re-exports all public API modules
- Skills are defined using the `skill()` function from `lib/definition/skill.ts`
- Event handling uses a composable middleware/handler pattern
- Datalog subscriptions are defined in `.edn` files under `datalog/subscription/`
- GraphQL subscriptions are in `graphql/subscription/`
- The `atm-skill` CLI binary (`bin/start.ts`) is provided for local skill execution
- Published as `@atomist/skill` on npm

## License

Apache-2.0
