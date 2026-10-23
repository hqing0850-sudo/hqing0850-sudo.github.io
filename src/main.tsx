import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { WardrobeProvider } from './store/wardrobe'
import './styles.css'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(
      new CustomEvent('wardrobe:sw-update', {
        detail: () => updateSW(true)
      })
    )
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <WardrobeProvider>
        <App />
      </WardrobeProvider>
    </BrowserRouter>
  </StrictMode>
)
