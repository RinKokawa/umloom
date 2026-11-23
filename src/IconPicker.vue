<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import IconGraphic from './IconGraphic.vue'
import { lucideIcons, umloomIcons, type IconChoice } from './icon-library'
import { searchIconify, type OnlineIcon } from './iconify-search'

const props = defineProps<{ className: string; choice: IconChoice | null; library: OnlineIcon[]; blocked: boolean }>()
const emit = defineEmits<{ select: [choice: IconChoice | null]; remove: [id: string] }>()
const selected = computed(() => props.choice ? props.choice.kind === 'none' ? 'none' : `${props.choice.kind}:${props.choice.id}` : 'auto')
const savedOnline = computed(() => {
  const choice = props.choice
  return choice?.kind === 'iconify' && props.library.some(icon => icon.id === choice.id)
})
const tablerLicenseUrl = `${import.meta.env.BASE_URL}licenses/TABLER.txt`
const query = ref(props.className)
const results = ref<OnlineIcon[]>([])
const error = ref('')
const searched = ref(false)
const loading = ref(false)
let controller: AbortController | null = null
function reset() { controller?.abort(); controller = null; loading.value = false; results.value = []; error.value = ''; searched.value = false; query.value = props.className }
watch(() => props.className, reset)
onBeforeUnmount(() => controller?.abort())
function change(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'auto') emit('select', null)
  else if (value === 'none') emit('select', { kind: 'none' })
  else if (value.startsWith('lucide:')) emit('select', { kind: 'lucide', id: value.slice(7) })
  else if (value.startsWith('umloom:')) emit('select', { kind: 'umloom', id: value.slice(7) })
  else if (value.startsWith('iconify:')) {
    const icon = props.library.find(item => item.id === value.slice(8)) ?? (props.choice?.kind === 'iconify' && props.choice.id === value.slice(8) ? props.choice : null)
    if (icon) emit('select', icon)
  }
}
async function search() {
  if (props.blocked || loading.value) return
  const current = new AbortController()
  controller = current; loading.value = true; error.value = ''; results.value = []; searched.value = false
  const timeout = setTimeout(() => {
    if (controller === current) { current.abort(); controller = null; loading.value = false; error.value = '连接超时，请检查网络后重试。' }
  }, 12_000)
  try {
    const icons = await searchIconify(query.value, current.signal)
    if (controller === current) { results.value = icons; searched.value = true }
  } catch (e) {
    if (!current.signal.aborted && controller === current) error.value = e instanceof Error ? e.message : '无法搜索图标'
  } finally { clearTimeout(timeout); if (controller === current) { loading.value = false; controller = null } }
}
</script>

<template>
  <section class="icon-picker" aria-label="类图标设置">
    <label>类图标
      <select :value="selected" :disabled="blocked" aria-label="类图标" @change="change">
        <option value="auto">自动匹配（Lucide → UMLoom → 通用）</option>
        <option value="none">此类不显示图标</option>
        <optgroup label="Lucide">
          <option v-for="icon in lucideIcons" :key="icon.id" :value="`lucide:${icon.id}`">{{ icon.label }}</option>
        </optgroup>
        <optgroup label="UMLoom">
          <option v-for="icon in umloomIcons" :key="icon.id" :value="`umloom:${icon.id}`">{{ icon.label }}</option>
        </optgroup>
        <optgroup v-if="library.length" label="本地图标库 · Tabler">
          <option v-for="icon in library" :key="icon.id" :value="`iconify:${icon.id}`">{{ icon.id }}</option>
        </optgroup>
        <option v-if="choice?.kind === 'iconify' && !savedOnline" :value="`iconify:${choice.id}`">Tabler：{{ choice.id }}（仅此类）</option>
      </select>
    </label>
    <button v-if="choice?.kind === 'iconify' && savedOnline" type="button" :disabled="blocked" @click="emit('remove', choice.id)">从本地图标库移除</button>
    <p>图标仅影响显示，选择后立即保存，不改变源码或评测。从本地图标库移除不会影响已使用的类。</p>
    <details>
      <summary>搜索开源图标（需联网）</summary>
      <p>点击搜索后，下面的关键词将发送到 Iconify；默认不联网。仅搜索 MIT 许可的 Tabler 图标。</p>
      <form class="icon-search-form" @submit.prevent="search">
        <input v-model="query" :disabled="blocked || loading" aria-label="图标搜索关键词" maxlength="64" placeholder="英文关键词" />
        <button :disabled="blocked || loading" type="submit">{{ loading ? '搜索中…' : '搜索图标' }}</button>
      </form>
      <p v-if="error" role="alert">搜索失败：{{ error }}</p>
      <p v-else-if="searched && !results.length">没有找到可安全显示的图标，请尝试其他英文关键词。</p>
      <div v-if="results.length" class="icon-search-results" aria-label="搜索结果">
        <button v-for="icon in results" :key="icon.id" type="button" :disabled="blocked" :aria-label="`选择图标 ${icon.id}`" :title="icon.id" @click="emit('select', icon)"><IconGraphic :choice="icon" :size="20" /><span>{{ icon.id }}</span></button>
      </div>
      <p v-if="choice?.kind === 'iconify' || results.length || library.length">Tabler Icons · <a :href="tablerLicenseUrl" target="_blank" rel="noopener noreferrer">MIT 许可证</a> · 由 Iconify 提供搜索服务</p>
    </details>
  </section>
</template>
