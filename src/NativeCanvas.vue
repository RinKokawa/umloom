<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, toRef, watch } from 'vue'
import { Plus, Minus, Maximize, RotateCcw, Link2, Trash2, Check, X, ChevronDown, Box, Braces, Eye, EyeOff, ArrowDownUp } from '@lucide/vue'
import { useCanvasViewport } from './canvas-viewport'
import { useClassIcons } from './use-class-icons'
import IconGraphic from './IconGraphic.vue'
import IconPicker from './IconPicker.vue'
import { assertOjDiagram } from './uml/model'
import { formatAttributeRow, formatMethodRow, newAttributeRow, newMethodRow, newParameterRow, parseAttributeRow, parseMethodRow } from './uml/member-editor'
import type { AttributeRow, MethodRow } from './uml/member-editor'
import type { Diagram } from './uml/model'

const props = defineProps<{ diagram: Diagram; problemId: string; disabled: boolean; onApply: (model: Diagram) => boolean | string }>()
const emit = defineEmits<{ dirty: [value: boolean] }>()
type Point = { x: number; y: number }
const svg = ref<SVGSVGElement | null>(null)
const viewport = useCanvasViewport(svg)
const { viewBox, percent, panning } = viewport
const icons = useClassIcons(toRef(props, 'problemId'))
const { visible: iconsVisible, warning: iconWarning, blocked: iconsBlocked, library: iconLibrary, libraryWarning } = icons
function classIconChoice(name: string) { return name in icons.settings.value.choices ? icons.settings.value.choices[name] : null }
function classIconId(name: string) { const icon = icons.iconFor(name); return icon && icon.kind !== 'none' ? `${icon.kind}:${icon.id}` : '' }
const nodePicker = ref<HTMLElement | null>(null)
const nodePickerButton = ref<HTMLButtonElement | null>(null)
const nodePickerOpen = ref(false)
const positions = ref<Record<string, Point>>({})
const storageOk = ref(true)
const selection = ref<{ kind: 'class' | 'relation'; index: number } | null>(null)
const form = reactive({ name: '', attributes: '', methods: '', source: '', target: '', sourceMultiplicity: '', targetMultiplicity: '', label: '', type: 'ClassBidirectional' })
const attributes = ref<AttributeRow[]>([])
const methods = ref<MethodRow[]>([])
const dirty = ref(false)
const error = ref('')
const stagedMismatch = ref(false)
let rawPending: string | null = null
const clone = () => structuredClone(toRaw(props.diagram))
const position = (name: string, index: number): Point => positions.value[name] ?? { x: 40 + (index % 3) * 320, y: 65 + Math.floor(index / 3) * 170 }
const classPoint = (name: string) => {
  const index = props.diagram.classes.findIndex(c => c.name === name)
  return position(name, Math.max(index, 0))
}
const headerHeight = (index: number) => props.diagram.classes[index]?.kind === 'interface' ? 50 : 32
const height = (index: number) => Math.max(headerHeight(index) + 30, headerHeight(index) + 8 + (props.diagram.classes[index]?.attributes.length ?? 0) * 18 + (props.diagram.classes[index]?.methods.length ?? 0) * 18)
function line(index: number) {
  const relation = props.diagram.relations[index]
  const si = props.diagram.classes.findIndex(c => c.name === relation.source)
  const ti = props.diagram.classes.findIndex(c => c.name === relation.target)
  const a = classPoint(relation.source), b = classPoint(relation.target)
  const ax = a.x + 100, ay = a.y + height(si) / 2, bx = b.x + 100, by = b.y + height(ti) / 2
  const dx = bx - ax, dy = by - ay
  if (si === ti) return { x1: ax, y1: a.y, x2: ax + 1, y2: a.y, self: true }
  const scaleA = 1 / Math.max(Math.abs(dx) / 100, Math.abs(dy) / (height(si) / 2), 1)
  const scaleB = 1 / Math.max(Math.abs(dx) / 100, Math.abs(dy) / (height(ti) / 2), 1)
  return { x1: ax + dx * scaleA, y1: ay + dy * scaleA, x2: bx - dx * scaleB, y2: by - dy * scaleB, self: false }
}
function edgeCurve(index: number) {
  const r = props.diagram.relations[index]
  if (r.source === r.target) return null
  const peers = props.diagram.relations.map((e, i) => ({ e, i })).filter(({ e }) => (e.source === r.source && e.target === r.target) || (e.source === r.target && e.target === r.source))
  if (peers.length < 2) return null
  const p = line(index), dx = p.x2 - p.x1, dy = p.y2 - p.y1, length = Math.hypot(dx, dy) || 1
  const offset = (peers.findIndex(e => e.i === index) - (peers.length - 1) / 2) * 110 * (r.source < r.target ? 1 : -1)
  const cx = (p.x1 + p.x2) / 2 - dy / length * offset, cy = (p.y1 + p.y2) / 2 + dx / length * offset
  const at = (t: number) => ({ x: (1 - t) ** 2 * p.x1 + 2 * (1 - t) * t * cx + t ** 2 * p.x2, y: (1 - t) ** 2 * p.y1 + 2 * (1 - t) * t * cy + t ** 2 * p.y2 })
  return { d: `M ${p.x1} ${p.y1} Q ${cx} ${cy} ${p.x2} ${p.y2}`, start: at(.2), mid: at(.5), end: at(.8) }
}
const isSelected = (kind: 'class' | 'relation', index: number) => selection.value?.kind === kind && selection.value.index === index
function setDirty(value: boolean) {
  dirty.value = value; emit('dirty', value)
  if (!value) {
    stagedMismatch.value = false; rawPending = null
    try { localStorage.removeItem(`uml-oj-native-pending-v1:${props.problemId}`) } catch { storageOk.value = false }
  }
}
function canDiscard() { return !dirty.value || window.confirm('编辑面板有尚未应用的内容，放弃这些内容吗？') }
function choose(kind: 'class' | 'relation', index: number) {
  if (props.disabled || (selection.value?.kind === kind && selection.value.index === index)) return
  if (!canDiscard()) return
  setDirty(false); error.value = ''; selection.value = { kind, index }
  if (kind === 'class') {
    const c = props.diagram.classes[index]
    form.name = c.name; form.attributes = c.attributes.join('\n'); form.methods = c.methods.join('\n')
    attributes.value = c.attributes.map(parseAttributeRow)
    methods.value = c.methods.map(parseMethodRow)
  } else {
    const r = props.diagram.relations[index]
    Object.assign(form, r)
  }
}
function closeInspector() {
  if (!canDiscard()) return
  const focusedNode = svg.value?.querySelector<SVGElement>('.canvas-node.selected, .canvas-edge.selected')
  selection.value = null; setDirty(false); error.value = ''
  void nextTick(() => focusedNode?.focus({ preventScroll: true }))
}
function markDirty() {
  setDirty(true); error.value = ''
  try {
    const value = JSON.stringify({ modelKey: JSON.stringify(props.diagram), selection: selection.value, form: { ...form }, members: { attributes: attributes.value, methods: methods.value } })
    localStorage.setItem(`uml-oj-native-pending-v1:${props.problemId}`, value)
    rawPending = value
  } catch { storageOk.value = false }
}
function swapRelationEnds() {
  if (props.disabled || stagedMismatch.value || selection.value?.kind !== 'relation') return
  if (form.source === form.target && form.sourceMultiplicity === form.targetMultiplicity) return
  ;[form.source, form.target] = [form.target, form.source]
  ;[form.sourceMultiplicity, form.targetMultiplicity] = [form.targetMultiplicity, form.sourceMultiplicity]
  markDirty()
}
function touchMember(row: AttributeRow | MethodRow) { row.modified = true; markDirty() }
function addAttribute() { attributes.value.push(newAttributeRow()); markDirty() }
function addMethod() { methods.value.push(newMethodRow()); markDirty() }
function removeAttribute(index: number) { attributes.value.splice(index, 1); markDirty() }
function removeMethod(index: number) { methods.value.splice(index, 1); markDirty() }
function addParameter(row: MethodRow) { row.parameters.push(newParameterRow()); touchMember(row) }
function removeParameter(row: MethodRow, index: number) { row.parameters.splice(index, 1); touchMember(row) }
function apply() {
  if (!selection.value || props.disabled) return
  if (stagedMismatch.value) { error.value = '这份未应用编辑与当前答案不一致，请先备份并撤销编辑。'; return }
  try {
    const next = clone()
    if (selection.value.kind === 'class') {
      const c = next.classes[selection.value.index]
      const old = c.name
      c.name = form.name.trim()
      c.attributes = attributes.value.map(formatAttributeRow)
      c.methods = methods.value.map(formatMethodRow)
      for (const r of next.relations) { if (r.source === old) r.source = c.name; if (r.target === old) r.target = c.name }
      assertOjDiagram(next)
    } else {
      const r = next.relations[selection.value.index]
      Object.assign(r, { source: form.source, target: form.target, sourceMultiplicity: form.sourceMultiplicity.trim(), targetMultiplicity: form.targetMultiplicity.trim(), label: form.label.trim(), type: form.type })
      assertOjDiagram(next)
    }
    const oldName = selection.value.kind === 'class' ? props.diagram.classes[selection.value.index].name : ''
    const newName = selection.value.kind === 'class' ? next.classes[selection.value.index].name : ''
    const applied = props.onApply(next)
    if (applied !== true) throw new Error(typeof applied === 'string' ? applied : '无法同步源码；编辑内容仍保留，请检查同步提示。')
    if (oldName && oldName !== newName && positions.value[oldName]) { positions.value[newName] = positions.value[oldName]; delete positions.value[oldName]; saveLayout() }
    if (oldName && oldName !== newName) icons.rename(oldName, newName)
    setDirty(false); error.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
function cancel() {
  const picked = selection.value
  selection.value = null; setDirty(false); error.value = ''
  if (picked && picked.index < (picked.kind === 'class' ? props.diagram.classes.length : props.diagram.relations.length) && !props.disabled) choose(picked.kind, picked.index)
}
function closeNodePicker(restoreFocus = false) {
  nodePickerOpen.value = false
  if (restoreFocus) void nextTick(() => nodePickerButton.value?.focus({ preventScroll: true }))
}
function focusNodeOption(last = false) {
  if (props.disabled) return
  nodePickerOpen.value = true
  void nextTick(() => {
    const options = nodePicker.value?.querySelectorAll<HTMLButtonElement>('.node-picker-option:not(:disabled)')
    if (options?.length) options[last ? options.length - 1 : 0].focus()
  })
}
function onOutsidePicker(event: Event) {
  if (nodePickerOpen.value && event.target instanceof Node && !nodePicker.value?.contains(event.target)) closeNodePicker()
}
function pickNode(isInterface: boolean) { closeNodePicker(true); addNode(isInterface) }
function addNode(isInterface = false) {
  if (props.disabled || !canDiscard()) return
  const next = clone()
  const prefix = isInterface ? 'Interface' : 'Class'
  let i = 1
  while (next.classes.some(c => c.name.toLowerCase() === `${prefix.toLowerCase()}${i}`)) i++
  const node: Diagram['classes'][number] = { name: `${prefix}${i}`, abstract: false, attributes: [], methods: [] }
  if (isInterface) node.kind = 'interface'
  next.classes.push(node)
  const applied = props.onApply(next)
  if (applied !== true) { error.value = typeof applied === 'string' ? applied : `无法同步源码，未添加${isInterface ? '接口' : '类'}。`; return }
  setDirty(false); selection.value = null
  void nextTick(() => choose('class', next.classes.length - 1))
}
function addRelation() {
  if (props.disabled || props.diagram.classes.length < 2 || !canDiscard()) return
  const next = clone()
  next.relations.push({ source: next.classes[0].name, target: next.classes[1].name, type: 'ClassBidirectional', label: '', sourceMultiplicity: '', targetMultiplicity: '' })
  const applied = props.onApply(next)
  if (applied !== true) { error.value = typeof applied === 'string' ? applied : '无法同步源码，未添加关系。'; return }
  setDirty(false); selection.value = null
  void nextTick(() => choose('relation', next.relations.length - 1))
}
function createConnection(source: string, target: string) {
  if (props.disabled || source === target || !props.diagram.classes.some(c => c.name === source) || !props.diagram.classes.some(c => c.name === target)) return
  if (!canDiscard()) { showConnectionNotice('已取消连线，未应用的编辑已保留。'); return }
  const next = clone()
  next.relations.push({ source, target, type: 'ClassBidirectional', label: '', sourceMultiplicity: '', targetMultiplicity: '' })
  try {
    const applied = props.onApply(next)
    if (applied !== true) { error.value = typeof applied === 'string' ? applied : '无法同步源码，未添加关系。'; showConnectionNotice('未创建关系，请检查同步提示。'); return }
    setDirty(false); selection.value = null; error.value = ''
    showConnectionNotice(`已连接 ${source} 和 ${target}，可在面板中修改关系类型。`)
    void nextTick(() => choose('relation', next.relations.length - 1))
  } catch (e) { error.value = e instanceof Error ? e.message : '无法同步源码，未添加关系。'; showConnectionNotice('未创建关系，请检查同步提示。') }
}
function removeSelected() {
  if (!selection.value || props.disabled) return
  if (!window.confirm(selection.value.kind === 'class' ? `删除这个${props.diagram.classes[selection.value.index]?.kind === 'interface' ? '接口' : '类'}及其所有关联？` : '删除这条关联？')) return
  const next = clone()
  if (selection.value.kind === 'class') {
    const name = next.classes[selection.value.index].name
    next.classes.splice(selection.value.index, 1)
    next.relations = next.relations.filter(r => r.source !== name && r.target !== name)
  } else next.relations.splice(selection.value.index, 1)
  const applied = props.onApply(next)
  if (applied !== true) { error.value = typeof applied === 'string' ? applied : '无法同步源码，未删除内容。'; return }
  setDirty(false); selection.value = null; error.value = ''
}
let layoutSaveBlocked = false
function layoutKey() { return `uml-oj-native-layout-v1:${props.problemId}` }
function saveLayout() {
  if (layoutSaveBlocked) return
  try { localStorage.setItem(layoutKey(), JSON.stringify(positions.value)); storageOk.value = true }
  catch { storageOk.value = false }
}
function loadLayout() {
  layoutSaveBlocked = false
  storageOk.value = true
  try {
    const raw = localStorage.getItem(layoutKey())
    if (!raw) { positions.value = {}; return }
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.values(data).some((p: any) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('invalid layout')
    positions.value = data
  } catch { positions.value = {}; layoutSaveBlocked = true; storageOk.value = false }
}
type Side = 'left' | 'right'
type Connecting = { source: string; pointer: number; x1: number; y1: number; x2: number; y2: number; clientX: number; clientY: number; target: string | null }
const connecting = ref<Connecting | null>(null)
const keyboardConnection = ref<{ source: string; side: Side } | null>(null)
const connectionNotice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function showConnectionNotice(message: string, persistent = false) {
  clearTimeout(noticeTimer)
  connectionNotice.value = message
  if (message && !persistent) noticeTimer = setTimeout(() => { connectionNotice.value = '' }, 4000)
}
let dragging: { name: string; offsetX: number; offsetY: number; pointer: number } | null = null
function connectionTarget(clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY)?.closest('[data-connection-node]')
  if (!element || !svg.value?.contains(element)) return null
  const name = element.getAttribute('data-connection-node')
  return name && props.diagram.classes.some(c => c.name === name) ? name : null
}
function cancelConnection() {
  const pointer = connecting.value?.pointer
  connecting.value = null; keyboardConnection.value = null
  if (pointer !== undefined && svg.value?.hasPointerCapture(pointer)) svg.value.releasePointerCapture(pointer)
}
function startConnection(event: PointerEvent, source: string, index: number, side: Side) {
  if (props.disabled || event.button !== 0 || dragging || connecting.value || viewport.isInteracting()) return
  const p = position(source, index)
  keyboardConnection.value = null; showConnectionNotice('')
  connecting.value = { source, pointer: event.pointerId, x1: p.x + (side === 'right' ? 200 : 0), y1: p.y + height(index) / 2, x2: p.x + (side === 'right' ? 200 : 0), y2: p.y + height(index) / 2, clientX: event.clientX, clientY: event.clientY, target: null }
  svg.value?.setPointerCapture(event.pointerId)
}
function onConnectionKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && (connecting.value || keyboardConnection.value)) { event.preventDefault(); cancelConnection(); showConnectionNotice('') }
}
function moveConnection(event: PointerEvent) {
  const link = connecting.value
  if (!link || link.pointer !== event.pointerId) return
  const p = svgPoint(event)
  if (!p) return
  link.x2 = p.x; link.y2 = p.y
  const target = connectionTarget(event.clientX, event.clientY)
  link.target = target !== link.source ? target : null
}
function endConnection(event: PointerEvent) {
  const link = connecting.value
  if (!link || link.pointer !== event.pointerId) return
  const target = event.type === 'pointerup' && Math.hypot(event.clientX - link.clientX, event.clientY - link.clientY) >= 6 ? connectionTarget(event.clientX, event.clientY) : null
  connecting.value = null
  if (target && target !== link.source) createConnection(link.source, target)
  else if (event.type === 'pointerup') showConnectionNotice('未创建关系：请拖到另一个类或接口。')
}
function keyboardConnect(source: string, side: Side) {
  if (props.disabled || connecting.value || dragging) return
  const previous = keyboardConnection.value
  if (!previous) { keyboardConnection.value = { source, side }; showConnectionNotice(`已选择 ${source}，请按 Tab 选择另一个类的连接点并按 Enter，或按 Escape 取消。`, true); return }
  if (previous.source === source) { showConnectionNotice('请选择另一个类或接口的连接点。', true); return }
  keyboardConnection.value = null
  createConnection(previous.source, source)
}
function onSvgPointerDown(event: PointerEvent) {
  if (keyboardConnection.value) { keyboardConnection.value = null; showConnectionNotice('') }
  if (!dragging && !connecting.value) viewport.pointerDown(event)
}
function svgPoint(event: PointerEvent) {
  const matrix = svg.value?.getScreenCTM()
  if (!matrix) return null
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
}
function startDrag(event: PointerEvent, name: string, index: number) {
  if (props.disabled || connecting.value || viewport.isInteracting() || event.button !== 0) return
  choose('class', index)
  if (!isSelected('class', index)) return
  // Pointer interaction selects the diagram node, not the text inside it.
  event.preventDefault()
  ;(event.currentTarget as SVGElement).focus({ preventScroll: true })
  const point = svgPoint(event)
  if (!point) return
  const p = position(name, index)
  dragging = { name, offsetX: point.x - p.x, offsetY: point.y - p.y, pointer: event.pointerId }
  svg.value?.setPointerCapture(event.pointerId)
}
function moveDrag(event: PointerEvent) {
  if (!dragging || dragging.pointer !== event.pointerId) return
  const p = svgPoint(event)
  if (!p) return
  positions.value[dragging.name] = { x: Math.max(-50000, Math.min(50000, p.x - dragging.offsetX)), y: Math.max(-50000, Math.min(50000, p.y - dragging.offsetY)) }
}
function endDrag(event: PointerEvent) { if (dragging?.pointer === event.pointerId) { dragging = null; saveLayout() } }
function fitDiagram() {
  if (!props.diagram.classes.length) { viewport.fit(null); return }
  const boxes = props.diagram.classes.map((c, i) => ({ ...position(c.name, i), height: height(i) }))
  const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y))
  const right = Math.max(...boxes.map(b => b.x + 200)), bottom = Math.max(...boxes.map(b => b.y + b.height))
  viewport.fit({ x: left, y: top, width: right - left, height: bottom - top })
}
function restorePending() {
  try {
    const raw = localStorage.getItem(`uml-oj-native-pending-v1:${props.problemId}`)
    if (!raw) return
    rawPending = raw
    const data = JSON.parse(raw)
    const picked = data.selection
    if (!picked || !['class', 'relation'].includes(picked.kind) || !Number.isInteger(picked.index) || picked.index < 0 || !data.form || typeof data.form !== 'object') throw new Error('invalid pending edit')
    selection.value = picked
    for (const key of Object.keys(form) as (keyof typeof form)[]) {
      if (typeof data.form[key] !== 'string') throw new Error('invalid pending field')
      form[key] = data.form[key]
    }
    if (data.members !== undefined) {
      if (!data.members || !Array.isArray(data.members.attributes) || !Array.isArray(data.members.methods)) throw new Error('invalid member drafts')
      const validBase = (row: any) => row && typeof row.id === 'string' && typeof row.editable === 'boolean' && (row.original === null || typeof row.original === 'string') && typeof row.modified === 'boolean' && typeof row.visibility === 'string' && typeof row.name === 'string'
      if (!data.members.attributes.every((row: any) => validBase(row) && typeof row.type === 'string') || !data.members.methods.every((row: any) => validBase(row) && typeof row.returnType === 'string' && Array.isArray(row.parameters) && row.parameters.every((p: any) => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.type === 'string'))) throw new Error('invalid member drafts')
      attributes.value = data.members.attributes; methods.value = data.members.methods
    } else {
      // Recover drafts made before the structured member editor was introduced.
      attributes.value = form.attributes ? form.attributes.split('\n').map(parseAttributeRow) : []
      methods.value = form.methods ? form.methods.split('\n').map(parseMethodRow) : []
    }
    stagedMismatch.value = data.modelKey !== JSON.stringify(props.diagram) || picked.index >= (picked.kind === 'class' ? props.diagram.classes.length : props.diagram.relations.length)
    if (stagedMismatch.value) error.value = '未应用的编辑与当前答案不一致；请先备份，再撤销编辑。'
    dirty.value = true; emit('dirty', true)
  } catch {
    stagedMismatch.value = true; dirty.value = true; emit('dirty', true)
    error.value = '未应用的画布编辑无法恢复；请先备份，再撤销编辑。'
  }
}
function beforeUnload(e: BeforeUnloadEvent) { if (dirty.value) { e.preventDefault(); e.returnValue = '' } }
watch(() => props.problemId, () => { cancelConnection(); showConnectionNotice(''); closeNodePicker(); viewport.reset(); selection.value = null; dirty.value = false; emit('dirty', false); loadLayout(); icons.load(); void nextTick(restorePending) })
watch(() => props.disabled, value => { if (value) { cancelConnection(); showConnectionNotice(''); closeNodePicker() } })
watch(() => props.diagram, () => {
  if (connecting.value || keyboardConnection.value) { cancelConnection(); showConnectionNotice('') }
  if (!selection.value || dirty.value) return
  const { kind, index } = selection.value
  if (index >= (kind === 'class' ? props.diagram.classes.length : props.diagram.relations.length)) { selection.value = null; return }
  selection.value = null; choose(kind, index)
})
onMounted(() => { loadLayout(); icons.load(); void nextTick(restorePending); window.addEventListener('beforeunload', beforeUnload); window.addEventListener('keydown', onConnectionKeydown); document.addEventListener('pointerdown', onOutsidePicker); document.addEventListener('focusin', onOutsidePicker) })
onBeforeUnmount(() => { clearTimeout(noticeTimer); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('keydown', onConnectionKeydown); document.removeEventListener('pointerdown', onOutsidePicker); document.removeEventListener('focusin', onOutsidePicker) })
const selected = computed(() => selection.value)
const selectedInterface = computed(() => selection.value?.kind === 'class' && props.diagram.classes[selection.value.index]?.kind === 'interface')
defineExpose({ hasPending: () => dirty.value, getLayout: () => structuredClone(toRaw(positions.value)), getIcons: () => icons.backup(), getPending: () => dirty.value ? { selection: selection.value, form: { ...form }, raw: rawPending } : null })
</script>

