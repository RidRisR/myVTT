import { StateNode, atom, type TLStateNodeConstructor } from 'tldraw'

export const measurePoints = atom<{
  start: { x: number; y: number }
  end: { x: number; y: number }
} | null>('measure', null)

class Idle extends StateNode {
  static override id = 'idle'
  override onPointerDown() {
    const { x, y } = this.editor.inputs.currentPagePoint
    measurePoints.set({ start: { x, y }, end: { x, y } })
    this.parent.transition('measuring')
  }
}

class Measuring extends StateNode {
  static override id = 'measuring'
  override onPointerMove() {
    const cur = measurePoints.get()
    if (!cur) return
    const { x, y } = this.editor.inputs.currentPagePoint
    measurePoints.set({ ...cur, end: { x, y } })
  }
  override onPointerUp() {
    measurePoints.set(null)
    this.parent.transition('idle')
  }
  override onCancel() {
    measurePoints.set(null)
    this.parent.transition('idle')
  }
}

export class MeasureTool extends StateNode {
  static override id = 'measure'
  static override initial = 'idle'
  static override children(): TLStateNodeConstructor[] {
    return [Idle, Measuring]
  }
  override onExit() {
    measurePoints.set(null)
  }
  override onKeyDown(info: { key: string }) {
    if (info.key === 'Escape') {
      measurePoints.set(null)
      this.editor.setCurrentTool('select')
    }
  }
}
