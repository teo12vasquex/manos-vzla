import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { supabase, getDeviceHash } from './lib/supabase.js';
import { queueReport, getPendingReports, removePendingReport } from './lib/offlineQueue.js';

// ============================================================
// CATEGORIAS
// ============================================================
const CATEGORIES = {
  rescue:   { emoji: '🔴', label: 'Rescate activo',    color: '#dc2626', short: 'Rescate' },
  medical:  { emoji: '🟠', label: 'Médico',             color: '#ea580c', short: 'Médico'  },
  supplies: { emoji: '🔵', label: 'Agua / comida',      color: '#2563eb', short: 'Agua'    },
  shelter:  { emoji: '🟢', label: 'Refugio',            color: '#16a34a', short: 'Refugio' },
  missing:  { emoji: '⚫', label: 'Zona desaparecidos', color: '#404040', short: 'Buscan'  }
};

const STATUS_LABELS = {
  urgent:   'URGENTE',
  active:   'activo',
  en_route: 'en camino',
  resolved: 'resuelto',
  flagged:  'spam',
};

// Centro inicial: Yaracuy (epicentro)
const VENEZUELA_CENTER = [10.34, -68.74];
const DEFAULT_ZOOM = 9;

// ============================================================
// ICONOS CUSTOM
// ============================================================
function makeIcon(category, status) {
  const c = CATEGORIES[category];

  if (status === 'en_route') {
    return L.divIcon({
      className: 'manos-marker',
      html: `<div class="marker-dot" style="background:#16a34a">
               <span>🚶</span>
             </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  }

  if (status === 'resolved') {
    return L.divIcon({
      className: 'manos-marker',
      html: `<div class="marker-dot marker-resolved" style="background:${c.color}">
               <span>${c.emoji}</span>
               <span class="marker-check">✅</span>
             </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  }

  const pulse = status === 'urgent';
  return L.divIcon({
    className: 'manos-marker',
    html: `<div class="marker-dot ${pulse ? 'pulse' : ''}" style="background:${c.color}">
             <span>${c.emoji}</span>
           </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
}

// ============================================================
// HOOK: estado conexion
// ============================================================
function useOnline() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

// ============================================================
// COMPONENTE: locator de usuario
// ============================================================
function LocateButton({ onLocated }) {
  const map = useMap();
  return (
    <button
      className="floating-btn locate-btn"
      onClick={() => {
        map.locate({ enableHighAccuracy: true, timeout: 8000 });
        map.once('locationfound', (e) => {
          map.flyTo(e.latlng, 14);
          onLocated && onLocated(e.latlng);
        });
        map.once('locationerror', () => alert('No se pudo obtener tu ubicación. Activa el GPS.'));
      }}
      aria-label="Ubícame"
    >📍</button>
  );
}

// ============================================================
// COMPONENTE: capturar click en mapa al publicar
// ============================================================
function MapClickCapture({ active, onPick }) {
  useMapEvents({
    click(e) { if (active) onPick(e.latlng); }
  });
  return null;
}

// ============================================================
// MODAL: publicar reporte
// ============================================================
function PublishModal({ latlng, onClose, onSubmit }) {
  const [category, setCategory] = useState('rescue');
  const [description, setDescription] = useState('');
  const [nickname, setNickname] = useState(() => localStorage.getItem('manos_nick') || '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!description.trim()) return alert('Describe brevemente la situación.');
    setSubmitting(true);
    localStorage.setItem('manos_nick', nickname);
    await onSubmit({
      category,
      description: description.trim().slice(0, 200),
      nickname: nickname.trim().slice(0, 40) || null,
      lat: latlng.lat,
      lng: latlng.lng
    });
    setSubmitting(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Reportar</h2>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-body">
          <label className="field-label">Categoría</label>
          <div className="cat-grid">
            {Object.entries(CATEGORIES).map(([key, c]) => (
              <button
                key={key}
                className={`cat-btn ${category === key ? 'active' : ''}`}
                style={category === key ? { borderColor: c.color, background: c.color + '22' } : {}}
                onClick={() => setCategory(key)}
              >
                <span className="cat-emoji">{c.emoji}</span>
                <span className="cat-text">{c.label}</span>
              </button>
            ))}
          </div>

          <label className="field-label">Qué hace falta (máx 200)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
            placeholder="Ej: edificio caído, 4 personas atrapadas, hace falta equipo pesado"
            rows={3}
            autoFocus
          />
          <div className="char-count">{description.length}/200</div>

          <label className="field-label">Tu nombre o alias (opcional)</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 40))}
            placeholder="Anónimo"
            maxLength={40}
          />

          <div className="coord-display">
            📍 {latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={submitting || !description.trim()}>
            {submitting ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// POPUP del marcador
// ============================================================
function ReportPopup({ report, onConfirm }) {
  const c = CATEGORIES[report.category];
  const minutesAgo = Math.floor((Date.now() - new Date(report.created_at).getTime()) / 60000);
  const timeLabel = minutesAgo < 60 ? `hace ${minutesAgo}m` : `hace ${Math.floor(minutesAgo / 60)}h`;
  const isResolved = report.status === 'resolved';
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(null);

  const vote = async (voteType) => {
    setLoading(voteType);
    setFeedback(null);
    const result = await onConfirm(report.id, voteType);
    setLoading(null);
    if (result?.error) {
      setFeedback({ type: 'error', msg: result.error });
    } else {
      const msgs = {
        on_my_way:    '¡Marcado en camino!',
        still_active: 'Confirmado. Gracias.',
        resolved:     `Voto registrado (${(report.resolved_votes || 0) + 1}/3 para resolver).`,
        flag:         'Spam reportado.',
      };
      setFeedback({ type: 'success', msg: msgs[voteType] || 'Voto registrado.' });
    }
  };

  return (
    <div className="popup-content">
      <div className="popup-header" style={{ borderLeft: `4px solid ${c.color}` }}>
        <strong>{c.label}</strong>
        <span className={`status-pill status-${report.status}`}>
          {STATUS_LABELS[report.status] || report.status}
        </span>
      </div>
      <p className="popup-desc">{report.description}</p>
      <div className="popup-meta">
        {report.nickname || 'Anónimo'} · {timeLabel}
        {report.confirmations > 0 && ` · ${report.confirmations} confirmaciones`}
        {report.resolved_votes > 0 && ` · ${report.resolved_votes}/3 para resolver`}
        {report.flag_votes > 0 && ` · ${report.flag_votes}/3 spam`}
      </div>
      {feedback && (
        <div className={`popup-feedback popup-feedback-${feedback.type}`}>
          {feedback.msg}
        </div>
      )}
      <div className="popup-actions">
        {!isResolved && (
          <>
            <button
              className="vote-btn vote-onway"
              onClick={() => vote('on_my_way')}
              disabled={loading !== null}
            >
              {loading === 'on_my_way' ? '…' : 'Voy en camino'}
            </button>
            <button
              className="vote-btn vote-active"
              onClick={() => vote('still_active')}
              disabled={loading !== null}
            >
              {loading === 'still_active' ? '…' : 'Sigue activo'}
            </button>
            <button
              className="vote-btn vote-resolved"
              onClick={() => vote('resolved')}
              disabled={loading !== null}
            >
              {loading === 'resolved' ? '…' : `Ya fue atendido${report.resolved_votes > 0 ? ` (${report.resolved_votes}/3)` : ''}`}
            </button>
          </>
        )}
        <button
          className="vote-btn vote-flag"
          onClick={() => vote('flag')}
          disabled={loading !== null}
          title="Reportar como spam"
        >
          {loading === 'flag' ? '…' : `🚩 Spam${report.flag_votes > 0 ? ` (${report.flag_votes}/3)` : ''}`}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// APP PRINCIPAL
// ============================================================
export default function App() {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('all');
  const [publishMode, setPublishMode] = useState(false);
  const [pickedLatLng, setPickedLatLng] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const online = useOnline();
  const deviceHash = useMemo(getDeviceHash, []);

  // ----- cargar reportes iniciales -----
  const loadReports = useCallback(async () => {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .in('status', ['urgent', 'active', 'en_route', 'resolved'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (!error && data) setReports(data);
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  // ----- realtime subscription -----
  useEffect(() => {
    const channel = supabase
      .channel('reports-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, (payload) => {
        setReports((prev) => [payload.new, ...prev.filter((r) => r.id !== payload.new.id)]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reports' }, (payload) => {
        setReports((prev) => prev.map((r) => (r.id === payload.new.id ? payload.new : r)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ----- sincronizar cola offline cuando vuelve la conexion -----
  const syncQueue = useCallback(async () => {
    if (!online || syncing) return;
    const pending = await getPendingReports();
    setPendingCount(pending.length);
    if (pending.length === 0) return;
    setSyncing(true);
    for (const r of pending) {
      const { localId, queuedAt, ...payload } = r;
      const { error } = await supabase.from('reports').insert([payload]);
      if (!error) await removePendingReport(localId);
    }
    setSyncing(false);
    setPendingCount((await getPendingReports()).length);
    loadReports();
  }, [online, syncing, loadReports]);

  useEffect(() => { syncQueue(); }, [online, syncQueue]);
  useEffect(() => { getPendingReports().then((p) => setPendingCount(p.length)); }, []);

  // ----- publicar reporte (online o cola) -----
  const handleSubmit = async (data) => {
    const payload = {
      ...data,
      location: `POINT(${data.lng} ${data.lat})`,
      device_hash: deviceHash,
      status: 'urgent'
    };

    if (online) {
      const { error } = await supabase.from('reports').insert([payload]);
      if (error) {
        if (error.message?.includes('rate_limit')) {
          alert('Has publicado demasiados reportes. Espera un momento.');
        } else {
          await queueReport(payload);
          setPendingCount((c) => c + 1);
          alert('No se pudo conectar. Guardado para subir cuando regrese la señal.');
        }
      } else {
        setPublishMode(false);
        setPickedLatLng(null);
      }
    } else {
      await queueReport(payload);
      setPendingCount((c) => c + 1);
      alert('Sin conexión. Tu reporte se subirá automáticamente cuando regrese la señal.');
      setPublishMode(false);
      setPickedLatLng(null);
    }
  };

  // ----- confirmar / votar -----
  const handleConfirm = async (reportId, voteType) => {
    if (!online) return { error: 'Necesitas conexión para confirmar.' };
    const { error } = await supabase.from('confirmations').insert([{
      report_id: reportId,
      device_hash: deviceHash,
      vote_type: voteType
    }]);
    if (error) {
      if (error.code === '23505') return { error: 'Ya votaste en este reporte.' };
      return { error: 'Error al votar: ' + error.message };
    }
    loadReports();
    return { success: true };
  };

  // ----- filtrar -----
  const visibleReports = useMemo(() => {
    if (filter === 'resolved') return reports.filter((r) => r.status === 'resolved');
    if (filter === 'all') return reports;
    return reports.filter((r) => r.category === filter);
  }, [reports, filter]);

  // ----- contadores -----
  const counts = useMemo(() => {
    const acc = { all: 0, resolved: 0 };
    Object.keys(CATEGORIES).forEach((k) => { acc[k] = 0; });
    reports.forEach((r) => {
      if (r.status === 'resolved') {
        acc.resolved++;
      } else {
        acc.all++;
        if (acc[r.category] !== undefined) acc[r.category]++;
      }
    });
    return acc;
  }, [reports]);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo">🇻🇪</span>
          <span className="brand-name">Manos VZLA</span>
        </div>
        <div className="header-status">
          {!online && <span className="badge badge-offline">Sin conexión</span>}
          {pendingCount > 0 && (
            <span className="badge badge-pending">
              {syncing ? 'Subiendo…' : `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''}`}
            </span>
          )}
        </div>
      </header>

      {/* Filtros */}
      <div className="filter-bar">
        <button className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Todo <span className="chip-count">{counts.all}</span>
        </button>
        {Object.entries(CATEGORIES).map(([key, c]) => (
          <button
            key={key}
            className={`filter-chip ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
            style={filter === key ? { background: c.color + '33', borderColor: c.color } : {}}
          >
            {c.emoji} {c.short} <span className="chip-count">{counts[key]}</span>
          </button>
        ))}
        <button
          className={`filter-chip filter-chip-resolved ${filter === 'resolved' ? 'active' : ''}`}
          onClick={() => setFilter('resolved')}
        >
          ✅ Atendidos <span className="chip-count chip-count-green">{counts.resolved}</span>
        </button>
      </div>

      {/* Mapa */}
      <div className="map-wrapper">
        <MapContainer
          center={VENEZUELA_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <MapClickCapture
            active={publishMode}
            onPick={(latlng) => { setPickedLatLng(latlng); setPublishMode(false); }}
          />
          <LocateButton />
          {visibleReports.map((r) => (
            <Marker key={r.id} position={[r.lat, r.lng]} icon={makeIcon(r.category, r.status)}>
              <Popup>
                <ReportPopup report={r} onConfirm={handleConfirm} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Banner modo publicar */}
        {publishMode && (
          <div className="publish-banner">
            Toca en el mapa donde quieres reportar
            <button onClick={() => setPublishMode(false)}>Cancelar</button>
          </div>
        )}

        {/* Boton + */}
        {!publishMode && !pickedLatLng && (
          <button
            className="fab"
            onClick={() => setPublishMode(true)}
            aria-label="Publicar reporte"
          >
            <span>+</span>
            <span className="fab-label">Reportar</span>
          </button>
        )}
      </div>

      {/* Modal publicar */}
      {pickedLatLng && (
        <PublishModal
          latlng={pickedLatLng}
          onClose={() => setPickedLatLng(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
