## Summary

<!-- Brief description of the change -->

## Related Issues

<!-- Every PR must link at least one issue (CI enforced).
     Use "Closes #N" to auto-close on merge, or "Part of #N" for incremental progress. -->

- Closes #

## API / Type Contract Changes

<!-- Remove this section if not applicable -->

- [ ] New/modified REST response types are defined in `src/shared/` and annotated with `satisfies SharedType` on the server side
- [ ] New/modified Socket.io events are declared in `src/shared/socketEvents.ts`

## Test Plan

<!--
List any manual verification steps you performed beyond the automated test suite.
Examples:
- Manual: open room → Network tab confirms single /bundle request replaces 12+ init requests
- Manual: asset upload works without duplicate keys in dock tabs
Write "N/A" if no manual steps were needed.
-->
