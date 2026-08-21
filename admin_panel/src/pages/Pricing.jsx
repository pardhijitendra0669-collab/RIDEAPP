import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getPricingRules, createPricingRule, updatePricingRule, deletePricingRule } from '../api';

const vehicleTypes = ['bike', 'auto', 'cabmini', 'cabsedan'];

const emptyForm = {
  city: '',
  vehicleType: 'bike',
  baseFare: '',
  perKmRate: '',
  perMinRate: '',
  minFare: '',
  surgeMultiplier: 1,
  nightChargeMultiplier: 1.25,
  cancellationCharge: 0,
};

const Pricing = () => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const { data } = await getPricingRules();
      setRules(data.data || []);
    } catch (err) {
      toast.error('Failed to load pricing rules');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updatePricingRule(editingId, form);
        toast.success('Pricing rule updated');
      } else {
        await createPricingRule(form);
        toast.success('Pricing rule created');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this pricing rule?')) return;
    try {
      await deletePricingRule(id);
      toast.success('Pricing rule deleted');
      loadRules();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleEdit = (rule) => {
    setEditingId(rule._id);
    setForm({
      city: rule.city,
      vehicleType: rule.vehicleType,
      baseFare: rule.baseFare,
      perKmRate: rule.perKmRate,
      perMinRate: rule.perMinRate,
      minFare: rule.minFare,
      surgeMultiplier: rule.surgeMultiplier,
      nightChargeMultiplier: rule.nightChargeMultiplier,
      cancellationCharge: rule.cancellationCharge,
    });
    setShowForm(true);
  };

  const updateField = (field, value) => {
    setForm({ ...form, [field]: value });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Fare & Pricing Management</h1>
        <button className="btn-primary" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm); }}>
          {showForm ? 'Cancel' : '+ Add Pricing Rule'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit' : 'Create'} Pricing Rule</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">City</label>
              <input
                className="input"
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
                placeholder="e.g. delhi"
                required
              />
            </div>
            <div>
              <label className="label">Vehicle Type</label>
              <select
                className="input"
                value={form.vehicleType}
                onChange={(e) => updateField('vehicleType', e.target.value)}
              >
                {vehicleTypes.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Base Fare (₹)</label>
              <input
                className="input"
                type="number"
                value={form.baseFare}
                onChange={(e) => updateField('baseFare', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Per KM Rate (₹)</label>
              <input
                className="input"
                type="number"
                step="0.5"
                value={form.perKmRate}
                onChange={(e) => updateField('perKmRate', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Per Minute Rate (₹)</label>
              <input
                className="input"
                type="number"
                step="0.5"
                value={form.perMinRate}
                onChange={(e) => updateField('perMinRate', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Minimum Fare (₹)</label>
              <input
                className="input"
                type="number"
                value={form.minFare}
                onChange={(e) => updateField('minFare', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Surge Multiplier</label>
              <input
                className="input"
                type="number"
                step="0.1"
                min="1"
                value={form.surgeMultiplier}
                onChange={(e) => updateField('surgeMultiplier', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Night Charge Multiplier</label>
              <input
                className="input"
                type="number"
                step="0.1"
                min="1"
                value={form.nightChargeMultiplier}
                onChange={(e) => updateField('nightChargeMultiplier', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Cancellation Charge (₹)</label>
              <input
                className="input"
                type="number"
                value={form.cancellationCharge}
                onChange={(e) => updateField('cancellationCharge', e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <button type="submit" className="btn-primary">
                {editingId ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rules table */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="pb-3 pr-4">City</th>
              <th className="pb-3 pr-4">Vehicle</th>
              <th className="pb-3 pr-4">Base</th>
              <th className="pb-3 pr-4">Per KM</th>
              <th className="pb-3 pr-4">Per Min</th>
              <th className="pb-3 pr-4">Min Fare</th>
              <th className="pb-3 pr-4">Surge</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="py-8 text-center">Loading...</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan="8" className="py-8 text-center text-gray-500">No pricing rules found</td></tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule._id} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium capitalize">{rule.city}</td>
                  <td className="py-3 pr-4 capitalize">{rule.vehicleType}</td>
                  <td className="py-3 pr-4">₹{rule.baseFare}</td>
                  <td className="py-3 pr-4">₹{rule.perKmRate}</td>
                  <td className="py-3 pr-4">₹{rule.perMinRate}</td>
                  <td className="py-3 pr-4">₹{rule.minFare}</td>
                  <td className="py-3 pr-4">×{rule.surgeMultiplier}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(rule)} className="btn-secondary px-3 py-1 text-xs">Edit</button>
                      <button onClick={() => handleDelete(rule._id)} className="btn-danger px-3 py-1 text-xs">Delete</button>
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

export default Pricing;