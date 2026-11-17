import { createApp } from 'vue'
import { setLucideProps } from '@lucide/vue'
import App from './App.vue'
import './style.css'
import './native-canvas.css'

setLucideProps({ size: 16, strokeWidth: 2, class: 'app-icon' })
createApp(App).mount('#app')
