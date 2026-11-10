import React, { useState, useEffect, useCallback } from 'react';
import { clothes } from '../services/adminApi';

const empty = { name: '', description: '', price: '', stock: '', images: '' };

export default function ProductForm() {
  const [list, setList]       = useState([]);
  const [form, setForm]       = useState(empty);
  const [editing, setEditing] = useState(null); // id being edited
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      setList(await clothes.list());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const notify = (msg, isErr = false) => {
    if (isErr) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 3000);
  };

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const startEdit = (item) => {
    setEditing(item.id);
    setForm({
      name: item.name,
      description: item.description || '',
      price: String(item.price),
      stock: String(item.stock),
      images: (item.images || []).join(', '),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => { setEditing(null); setForm(empty); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        price: parseFloat(form.price),
        stock: parseInt(form.stock, 10),
        images: form.images.split(',').map((s) => s.trim()).filter(Boolean),
      };
      if (editing) {
        await clothes.update(editing, payload);
        notify('Product updated ✓');
        setEditing(null);
      } else {
        await clothes.create(payload);
        notify('Product created ✓');
      }
      setForm(empty);
      await load();
    } catch (err) {
      notify(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await clothes.delete(id);
      notify('Deleted ✓');
      await load();
    } catch (err) {
      notify(err.message, true);
    }
  };

  return (
    <div style={s.wrap}>
      {/* ── Form ── */}
      <form onSubmit={handleSubmit} style={s.form}>
        <h2 style={s.heading}>{editing ? '✏️ Edit Product' : '➕ New Product'}</h2>

        {error   && <div style={s.err}>{error}</div>}
        {success && <div style={s.ok}>{success}</div>}

        {[
          { label: 'Name *',        name: 'name',        type: 'text',   required: true },
          { label: 'Price (₹) *',   name: 'price',       type: 'number', required: true },
          { label: 'Stock *',       name: 'stock',       type: 'number', required: true },
        ].map(({ label, name, type, required }) => (
          <label key={name} style={s.label}>
            {label}
            <input
              name={name} type={type} value={form[name]}
              onChange={handleChange} required={required} style={s.input}
            />
          </label>
        ))}

        <label style={s.label}>
          Description
          <textarea name="description" value={form.description} onChange={handleChange} style={{ ...s.input, height: 72 }} />
        </label>

        <label style={s.label}>
          Image URLs (comma-separated)
          <input name="images" type="text" value={form.images} onChange={handleChange} style={s.input} placeholder="https://..." />
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={loading} style={s.btn}>
            {loading ? 'Saving…' : editing ? 'Update' : 'Create'}
          </button>
          {editing && <button type="button" onClick={cancelEdit} style={s.btnGray}>Cancel</button>}
        </div>
      </form>

      {/* ── Table ── */}
      <h3 style={s.heading}>All Products ({list.length})</h3>
      {list.length === 0 ? (
        <p style={{ color: '#888' }}>No products yet. Create one above.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>{['ID', 'Name', 'Price', 'Stock', 'Actions'].map((h) => (
                <th key={h} style={s.th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {list.map((item) => (
                <tr key={item.id} style={s.tr}>
                  <td style={s.td}>{item.id}</td>
                  <td style={s.td}>{item.name}</td>
                  <td style={s.td}>₹{item.price}</td>
                  <td style={s.td}>{item.stock}</td>
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
  err:     { background: '#fff0f0', color: '#c0392b', padding: '8px 12px', borderRadius: 6, fontSize: 13 },
  ok:      { background: '#f0fff4', color: '#27ae60', padding: '8px 12px', borderRadius: 6, fontSize: 13 },
  table:   { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px #0001' },
  th:      { background: '#7367f0', color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 13 },
  td:      { padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 13 },
  tr:      { transition: 'background 0.15s' },
};
