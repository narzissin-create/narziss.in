import React, { useState, useEffect, useCallback } from 'react';
import { banners } from '../services/adminApi';

const empty = { title: '', image_url: '', link_url: '', sort_order: 0, active: true };

export default function BannerForm() {
  const [list, setList]       = useState([]);
  const [form, setForm]       = useState(empty);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try { setList(await banners.list()); }
    catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const notify = (msg, isErr = false) => {
    if (isErr) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 3000);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setForm({ title: item.title, image_url: item.image_url, link_url: item.link_url || '', sort_order: item.sort_order, active: item.active });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelEdit = () => { setEditing(null); setForm(empty); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, sort_order: parseInt(form.sort_order, 10) };
      if (editing) {
        await banners.update(editing, payload);
        notify('Banner updated ✓');
        setEditing(null);
      } else {
        await banners.create(payload);
        notify('Banner created ✓');
      }
      setForm(empty);
      await load();
    } catch (err) { notify(err.message, true); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this banner?')) return;
    try { await banners.delete(id); notify('Deleted ✓'); await load(); }
    catch (err) { notify(err.message, true); }
  };

  const handleMove = async (id, order) => {
    try { await banners.move(id, order); await load(); }
    catch (err) { notify(err.message, true); }
  };

  return (
    <div style={s.wrap}>
      <form onSubmit={handleSubmit} style={s.form}>
        <h2 style={s.heading}>{editing ? '✏️ Edit Banner' : '➕ New Banner'}</h2>
        {error   && <div style={s.err}>{error}</div>}
        {success && <div style={s.ok}>{success}</div>}

        {[
          { label: 'Title *',     name: 'title',     type: 'text', required: true },
          { label: 'Image URL *', name: 'image_url', type: 'url',  required: true },
          { label: 'Link URL',    name: 'link_url',  type: 'url' },
          { label: 'Sort Order',  name: 'sort_order',type: 'number' },
        ].map(({ label, name, type, required }) => (
          <label key={name} style={s.label}>
            {label}
            <input name={name} type={type} value={form[name]} onChange={handleChange} required={required} style={s.input} />
          </label>
        ))}

        <label style={{ ...s.label, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input name="active" type="checkbox" checked={form.active} onChange={handleChange} />
          Active (visible on site)
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={loading} style={s.btn}>{loading ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
          {editing && <button type="button" onClick={cancelEdit} style={s.btnGray}>Cancel</button>}
        </div>
      </form>

      <h3 style={s.heading}>All Banners ({list.length})</h3>
      {list.length === 0 ? (
        <p style={{ color: '#888' }}>No banners yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>{['Order', 'Image', 'Title', 'Active', 'Actions'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {list.map((item, idx) => (
                <tr key={item.id} style={s.tr}>
                  <td style={s.td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button onClick={() => handleMove(item.id, item.sort_order - 1)} disabled={idx === 0} style={s.arrow}>▲</button>
                      {item.sort_order}
                      <button onClick={() => handleMove(item.id, item.sort_order + 1)} disabled={idx === list.length - 1} style={s.arrow}>▼</button>
                    </div>
                  </td>
                  <td style={s.td}>
                    {item.image_url
                      ? <img src={item.image_url} alt={item.title} style={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                      : '—'}
                  </td>
                  <td style={s.td}>{item.title}</td>
                  <td style={s.td}><span style={{ color: item.active ? '#27ae60' : '#e74c3c' }}>{item.active ? '✓' : '✗'}</span></td>
                  <td style={s.td}>
                    <button onClick={() => startEdit(item)} style={s.btnSm}>Edit</button>
                    <button onClick={() => handleDelete(item.id)} style={{ ...s.btnSm, background: '#e74c3c' }}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap:    { display: 'flex', flexDirection: 'column', gap: 24 },
  form:    { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480, background: '#fff', padding: 24, borderRadius: 12, boxShadow: '0 2px 12px #0001' },
  heading: { margin: 0, color: '#333', fontSize: '1.1rem' },
  label:   { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, color: '#555' },
  input:   { padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 },
  btn:     { padding: '9px 20px', background: '#7367f0', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnGray: { padding: '9px 20px', background: '#aaa', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnSm:   { padding: '4px 10px', background: '#7367f0', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginRight: 4, fontSize: 12 },
  arrow:   { padding: '1px 6px', background: '#efefef', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 10 },
  err:     { background: '#fff0f0', color: '#c0392b', padding: '8px 12px', borderRadius: 6, fontSize: 13 },
  ok:      { background: '#f0fff4', color: '#27ae60', padding: '8px 12px', borderRadius: 6, fontSize: 13 },
  table:   { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px #0001' },
  th:      { background: '#7367f0', color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 13 },
  td:      { padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 13 },
  tr:      {},
};
