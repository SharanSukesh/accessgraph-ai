# Contributing to AccessGraph AI

Thank you for your interest in contributing to AccessGraph AI! This document provides guidelines and instructions for contributing.

## 🚀 Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/accessgraph-ai.git
   cd accessgraph-ai
   ```
3. **Set up the development environment:**
   ```bash
   cp .env.example .env
   docker-compose up -d
   ```

## 🔧 Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

**Branch naming conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions or updates

### 2. Make Changes

Follow the code style guidelines below and ensure:
- Code is well-documented
- Tests are included for new features
- All tests pass
- Type checking passes

### 3. Commit Your Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add user risk scoring algorithm"
git commit -m "fix: resolve Neo4j connection timeout"
git commit -m "docs: update API documentation"
```

**Commit types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style/formatting
- `refactor:` - Code refactoring
- `test:` - Tests
- `chore:` - Maintenance

### 4. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## 📝 Code Style Guidelines

### Python (Backend)

**Style Guide:** PEP 8

**Tools:**
- `black` - Code formatting
- `ruff` - Linting
- `mypy` - Type checking

**Run checks:**
```bash
cd apps/backend
black .
ruff check .
mypy app
```

**Best Practices:**
- Use type hints everywhere
- Write docstrings for public functions
- Keep functions small and focused
- Use async/await for I/O operations
- Follow dependency injection pattern

**Example:**
```python
async def get_user_risk_score(
    user_id: str,
    db: AsyncSession = Depends(get_database)
) -> RiskScore:
    """
    Calculate risk score for a user.

    Args:
        user_id: User identifier
        db: Database session

    Returns:
        RiskScore object with calculated score

    Raises:
        UserNotFoundError: If user doesn't exist
    """
    # Implementation
```

### TypeScript (Frontend)

**Style Guide:** ESLint + Prettier

**Tools:**
- `eslint` - Linting
- `prettier` - Formatting
- `tsc` - Type checking

**Run checks:**
```bash
cd apps/frontend
npm run lint
npm run type-check
```

**Best Practices:**
- Use functional components with hooks
- Prefer server components when possible
- Use TypeScript strictly (no `any`)
- Keep components small and focused
- Use descriptive variable names

**Example:**
```typescript
interface UserCardProps {
  user: User
  onSelect?: (user: User) => void
}

export function UserCard({ user, onSelect }: UserCardProps) {
  const handleClick = () => {
    onSelect?.(user)
  }

  return (
    <div onClick={handleClick}>
      {user.displayName}
    </div>
  )
}
```

## 🧪 Testing

### Backend Tests

```bash
cd apps/backend
pytest tests/ --cov=app --cov-report=html
```

**Test structure:**
```python
def test_calculate_risk_score():
    """Test risk score calculation."""
    # Arrange
    user = create_test_user()

    # Act
    score = calculate_risk_score(user)

    # Assert
    assert 0 <= score <= 100
```

### Frontend Tests (Future)

```bash
cd apps/frontend
npm run test
```

## 📚 Documentation

- Update README.md if adding new features
- Add JSDoc/docstrings to new functions
- Update ARCHITECTURE.md for architectural changes
- Include inline comments for complex logic

## 🔍 Pull Request Process

1. **Ensure CI passes** - All GitHub Actions checks must pass
2. **Update documentation** - If applicable
3. **Request review** - Tag relevant reviewers
4. **Address feedback** - Respond to review comments
5. **Squash commits** - If requested

**PR Template:**
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How did you test this?

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] All tests pass
```

## 🐛 Reporting Bugs

**Before submitting:**
1. Check existing issues
2. Verify bug in latest version
3. Collect reproduction steps

**Bug report should include:**
- Clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, versions)
- Screenshots if applicable
- Relevant logs

## 💡 Suggesting Features

**Feature requests should include:**
- Clear use case
- Expected behavior
- Why this is valuable
- Possible implementation approach

## 🏗️ Project Structure

Understanding the structure helps you contribute:

```
accessgraph-ai/
├── apps/
│   ├── backend/          # Python backend
│   └── frontend/         # Next.js frontend
├── packages/
│   ├── shared-types/     # Shared TypeScript types
│   └── shared-config/    # Shared configuration
├── infrastructure/
│   ├── docker/          # Dockerfile templates
│   └── scripts/         # Helper scripts
└── .github/
    └── workflows/       # CI/CD pipelines
```

## 🤝 Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Give constructive feedback
- Focus on the issue, not the person
- Help create a positive community

## 📞 Getting Help

- **GitHub Discussions** - Ask questions
- **GitHub Issues** - Report bugs
- **Documentation** - Check docs first

## 🙏 Thank You!

Your contributions make this project better for everyone. We appreciate your time and effort!

---

**Questions?** Open a discussion or reach out to maintainers.
