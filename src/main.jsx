import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/spatial-studio.css'
import '@/impact/impact.css'
import '@/light-system.css'
import '@/product-polish.css'
import '@/product-refinement.css'

document.documentElement.classList.remove('dark');
document.documentElement.dataset.theme = 'light';

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

