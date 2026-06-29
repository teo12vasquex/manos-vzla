import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MapApp from './MapApp.jsx';
import CentersPage from './CentersPage.jsx';
import CentersEditPage from './CentersEditPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/app" element={<MapApp />} />
        <Route path="/app/" element={<MapApp />} />
        <Route path="/centros" element={<CentersPage />} />
        <Route path="/centros/" element={<CentersPage />} />
        <Route path="/centros/edit" element={<CentersEditPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
