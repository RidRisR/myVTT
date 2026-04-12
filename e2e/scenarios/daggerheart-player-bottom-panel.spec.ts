import { test, expect } from '@playwright/test'
import { AdminPage } from '../pages/admin.page'
import { SeatSelectPage } from '../pages/seat-select.page'
import { RoomPage } from '../pages/room.page'

test.describe('Daggerheart Player Bottom Panel', () => {
  const roomName = `dh-bottom-panel-${Date.now()}`

  test('player can create, configure, and use a custom roll template from the bottom panel', async ({
    browser,
  }) => {
    const gmPage = await browser.newPage()
    const admin = new AdminPage(gmPage)
    await admin.goto()
    await admin.createRoom(roomName, 'daggerheart')
    await admin.enterRoom(roomName)

    const gmSeat = new SeatSelectPage(gmPage)
    await gmSeat.createAndJoin('Game Master', 'GM')
    const gmRoom = new RoomPage(gmPage)
    await gmRoom.expectInRoom()

    const playerContext = await browser.newContext()
    const playerPage = await playerContext.newPage()
    await playerPage.goto(gmPage.url())

    const playerSeat = new SeatSelectPage(playerPage)
    await playerSeat.expectVisible()
    await playerSeat.createAndJoin('Rogue', 'PL')

    const playerRoom = new RoomPage(playerPage)
    await playerRoom.expectInRoom()
    await expect(playerRoom.scenes.scenesButton).toBeHidden()

    const roomId = /#room=([a-zA-Z0-9_-]+)/.exec(playerPage.url())?.[1]
    expect(roomId).toBeTruthy()

    await playerPage.evaluate(async ({ currentRoomId }) => {
      const seats = (await fetch(`/api/rooms/${currentRoomId}/seats`).then((res) => res.json())) as Array<{
        id: string
        name: string
      }>
      const playerSeat = seats.find((seat) => seat.name === 'Rogue')
      if (!playerSeat) throw new Error('Player seat not found')

      const entityId = `e2e-dh-char-${playerSeat.id}`
      await fetch(`/api/rooms/${currentRoomId}/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entityId,
          lifecycle: 'persistent',
          permissions: { default: 'observer', seats: { [playerSeat.id]: 'owner' } },
          components: {
            'core:identity': { name: 'Rogue', imageUrl: '', color: '#3b82f6' },
            'daggerheart:health': { current: 12, max: 20 },
            'daggerheart:stress': { current: 2, max: 6 },
            'daggerheart:attributes': {
              agility: 2,
              strength: 0,
              finesse: 1,
              instinct: 1,
              presence: 0,
              knowledge: 0,
            },
            'daggerheart:meta': {
              tier: 1,
              proficiency: 1,
              className: 'Rogue',
              ancestry: 'Human',
            },
            'daggerheart:extras': { hope: 3, hopeMax: 6, armor: 1, armorMax: 3 },
            'daggerheart:thresholds': { evasion: 12, major: 7, severe: 14 },
            'daggerheart:experiences': { items: [] },
            'daggerheart:roll-templates': { items: [] },
          },
        }),
      })

      await fetch(`/api/rooms/${currentRoomId}/seats/${playerSeat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeCharacterId: entityId }),
      })
    }, { currentRoomId: roomId })

    const collapsedBar = playerPage.getByTestId('player-bottom-panel-collapsed')
    await expect(collapsedBar).toBeVisible({ timeout: 15000 })

    await playerPage.getByTestId('player-bottom-panel-expand').click()
    await expect(playerPage.getByTestId('player-bottom-panel-expanded')).toBeVisible()

    await playerPage.getByRole('button', { name: '自定义' }).click()
    await playerPage.getByRole('button', { name: /新建模板/ }).click()

    const templateCard = playerPage.getByText('新模板').first()
    await expect(templateCard).toBeVisible()

    await templateCard.hover()
    await playerPage.getByLabel('编辑模板').click()

    const nameInput = playerPage.getByPlaceholder('模板名称')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('潜行模板')

    const configButton = playerPage.getByRole('button', { name: '配置' })
    await configButton.click()

    const modifierPanel = playerPage.getByText('掷骰设定')
    await expect(modifierPanel).toBeVisible()
    await playerPage.getByRole('button', { name: 'Roll' }).click()
    await expect(modifierPanel).toBeHidden({ timeout: 10000 })

    await playerPage.getByLabel('保存模板').click()
    await expect(playerPage.getByText('潜行模板').first()).toBeVisible()

    await playerPage.getByText('潜行模板').first().click()
    await playerRoom.chat.expandChat()
    await playerRoom.chat.expectJudgmentVisible()

    await gmPage.close()
    await playerPage.close()
    await playerContext.close()
  })
})
