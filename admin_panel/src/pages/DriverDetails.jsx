import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getDriverDetails, approveDriver, blockDriver } from '../api';

const DriverDetails = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDriver();
  }, [id]);

  const loadDriver = async () => {
    if (!id || id === 'undefined') {
      toast.error('Invalid driver id');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await getDriverDetails(id);
      setData(data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed to load driver');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      await approveDriver(id, true);
      toast.success('Driver approved');
      loadDriver();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed');
    }
  };

  const handleReject = async () => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    try {
      await approveDriver(id, false, reason);
      toast.success('Driver rejected');
      loadDriver();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed');
    }
  };

  const handleBlock = async () => {
    try {
      await blockDriver(id, !data?.driver?.isBlocked);
      toast.success('Status updated');
      loadDriver();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed');
    }
  };

  if (loading) return <div className="text-center py-20">Loading...</div>;
  if (!data) return <div className="text-center py-20">Driver not found</div>;

  const driver = data.driver;

  return (
    <div>
      <Link to="/drivers" className="text-primary-600 hover:underline mb-4 inline-block">← Back to Drivers</Link>
      <h1 className="text-2xl font-bold mb-6">{driver.name}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Driver info */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Driver Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Mobile</p>
              <p className="font-medium">{driver.mobile}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">{driver.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Rating</p>
              <p className="font-medium">⭐ {driver.rating?.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Trips</p>
              <p className="font-medium">{driver.totalTrips || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Earnings</p>
              <p className="font-medium">₹{driver.totalEarnings || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Wallet Balance</p>
              <p className="font-medium">₹{driver.walletBalance || 0}</p>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            {!driver.isApproved && (
              <>
                <button onClick={handleApprove} className="btn-primary flex-1">Approve</button>
                <button onClick={handleReject} className="btn-danger flex-1">Reject</button>
              </>
            )}
            <button onClick={handleBlock} className="btn-secondary flex-1">
              {driver.isBlocked ? 'Unblock' : 'Block'}
            </button>
          </div>
        </div>

        {/* Vehicle info */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Vehicle Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Type</p>
              <p className="font-medium capitalize">{driver.vehicle?.type}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Number</p>
              <p className="font-medium">{driver.vehicle?.number}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Model</p>
              <p className="font-medium">{driver.vehicle?.model || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Color</p>
              <p className="font-medium">{driver.vehicle?.color || 'N/A'}</p>
            </div>
          </div>

          <h2 className="text-lg font-semibold mt-6 mb-4">Documents</h2>
          <div className="space-y-3">
            {['license', 'rc', 'insurance', 'aadhaar'].map((doc) => (
              <div key={doc} className="flex items-center justify-between">
                <span className="capitalize">{doc}</span>
                {driver.documents?.[doc]?.url ? (
                  <a
                    href={driver.documents[doc].url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-600 text-sm hover:underline"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-gray-400 text-sm">Not uploaded</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent rides */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Rides</h2>
          <div className="space-y-3">
            {data.recentRides?.length === 0 ? (
              <p className="text-gray-500 text-sm">No rides yet</p>
            ) : (
              data.recentRides?.map((ride) => (
                <div key={ride._id} className="border-b border-gray-100 pb-3">
                  <div className="flex justify-between">
                    <span className="font-medium">{ride.rideNumber}</span>
                    <span className={`badge ${ride.status === 'completed' ? 'badge-green' : 'badge-yellow'}`}>
                      {ride.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(ride.createdAt).toLocaleDateString()} · ₹{ride.finalFare || 'N/A'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverDetails;