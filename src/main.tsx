import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './lib/devBridge'
import './styles/global.css'
import App from './App'

// In preview mode, show branch name in tab title for multi-branch identification
const previewBranch = import.meta.env.VITE_PREVIEW_BRANCH
if (previewBranch) document.title = `myVTT [${previewBranch}]`

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </StrictMode>,
)
