# UX Journey Audit

Full-journey UX review conducted via Playwright automated screenshots.
Screenshots: `screenshots/ux-review/`

## Issue List

### P0 — First-Screen Onboarding

| ID   | Issue                                                                                                                  | Screenshot               | Status |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------ |
| F-01 | GM sidebar defaults to "Archives" tab on new room — should be collapsed or show Entities                               | `07-seat-joined-gm`      | Open   |
| F-02 | Empty scene state shows "No scene selected / Upload a scene from the asset dock" — no actionable CTA for new users     | `08-main-layout-default` | Open   |
| F-03 | Dice roll total displays "?" instead of computed sum (`.r 2d6+3` → `1 4 + 3 = ?`) — confirm if animation timing or bug | `05-chat-dice-roll`      | Open   |

### P1 — Language Consistency

| ID   | Issue                                                            | Screenshot               | Status |
| ---- | ---------------------------------------------------------------- | ------------------------ | ------ |
| F-04 | Bottom dock tab "蓝图" is Chinese while all others are English   | `08-main-layout-default` | Open   |
| F-05 | Blueprint tag filters are Chinese (人形/野兽/魔法生物/亡灵/物件) | `09-token-spawned`       | Open   |
| F-06 | Sidebar titles are Chinese (存档/实体/暂无战场存档/新建NPC)      | `07-seat-joined-gm`      | Open   |

### P2 — Interaction Details

| ID   | Issue                                                                                        | Screenshot                   | Status |
| ---- | -------------------------------------------------------------------------------------------- | ---------------------------- | ------ |
| F-07 | Join button appears disabled despite valid form (name filled, role selected, color selected) | `06-seat-select-form-filled` | Open   |
| F-08 | Spawned token lands at top-left corner instead of visible canvas center                      | `09-token-spawned`           | Open   |
| F-09 | Dice dock tab shows "Dice system coming soon" placeholder — hide or label as WIP?            | `19-gm-sidebar-archives`     | Open   |
| F-10 | Top-right Team Dashboard area is an empty bar with no content or hint                        | `08-main-layout-default`     | Open   |

### P3 — Low Priority / Polish

| ID   | Issue                                                            | Screenshot                   | Status |
| ---- | ---------------------------------------------------------------- | ---------------------------- | ------ |
| F-11 | Seat color swatches have no tooltip/label                        | `05-seat-select-create-form` | Open   |
| F-12 | "Online" and "GM" badges on seat buttons are very small          | `21-player-seat-select`      | Open   |
| F-13 | Canvas right-click context menu has no background/shadow styling | `10-tactical-context-menu`   | Open   |
| F-14 | Hamburger menu theme name "Cold Arcane" is unclear to users      | `09-hamburger-menu-open`     | Open   |

## Journeys Covered

- [x] J1: Landing & Admin Panel
- [x] J2: Seat Selection
- [x] J3: Main Layout & Navigation
- [x] J4: Scene Mode
- [x] J5: Character System
- [x] J6: Chat & Dice
- [x] J7: Tactical Combat
- [x] J8: GM Tools (Dock + Sidebar)
- [ ] J9: Showcase (needs separate test — complex setup)
- [x] J10: Team Dashboard
- [x] J11: Multi-client Sync
