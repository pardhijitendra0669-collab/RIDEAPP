import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getRevenueReport, getDriverReport } from '../api';

const Reports = () => {
  const [revenue, setRevenue] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [revRes, driverRes] = await Promise.all([
        getRevenueReport({ from, to }),
        getDriverReport(),
      ]);
      setRevenue(revRes.data.data);
      setDrivers(driverRes.data.data || []);
    } catch (err) {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = (e) => {
    e.preventDefault();
    loadReports();
  };

  if (loading) return <div className="text-center py-20">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Reports & Analytics</h1>

      {/* Date filter */}
      <form onSubmit={handleFilter} className="flex items-end gap-4 mb-6">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary">Apply</button>
      </form>

      {/* Revenue summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="text-2xl font-bold">₹{revenue?.totals?.totalRevenue || 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Total Rides</p>
          <p className="text-2xl font-bold">{revenue?.totals?.totalRides || 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Total Distance</p>
          <p className="text-2xl font-bold">{revenue?.totals?.totalDistance?.toFixed(1) || 0} km</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Avg Fare</p>
          <p className="text-2xl font-bold">₹{revenue?.totals?.avgFare?.toFixed(0) || 0}</p>
        </div>
      </div>

      {/* Daily revenue table */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">Daily Revenue</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3 pr-4">Vehicle</th>
                <th className="pb-3 pr-4">Rides</th>
                <th className="pb-3 pr-4">Revenue</th>
                <th className="pb-3">Distance</th>
              </tr>
            </thead>
            <tbody>
              {revenue?.daily?.length === 0 ? (
                <tr><td colSpan="5" className="py-8 text-center text-gray-500">No data</td></tr>
              ) : (
                revenue?.daily?.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-3 pr-4">{item._id.date}</td>
                    <td className="py-3 pr-4 capitalize">{item._id.vehicleType}</td>
                    <td className="py-3 pr-4">{item.count}</td>
                    <td className="py-3 pr-4">₹{item.revenue}</td>
                    <td className="py-3">{item.distance?.toFixed(1)} km</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Driver performance */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Driver Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="pb-3 pr-4">Driver</th>
                <th className="pb-3 pr-4">Rating</th>
                <th className="pb-3 pr-4">Completed</th>
                <th className="pb-3 pr-4">Cancelled</th>
                <th className="pb-3 pr-4">Earnings</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr><td colSpan="6" className="py-8 text-center text-gray-500">No driver data</td></tr>
              ) : (
                drivers.map((driver) => (
                  <tr key={driver._id} className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">{driver.name}</td>
                    <td className="py-3 pr-4">⭐ {driver.rating?.toFixed(1)}</td>
                    <td className="py-3 pr-4">{driver.completedRides || 0}</td>
                    <td className="py-3 pr-4">{driver.cancelledRides || 0}</td>
                    <td className="py-3 pr-4">₹{driver.totalEarnings || 0}</td>
                    <td className="py-3">
                      <span className={`badge ${driver.isOnline ? 'badge-green' : 'badge-gray'}`}>
                        {driver.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;