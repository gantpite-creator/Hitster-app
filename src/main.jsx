import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Home from './pages/Home.jsx'
import Game from './pages/Game.jsx'
import Workshop from './pages/Workshop.jsx'
import Master from './pages/Master.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/jatek/:code" element={<Game />} />
        <Route path="/muhely" element={<Workshop />} />
        <Route path="/mester" element={<Master />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
