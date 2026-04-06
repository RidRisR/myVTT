import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Character Card Expansion (entity bindings)', () => {
  test('clicking DH portrait opens character card with HP/Stress and attributes', async ({
    page,
  }) => {
    const roomName = `card-expand-dh-${Date.now()}`

    // Setup: create DH room and join as GM
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)
    const seatSelect = new SeatSelectPage(page)
    await seatSelect.createAndJoin('GM', 'GM')
    const room = new RoomPage(page)
    await room.expectInRoom()

    // Create character
    await room.gmDock.openTab('characters')
    await room.gmDock.characterLibrary.createCharacter()
    await room.gmDock.characterLibrary.expectCharacterVisible('New Character')

    // Get entity ID and set meaningful DH data
    const entityId = await page.evaluate(() => {
      const store = (window as any).__MYVTT_STORES__?.world()
      const entities = Object.values(store.entities)
      return entities.find((e: any) => e.components?.['core:identity']?.name === 'New Character')
        ?.id
    })
    expect(entityId).toBeTruthy()

    await page.evaluate(
      async ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        await store.updateEntity(id, {
          components: {
            ...store.entities[id].components,
            'daggerheart:health': { current: 15, max: 20 },
            'daggerheart:stress': { current: 2, max: 6 },
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
            'daggerheart:extras': { hope: 3, armor: 1 },
          },
        })
      },
      { id: entityId },
    )

    // Wait for store update
    await page.waitForFunction(
      ({ id }) => {
        const store = (window as any).__MYVTT_STORES__?.world()
        return store?.entities?.[id]?.components?.['daggerheart:health']?.current === 15
      },
      { id: entityId },
      { timeout: 10_000 },
    )

    // The character creation opens a card by default (openCard is called in handleCreate).
    // Close it first by clicking elsewhere, then reopen by clicking the portrait.
    await page.keyboard.press('Escape')
    // Wait a bit for the card to close
    await page.waitForTimeout(300)

    // Click on the portrait to open the character card
    const portrait = page.locator(`[data-char-id="${entityId}"]`)
    await expect(portrait).toBeVisible({ timeout: 5_000 })
    await portrait.click()

    // The entity card popup should appear
    const cardPopup = page.getByTestId('entity-card-popup')
    await expect(cardPopup).toBeVisible({ timeout: 5_000 })

    // Card should display DH-specific content: HP, Stress, Hope
    await expect(cardPopup).toContainText('15/20') // HP
    await expect(cardPopup).toContainText('2/6') // Stress
    await expect(cardPopup).toContainText('3') // Hope value

    // Card should display character name
    await expect(cardPopup).toContainText('New Character')

    // Card should display attribute grid (6 DH attributes)
    await expect(cardPopup).toContainText('agility')
    await expect(cardPopup).toContainText('strength')
    await expect(cardPopup).toContainText('finesse')
    await expect(cardPopup).toContainText('instinct')
    await expect(cardPopup).toContainText('presence')
    await expect(cardPopup).toContainText('knowledge')

    // Attribute values should be displayed
    await expect(cardPopup).toContainText('+3') // agility
    await expect(cardPopup).toContainText('+1') // strength or presence
    await expect(cardPopup).toContainText('+2') // finesse or knowledge

    // Card should show the class name from meta
    await expect(cardPopup).toContainText('Ranger')
  })

  test('clicking Generic portrait opens character card', async ({ page }) => {
    const roomName = `card-expand-gen-${Date.now()}`

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

    // Close the auto-opened card and reopen via portrait click
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    const portrait = page.locator(`[data-char-id="${entityId}"]`)
    await expect(portrait).toBeVisible({ timeout: 5_000 })
    await portrait.click()

    // The entity card popup should appear
    const cardPopup = page.getByTestId('entity-card-popup')
    await expect(cardPopup).toBeVisible({ timeout: 5_000 })

    // Card should display the character name
    await expect(cardPopup).toContainText('New Character')
  })

  test('character card closes when clicking outside', async ({ page }) => {
    const roomName = `card-dismiss-${Date.now()}`

    // Setup
    const admin = new AdminPage(page)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
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

    // Close auto-opened card, then reopen
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    const portrait = page.locator(`[data-char-id="${entityId}"]`)
    await portrait.click()
    const cardPopup = page.getByTestId('entity-card-popup')
    await expect(cardPopup).toBeVisible({ timeout: 5_000 })

    // Click on the page body (outside the card) to dismiss
    await page.mouse.click(10, 400)

    // Card should be dismissed
    await expect(cardPopup).toBeHidden({ timeout: 5_000 })
  })
})
