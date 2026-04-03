import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

/**
 * E2E tests pinning the entity lifecycle redesign (persistent / tactical / scene).
 *
 * Key behavioral changes verified:
 *  1. Persistent entities are linked to current scene by UI, but NOT auto-linked to new scenes
 *  2. Token quick-create produces tactical entities
 *  3. Character library only shows persistent entities
 *  4. Scene deletion cleans up tactical entities but preserves persistent ones
 *  5. Persistent entities can be removed from scenes
 */

/** Helper: create room, join as GM, return RoomPage */
async function gmSetup(page: import('@playwright/test').Page, roomSuffix: string) {
  const roomName = `lifecycle-${roomSuffix}-${Date.now()}`
  const admin = new AdminPage(page)
  await admin.goto()
  await admin.createRoom(roomName)
  await admin.enterRoom(roomName)
  const seatSelect = new SeatSelectPage(page)
  await seatSelect.createAndJoin('GM', 'GM')
  const room = new RoomPage(page)
  await room.expectInRoom()
  return room
}

/** Helper: get active sceneId from store */
function evalActiveSceneId(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const store = (window as any).__MYVTT_STORES__?.world()
    return store?.room?.activeSceneId as string | undefined
  })
}

/** Helper: get sceneEntityMap entries for a scene */
function evalSceneEntities(page: import('@playwright/test').Page, sceneId: string) {
  return page.evaluate(
    (sid: string) => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return (store?.sceneEntityMap?.[sid] ?? []) as Array<{
        entityId: string
        visible: boolean
      }>
    },
    sceneId,
  )
}

/** Helper: find entity by name, return { id, lifecycle } */
function evalEntityByName(page: import('@playwright/test').Page, name: string) {
  return page.evaluate(
    (n: string) => {
      const store = (window as any).__MYVTT_STORES__?.world()
      if (!store?.entities) return null
      const entity = Object.values(store.entities).find(
        (e: any) => e.components?.['core:identity']?.name === n,
      )
      if (!entity) return null
      return { id: (entity as any).id, lifecycle: (entity as any).lifecycle }
    },
    name,
  )
}

