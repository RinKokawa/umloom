<script setup lang="ts">
import { computed } from 'vue'
import { localIcon, type IconChoice } from './icon-library'
import { safeSvg } from './iconify-search'
import SafeSvgNodes from './SafeSvgNodes'

const props = withDefaults(defineProps<{ choice: IconChoice | null; x?: number; y?: number; size?: number }>(), { x: 0, y: 0, size: 18 })
const spec = computed(() => {
  if (!props.choice || props.choice.kind === 'none') return null
  if (props.choice.kind === 'lucide') {
    const icon = localIcon(props.choice)
    return icon && 'component' in icon ? { component: icon.component } : null
  }
  const icon = props.choice.kind === 'umloom' ? localIcon(props.choice) : props.choice
  if (!icon || !('body' in icon)) return null
  try { return { nodes: safeSvg(icon.body), width: icon.width, height: icon.height } } catch { return null }
})
</script>

<template>
  <component :is="spec.component" v-if="spec && 'component' in spec" :x="x" :y="y" :size="size" aria-hidden="true" class="class-icon-svg" />
  <svg v-else-if="spec && 'nodes' in spec" :x="x" :y="y" :width="size" :height="size" :viewBox="`0 0 ${spec.width} ${spec.height}`" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="class-icon-svg"><SafeSvgNodes :nodes="spec.nodes" /></svg>
</template>
