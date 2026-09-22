import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import router from './router/router.jsx'
import { initTheme } from './utils/theme'
import { registerServiceWorker } from './services/pwa'
import './styles/design-system.css'
import './styles/data-table.css'
import './styles/dashboard-layout.css'
import './styles/polish.css'


initTheme()
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)