import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import Vue3Toastify, { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'
import 'dockview-vue/dist/styles/dockview.css'
import App from './App.vue'
import router from './router'
import '@/styles/index.scss'
import '@/styles/floating-popper.scss'
import '@/styles/element-override.scss'
import '@/styles/reset.scss'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPersistedstate)

app.use(pinia)
app.use(router)
app.use(ElementPlus)
app.use(Vue3Toastify, {
  theme: 'light',
  position: toast.POSITION.TOP_RIGHT,
  autoClose: 3000
})
app.mount('#app')
