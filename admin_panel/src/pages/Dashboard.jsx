import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard } from '../api';

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const { data } = await getDashboard();
      setData(data.data);
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20">Loading...</div>;
  }

  const stats = [
    { label: 'Total Users', value: data?.totals?.users || 0, icon: '👤', color: 'bg-blue-50 text-blue-600' },
    { label: 'Total Drivers', value: data?.totals?.drivers || 0, icon: '🚗', color: 'bg-green-50 text-green-600' },
    { label: 'Online Drivers', value: data?.totals?.onlineDrivers || 0, icon: '🟢', color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Total Rides', value: data?.totals?.rides || 0, icon: '🛺', color: 'bg-purple-50 text-purple-600' },
    { label: 'Today\'s Revenue', value: `₹${data?.today?.revenue || 0}`, icon: '💰', color: 'bg-yellow-50 text-yellow-600' },
    { label: 'Monthly Revenue', value: `₹${data?.month?.revenue || 0}`, icon: '📈', color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Pending Approvals', value: data?.totals?.pendingDrivers || 0, icon: '⏳', color: 'bg-orange-50 text-orange-600' },
    { label: 'Active Drivers', value: data?.totals?.activeDrivers || 0, icon: '✅', color: 'bg-teal-50 text-teal-600' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="card flex items-center">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${stat.color}`}>
              {stat.icon}
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue by vehicle type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Revenue by Vehicle Type</h2>
          <div className="space-y-4">
            {data?.revenueByVehicle?.map((item) => (
              <div key={item._id}>
                <div className="flex justify-between mb-1">
                  <span className="capitalize">{item._id}</span>
                  <span className="font-medium">₹{item.revenue}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, (item.revenue / Math.max(...data.revenueByVehicle.map(v => v.revenue))) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent rides */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Recent Rides</h2>
            <Link to="/rides" className="text-primary-600 text-sm hover:underline">View all</Link>
          </div>
          <div className="space-y-3">
            {data?.recentRides?.slice(0, 6).map((ride) => (
              <div key={ride._id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="font-medium">{ride.rideNumber}</p>
                  <p className="text-xs text-gray-500">
                    {ride.customerId?.name || 'Customer'} → {ride.driverId?.name || 'Driver'}
                  </p>
                </div>
                <span className={`badge ${ride.status === 'completed' ? 'badge-green' : 'badge-yellow'}`}>
                  {ride.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;