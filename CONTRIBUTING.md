# Contributing to Memento MCP

Thank you for your interest in contributing to Memento MCP! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- Be respectful and inclusive
- Focus on constructive feedback
- Maintain professionalism in all communications
- Respect the time and efforts of maintainers and other contributors

## Development Workflow

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/memento-mcp.git`
3. Add the upstream remote: `git remote add upstream https://github.com/gannonh/memento-mcp.git`
4. Install dependencies: `npm install`
5. Setup Neo4j: `docker-compose up -d neo4j && npm run neo4j:init`

### Development Process

1. Create a new branch for your feature: `git checkout -b feature/your-feature-name`
2. Implement your feature or fix
3. Run the full test suite: `npm test`
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
- Reference your PR from  an issue comment and the issue from your PR; also feel free to open a draft PR if you want feedback before working on something

## Pull Request Process

1. Update documentation to reflect any changes
2. Ensure all tests pass: `npm test`
3. Verify code coverage: `npm run test:coverage`
4. Run linting: `npm run lint`
5. Make sure your code follows project conventions
6. Update the README.md if needed with details of changes
7. Your PR will be reviewed by the maintainers
8. Address any requested changes promptly

## Testing

All contributions must include appropriate tests:

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage
```

Ensure all tests are passing before submitting a PR. New code should maintain or improve the existing test coverage. PRs without tests will not be reviewed.

## Continuous Integration

This project uses GitHub Actions for continuous integration on all pull requests:

- Tests are automatically run when you create or update a PR
- Test coverage is monitored and must meet minimum thresholds
- Linting checks ensure code quality standards are maintained
- The workflow runs tests across target Node.js versions

PRs cannot be merged until CI passes all checks. You can see the full CI workflow configuration in `.github/workflows/memento-mcp.yml`.

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
