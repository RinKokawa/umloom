import { defineComponent, h, type PropType } from 'vue'
import type { SafeSvgNode } from './iconify-search'

export default defineComponent({
  props: { nodes: { type: Array as PropType<SafeSvgNode[]>, required: true } },
  setup: props => {
    const render = (node: SafeSvgNode): ReturnType<typeof h> => h(node.tag, node.attrs, node.children.map(render))
    return () => h('g', props.nodes.map(render))
  },
})
