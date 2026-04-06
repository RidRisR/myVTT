import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Portrait Resource Display (entity bindings)', () => {
  test('DH character shows portrait with resource rings after setting HP/Stress', async ({
    page,
  }) => {
    const roomName = `portrait-res-${Date.now()}`

    // Setup: create DH room and join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Create a character via Characters tab (gets DH data template)
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('New Character')

    // Read entity ID from store
    const entityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const entities = Object.values(store.entities) as any[]
      return entities.find(
        (e: any) => e.components?.['core:identity']?.name === 'New Character',
      )?.id
    })
    expect(entityId).toBeTruthy()

    // Set HP and Stress to non-zero values via store (simulates GM editing the character sheet)
    await page.evaluate(
      async ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        await store.updateEntity(id, {
          components: {
            ...store.entities[id].components,
            'daggerheart:health': { current: 15, max: 20 },
            'daggerheart:stress': { current: 2, max: 6 },
          },
        })
      },
      { id: entityId },
    )

    // Wait for store to reflect the updated HP
    await page.waitForFunction(
      ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const entity = store?.entities?.[id]
        return entity?.components?.['daggerheart:health']?.current === 15
      },
      { id: entityId },
      { timeout: 10_000 },
    )

    // Portrait should appear in the portrait bar with the entity's data-char-id
    const portrait = page.locator(`[data-char-id="${entityId}"]`)
    await expect(portrait).toBeVisible({ timeout: 5_000 })

    // Portrait should contain SVG resource rings (circle elements for HP and Stress)
    const rings = portrait.locator('svg circle')
    // 2 resources × 2 (background + fill) = 4 circle elements
    await expect(rings).toHaveCount(4, { timeout: 5_000 })

    // Verify entity components are correct in the store
    const entityData = await page.evaluate(
      ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const entity = store?.entities?.[id]
        return {
          hp: entity?.components?.['daggerheart:health'],
          stress: entity?.components?.['daggerheart:stress'],
          name: entity?.components?.['core:identity']?.name,
        }
      },
      { id: entityId },
    )
    expect(entityData.hp).toEqual({ current: 15, max: 20 })
    expect(entityData.stress).toEqual({ current: 2, max: 6 })
    expect(entityData.name).toBe('New Character')
  })

  test('Generic character shows portrait with resource rings', async ({ page }) => {
    const roomName = `portrait-generic-${Date.now()}`

    // Setup: create Generic room and join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName) // default = generic
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Create a character
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('New Character')

    // Read entity ID
    const entityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const entities = Object.values(store.entities) as any[]
      return entities.find(
        (e: any) => e.components?.['core:identity']?.name === 'New Character',
      )?.id
    })
    expect(entityId).toBeTruthy()

    // Set rule:resources via store
    await page.evaluate(
      async ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        await store.updateEntity(id, {
          components: {
            ...store.entities[id].components,
            'rule:resources': [
              { current: 5, max: 10, label: 'Mana', color: '#3b82f6' },
              { current: 3, max: 8, label: 'Stamina', color: '#22c55e' },
            ],
          },
        })
      },
      { id: entityId },
    )

    // Wait for store update
    await page.waitForFunction(
      ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const entity = store?.entities?.[id]
        const resources = entity?.components?.['rule:resources']
        return Array.isArray(resources) && resources.length === 2
      },
      { id: entityId },
      { timeout: 10_000 },
    )

    // Portrait appears with resource rings
    const portrait = page.locator(`[data-char-id="${entityId}"]`)
    await expect(portrait).toBeVisible({ timeout: 5_000 })
    const rings = portrait.locator('svg circle')
    await expect(rings).toHaveCount(4, { timeout: 5_000 })
  })
})
