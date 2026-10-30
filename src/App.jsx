import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home';
import Controller from './pages/Controller';
import Overlay from './pages/Overlay';
import RemoteControl from './pages/RemoteControl';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/controller" element={<Controller />} />
          <Route path="/overlay" element={<Overlay />} />
          <Route path="/remote" element={<RemoteControl />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
