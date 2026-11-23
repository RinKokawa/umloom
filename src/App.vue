<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Download, Moon, RotateCcw, Sun } from '@lucide/vue'
import NativeCanvas from './NativeCanvas.vue'
import { parsePlantUml, toPlantUml } from './uml/adapters/plantuml'
import { parseMermaid, toMermaid } from './uml/adapters/mermaid'
import { assertOjDiagram } from './uml/model'
import type { Diagram } from './uml/model'

type Format = 'plantuml' | 'mermaid'
const formatNames: Record<Format, string> = { plantuml: 'PlantUML', mermaid: 'Mermaid' }
const isFormat = (value: unknown): value is Format => typeof value === 'string' && Object.hasOwn(formatNames, value)
const initial = `@startuml
class Classroom
class Student
Classroom "1" -- "0..*" Student
@enduml`
const storageKey = 'uml-oj-canvas-document-v1'
const model = ref<Diagram>(parsePlantUml(initial))
const source = ref(initial)
const format = ref<Format>('plantuml')
const state = ref<'synced' | 'pending' | 'invalid' | 'conflict'>('synced')
const message = ref('画布和源码已同步')
const formatError = ref('')
const storageOK = ref(true)
const canvasDirty = ref(false)
const canvas = ref<InstanceType<typeof NativeCanvas> | null>(null)
const theme = ref<'dark' | 'light'>('dark')
const mobileView = ref<'canvas' | 'source'>('canvas')
let syncedKey = JSON.stringify(model.value)
let timer: ReturnType<typeof setTimeout> | undefined
let updating = false
let saveBlocked = false
const parsers: Record<Format, (text: string) => Diagram> = { plantuml: parsePlantUml, mermaid: parseMermaid }
const serializers: Record<Format, (diagram: Diagram) => string> = { plantuml: toPlantUml, mermaid: toMermaid }
const parser = (text: string, selected = format.value) => parsers[selected](text)
const serializer = (diagram: Diagram, selected = format.value) => serializers[selected](diagram)
const readOnlySource = computed(() => canvasDirty.value || state.value === 'conflict')
watch(canvasDirty, dirty => { if (!dirty) formatError.value = '' })

