import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { broadcastNotification } from '../api';

const Broadcast = () => {
  const [audience, setAudience] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await broadcastNotification({ audience, title, body });
      toast.success(data.message || 'Notification sent');
      setTitle('');
      setBody('');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to send');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Broadcast Notification</h1>

      <div className="card max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="label">Audience</label>
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: 'all', label: '👥 Everyone' },
                { value: 'users', label: '👤 Customers' },
                { value: 'drivers', label: '🚗 Drivers' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAudience(option.value)}
                  className={`p-4 rounded-xl border-2 transition-colors ${
                    audience === option.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl block mb-2">{option.label.split(' ')[0]}</span>
                  <span className="font-medium">{option.label.split(' ').slice(1).join(' ')}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Notification Title</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 50% OFF on your next ride!"
              maxLength={100}
              required
            />
          </div>

          <div>
            <label className="label">Message</label>
            <textarea
              className="input min-h-[120px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Enter your message here..."
              maxLength={500}
              required
            />
          </div>

          <div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Sending...' : '📢 Send Notification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Broadcast;