<template>
  <div class="native-canvas">
    <div class="canvas-toolbar">
      <div ref="nodePicker" class="node-picker" @keydown.esc.stop.prevent="nodePickerOpen && closeNodePicker(true)">
        <button ref="nodePickerButton" :disabled="disabled" :aria-expanded="nodePickerOpen" aria-controls="node-picker-options" @click="nodePickerOpen = !nodePickerOpen" @keydown.down.prevent="focusNodeOption()" @keydown.up.prevent="focusNodeOption(true)"><Plus :size="14" /> 添加元素 <ChevronDown :size="13" /></button>
        <div v-show="nodePickerOpen" id="node-picker-options" class="node-picker-popover" role="group" aria-label="可添加的元素">
          <button class="node-picker-option" :disabled="disabled" aria-label="添加类" @click="pickNode(false)"><Box :size="16" /><span><strong>类</strong><small>描述对象的属性和方法</small></span></button>
          <button class="node-picker-option" :disabled="disabled" aria-label="添加接口" @click="pickNode(true)"><Braces :size="16" /><span><strong>接口</strong><small>定义能力和操作的约定</small></span></button>
        </div>
      </div>
      <button :disabled="disabled || diagram.classes.length < 2" title="添加普通关联、继承或实现" @click="addRelation"><Link2 :size="14" /> 添加关系</button>
      <button :disabled="iconsBlocked" :aria-label="iconsVisible ? '隐藏类图标' : '显示类图标'" :aria-pressed="iconsVisible" @click="icons.toggle"><Eye v-if="iconsVisible" :size="14" /><EyeOff v-else :size="14" />{{ iconsVisible ? '隐藏图标' : '显示图标' }}</button>
      <span>拖动类左右的连接点连线；拖动节点移动，拖动空白处平移。</span>
    </div>
    <div v-if="!storageOk" class="canvas-storage-warning" role="alert">画布布局无法读取或保存；请下载草稿备份。</div>
    <div v-if="iconWarning" class="canvas-storage-warning" role="alert">{{ iconWarning }}</div>
    <div v-if="libraryWarning" class="canvas-storage-warning" role="alert">{{ libraryWarning }}</div>
    <div v-if="error && !selected && !dirty" class="canvas-storage-warning" role="alert">{{ error }}</div>
    <div class="canvas-workspace" :class="{ connecting: !!connecting || !!keyboardConnection }">
    <div v-if="connectionNotice" class="connection-notice" role="status">{{ connectionNotice }}</div>
    <div class="canvas-scroll">
      <svg ref="svg" class="diagram-svg" :class="{ panning }" :viewBox="viewBox" tabindex="0" aria-label="类图画布" aria-description="拖动空白处平移，滚轮或加减键缩放，方向键平移，0 重置视图" @wheel.prevent="!connecting && viewport.onWheel($event)" @keydown="viewport.onKeydown" @keydown.esc.stop.prevent="cancelConnection(); showConnectionNotice('')" @pointerdown="onSvgPointerDown" @pointermove="moveDrag($event); moveConnection($event); viewport.pointerMove($event)" @pointerup="endDrag($event); endConnection($event); viewport.pointerEnd($event)" @pointercancel="endDrag($event); endConnection($event); viewport.pointerEnd($event)" @lostpointercapture="endDrag($event); endConnection($event); viewport.pointerEnd($event)">
        <defs>
          <marker id="native-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="currentColor" /></marker>
          <marker id="native-triangle" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path class="edge-triangle" d="M 1 1 L 11 6 L 1 11 Z" stroke="currentColor" /></marker>
        </defs>
        <g v-for="(r, i) in diagram.relations" :key="`r-${i}`" class="canvas-edge" :class="{ selected: isSelected('relation', i) }" role="button" tabindex="0" :aria-label="`编辑关联 ${r.source} 到 ${r.target}${r.label ? `：${r.label}` : ''}`" @click="choose('relation', i)" @keydown.enter.prevent="choose('relation', i)" @keydown.space.prevent="choose('relation', i)">
          <template v-if="edgeCurve(i)"><path class="edge-hit" fill="none" :d="edgeCurve(i)!.d"/><path class="edge-line" :d="edgeCurve(i)!.d" :stroke-dasharray="r.type === 'ClassRealization' ? '6 4' : undefined" :marker-end="r.type === 'ClassUnidirectional' ? 'url(#native-arrow)' : ['ClassInheritance', 'ClassRealization'].includes(r.type) ? 'url(#native-triangle)' : undefined"/><circle class="edge-handle" :cx="edgeCurve(i)!.mid.x" :cy="edgeCurve(i)!.mid.y" r="5"/><text :x="edgeCurve(i)!.start.x" :y="edgeCurve(i)!.start.y - 8">{{ r.sourceMultiplicity }}</text><text :x="edgeCurve(i)!.end.x" :y="edgeCurve(i)!.end.y - 8">{{ r.targetMultiplicity }}</text><text :x="edgeCurve(i)!.mid.x" :y="edgeCurve(i)!.mid.y + 16">{{ r.label }}</text></template>
          <template v-else-if="!line(i).self"><circle class="edge-handle" :cx="(line(i).x1 + line(i).x2) / 2" :cy="(line(i).y1 + line(i).y2) / 2" r="5"/><line class="edge-hit" :x1="line(i).x1" :y1="line(i).y1" :x2="line(i).x2" :y2="line(i).y2"/><line class="edge-line" :x1="line(i).x1" :y1="line(i).y1" :x2="line(i).x2" :y2="line(i).y2" :stroke-dasharray="r.type === 'ClassRealization' ? '6 4' : undefined" :marker-end="r.type === 'ClassUnidirectional' ? 'url(#native-arrow)' : ['ClassInheritance', 'ClassRealization'].includes(r.type) ? 'url(#native-triangle)' : undefined" />
            <text :x="line(i).x1 * .8 + line(i).x2 * .2" :y="line(i).y1 * .8 + line(i).y2 * .2 - 8">{{ r.sourceMultiplicity }}</text><text :x="line(i).x1 * .2 + line(i).x2 * .8" :y="line(i).y1 * .2 + line(i).y2 * .8 - 8">{{ r.targetMultiplicity }}</text><text :x="(line(i).x1 + line(i).x2) / 2" :y="(line(i).y1 + line(i).y2) / 2 + 16">{{ r.label }}</text>
          </template><template v-else><path class="edge-line" :stroke-dasharray="r.type === 'ClassRealization' ? '6 4' : undefined" :marker-end="r.type === 'ClassUnidirectional' ? 'url(#native-arrow)' : ['ClassInheritance', 'ClassRealization'].includes(r.type) ? 'url(#native-triangle)' : undefined" :d="`M ${line(i).x1} ${line(i).y1} c -60 -70 60 -70 1 0`"/><text :x="line(i).x1" :y="line(i).y1 - 52">{{ r.sourceMultiplicity }} / {{ r.targetMultiplicity }} {{ r.label }}</text></template>
        </g>
        <g v-for="(c, i) in diagram.classes" :key="c.name" class="canvas-node" :class="{ selected: isSelected('class', i), disabled, 'connection-target': connecting?.target === c.name }" :data-connection-node="c.name" :transform="`translate(${position(c.name, i).x} ${position(c.name, i).y})`" role="button" tabindex="0" :aria-pressed="isSelected('class', i)" :aria-label="`编辑${c.kind === 'interface' ? '接口' : '类'} ${c.name}`" @pointerdown="startDrag($event, c.name, i)" @click="choose('class', i)" @keydown.enter.prevent="choose('class', i)" @keydown.space.prevent="choose('class', i)">
          <rect class="node-outline" x="-5" y="-5" width="210" :height="height(i) + 10" rx="7" aria-hidden="true"/><rect class="node-body" width="200" :height="height(i)" rx="4"/><g v-if="icons.iconFor(c.name)" class="class-icon-badge" :data-icon="classIconId(c.name)" aria-hidden="true"><circle cx="16" :cy="headerHeight(i) - 16" r="12"/><IconGraphic :choice="icons.iconFor(c.name)" :x="6" :y="headerHeight(i) - 26" :size="20" /></g><line x1="0" :y1="headerHeight(i)" x2="200" :y2="headerHeight(i)"/><text v-if="c.kind === 'interface'" x="110" y="17" text-anchor="middle" class="node-stereotype">&lt;&lt;interface&gt;&gt;</text><text :x="icons.iconFor(c.name) ? 114 : 100" :y="headerHeight(i) - 10" :textLength="icons.iconFor(c.name) && c.name.length > 17 ? 166 : undefined" lengthAdjust="spacingAndGlyphs" text-anchor="middle" class="node-title">{{ c.name }}</text><text v-for="(a, n) in c.attributes" :key="`a-${n}`" x="10" :y="headerHeight(i) + 20 + n * 18">{{ a }}</text><text v-for="(m, n) in c.methods" :key="`m-${n}`" x="10" :y="headerHeight(i) + 20 + (c.attributes.length + n) * 18">{{ m }}</text>
        </g>
        <line v-if="connecting" class="connection-preview" :class="{ valid: connecting.target }" :x1="connecting.x1" :y1="connecting.y1" :x2="connecting.x2" :y2="connecting.y2" aria-hidden="true" />
        <g v-for="(c, i) in diagram.classes" :key="`ports-${c.name}`" :transform="`translate(${position(c.name, i).x} ${position(c.name, i).y})`">
          <g v-for="side in (['left', 'right'] as const)" :key="side" class="connection-port" :class="{ disabled, active: keyboardConnection?.source === c.name && keyboardConnection.side === side }" :data-connection-node="c.name" :transform="`translate(${side === 'right' ? 200 : 0} ${height(i) / 2})`" role="button" :tabindex="disabled ? -1 : 0" :aria-disabled="disabled" :aria-label="`${c.name} 的${side === 'left' ? '左' : '右'}连接点`" @pointerdown.stop.prevent="startConnection($event, c.name, i, side)" @click.stop @keydown.enter.stop.prevent="keyboardConnect(c.name, side)" @keydown.space.stop.prevent="keyboardConnect(c.name, side)">
            <circle class="connection-hit" :r="11 / viewport.view.zoom" /><circle class="connection-dot" :r="5 / viewport.view.zoom" vector-effect="non-scaling-stroke" />
          </g>
        </g>
        <text v-if="!diagram.classes.length" x="40" y="48" class="canvas-hint">点击“添加元素”，选择类或接口开始建模</text>
      </svg>
    </div>
    <div class="viewport-controls" role="group" aria-label="画布视图控制">
      <button aria-label="缩小画布" title="缩小画布" :disabled="viewport.view.zoom <= 0.1" @click="viewport.zoomBy(1 / 1.2)"><Minus :size="14" /></button>
      <output aria-label="画布缩放比例">{{ percent }}</output>
      <button aria-label="放大画布" title="放大画布" :disabled="viewport.view.zoom >= 4" @click="viewport.zoomBy(1.2)"><Plus :size="14" /></button>
      <button aria-label="适应内容" title="适应内容" @click="fitDiagram"><Maximize :size="14" /></button>
      <button aria-label="重置视图" title="重置视图" @click="viewport.reset"><RotateCcw :size="14" /></button>
    </div>
    <Transition name="inspector">
    <aside v-if="selected" class="canvas-inspector" :aria-label="selected.kind === 'class' ? (selectedInterface ? '接口属性面板' : '类属性面板') : '关联属性面板'">
      <div class="inspector-heading"><strong>属性面板</strong><span v-if="dirty">未应用</span><button :disabled="disabled" class="delete-button" @click="removeSelected"><Trash2 :size="14" /> 删除</button><button class="close-inspector" aria-label="关闭编辑面板" title="关闭编辑面板" @click="closeInspector"><X :size="14" /></button></div>
      <template v-if="selected.kind === 'class'">
        <label>{{ selectedInterface ? '接口名' : '类名' }}<input v-model="form.name" :disabled="disabled" :aria-label="selectedInterface ? '接口名' : '类名'" @input="markDirty" /></label>
        <IconPicker v-if="diagram.classes[selected.index]" :key="diagram.classes[selected.index].name" :class-name="diagram.classes[selected.index].name" :choice="classIconChoice(diagram.classes[selected.index].name)" :library="iconLibrary" :blocked="iconsBlocked" @select="icons.select(diagram.classes[selected.index].name, $event)" @remove="icons.removeLibrary($event)" />
        <section class="member-section" aria-label="属性列表">
          <div class="member-section-heading"><strong>属性 <span>{{ attributes.length }}</span></strong><button :disabled="disabled" @click="addAttribute"><Plus :size="13" /> 添加属性</button></div>
          <p v-if="!attributes.length" class="member-empty">暂无属性</p>
          <div v-for="(row, i) in attributes" :key="row.id" class="member-card">
            <div class="member-card-heading"><strong>属性 {{ i + 1 }}</strong><button :disabled="disabled" :aria-label="`删除属性 ${i + 1}`" title="删除属性" @click="removeAttribute(i)"><Trash2 :size="13" /></button></div>
            <template v-if="row.editable">
              <div class="member-main-fields"><label>可见性<select v-model="row.visibility" :disabled="disabled" :aria-label="`属性 ${i + 1} 可见性`" @change="touchMember(row)"><option value="">默认</option><option value="+">+ 公开</option><option value="-">- 私有</option><option value="#"># 受保护</option><option value="~">~ 包级</option></select></label><label>名称<input v-model="row.name" :disabled="disabled" :aria-label="`属性 ${i + 1} 名称`" placeholder="name" @input="touchMember(row)" /></label></div>
              <label>类型（可选）<input v-model="row.type" :disabled="disabled" :aria-label="`属性 ${i + 1} 类型`" placeholder="String" @input="touchMember(row)" /></label>
            </template>
            <template v-else><p class="member-raw-note">此声明暂不能结构化编辑，原文会保留。</p><code class="member-raw">{{ row.original }}</code></template>
          </div>
        </section>
        <section class="member-section" aria-label="方法列表">
          <div class="member-section-heading"><strong>方法 <span>{{ methods.length }}</span></strong><button :disabled="disabled" @click="addMethod"><Plus :size="13" /> 添加方法</button></div>
          <p v-if="!methods.length" class="member-empty">暂无方法</p>
          <div v-for="(row, i) in methods" :key="row.id" class="member-card">
            <div class="member-card-heading"><strong>方法 {{ i + 1 }}</strong><button :disabled="disabled" :aria-label="`删除方法 ${i + 1}`" title="删除方法" @click="removeMethod(i)"><Trash2 :size="13" /></button></div>
            <template v-if="row.editable">
              <div class="member-main-fields"><label>可见性<select v-model="row.visibility" :disabled="disabled" :aria-label="`方法 ${i + 1} 可见性`" @change="touchMember(row)"><option value="">默认</option><option value="+">+ 公开</option><option value="-">- 私有</option><option value="#"># 受保护</option><option value="~">~ 包级</option></select></label><label>名称<input v-model="row.name" :disabled="disabled" :aria-label="`方法 ${i + 1} 名称`" placeholder="study" @input="touchMember(row)" /></label></div>
              <label>返回类型（可选）<input v-model="row.returnType" :disabled="disabled" :aria-label="`方法 ${i + 1} 返回类型`" placeholder="void" @input="touchMember(row)" /></label>
              <div class="parameter-heading"><span>参数</span><button :disabled="disabled" :aria-label="`为方法 ${i + 1} 添加参数`" @click="addParameter(row)"><Plus :size="13" /> 添加参数</button></div>
              <p v-if="!row.parameters.length" class="member-empty">无参数</p>
              <div v-for="(param, n) in row.parameters" :key="param.id" class="parameter-row"><label>名称<input v-model="param.name" :disabled="disabled" :aria-label="`方法 ${i + 1} 参数 ${n + 1} 名称`" placeholder="id" @input="touchMember(row)" /></label><label>类型<input v-model="param.type" :disabled="disabled" :aria-label="`方法 ${i + 1} 参数 ${n + 1} 类型`" placeholder="String" @input="touchMember(row)" /></label><button :disabled="disabled" :aria-label="`删除方法 ${i + 1} 参数 ${n + 1}`" title="删除参数" @click="removeParameter(row, n)"><Trash2 :size="13" /></button></div>
            </template>
            <template v-else><p class="member-raw-note">此声明暂不能结构化编辑，原文会保留。</p><code class="member-raw">{{ row.original }}</code></template>
          </div>
        </section>
      </template>
      <template v-else>
        <div class="relation-fields"><label>起点类<select v-model="form.source" :disabled="disabled" aria-label="起点类" @change="markDirty"><option v-for="c in diagram.classes" :key="c.name">{{ c.name }}</option></select></label><label>起点多重性<input v-model="form.sourceMultiplicity" :disabled="disabled" aria-label="起点多重性" placeholder="如 1" @input="markDirty" /></label></div>
        <div class="relation-swap"><button :disabled="disabled || stagedMismatch" title="交换两端，多重性随类移动；有向关系方向反转" @click="swapRelationEnds"><ArrowDownUp :size="14" aria-hidden="true" />交换起点和终点</button></div>
        <div class="relation-fields"><label>终点类<select v-model="form.target" :disabled="disabled" aria-label="终点类" @change="markDirty"><option v-for="c in diagram.classes" :key="c.name">{{ c.name }}</option></select></label><label>终点多重性<input v-model="form.targetMultiplicity" :disabled="disabled" aria-label="终点多重性" placeholder="如 0..*" @input="markDirty" /></label></div>
        <p class="swap-hint">多重性随类移动；有向关系的方向会反转。</p>
        <div class="relation-fields"><label>关系名称<input v-model="form.label" :disabled="disabled" aria-label="关系名称" @input="markDirty" /></label><label>方向<select v-model="form.type" :disabled="disabled" aria-label="关联方向" @change="markDirty"><option value="ClassBidirectional">普通关联（无方向）</option><option value="ClassUnidirectional">普通关联（起点 → 终点）</option><option value="ClassInheritance">继承（起点 → 父类）</option><option value="ClassRealization">实现（起点 → 接口）</option></select></label></div>
      </template>
      <p v-if="error" role="alert" class="inspector-error">{{ error }}</p>
      <div class="inspector-actions"><button :disabled="disabled || !dirty || stagedMismatch" @click="apply"><Check :size="14"/> 应用更改</button><button :disabled="!dirty" @click="cancel"><X :size="14"/> 撤销编辑</button></div>
    </aside>
    <aside v-else-if="dirty" class="canvas-inspector" aria-label="画布编辑恢复"><p role="alert">{{ error }}</p><button @click="cancel">撤销无法恢复的编辑</button></aside>
    </Transition>
    </div>
  </div>
</template>
