import { computed, onBeforeUnmount, onMounted, reactive, ref, type Ref } from 'vue'

type Point = { x: number; y: number }
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const clampZoom = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))

/** View-only state: never changes diagram, layout storage or pending edits. */
export function useCanvasViewport(svg: Ref<SVGSVGElement | null>) {
  const view = reactive({ x: 0, y: 0, zoom: 1 })
  const pointers = new Map<number, Point>()
  const panning = ref(false)
  // One model unit equals one CSS pixel at 100%, even in narrow split panes.
  const size = reactive({ width: 1000, height: 600 })
  let observer: ResizeObserver | null = null
  onMounted(() => {
    if (!svg.value) return
    observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) { size.width = rect.width; size.height = rect.height }
    })
    observer.observe(svg.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  const viewBox = computed(() => `${view.x} ${view.y} ${size.width / view.zoom} ${size.height / view.zoom}`)
  const percent = computed(() => `${Math.round(view.zoom * 100)}%`)

  function worldPoint(clientX: number, clientY: number): Point | null {
    const matrix = svg.value?.getScreenCTM()
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null
  }
  function zoomAt(value: number, point: Point) {
    const zoom = clampZoom(value)
    const ratio = view.zoom / zoom
    view.x = point.x - (point.x - view.x) * ratio
    view.y = point.y - (point.y - view.y) * ratio
    view.zoom = zoom
  }
  function zoomBy(factor: number) {
    zoomAt(view.zoom * factor, { x: view.x + size.width / (2 * view.zoom), y: view.y + size.height / (2 * view.zoom) })
  }
  function onWheel(event: WheelEvent) {
    const point = worldPoint(event.clientX, event.clientY)
    if (!point) return
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 600 : 1)
    zoomAt(view.zoom * Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.0015), point)
  }
  function reset() {
    for (const id of pointers.keys()) {
      if (svg.value?.hasPointerCapture(id)) svg.value.releasePointerCapture(id)
    }
    pointers.clear(); panning.value = false
    view.x = 0; view.y = 0; view.zoom = 1
  }
  function fit(bounds: { x: number; y: number; width: number; height: number } | null) {
    if (!bounds) { reset(); return }
    const zoom = clampZoom(Math.min(size.width / (bounds.width + 160), size.height / (bounds.height + 160), 1))
    view.zoom = zoom
    view.x = bounds.x + bounds.width / 2 - size.width / (2 * zoom)
    view.y = bounds.y + bounds.height / 2 - size.height / (2 * zoom)
  }
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('.canvas-node, .canvas-edge'))) return
    if (pointers.size >= 2) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    panning.value = true
    svg.value?.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  function pointerMove(event: PointerEvent) {
    const previous = pointers.get(event.pointerId)
    const matrix = svg.value?.getScreenCTM()
    if (!previous || !matrix || !matrix.a) return
    const next = { x: event.clientX, y: event.clientY }
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1]
    if (other) {
      const oldCenter = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 }
      const newCenter = { x: (next.x + other.x) / 2, y: (next.y + other.y) / 2 }
      const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y)
      const newDistance = Math.hypot(next.x - other.x, next.y - other.y)
      const anchor = worldPoint(oldCenter.x, oldCenter.y)
      if (oldDistance > 0 && anchor) {
        const oldZoom = view.zoom
        zoomAt(view.zoom * newDistance / oldDistance, anchor)
        const scale = matrix.a * view.zoom / oldZoom
        view.x -= (newCenter.x - oldCenter.x) / scale
        view.y -= (newCenter.y - oldCenter.y) / scale
      }
    } else {
      view.x -= (next.x - previous.x) / matrix.a
      view.y -= (next.y - previous.y) / matrix.d
    }
    pointers.set(event.pointerId, next)
  }
  function pointerEnd(event: PointerEvent) {
    pointers.delete(event.pointerId)
    panning.value = pointers.size > 0
  }
  function onKeydown(event: KeyboardEvent) {
    if (event.target !== svg.value) return
    const step = 50 / view.zoom
    if (event.key === 'ArrowLeft') view.x -= step
    else if (event.key === 'ArrowRight') view.x += step
    else if (event.key === 'ArrowUp') view.y -= step
    else if (event.key === 'ArrowDown') view.y += step
    else if (event.key === '+' || event.key === '=') zoomBy(1.2)
    else if (event.key === '-') zoomBy(1 / 1.2)
    else if (event.key === '0') reset()
    else return
    event.preventDefault()
  }
  return { view, viewBox, percent, panning, zoomBy, onWheel, reset, fit, pointerDown, pointerMove, pointerEnd, onKeydown, isInteracting: () => pointers.size > 0 }
}
