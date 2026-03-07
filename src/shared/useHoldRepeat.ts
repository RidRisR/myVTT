import { useCallback, useEffect, useRef } from 'react'

/**
 * Hold-to-repeat with acceleration.
 *
 * - Initial press fires immediately (count=0)
 * - After 400ms delay, fires every 80ms with incrementing count
 * - `onTick` is stored in a ref so the caller's closure is always fresh
 */
export function useHoldRepeat(onTick: (count: number) => void) {
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const holdStop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    timerRef.current = null
    intervalRef.current = null
  }, [])

  useEffect(() => holdStop, [holdStop])

  const holdStart = useCallback(() => {
    holdStop()
    onTickRef.current(0)
    let count = 0
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        count++
        onTickRef.current(count)
      }, 80)
    }, 400)
  }, [holdStop])

  return { holdStart, holdStop }
}
