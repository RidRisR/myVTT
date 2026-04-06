import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Chat @variable autocomplete (entity bindings)', () => {
  test('DH character attributes appear in @autocomplete and resolve in formula rolls', async ({
    page,
  }) => {
    const roomName = `at-var-dh-${Date.now()}`

    // Setup: create DH room and join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Create character and get its ID
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('New Character')

    const entityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const entities = Object.values(store.entities)
      return entities.find((e: any) => e.components?.['core:identity']?.name === 'New Character')
        ?.id
    })
    expect(entityId).toBeTruthy()

    // Set DH attributes to non-zero values
    await page.evaluate(
      async ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        await store.updateEntity(id, {
          components: {
            ...store.entities[id].components,
            'daggerheart:attributes': {
              agility: 3,
              strength: 1,
              finesse: 2,
              instinct: 0,
              presence: 1,
              knowledge: 2,
            },
            'daggerheart:meta': {
              tier: 1,
              proficiency: 2,
              className: 'Ranger',
              ancestry: 'Elf',
            },
          },
        })
      },
      { id: entityId },
    )

    // Wait for attributes to propagate to store via WebSocket broadcast
    await page.waitForFunction(
      ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.entities?.[id]?.components?.['daggerheart:attributes']?.agility === 3
      },
      { id: entityId },
      { timeout: 10_000 },
    )

    // Click on the portrait to set as active character (via context menu)
    const portrait = page.locator(`[data-char-id="${entityId}"]`)
    await expect(portrait).toBeVisible({ timeout: 5_000 })
    await portrait.click({ button: 'right' })
    // Look for "Set Active" menu item — it sets the active character
    const setActiveItem = page.getByText(/Set Active|设为活跃|アクティブ/)
    if (await setActiveItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await setActiveItem.click()
    } else {
      // If not visible (e.g., already active), press Escape to dismiss menu
      await page.keyboard.press('Escape')
    }

    // Expand chat and type @ to trigger autocomplete
    await room.chat.expandChat()
    const chatInput = page.getByTestId('chat-input')
    await chatInput.fill('@')

    // Autocomplete dropdown should appear with DH attribute suggestions
    const dropdown = page.getByTestId('autocomplete-dropdown')
    await expect(dropdown).toBeVisible({ timeout: 3_000 })

    // Should contain attribute keys like agility, strength, etc.
    await expect(dropdown).toContainText('agility')
    await expect(dropdown).toContainText('strength')

    // Type 'ag' to filter to agility
    await chatInput.fill('@ag')
    await expect(dropdown).toBeVisible()
    await expect(dropdown).toContainText('agility')

    // Press Tab to accept the suggestion
    await chatInput.press('Tab')

    // Input should now contain @agility
    await expect(chatInput).toHaveValue('@agility')

    // Now test formula substitution: type a dice formula using @agility
    await chatInput.fill('.r 1d20+@agility')
    await chatInput.press('Enter')

    // A roll result card should appear (formula was substituted and rolled)
    await expect(page.getByTestId('entry-roll-result').first()).toBeVisible({ timeout: 5_000 })
  })

  test('Generic character attributes appear in @autocomplete', async ({ page }) => {
    const roomName = `at-var-gen-${Date.now()}`

    // Setup: create Generic room and join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName)
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Create character
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('New Character')

    const entityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const entities = Object.values(store.entities)
      return entities.find((e: any) => e.components?.['core:identity']?.name === 'New Character')
        ?.id
    })
    expect(entityId).toBeTruthy()

    // Set generic attributes
    await page.evaluate(
      async ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        await store.updateEntity(id, {
          components: {
            ...store.entities[id].components,
            'rule:attributes': [
              { key: 'dex', value: 3 },
              { key: 'str', value: 5 },
            ],
          },
        })
      },
      { id: entityId },
    )

    // Wait for attributes to propagate to store via WebSocket broadcast
    await page.waitForFunction(
      ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        const attrs = store?.entities?.[id]?.components?.['rule:attributes']
        return Array.isArray(attrs) && attrs.length === 2
      },
      { id: entityId },
      { timeout: 10_000 },
    )

    // Set as active character via portrait click
    const portrait = page.locator(`[data-char-id="${entityId}"]`)
    await expect(portrait).toBeVisible({ timeout: 5_000 })
    await portrait.click({ button: 'right' })
    const setActiveItem = page.getByText(/Set Active|设为活跃|アクティブ/)
    if (await setActiveItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await setActiveItem.click()
    } else {
      await page.keyboard.press('Escape')
    }

    // Expand chat and trigger autocomplete
    await room.chat.expandChat()
    const chatInput = page.getByTestId('chat-input')
    await chatInput.fill('@')

    const dropdown = page.getByTestId('autocomplete-dropdown')
    await expect(dropdown).toBeVisible({ timeout: 3_000 })
    await expect(dropdown).toContainText('dex')
    await expect(dropdown).toContainText('str')
  })
})
