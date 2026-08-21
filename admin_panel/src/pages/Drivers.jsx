import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getDrivers, approveDriver, blockDriver } from '../api';

const Drivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadDrivers();
  }, [filter]);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const { data } = await getDrivers({ status: filter !== 'all' ? filter : undefined });
      setDrivers(data.data.drivers || []);
    } catch (err) {
      toast.error('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await approveDriver(id, true);
      toast.success('Driver approved');
      loadDrivers();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed');
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    try {
      await approveDriver(id, false, reason);
      toast.success('Driver rejected');
      loadDrivers();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed');
    }
  };

  const handleBlock = async (id, block) => {
    try {
      await blockDriver(id, block);
      toast.success(block ? 'Driver blocked' : 'Driver unblocked');
      loadDrivers();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed');
    }
  };

  const filteredDrivers = drivers.filter(
    (d) =>
      !search ||
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.mobile?.includes(search) ||
      d.vehicle?.number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Driver Management</h1>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <select
          className="input w-48"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All Drivers</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="blocked">Blocked</option>
          <option value="online">Online</option>
        </select>

        <input
          className="input max-w-xs"
          placeholder="Search by name, mobile, vehicle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Drivers table */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="pb-3 pr-4">Driver</th>
              <th className="pb-3 pr-4">Mobile</th>
              <th className="pb-3 pr-4">Vehicle</th>
              <th className="pb-3 pr-4">Rating</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3 pr-4">Trips</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="py-8 text-center">Loading...</td></tr>
            ) : filteredDrivers.length === 0 ? (
              <tr><td colSpan="7" className="py-8 text-center text-gray-500">No drivers found</td></tr>
            ) : (
              filteredDrivers.map((driver) => (
                <tr key={driver.id || driver._id} className="border-b border-gray-100">
                  <td className="py-3 pr-4">
                    <Link to={`/drivers/${driver.id || driver._id}`} className="font-medium hover:text-primary-600">
                      {driver.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{driver.mobile}</td>
                  <td className="py-3 pr-4">
                    <span className="capitalize">{driver.vehicle?.type}</span>
                    <span className="text-gray-500 text-sm"> · {driver.vehicle?.number}</span>
                  </td>
                  <td className="py-3 pr-4">⭐ {driver.rating?.toFixed(1)}</td>
                  <td className="py-3 pr-4">
                    {driver.isBlocked ? (
                      <span className="badge badge-red">Blocked</span>
                    ) : driver.isApproved ? (
                      <span className="badge badge-green">
                        {driver.isOnline ? 'Online' : 'Approved'}
                      </span>
                    ) : driver.documents?.verificationStatus === 'rejected' ? (
                      <span className="badge badge-red">Rejected</span>
                    ) : (
                      <span className="badge badge-yellow">Pending</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">{driver.totalTrips || 0}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      {!driver.isApproved && (
                        <>
                          <button
                            onClick={() => handleApprove(driver.id || driver._id)}
                            className="btn-primary px-3 py-1 text-xs"
                          >
                            Approve
                          </button>
                          {driver.documents?.verificationStatus === 'submitted' && (
                            <button
                              onClick={() => handleReject(driver.id || driver._id)}
                              className="btn-danger px-3 py-1 text-xs"
                            >
                              Reject
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => handleBlock(driver.id || driver._id, !driver.isBlocked)}
                        className={`px-3 py-1 text-xs rounded-lg ${
                          driver.isBlocked
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {driver.isBlocked ? 'Unblock' : 'Block'}
                      </button>
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

export default Drivers;