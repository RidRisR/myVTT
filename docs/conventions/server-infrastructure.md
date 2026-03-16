# Server Infrastructure Rule

## Rule: One Concept, One Gate

Each concept (e.g. "does this room exist?") must have exactly one source of truth in the system.
REST middleware and Socket.io auth **MUST** use the same check logic.

## Current Design

- `POST /api/rooms` is the only entry point for creating rooms
- The global `rooms` table is the single source of truth for "does this room exist?"
- Both `withRoom` and `setupSocketAuth` check the global `rooms` table first

## Compliance Checklist

When adding any server-side middleware, you must answer:

1. **What is the source of truth for this check?** — explicitly state the table/function it depends on
2. **Does another middleware already do the same check?** — if so, reuse the same function
3. **Are both paths (REST and Socket.io) consistent?** — no "REST works but Socket.io rejects" scenarios

## Lesson Learned

### Old bug: combat button unresponsive

- `withRoom` used `getRoomDb()` (auto-creates room DB)
- `setupSocketAuth` checked `rooms` table (rejected if not registered)
- User enters room via URL → REST works → Socket.io rejected → all real-time events lost

Fix: both paths now use the `rooms` table as the single gate.
