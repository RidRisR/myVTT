import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import { SeatSelectPage } from './seat-select.page'
import { ScenePanelPage } from './scene-panel.page'
import { GmDockPage } from './gm-dock.page'
import { GmSidebarPage } from './gm-sidebar.page'
import { ChatPanelPage } from './chat-panel.page'
import { TacticalCanvasPage } from './tactical-canvas.page'

export class RoomPage {
  readonly page: Page
  readonly seatSelect: SeatSelectPage
  readonly scenes: ScenePanelPage
  readonly gmDock: GmDockPage
  readonly gmSidebar: GmSidebarPage
  readonly chat: ChatPanelPage
  readonly tactical: TacticalCanvasPage
  readonly hamburgerMenu: Locator

  constructor(page: Page) {
    this.page = page
    this.seatSelect = new SeatSelectPage(page)
    this.scenes = new ScenePanelPage(page)
    this.gmDock = new GmDockPage(page)
    this.gmSidebar = new GmSidebarPage(page)
    this.chat = new ChatPanelPage(page)
    this.tactical = new TacticalCanvasPage(page)
    this.hamburgerMenu = page.locator('[data-testid="hamburger-menu"]')
  }

  async goto(roomId: string) {
    await this.page.goto(`/#room=${roomId}`)
  }

  /** Wait until room is fully loaded (past "Connecting to server..." screen) */
  async waitForRoomLoaded() {
    await expect(this.page.getByText('Connecting to server...')).toBeHidden({ timeout: 15_000 })
  }

  /** Check that we're inside the room (not on SeatSelect or loading screen) */
  async expectInRoom() {
    await expect(this.hamburgerMenu).toBeVisible({ timeout: 10_000 })
  }

  /** Open hamburger menu and click "Leave Seat" */
  async leaveSeat() {
    await this.hamburgerMenu.click()
    await this.page.getByRole('button', { name: 'Leave Seat' }).click()
  }
}
