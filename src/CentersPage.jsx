import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { supabase } from './lib/supabase.js';

const SUPPLY_LABELS = {
  water:      { emoji: '💧', label: 'Agua' },
  food:       { emoji: '🥫', label: 'Alimentos' },
  clothing:   { emoji: '👕', label: 'Ropa' },
  medicine:   { emoji: '💊', label: 'Medicinas' },
  hygiene:    { emoji: '🧴', label: 'Higiene' },
  tools:      { emoji: '🛠️', label: 'Herramientas' },
  volunteers: { emoji: '👥', label: 'Voluntarios' },
};

const STATUS_CONFIG = {
  needed: { color: '#16a34a', label: 'Necesitan más', bg: '#14532d22' },
  ok:     { color: '#d4af37', label: 'Bien abastecido', bg: '#78350f22' },
  full:   { color: '#dc2626', label: 'No envíen más', bg: '#7f1d1d22' },
};

const CITIES = ['Todo', 'Miami', 'Madrid', 'Bogotá', 'Otra'];
const MIAMI_CENTER = [25.7617, -80.1918];

function makeCenterIcon() {
  return L.divIcon({
    className: 'center-marker',
    html: `<div class="center-dot">📦</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function MapClickCapture({ active, onPick }) {
  useMapEvents({
    click(e) { if (active) onPick(e.latlng); }
  });
  return null;
}

function FlyTo({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords) map.flyTo(coords, 14);
  }, [coords, map]);
  return null;
}

function SupplyGrid({ supplies }) {
  return (
    <div className="supply-grid">
      {Object.entries(SUPPLY_LABELS).map(([cat, { emoji, label }]) => {
        const s = supplies?.find(s => s.category === cat);
        const status = s?.status || 'needed';
        const cfg = STATUS_CONFIG[status];
        return (
          <div key={cat} className="supply-item" style={{ borderColor: cfg.color, background: cfg.bg }}>
            <span className="supply-emoji">{emoji}</span>
            <span className="supply-label">{label}</span>
            <span className="supply-status" style={{ color: cfg.color }}>{cfg.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function RegisterModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '', address: '', city: 'Miami', contact: '', instagram: '' });
  const [latlng, setLatlng] = useState(null);
  const [pickingMap, setPickingMap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleLocate = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setLatlng({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => alert('No se pudo obtener tu ubicación. Toca el mapa para marcar.')
    );
  };

  const submit = async () => {
    if (!form.name.trim()) return alert('El nombre del centro es requerido.');
    if (!form.address.trim()) return alert('La dirección es requerida.');
    if (!latlng) return alert('Marca la ubicación del centro en el mapa o usa tu ubicación.');
    setSubmitting(true);
    const { data, error } = await supabase.from('centers').insert([{
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city,
      contact: form.contact.trim() || null,
      instagram: form.instagram.trim() || null,
      lat: latlng.lat,
      lng: latlng.lng,
      location: `POINT(${latlng.lng} ${latlng.lat})`,
    }]).select('edit_token').single();
    setSubmitting(false);
    if (error) return alert('Error al registrar: ' + error.message);
    setToken(data.edit_token);
  };

  if (token) return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>✅ Centro registrado</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 12 }}>Tu centro fue registrado y aparecerá en el mapa cuando un moderador lo verifique (normalmente en 24h).</p>
          <p style={{ marginBottom: 8, fontWeight: 700 }}>Guarda este link — es tu acceso para actualizar los insumos:</p>
          <div className="token-box">
            {`${window.location.origin}/centros/edit?token=${token}`}
          </div>
          <p style={{ marginTop: 12, fontSize: 13, color: '#a0a0a0' }}>⚠️ No lo compartas. Es tu contraseña para editar el estado de tu centro.</p>
        </div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/centros/edit?token=${token}`); alert('Link copiado'); }}>Copiar link</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Registrar centro</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <label className="field-label">Nombre del centro</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: Centro de Acopio Doral" maxLength={100} />

          <label className="field-label">Dirección completa</label>
          <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Ej: 1234 NW 87th Ave, Doral, FL" maxLength={200} />

          <label className="field-label">Ciudad</label>
          <select value={form.city} onChange={e => set('city', e.target.value)} style={{ background: '#1f1f1f', color: '#f5f5f5', border: '1px solid #2a2a2a', padding: '12px', borderRadius: 8, width: '100%', fontSize: 16 }}>
            {CITIES.filter(c => c !== 'Todo').map(c => <option key={c}>{c}</option>)}
          </select>

          <label className="field-label">Teléfono o email (opcional)</label>
          <input value={form.contact} onChange={e => set('contact', e.target.value)} placeholder="Ej: +1 305 555 0000" maxLength={100} />

          <label className="field-label">Instagram (opcional)</label>
          <input value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@tucentro" maxLength={60} />

          <label className="field-label">Ubicación en el mapa</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={handleLocate}>📍 Usar mi ubicación</button>
            <button className="btn-secondary" style={{ flex: 1, borderColor: pickingMap ? '#d4af37' : '' }} onClick={() => setPickingMap(!pickingMap)}>
              {pickingMap ? '✓ Toca el mapa abajo' : '🗺️ Tocar el mapa'}
            </button>
          </div>
          {latlng && <div className="coord-display">📍 {latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}</div>}
          {pickingMap && (
            <div style={{ height: 200, borderRadius: 8, overflow: 'hidden', marginTop: 8 }}>
              <MapContainer center={MIAMI_CENTER} zoom={10} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapClickCapture active={pickingMap} onPick={(ll) => { setLatlng(ll); setPickingMap(false); }} />
                {latlng && <Marker position={[latlng.lat, latlng.lng]} icon={makeCenterIcon()} />}
              </MapContainer>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={submitting || !form.name || !form.address || !latlng}>
            {submitting ? 'Registrando…' : 'Registrar centro'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CentersPage() {
  const navigate = useNavigate();
  const [centers, setCenters] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [cityFilter, setCityFilter] = useState('Todo');
  const [needFilter, setNeedFilter] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [flyTo, setFlyTo] = useState(null);

  useEffect(() => {
    supabase.from('centers').select('*').then(({ data }) => { if (data) setCenters(data); });
    supabase.from('center_supplies').select('*').then(({ data }) => { if (data) setSupplies(data); });
  }, []);

  const visibleCenters = useMemo(() => {
    return centers.filter(c => {
      if (cityFilter !== 'Todo' && c.city !== cityFilter) return false;
      if (needFilter) {
        const s = supplies.find(s => s.center_id === c.id && s.category === needFilter);
        if (!s || s.status !== 'needed') return false;
      }
      return true;
    });
  }, [centers, supplies, cityFilter, needFilter]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <button className="btn-back" onClick={() => navigate('/app')}>← Mapa</button>
          <span className="brand-logo">📦</span>
          <span className="brand-name">Centros de acopio</span>
        </div>
        <button className="fab-small" onClick={() => setShowModal(true)}>+ Registrar</button>
      </header>

      <div className="filter-bar">
        {CITIES.map(c => (
          <button key={c} className={`filter-chip ${cityFilter === c ? 'active' : ''}`} onClick={() => setCityFilter(c)}>{c}</button>
        ))}
        <div style={{ width: 1, background: '#2a2a2a', margin: '0 4px' }} />
        {[['water','💧 Agua'],['volunteers','👥 Voluntarios'],['medicine','💊 Medicina']].map(([cat, label]) => (
          <button key={cat} className={`filter-chip ${needFilter === cat ? 'active' : ''}`}
            style={needFilter === cat ? { borderColor: '#16a34a', background: '#14532d33' } : {}}
            onClick={() => setNeedFilter(needFilter === cat ? null : cat)}>
            {label}
          </button>
        ))}
      </div>

      <div className="map-wrapper">
        <MapContainer center={MIAMI_CENTER} zoom={4} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {flyTo && <FlyTo coords={[flyTo.lat, flyTo.lng]} />}
          {visibleCenters.map(c => (
            <Marker key={c.id} position={[c.lat, c.lng]} icon={makeCenterIcon()}>
              <Popup>
                <div className="popup-content">
                  <div className="popup-header" style={{ borderLeft: '4px solid #d4af37' }}>
                    <strong>{c.name}</strong>
                  </div>
                  <p style={{ fontSize: 13, color: '#a0a0a0', margin: '6px 0' }}>{c.city} · {c.address}</p>
                  {c.contact && <p style={{ fontSize: 13, marginBottom: 4 }}>📞 {c.contact}</p>}
                  {c.instagram && <p style={{ fontSize: 13, marginBottom: 8 }}>📸 {c.instagram}</p>}
                  <SupplyGrid supplies={supplies.filter(s => s.center_id === c.id)} />
                  <button className="vote-btn vote-active" style={{ width: '100%', marginTop: 10 }}
                    onClick={() => navigate(`/centros/edit?center=${c.id}`)}>
                    ¿Eres este centro? Actualizar insumos
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {visibleCenters.length === 0 && (
          <div className="publish-banner" style={{ background: '#1f1f1f', color: '#a0a0a0', border: '1px solid #2a2a2a' }}>
            No hay centros registrados aún.
            <button onClick={() => setShowModal(true)} style={{ background: '#d4af37', color: '#0a0a0a', padding: '4px 10px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>Sé el primero</button>
          </div>
        )}
      </div>

      {showModal && <RegisterModal onClose={() => setShowModal(false)} onSuccess={() => setShowModal(false)} />}
    </div>
  );
}
