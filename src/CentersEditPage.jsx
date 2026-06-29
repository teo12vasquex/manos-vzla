import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

const STATUS_OPTIONS = [
  { value: 'needed', emoji: '🟢', label: 'Necesitamos más' },
  { value: 'ok',     emoji: '🟡', label: 'Estamos bien' },
  { value: 'full',   emoji: '🔴', label: 'No envíen más' },
];

const STATUS_COLORS = {
  needed: '#16a34a',
  ok:     '#d4af37',
  full:   '#dc2626',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export default function CentersEditPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [center, setCenter] = useState(null);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});

  useEffect(() => {
    if (!token) { setError('Link inválido — falta el token.'); setLoading(false); return; }

    async function load() {
      const { data: centers, error: e1 } = await supabase
        .from('centers')
        .select('*')
        .eq('edit_token', token)
        .limit(1);

      if (e1 || !centers?.length) {
        setError('Link inválido o expirado. Verifica que copiaste el link completo.');
        setLoading(false);
        return;
      }

      const c = centers[0];
      setCenter(c);

      const { data: sups } = await supabase
        .from('center_supplies')
        .select('*')
        .eq('center_id', c.id);

      setSupplies(sups || []);
      setLoading(false);
    }

    load();
  }, [token]);

  const updateSupply = async (category, newStatus) => {
    setSaving(s => ({ ...s, [category]: true }));

    const { error } = await supabase
      .from('center_supplies')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('center_id', center.id)
      .eq('category', category);

    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      setSupplies(prev => prev.map(s =>
        s.center_id === center.id && s.category === category
          ? { ...s, status: newStatus, updated_at: new Date().toISOString() }
          : s
      ));
    }
    setSaving(s => ({ ...s, [category]: false }));
  };

  if (loading) return (
    <div style={{ background: '#0a0a0a', color: '#f5f5f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p>Cargando…</p>
    </div>
  );

  if (error) return (
    <div style={{ background: '#0a0a0a', color: '#f5f5f5', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <span style={{ fontSize: 48 }}>🔒</span>
      <h2 style={{ textAlign: 'center' }}>{error}</h2>
      <button className="btn-secondary" onClick={() => navigate('/centros')}>← Volver a centros</button>
    </div>
  );

  return (
    <div style={{ background: '#0a0a0a', color: '#f5f5f5', minHeight: '100vh' }}>
      <header className="app-header">
        <div className="brand">
          <button className="btn-back" onClick={() => navigate('/centros')}>← Centros</button>
          <span className="brand-logo">📦</span>
          <span className="brand-name" style={{ fontSize: 14 }}>{center.name}</span>
        </div>
      </header>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
        <p style={{ color: '#a0a0a0', fontSize: 14, marginBottom: 24 }}>
          {center.city} · {center.address}
        </p>

        <h2 style={{ fontSize: 18, marginBottom: 16, color: '#d4af37' }}>Estado de insumos</h2>
        <p style={{ color: '#a0a0a0', fontSize: 13, marginBottom: 24 }}>
          Los cambios se guardan automáticamente y se ven en el mapa al instante.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(SUPPLY_LABELS).map(([cat, { emoji, label }]) => {
            const sup = supplies.find(s => s.category === cat);
            const current = sup?.status || 'needed';
            const isSaving = saving[cat];

            return (
              <div key={cat} style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 22 }}>{emoji}</span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{label}</span>
                  {sup?.updated_at && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#606060' }}>
                      {timeAgo(sup.updated_at)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {STATUS_OPTIONS.map(({ value, emoji: se, label: sl }) => {
                    const isActive = current === value;
                    return (
                      <button
                        key={value}
                        disabled={isSaving}
                        onClick={() => updateSupply(cat, value)}
                        style={{
                          flex: 1,
                          padding: '10px 4px',
                          borderRadius: 8,
                          border: `2px solid ${isActive ? STATUS_COLORS[value] : '#2a2a2a'}`,
                          background: isActive ? STATUS_COLORS[value] + '22' : '#0a0a0a',
                          color: isActive ? STATUS_COLORS[value] : '#606060',
                          fontWeight: isActive ? 700 : 400,
                          fontSize: 12,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 4,
                          opacity: isSaving ? 0.5 : 1,
                        }}
                      >
                        <span>{se}</span>
                        <span>{sl}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 32, padding: 16, background: '#161616', borderRadius: 12, border: '1px solid #2a2a2a' }}>
          <p style={{ fontSize: 13, color: '#a0a0a0', marginBottom: 8 }}>🔗 Tu link de edición:</p>
          <p style={{ fontSize: 12, fontFamily: 'monospace', color: '#d4af37', wordBreak: 'break-all' }}>
            {window.location.href}
          </p>
          <button
            className="btn-secondary"
            style={{ marginTop: 10, width: '100%', fontSize: 13 }}
            onClick={() => { navigator.clipboard.writeText(window.location.href); alert('Link copiado'); }}
          >
            Copiar link
          </button>
        </div>
      </div>
    </div>
  );
}
