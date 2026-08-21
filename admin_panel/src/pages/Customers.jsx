import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getCustomers, blockCustomer } from '../api';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data } = await getCustomers();
      setCustomers(data.data.customers || []);
    } catch (err) {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async (id, block) => {
    try {
      await blockCustomer(id, block);
      toast.success(block ? 'Customer blocked' : 'Customer unblocked');
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  const filtered = customers.filter(
    (c) =>
      !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.mobile?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Customer Management</h1>

      <div className="mb-6">
        <input
          className="input max-w-xs"
          placeholder="Search by name, mobile, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="pb-3 pr-4">Customer</th>
              <th className="pb-3 pr-4">Mobile</th>
              <th className="pb-3 pr-4">Email</th>
              <th className="pb-3 pr-4">Rides</th>
              <th className="pb-3 pr-4">Rating</th>
              <th className="pb-3 pr-4">Wallet</th>
              <th className="pb-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="py-8 text-center">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="7" className="py-8 text-center text-gray-500">No customers found</td></tr>
            ) : (
              filtered.map((customer) => (
                <tr key={customer._id} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium">{customer.name}</td>
                  <td className="py-3 pr-4">{customer.mobile}</td>
                  <td className="py-3 pr-4">{customer.email || 'N/A'}</td>
                  <td className="py-3 pr-4">{customer.totalRides || 0}</td>
                  <td className="py-3 pr-4">⭐ {customer.rating?.toFixed(1)}</td>
                  <td className="py-3 pr-4">₹{customer.walletBalance || 0}</td>
                  <td className="py-3">
                    <button
                      onClick={() => handleBlock(customer._id, !customer.isBlocked)}
                      className={`px-3 py-1 text-xs rounded-lg ${
                        customer.isBlocked
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {customer.isBlocked ? 'Unblock' : 'Block'}
                    </button>
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

export default Customers;