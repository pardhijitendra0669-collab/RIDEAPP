import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getRides } from '../api';

const Rides = () => {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadRides();
  }, [filter]);

  const loadRides = async () => {
    setLoading(true);
    try {
      const { data } = await getRides({ status: filter !== 'all' ? filter : undefined });
      setRides(data.data.rides || []);
    } catch (err) {
      toast.error('Failed to load rides');
    } finally {
      setLoading(false);
    }
  };

  const filtered = rides.filter(
    (r) =>
      !search ||
      r.rideNumber?.toLowerCase().includes(search.toLowerCase()) ||
      r.pickupLocation?.address?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Ride Management</h1>

      <div className="flex items-center gap-4 mb-6">
        <select
          className="input w-48"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All Rides</option>
          <option value="completed">Completed</option>
          <option value="started">In Progress</option>
          <option value="accepted">Accepted</option>
          <option value="searching">Searching</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_driver_found">No Driver</option>
        </select>

        <input
          className="input max-w-xs"
          placeholder="Search by ride number, location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="pb-3 pr-4">Ride</th>
              <th className="pb-3 pr-4">Vehicle</th>
              <th className="pb-3 pr-4">Customer</th>
              <th className="pb-3 pr-4">Driver</th>
              <th className="pb-3 pr-4">Fare</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="py-8 text-center">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="7" className="py-8 text-center text-gray-500">No rides found</td></tr>
            ) : (
              filtered.map((ride) => (
                <tr key={ride._id} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium">{ride.rideNumber}</td>
                  <td className="py-3 pr-4 capitalize">{ride.vehicleType}</td>
                  <td className="py-3 pr-4">{ride.customerId?.name || 'N/A'}</td>
                  <td className="py-3 pr-4">{ride.driverId?.name || 'N/A'}</td>
                  <td className="py-3 pr-4">₹{ride.finalFare || ride.fareEstimate?.estimatedFare || 'N/A'}</td>
                  <td className="py-3 pr-4">
                    <span className={`badge ${
                      ride.status === 'completed' ? 'badge-green' :
                      ride.status === 'cancelled' ? 'badge-red' :
                      ride.status === 'started' ? 'badge-blue' :
                      'badge-yellow'
                    }`}>
                      {ride.status}
                    </span>
                  </td>
                  <td className="py-3">{new Date(ride.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Rides;