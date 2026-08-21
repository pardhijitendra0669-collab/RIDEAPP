import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getPromos, createPromo, updatePromo, deletePromo } from '../api';

const emptyForm = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  minFare: 0,
  maxDiscount: '',
  expiryDate: '',
  usageLimit: '',
  perUserLimit: 1,
};

const Promos = () => {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadPromos();
  }, []);

  const loadPromos = async () => {
    setLoading(true);
    try {
      const { data } = await getPromos();
      setPromos(data.data || []);
    } catch (err) {
      toast.error('Failed to load promos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updatePromo(editingId, form);
        toast.success('Promo updated');
      } else {
        await createPromo(form);
        toast.success('Promo created');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      loadPromos();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this promo?')) return;
    try {
      await deletePromo(id);
      toast.success('Promo deleted');
      loadPromos();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleEdit = (promo) => {
    setEditingId(promo._id);
    setForm({
      code: promo.code,
      description: promo.description,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      minFare: promo.minFare,
      maxDiscount: promo.maxDiscount,
      expiryDate: promo.expiryDate?.split('T')[0],
      usageLimit: promo.usageLimit,
      perUserLimit: promo.perUserLimit,
    });
    setShowForm(true);
  };

  const updateField = (field, value) => {
    setForm({ ...form, [field]: value });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Promo Code Management</h1>
        <button className="btn-primary" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm); }}>
          {showForm ? 'Cancel' : '+ Create Promo'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit' : 'Create'} Promo Code</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Code</label>
              <input
                className="input"
                value={form.code}
                onChange={(e) => updateField('code', e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME50"
                required
              />
            </div>
            <div>
              <label className="label">Description</label>
              <input
                className="input"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Discount Type</label>
              <select
                className="input"
                value={form.discountType}
                onChange={(e) => updateField('discountType', e.target.value)}
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label className="label">Discount Value</label>
              <input
                className="input"
                type="number"
                value={form.discountValue}
                onChange={(e) => updateField('discountValue', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Min Fare (₹)</label>
              <input
                className="input"
                type="number"
                value={form.minFare}
                onChange={(e) => updateField('minFare', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Max Discount (₹)</label>
              <input
                className="input"
                type="number"
                value={form.maxDiscount}
                onChange={(e) => updateField('maxDiscount', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Expiry Date</label>
              <input
                className="input"
                type="date"
                value={form.expiryDate}
                onChange={(e) => updateField('expiryDate', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Usage Limit</label>
              <input
                className="input"
                type="number"
                value={form.usageLimit}
                onChange={(e) => updateField('usageLimit', e.target.value)}
                placeholder="Leave empty for unlimited"
              />
            </div>
            <div>
              <label className="label">Per User Limit</label>
              <input
                className="input"
                type="number"
                value={form.perUserLimit}
                onChange={(e) => updateField('perUserLimit', e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <button type="submit" className="btn-primary">
                {editingId ? 'Update Promo' : 'Create Promo'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="pb-3 pr-4">Code</th>
              <th className="pb-3 pr-4">Type</th>
              <th className="pb-3 pr-4">Value</th>
              <th className="pb-3 pr-4">Min Fare</th>
              <th className="pb-3 pr-4">Expiry</th>
              <th className="pb-3 pr-4">Used</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="py-8 text-center">Loading...</td></tr>
            ) : promos.length === 0 ? (
              <tr><td colSpan="8" className="py-8 text-center text-gray-500">No promos found</td></tr>
            ) : (
              promos.map((promo) => (
                <tr key={promo._id} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium">{promo.code}</td>
                  <td className="py-3 pr-4 capitalize">{promo.discountType}</td>
                  <td className="py-3 pr-4">
                    {promo.discountType === 'percentage' ? `${promo.discountValue}%` : `₹${promo.discountValue}`}
                  </td>
                  <td className="py-3 pr-4">₹{promo.minFare}</td>
                  <td className="py-3 pr-4">{new Date(promo.expiryDate).toLocaleDateString()}</td>
                  <td className="py-3 pr-4">{promo.usedBy?.length || 0}</td>
                  <td className="py-3 pr-4">
                    <span className={`badge ${promo.isActive ? 'badge-green' : 'badge-gray'}`}>
                      {promo.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(promo)} className="btn-secondary px-3 py-1 text-xs">Edit</button>
                      <button onClick={() => handleDelete(promo._id)} className="btn-danger px-3 py-1 text-xs">Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Promos;