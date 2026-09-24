import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './styles/draft-room.css'
import './styles/broadcast-stage.css'
import './styles/gameplay-control.css'
import './styles/gameplay-stage.css'
import './styles/bracket-stage.css'
import './styles/bracket-scene.css'
import './styles/tournament-manager.css'
import './styles/team-reveal.css'
import './styles/cme-overrides.css'
import './styles/draft-lock-modal.css'
import './styles/gameplay-preview.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