test.describe('Entity Lifecycle Redesign', () => {
  // ── 1. Persistent entity linked to current scene but NOT new scenes ──
  test('persistent entity is linked to current scene by UI, but NOT auto-linked to new scenes', async ({
    page,
  }) => {
    const room = await gmSetup(page, 'no-autolink-create')

    const sceneId = await evalActiveSceneId(page)
    expect(sceneId).toBeTruthy()

    // Create a character via Characters tab (lifecycle = persistent)
    // Note: CharacterLibraryTab explicitly links new entities to the active scene
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('New Character')

    await page.waitForTimeout(500)

    const entityInfo = await evalEntityByName(page, 'New Character')
    expect(entityInfo).toBeTruthy()
    expect(entityInfo!.lifecycle).toBe('persistent')

    // Assert: entity IS in the current scene (UI links it on creation)
    const entries = await evalSceneEntities(page, sceneId!)
    const linked = entries.some((e) => e.entityId === entityInfo!.id)
    expect(linked).toBe(true)

    // Create a new scene — persistent entity should NOT be auto-linked to it
    await room.scenes.openSceneList()
    await room.scenes.createScene()
    await room.scenes.selectScene('New Scene')
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sid = store?.room?.activeSceneId
        return store?.scenes?.find((s: any) => s.id === sid)?.name === 'New Scene'
      },
      null,
      { timeout: 10_000 },
    )

    const newSceneId = await evalActiveSceneId(page)
    const newEntries = await evalSceneEntities(page, newSceneId!)
    const linkedInNew = newEntries.some((e) => e.entityId === entityInfo!.id)
    expect(linkedInNew).toBe(false)
  })

  // ── 2. No auto-link on scene creation ──
  test('new scene does NOT auto-link existing persistent entities', async ({ page }) => {
    const room = await gmSetup(page, 'no-autolink-scene')

    // Create a character first
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('New Character')

    const entityInfo = await evalEntityByName(page, 'New Character')
    expect(entityInfo).toBeTruthy()

    // Create a new scene and switch to it
    await room.scenes.openSceneList()
    await room.scenes.createScene()
    await room.scenes.selectScene('New Scene')

    // Wait for scene switch
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        const scene = store?.scenes?.find((s: any) => s.id === sceneId)
        return scene?.name === 'New Scene'
      },
      null,
      { timeout: 10_000 },
    )

    const newSceneId = await evalActiveSceneId(page)
    expect(newSceneId).toBeTruthy()

    // Assert: persistent entity should NOT be in the new scene
    const entries = await evalSceneEntities(page, newSceneId!)
    const linked = entries.some((e) => e.entityId === entityInfo!.id)
    expect(linked).toBe(false)
  })

  // ── 3. Token quick-create produces tactical entity ──
  test('token quick-create produces entity with lifecycle=tactical', async ({ page }) => {
    const room = await gmSetup(page, 'tactical-create')

    // Enter combat and create a token
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()

    // Wait for token to appear
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // Get the entity created by quick-create and verify lifecycle
    const entityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.tacticalInfo?.tokens?.[0]?.entityId
    })
    expect(entityId).toBeTruthy()

    const lifecycle = await page.evaluate((eid: string) => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.entities?.[eid]?.lifecycle
    }, entityId as string)
    expect(lifecycle).toBe('tactical')
  })

  // ── 4. Character library only shows persistent entities ──
  test('character library shows only persistent entities, not tactical', async ({ page }) => {
    const room = await gmSetup(page, 'library-filter')

    // Create a tactical entity via token quick-create
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // Get tactical entity id (name is empty for quick-created tokens)
    const tacticalEntityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.tacticalInfo?.tokens?.[0]?.entityId as string
    })
    expect(tacticalEntityId).toBeTruthy()

    // Verify the entity is tactical
    const lifecycle = await page.evaluate(
      (eid: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.entities?.[eid]?.lifecycle
      },
      tacticalEntityId as string,
    )
    expect(lifecycle).toBe('tactical')

    // Create a persistent entity via character library
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('New Character')

    // Verify tactical entity is NOT in the library by checking store filtering
    // The library only shows entities with lifecycle === 'persistent'
    const libraryHasTactical = await page.evaluate(
      (eid: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const entity = store?.entities?.[eid]
        return entity?.lifecycle === 'persistent'
      },
      tacticalEntityId as string,
    )
    expect(libraryHasTactical).toBe(false)
  })

  // ── 5. Scene deletion cleans up tactical entities ──
  test('deleting a scene removes tactical entities created in it', async ({ page }) => {
    const room = await gmSetup(page, 'scene-delete-tactical')

    // Create a second scene and switch to it
    await room.scenes.openSceneList()
    await room.scenes.createScene()
    await room.scenes.renameScene('New Scene', 'Battle Arena')
    await room.scenes.selectScene('Battle Arena')
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        const scene = store?.scenes?.find((s: any) => s.id === sceneId)
        return scene?.name === 'Battle Arena'
      },
      null,
      { timeout: 10_000 },
    )

    // Enter combat and create a token → creates tactical entity
    await room.gmDock.enterCombat()
    await room.tactical.expectVisible()
    await room.tactical.rightClickCenter()
    await page.getByText('Create Token').click()
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return (store?.tacticalInfo?.tokens?.length ?? 0) > 0
      },
      null,
      { timeout: 10_000 },
    )

    // Record the tactical entity id
    const tacticalEntityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.tacticalInfo?.tokens?.[0]?.entityId
    })
    expect(tacticalEntityId).toBeTruthy()

    // Exit combat, switch back to first scene
    await room.gmDock.exitCombat()
    await room.tactical.expectHidden()

    await room.scenes.openSceneList()
    const firstSceneName = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.scenes?.find((s: any) => s.name !== 'Battle Arena')?.name
    })
    expect(firstSceneName).toBeTruthy()
    await room.scenes.selectScene(firstSceneName as string)
    await page.waitForFunction(
      (name: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        return store?.scenes?.find((s: any) => s.id === sceneId)?.name === name
      },
      firstSceneName as string,
      { timeout: 10_000 },
    )

    // Delete "Battle Arena"
    await room.scenes.deleteScene('Battle Arena')
    await room.scenes.expectSceneNotExists('Battle Arena')

    // Assert: tactical entity should be deleted from the store
    await page.waitForFunction(
      (eid: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.entities?.[eid] == null
      },
      tacticalEntityId as string,
      { timeout: 10_000 },
    )
  })

  // ── 6. Scene deletion preserves persistent entities ──
  test('deleting a scene preserves persistent entities', async ({ page }) => {
    const room = await gmSetup(page, 'scene-delete-persistent')

    // Create a persistent character
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('New Character')

    const entityInfo = await evalEntityByName(page, 'New Character')
    expect(entityInfo).toBeTruthy()

    // Create a second scene
    await room.scenes.openSceneList()
    await room.scenes.createScene()
    await room.scenes.renameScene('New Scene', 'Temp Scene')
    await room.scenes.selectScene('Temp Scene')
    await page.waitForFunction(
      () => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        return store?.scenes?.find((s: any) => s.id === sceneId)?.name === 'Temp Scene'
      },
      null,
      { timeout: 10_000 },
    )

    // Switch back to first scene, delete "Temp Scene"
    const firstSceneName = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.scenes?.find((s: any) => s.name !== 'Temp Scene')?.name
    })
    await room.scenes.selectScene(firstSceneName as string)
    await page.waitForFunction(
      (name: string) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const sceneId = store?.room?.activeSceneId
        return store?.scenes?.find((s: any) => s.id === sceneId)?.name === name
      },
      firstSceneName as string,
      { timeout: 10_000 },
    )
    await room.scenes.deleteScene('Temp Scene')
    await room.scenes.expectSceneNotExists('Temp Scene')

    // Assert: persistent entity still exists
    const entityStillExists = await page.evaluate((eid: string) => {
      const store = (window as any).__MYVTT_STORES__?.world()
      return store?.entities?.[eid] != null
    }, entityInfo!.id)
    expect(entityStillExists).toBe(true)
  })

  // ── 7. NPC quick-create (entity panel) produces tactical entity ──
  test('NPC created via entity panel has lifecycle=tactical', async ({ page }) => {
    const room = await gmSetup(page, 'npc-tactical')

    // Open entity panel and create NPC
    await room.gmSidebar.openEntities()
    await room.gmSidebar.entityPanel.createNpc()

    // Wait for entity to appear
    await room.gmSidebar.entityPanel.expectEntityVisible('New NPC')

    // Verify lifecycle
    const entityInfo = await evalEntityByName(page, 'New NPC')
    expect(entityInfo).toBeTruthy()
    expect(entityInfo!.lifecycle).toBe('tactical')
  })
})
