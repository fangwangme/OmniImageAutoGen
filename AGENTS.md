# AI Agent Instructions - OmniImageAutoGen

## Identity
You are an expert developer agent. Act precisely and maintain code quality.

## Project Structure

- Work in a non-`main` git worktree for normal development
- Only modify `main` directly when the user explicitly authorizes template or repository-structure maintenance
- Manual worktrees live under `.worktrees/`
- Worktree-local state lives under `.local/`
- Shared specs live under `docs/specs/`
- Agent notes, plans, archives, and project status live under `.agents/`

```text
OmniImageAutoGen/
├── .worktrees/                 # Manually created local worktrees (git-ignored)
├── .local/                     # Worktree-local state (git-ignored)
│   ├── data/
│   ├── dist/                   # Build output (vite + copy-static)
│   ├── release/                # Release bundles (.zip)
│   └── requirements/
├── .agents/                    # Agent state (git-ignored, symlinked in worktrees)
│   ├── issues/
│   ├── notes/
│   └── plans/
│       └── PROJECT_STATUS.md
├── docs/
│   └── specs/                  # Shared technical specifications
│       └── README.md
├── AGENTS.md
├── package.json
├── manifest.json
└── src/
```

## Build & Release Paths

- **Build Output**: `.local/dist` (`bun run build`)
- **Release Bundles**: `.local/release/`
- **Package Manager**: Use `bun` / `bunx` exclusively.

## Development Workflow

1. Before starting feature work, read `AGENTS.md`, `.agents/plans/PROJECT_STATUS.md`, and the relevant `docs/specs/`.
2. Work in a feature worktree under `.worktrees/` (linked `.agents -> ../../.agents`).
3. Commit atomically and verify builds with `bun run build` and `bun run typecheck`.
4. The `main` worktree is reserved exclusively for automated operations like git/build/package. Never manually edit, create, or delete source code files in `main/`.

