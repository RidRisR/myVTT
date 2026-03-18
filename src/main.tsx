import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './lib/devBridge'
import './styles/global.css'
import App from './App'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </StrictMode>,
)