function save() {
  if (saveBlocked) return
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, model: model.value, source: source.value, format: format.value, syncedKey }))
    storageOK.value = true
  } catch { storageOK.value = false }
}
function syncSource(force = false) {
  clearTimeout(timer)
  try {
    const next = parser(source.value)
    const sourceKey = JSON.stringify(next)
    const modelKey = JSON.stringify(model.value)
    if (!force && sourceKey !== modelKey && modelKey !== syncedKey) {
      state.value = 'conflict'; message.value = '源码和画布都有不同修改；请先备份，再选择保留的内容。'; return false
    }
    model.value = next; syncedKey = sourceKey
    state.value = 'synced'; message.value = '画布和源码已同步'
    save(); return true
  } catch (e) {
    state.value = 'invalid'; message.value = `源码尚未同步：${e instanceof Error ? e.message : String(e)} 画布保留上次有效内容。`
    save(); return false
  }
}
function onCanvasApply(next: Diagram): boolean | string {
  if (state.value !== 'synced') return false
  try {
    assertOjDiagram(next)
    if (JSON.stringify(parser(source.value)) !== JSON.stringify(model.value)) throw new Error('源码和画布不一致。')
    const generated = serializer(next)
    if (JSON.stringify(parser(generated)) !== JSON.stringify(next)) throw new Error('当前内容无法无损转换为源码。')
    updating = true
    try { model.value = next; source.value = generated } finally { updating = false }
    syncedKey = JSON.stringify(next); state.value = 'synced'; message.value = '画布和源码已同步'
    save(); return true
  } catch (e) { message.value = `画布更改未应用：${e instanceof Error ? e.message : String(e)}`; return message.value }
}
watch(source, () => {
  if (updating) return
  formatError.value = ''
  clearTimeout(timer)
  state.value = 'pending'; message.value = '正在检查源码…'
  // Persist the unfinished text immediately alongside the last valid model.
  save()
  timer = setTimeout(syncSource, 300)
}, { flush: 'sync' })
function changeFormat(event: Event) {
  const select = event.target as HTMLSelectElement
  const target = select.value
  if (!isFormat(target)) { select.value = format.value; return }
  if (target === format.value) return
  formatError.value = ''
  const reject = (reason: string) => {
    select.value = format.value
    formatError.value = `无法切换到 ${formatNames[target]}：${reason}`
  }
  if (canvasDirty.value) { reject('请先应用或撤销画布面板中的编辑。'); return }
  if (state.value === 'pending') syncSource()
  if (state.value !== 'synced') { reject(`请先解决当前同步问题。${message.value}`); return }
  try {
    const next = serializer(model.value, target)
    if (JSON.stringify(parser(next, target)) !== JSON.stringify(model.value)) throw new Error('目标格式无法无损表示当前内容。')
    updating = true
    try { format.value = target; source.value = next } finally { updating = false }
    message.value = '画布和源码已同步'
    save()
  } catch (e) { reject(e instanceof Error ? e.message : String(e)) }
}
function switchTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
  try { localStorage.setItem('uml-oj-canvas-theme', theme.value) } catch { /* optional preference */ }
}
function downloadBackup() {
  const backup = { version: 1, source: source.value, format: format.value, model: model.value, syncedKey, layout: canvas.value?.getLayout(), icons: canvas.value?.getIcons(), pendingCanvasEdit: canvas.value?.getPending() }
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = 'uml-oj-canvas-backup.json'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function reset() {
  if (canvasDirty.value) { message.value = '请先应用或撤销画布面板中的编辑。'; return }
  if (!window.confirm('将当前答案重置为示例，原内容会先备份到本机。是否继续？')) return
  try { localStorage.setItem(`uml-oj-canvas-reset-backup:${Date.now()}`, JSON.stringify({ source: source.value, format: format.value, model: model.value, layout: canvas.value?.getLayout(), icons: canvas.value?.getIcons() })) }
  catch { storageOK.value = false; message.value = '无法备份当前内容，未重置。'; return }
  updating = true
  try { format.value = 'plantuml'; source.value = initial; model.value = parsePlantUml(initial) } finally { updating = false }
  syncedKey = JSON.stringify(model.value); state.value = 'synced'; message.value = '已恢复示例'; formatError.value = ''; save()
}
function resolveConflict(keep: 'source' | 'canvas') {
  if (!window.confirm('将先备份当前源码和画布，再应用所选内容。是否继续？')) return
  try { localStorage.setItem(`uml-oj-canvas-conflict-backup:${Date.now()}`, JSON.stringify({ source: source.value, format: format.value, model: model.value, syncedKey })) }
  catch { storageOK.value = false; message.value = '备份失败，未覆盖任何内容。'; return }
  if (keep === 'source') syncSource(true)
  else {
    try {
      const generated = serializer(model.value)
      if (JSON.stringify(parser(generated)) !== JSON.stringify(model.value)) throw new Error('无法无损转换。')
      updating = true; try { source.value = generated } finally { updating = false }
      syncedKey = JSON.stringify(model.value); state.value = 'synced'; message.value = '画布和源码已同步'; save()
    } catch (e) { message.value = `画布无法转换：${e instanceof Error ? e.message : String(e)}` }
  }
}
onMounted(() => {
  try {
    theme.value = localStorage.getItem('uml-oj-canvas-theme') === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme.value
    const text = localStorage.getItem(storageKey)
    if (!text) return
    const data = JSON.parse(text)
    if (data.format === 'nomnoml') return
    if (data.version !== 1 || typeof data.source !== 'string' || !isFormat(data.format) || !data.model || !Array.isArray(data.model.classes) || !Array.isArray(data.model.relations) || typeof data.syncedKey !== 'string') throw new Error('invalid draft')
    assertOjDiagram(data.model)
    updating = true
    try { model.value = data.model; source.value = data.source; format.value = data.format; syncedKey = data.syncedKey } finally { updating = false }
    const modelKey = JSON.stringify(model.value)
    let sourceKey: string | null = null
    try { sourceKey = JSON.stringify(parser(source.value)) } catch { /* unfinished source */ }
    if (sourceKey === modelKey) { syncedKey = modelKey; return }
    if (modelKey === syncedKey) syncSource()
    else { state.value = 'conflict'; message.value = '源码和画布不一致；请先备份，再选择保留的内容。' }
  } catch { saveBlocked = true; storageOK.value = false; message.value = '本机草稿无法读取，原数据不会被覆盖。' }
})
onBeforeUnmount(() => { clearTimeout(timer); save() })
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">U</span><div><strong>UML OJ Canvas</strong><small>独立类图画布原型</small></div></div>
      <div class="top-actions"><button @click="reset"><RotateCcw /> 重置示例</button><button @click="downloadBackup"><Download /> 备份草稿</button><button :aria-label="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" @click="switchTheme"><Sun v-if="theme === 'dark'"/><Moon v-else/> {{ theme === 'dark' ? '亮色' : '暗色' }}</button></div>
    </header>
    <div v-if="!storageOK" class="banner" role="alert">本机草稿不可用或无法恢复；刷新前请下载备份，原存储不会被主动覆盖。</div>
    <main class="workbench">
      <div class="mobile-tabs"><button :class="{active: mobileView === 'canvas'}" @click="mobileView = 'canvas'">画布</button><button :class="{active: mobileView === 'source'}" :disabled="canvasDirty" @click="mobileView = 'source'">源码</button></div>
      <section class="pane canvas-pane" :class="{'mobile-hidden': mobileView !== 'canvas'}">
        <div class="pane-header"><span>类图画布</span><small>单击编辑，拖动调整位置</small></div>
        <NativeCanvas ref="canvas" :diagram="model" problem-id="playground" :disabled="state !== 'synced'" :on-apply="onCanvasApply" @dirty="canvasDirty = $event" />
      </section>
      <section class="pane code-pane" :class="{'mobile-hidden': mobileView !== 'source'}">
        <div class="pane-header"><span>源码</span><label>格式 <select :value="format" aria-label="源码格式" :aria-describedby="formatError ? 'format-error' : undefined" @change="changeFormat"><option value="plantuml">PlantUML</option><option value="mermaid">Mermaid</option></select></label></div>
        <p v-if="formatError" id="format-error" class="format-error" role="alert">{{ formatError }} 切换未完成，原源码已保留。</p>
        <textarea v-model="source" :readonly="readOnlySource" :aria-label="`${formatNames[format]} source`" spellcheck="false"></textarea>
        <p class="hint">支持普通类、接口、属性、方法、普通关联、继承、实现及两端多重性。未完成或不支持的源码会保留，不会覆盖画布。</p>
      </section>
    </main>
    <footer><span :class="{ warning: state !== 'synced' || canvasDirty }">{{ canvasDirty ? '画布面板有未应用的编辑，请先应用或撤销。' : message }}</span><span>数据保存在当前浏览器</span></footer>
    <div v-if="state === 'conflict'" class="banner" role="alert">{{ message }} <button @click="resolveConflict('source')">使用源码</button> <button @click="resolveConflict('canvas')">使用画布</button></div>
  </div>
</template>
