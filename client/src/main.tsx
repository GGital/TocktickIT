import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './styles/zen-theme.css'
import AppRoutes from './AppRoutes.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <a className="visually-hidden-focusable" href="#main">
        Skip to main content
      </a>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
)
