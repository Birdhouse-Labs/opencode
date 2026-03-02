# Birdhouse Fork

This is the Birdhouse fork of [anomalyco/opencode](https://github.com/anomalyco/opencode).

## Our commits

We maintain a set of commits on top of the latest tagged upstream release. The goal is a clean history where every commit passes CI independently. The current base is `v1.2.15`.

When upstream cuts a new release we rebase our commits onto the new tag, fix any failures introduced by each commit before moving on, and update this file.

## Running CI locally

From the repo root:

```bash
bun turbo typecheck
bun turbo test
```

Both commands use Turborepo, which builds dependencies (including the SDK) before running. **Do not run `bun run typecheck` or `bun test` directly inside `packages/opencode`** — the SDK `dist/` will be stale and typecheck will fail with spurious errors.

If typecheck fails after a cache clear, force a rebuild:

```bash
bun turbo typecheck --force
```

## Fixup strategy

When a commit introduces a test failure, we fix it with a `git commit --fixup <hash>` targeting the commit that caused the regression. This keeps the fix adjacent to the problem in the history, and means the branch can be kept clean with a single rebase command.

To squash all pending fixups into their target commits:

```bash
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash v1.2.15
```

Replace `v1.2.15` with the current upstream base tag if it has changed.
