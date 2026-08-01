import { mount } from 'svelte'
import '@fontsource/limelight/400.css'
import '@fontsource/bodoni-moda/500.css'
import '@fontsource/bodoni-moda/700.css'
import '@fontsource/jost/400.css'
import '@fontsource/jost/500.css'
import '@fontsource/jost/600.css'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
