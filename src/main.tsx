import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ensureAnonymousSession } from './lib/gameService'
import './lib/supabase'
import './styles.css'

ensureAnonymousSession().catch((error) => {
  console.warn('Anonymous Supabase session unavailable; demo mode remains available.', error)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
