# Contributing to Neo4j Knowledge Graph MCP Server

Thank you for your interest in contributing to this project! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- Be respectful and inclusive
- Focus on constructive feedback
- Maintain professionalism in all communications
- Respect the time and efforts of maintainers and other contributors

## Development Workflow

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/mcp-neo4j-knowledge-graph.git`
3. Add the upstream remote: `git remote add upstream https://github.com/henrychong-ai/mcp-neo4j-knowledge-graph.git`
4. Install dependencies: `pnpm install`
5. Setup Neo4j: See README.md for manual Neo4j setup instructions

### Development Process

1. Create a new branch for your feature: `git checkout -b feature/your-feature-name`
2. Implement your feature or fix
3. Run the full test suite: `pnpm test`
4. Ensure passing tests and full coverage of your changes
5. Commit your changes with descriptive messages
6. Push to your fork: `git push origin feature/your-feature-name`
7. Create a pull request to the main repository

Note: We require all code to have appropriate test coverage. Writing tests that verify your implementation works as expected is essential.

### Important Guidelines

- Ensure adequate test coverage for all code changes
- Follow existing code style and conventions
- Keep commits focused and related to a single change
- Use descriptive commit messages that explain the "why" not just the "what"
- Reference issue numbers in your commit messages when applicable
- Reference your PR from an issue comment and the issue from your PR; also feel free to open a draft PR if you want feedback before working on something

## Quality Requirements

All contributions must pass:

```bash
# Linting (zero warnings)
pnpm lint

# Formatting
pnpm format:check

# Type checking
pnpm typecheck

# All checks at once
pnpm check
```

## Code Style

- **TypeScript**: Strict mode, ES2024 target
- **Linting**: Oxlint (import, promise, node, vitest plugins)
- **Formatting**: Biome (formatter-only, linter disabled)
- **Tests**: Vitest with comprehensive mocking

## Pull Request Process

1. Update documentation to reflect any changes
2. Ensure all checks pass: `pnpm check` (lint, format, typecheck)
3. Ensure all tests pass: `pnpm test`
4. Update the README.md if needed with details of changes
5. Your PR will be reviewed by the maintainers
6. Address any requested changes promptly

## Testing

All contributions must include appropriate tests:

```bash
# Run all tests
pnpm test

# Run tests with coverage report
pnpm run test:coverage
```

Ensure all tests are passing before submitting a PR. New code should maintain or improve the existing test coverage. PRs without tests will not be reviewed.

## Continuous Integration

This project uses GitHub Actions for continuous integration on all pull requests:

- Tests are automatically run when you create or update a PR
- Test coverage is monitored and must meet minimum thresholds
- Linting checks ensure code quality standards are maintained
- The workflow runs tests across target Node.js versions

PRs cannot be merged until CI passes all checks. You can see the full CI workflow configuration in `.github/workflows/ci-cd.yml`.

## Documentation

- Update documentation as needed for new features
- Use JSDoc comments for all public APIs
- Keep examples current and accurate
- Update CHANGELOG.md for any user-facing changes

## Versioning

This project follows [Semantic Versioning](https://semver.org/).

- MAJOR version for incompatible API changes
- MINOR version for functionality added in a backward compatible manner
- PATCH version for backward compatible bug fixes

## Communication

- For bugs and feature requests, open an issue on GitHub
- For general questions, open a discussion on the repository
- For security issues, please see our security policy

## License

By contributing to this project, you agree that your contributions will be licensed under the same MIT license that covers the project.

## Questions?

If you have any questions about contributing, please open an issue or contact the maintainers.

Thank you for your contributions!
