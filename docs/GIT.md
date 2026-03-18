# Git Setup and Workflow

## Initialize Git Repository

```bash
cd 1-1-mentor-session-booking-app

git init
git add .
git commit -m "Initial commit: Mentor Session Platform"

# Add remote
git remote add origin https://github.com/yourusername/mentor-session-platform.git
git branch -M main
git push -u origin main
```

## Branch Strategy

```
main (production)
├── development (staging)
│   ├── feature/auth
│   ├── feature/sessions
│   ├── feature/editor
│   ├── feature/video
│   ├── feature/chat
│   └── feature/code-execution
└── hotfix/bugs
```

## Workflow

### Create Feature
```bash
git checkout -b feature/your-feature
git commit -am "Add feature description"
git push origin feature/your-feature
```

### Create Pull Request
- Open PR on GitHub
- Add description and screenshots
- Request review
- Merge after approval

### Deployment
```bash
# Merge to main for production
git checkout main
git pull
git merge development
git push origin main
```

## Commit Messages

```
feat: Add new feature
fix: Fix bug
docs: Update documentation
style: Code style changes
refactor: Refactor code
test: Add tests
chore: Update dependencies
```

Example:
```
feat: Add real-time code editor sync with Socket.io
- Implement throttled code updates
- Add cursor position tracking
- Store code snapshots in database
```
