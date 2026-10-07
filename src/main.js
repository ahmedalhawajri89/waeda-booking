import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { vReveal } from './directives/reveal'

// Self-hosted: four weights, no render-blocking round trip to Google, and
// the same family draws Arabic and Latin — times and amounts sit on one
// baseline instead of borrowing a fallback for the digits.
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css'
import '@fontsource/ibm-plex-sans-arabic/latin-400.css'
import '@fontsource/ibm-plex-sans-arabic/latin-500.css'
import '@fontsource/ibm-plex-sans-arabic/latin-600.css'
import '@fontsource/ibm-plex-sans-arabic/latin-700.css'
// Headings: Alexandria, drawn for Arabic first. Only the weights used.
import '@fontsource/alexandria/arabic-600.css'
import '@fontsource/alexandria/arabic-700.css'
import '@fontsource/alexandria/latin-600.css'
import '@fontsource/alexandria/latin-700.css'

import './assets/main.css'
import { initRepository } from './data/repository'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.directive('reveal', vReveal)

// Resolve the backend before the first screen renders, so no store can start
// reading from localStorage and then find itself talking to the API.
//
// .then rather than top-level await: that would raise the build target above
// the browsers this is compiled for, to save one line here.
void initRepository().finally(() => app.mount('#app'))
