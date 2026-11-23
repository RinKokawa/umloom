import { computed, ref, toRaw, type Ref } from 'vue'
import { autoIcon, localIcon, type IconChoice } from './icon-library'
import { TABLER_LICENSE, validOnlineIcon, type OnlineIcon } from './iconify-search'

type Settings = { visible: boolean; choices: Record<string, IconChoice> }
const empty = (): Settings => ({ visible: true, choices: Object.create(null) })
function validChoice(value: any): value is IconChoice {
  if (!value || typeof value !== 'object') return false
  if (value.kind === 'none') return true
  if (value.kind === 'iconify') return validOnlineIcon(value)
  return (value.kind === 'lucide' || value.kind === 'umloom') && typeof value.id === 'string' && !!localIcon(value)
}

export function useClassIcons(problemId: Ref<string>) {
  const settings = ref<Settings>(empty())
  const warning = ref('')
  const blocked = ref(false)
  const library = ref<OnlineIcon[]>([])
  const libraryWarning = ref('')
  let libraryBlocked = false
  let rawLibrary: string | null = null
  let raw: string | null = null
  const key = () => `umloom-class-icons-v1:${problemId.value}`
  const libraryKey = 'umloom-icon-library-v1'
  function loadLibrary() {
    library.value = []; libraryWarning.value = ''; libraryBlocked = false; rawLibrary = null
    try {
      rawLibrary = localStorage.getItem(libraryKey)
      if (!rawLibrary) return
      if (rawLibrary.length > 2_000_000) throw new Error('too large')
      const data = JSON.parse(rawLibrary)
      if (data?.version !== 1 || !Array.isArray(data.icons) || data.icons.length > 100 || !data.icons.every(validOnlineIcon) || new Set(data.icons.map((icon: OnlineIcon) => icon.id)).size !== data.icons.length) throw new Error('invalid icon library')
      library.value = data.icons
    } catch { libraryBlocked = true; libraryWarning.value = '本地图标库无法读取，原数据不会被覆盖；请先备份。' }
  }
  function saveLibrary() {
    if (libraryBlocked) return
    try { const value = JSON.stringify({ version: 1, icons: library.value }); localStorage.setItem(libraryKey, value); rawLibrary = value; libraryWarning.value = '' }
    catch { libraryWarning.value = '本地图标库无法保存；切换题目或刷新前请下载备份。' }
  }
  function addLibrary(icon: OnlineIcon) {
    if (libraryBlocked || library.value.some(item => item.id === icon.id)) return
    if (library.value.length >= 100) { libraryWarning.value = '本地图标库已满；此图标仅保存在当前类中。'; return }
    library.value.push(icon); saveLibrary()
  }
  function removeLibrary(id: string) {
    if (libraryBlocked) return
    library.value = library.value.filter(icon => icon.id !== id); saveLibrary()
  }
  function load() {
    loadLibrary()
    settings.value = empty(); warning.value = ''; blocked.value = false; raw = null
    try {
      raw = localStorage.getItem(key())
      if (!raw) return
      if (raw.length > 2_000_000) throw new Error('too large')
      const data = JSON.parse(raw)
      if (data?.version !== 1 || typeof data.visible !== 'boolean' || !data.choices || typeof data.choices !== 'object' || Array.isArray(data.choices) || Object.keys(data.choices).length > 1000) throw new Error('invalid icons')
      const choices: Record<string, IconChoice> = Object.create(null)
      for (const [name, choice] of Object.entries(data.choices)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || !validChoice(choice)) throw new Error('invalid icon choice')
        choices[name] = choice
      }
      settings.value = { visible: data.visible, choices }
    } catch { blocked.value = true; warning.value = '本地图标设置无法读取，原数据不会被覆盖；请先备份。' }
  }
  function save() {
    if (blocked.value) return
    try {
      const value = JSON.stringify({ version: 1, ...settings.value })
      localStorage.setItem(key(), value); raw = value; warning.value = ''
    } catch { warning.value = '图标设置无法保存；请下载备份，切换题目或刷新可能丢失。' }
  }
  function select(name: string, choice: IconChoice | null) {
    if (blocked.value || (choice && !validChoice(choice))) return
    if (choice?.kind === 'iconify') addLibrary(choice)
    if (choice) settings.value.choices[name] = choice
    else delete settings.value.choices[name]
    save()
  }
  function toggle() { if (!blocked.value) { settings.value.visible = !settings.value.visible; save() } }
  function rename(oldName: string, newName: string) {
    if (blocked.value || oldName === newName || !Object.hasOwn(settings.value.choices, oldName) || Object.hasOwn(settings.value.choices, newName)) return
    settings.value.choices[newName] = settings.value.choices[oldName]
    delete settings.value.choices[oldName]
    save()
  }
  function iconFor(name: string): IconChoice | null {
    if (!settings.value.visible) return null
    const cached = library.value.find(icon => icon.id.replace(/-/g, '').toLowerCase() === name.replace(/_/g, '').toLowerCase())
    const choice = name in settings.value.choices ? settings.value.choices[name] : autoIcon(name) ?? cached ?? { kind: 'lucide' as const, id: 'box' }
    return choice.kind === 'none' ? null : choice
  }
  function backup() {
    return { version: 1, ...structuredClone(toRaw(settings.value)), ...(blocked.value ? { unreadableOriginal: raw } : {}),
      library: { version: 1, icons: structuredClone(toRaw(library.value)), source: 'Tabler Icons via Iconify', license: 'MIT', licenseUrl: 'https://github.com/tabler/tabler-icons/blob/master/LICENSE', licenseText: TABLER_LICENSE, ...(libraryBlocked ? { unreadableOriginal: rawLibrary } : {}) } }
  }
  return { settings, warning, blocked, library, libraryWarning, visible: computed(() => settings.value.visible), load, select, toggle, rename, removeLibrary, iconFor, backup }
}
