import { Navigate, Route, Routes } from 'react-router-dom'
import BracketControlPage from './pages/BracketControlPage'
import BracketOverlayPage from './pages/BracketOverlayPage'
import CamJoinPage from './pages/CamJoinPage'
import CamOverlayPage from './pages/CamOverlayPage'
import CamsControlPage from './pages/CamsControlPage'
import CamsGridOverlayPage from './pages/CamsGridOverlayPage'
import ControlPage from './pages/ControlPage'
import GameplayControlPage from './pages/GameplayControlPage'
import GameplayOverlayPage from './pages/GameplayOverlayPage'
import LineupControlPage from './pages/LineupControlPage'
import LineupOverlayPage from './pages/LineupOverlayPage'
import LiveDeskPage from './pages/LiveDeskPage'
import OverlayPage from './pages/OverlayPage'
import ScenesControlPage from './pages/ScenesControlPage'
import StandbyOverlayPage from './pages/StandbyOverlayPage'
import StingerOverlayPage from './pages/StingerOverlayPage'
import TournamentControlPage from './pages/TournamentControlPage'
import MatchPreviewOverlayPage from './pages/MatchPreviewOverlayPage'
import MatchOverlayPage from './pages/MatchOverlayPage'
import VictoryOverlayPage from './pages/VictoryOverlayPage'
import CasterOverlayPage from './pages/CasterOverlayPage'
import CasterControlPage from './pages/CasterControlPage'
import GameplayPreviewPage from './pages/GameplayPreviewPage'

function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0b1220',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Page not found</h1>
      <ul style={{ lineHeight: 1.9 }}>
        <li>
          <a href="/control/tournament" style={{ color: '#e8bf72' }}>
            /control/tournament
          </a>{' '}
          — tournament hub
        </li>
        <li>
          <a href="/control/live" style={{ color: '#5eead4' }}>
            /control/live
          </a>{' '}
          — live desk
        </li>
        <li>
          <a href="/watch/gameplay" style={{ color: '#e8bf72' }}>
            /watch/gameplay
          </a>{' '}
          — shoutcaster gameplay preview
        </li>
      </ul>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/control/tournament" replace />} />
      <Route path="/overlay" element={<OverlayPage />} />
      <Route path="/overlay/game" element={<GameplayOverlayPage />} />
      <Route path="/overlay/stinger" element={<StingerOverlayPage />} />
      <Route path="/overlay/standby" element={<StandbyOverlayPage />} />
      <Route path="/overlay/bracket" element={<BracketOverlayPage />} />
      <Route path="/overlay/lineup" element={<LineupOverlayPage />} />
      <Route path="/overlay/match-preview" element={<MatchPreviewOverlayPage />} />
      <Route path="/overlay/match" element={<MatchOverlayPage />} />
      <Route path="/overlay/victory" element={<VictoryOverlayPage />} />
      <Route path="/overlay/caster" element={<CasterOverlayPage />} />
      <Route path="/overlay/cams" element={<CamsGridOverlayPage />} />
      <Route path="/overlay/cam/:side" element={<CamOverlayPage />} />
      <Route
        path="/overlay/cam/:side/:index"
        element={<Navigate to="/cam" replace />}
      />
      <Route path="/control" element={<ControlPage />} />
      <Route path="/control/tournament" element={<TournamentControlPage />} />
      <Route path="/control/live" element={<LiveDeskPage />} />
      <Route path="/control/scenes" element={<ScenesControlPage />} />
      <Route path="/control/game" element={<GameplayControlPage />} />
      <Route path="/control/bracket" element={<BracketControlPage />} />
      <Route path="/control/lineup" element={<LineupControlPage />} />
      <Route path="/control/casters" element={<CasterControlPage />} />
      <Route
        path="/control/gameplay-preview"
        element={<Navigate to="/control/casters?tab=preview" replace />}
      />
      <Route path="/watch/gameplay" element={<GameplayPreviewPage />} />
      <Route path="/control/cams" element={<CamsControlPage />} />
      <Route
        path="/control/shoutcasters"
        element={<Navigate to="/control/casters" replace />}
      />
      <Route
        path="/control/caster"
        element={<Navigate to="/control/casters" replace />}
      />
      <Route
        path="/controls/cams"
        element={<Navigate to="/control/cams" replace />}
      />
      <Route
        path="/controls/*"
        element={<Navigate to="/control/tournament" replace />}
      />
      <Route path="/cam" element={<CamJoinPage />} />
      <Route path="/cam/stand/*" element={<Navigate to="/cam" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
