# Sandbox Pattern Authoring

Sandbox patterns are reference code — developers (and AI) will copy-paste them. The quality bar is higher than normal feature code: a bug in a pattern propagates to every component that uses it as a template.

## Design Process

Every pattern goes through three phases. Do NOT combine or skip phases.

### Phase 1: Rule Inventory (before writing code)

1. List every design rule the pattern touches (z-index, positioning, event isolation, etc.)
2. For each rule, find the **authoritative source** — a convention doc or source file, not memory
3. Record rule + source in the pattern's `.md` constraint checklist (see below)

This phase prevents the #1 failure mode: writing code from assumptions instead of verified rules.

### Phase 2: Implementation + Audit (writing code)

1. Write the pattern code
2. **Audit against the constraint checklist** — for each rule, annotate which line of code implements it
3. Fill in the "Code" column of the constraint checklist with actual line references

Do NOT skip the audit. "It works" is not the acceptance criterion — "it can be safely copied" is.

### Phase 3: Documentation (after code review passes)

1. Write the `.md` architecture doc **after** the code is finalized, not concurrently
2. Every technical claim must reference a specific source file and line number
3. Do NOT infer behavior from "how it should work" — read the actual source code

This phase prevents the #2 failure mode: documentation that describes intended behavior instead of actual behavior.

## Pattern `.md` Required Structure

Every `src/sandbox/Pattern*.md` MUST include these sections:

```
# <Pattern Name>

## 问题背景
Why this pattern exists — what went wrong without it.

## 架构原则
Design rules and their rationale. Code examples where helpful.

## 约束清单                          ← REQUIRED
Table mapping design rules → sources → code locations.

## 陷阱清单
Common mistakes with ❌/✅ contrast.

## 适用场景
When to use this pattern and when NOT to.
```

### Constraint Checklist Format

| Design Rule        | Source                              | Code                                                     |
| ------------------ | ----------------------------------- | -------------------------------------------------------- |
| What the rule says | File path where the rule is defined | `Pattern*.tsx:L<n>` showing where the code implements it |

**Source** must be a file path (convention doc, source file, or config), not "common knowledge" or "best practice".

**Code** must be a line reference in the pattern's `.tsx`, not a description of what the code does.

## Why This Process Exists

During the first sandbox pattern (FloatingPanel + NestedOverlay), three bugs shipped in what was supposed to be reference-quality code:

| Bug                                                | Root Cause                                          | Phase That Would Have Caught It |
| -------------------------------------------------- | --------------------------------------------------- | ------------------------------- |
| z-index panel above popover                        | Didn't read ui-patterns.md z-index scale            | Phase 1 (rule inventory)        |
| Drag handler recreated every frame                 | "Works" accepted as "correct"                       | Phase 2 (audit)                 |
| Doc claimed ContextMenuContent has stopPropagation | Inferred from PopoverContent without reading source | Phase 3 (source verification)   |
