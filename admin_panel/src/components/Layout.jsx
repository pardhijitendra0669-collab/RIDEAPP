import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/drivers', label: 'Drivers', icon: '🚗' },
  { to: '/customers', label: 'Customers', icon: '👤' },
  { to: '/rides', label: 'Rides', icon: '🛺' },
  { to: '/pricing', label: 'Pricing', icon: '💰' },
  { to: '/promos', label: 'Promos', icon: '🎟️' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/broadcast', label: 'Broadcast', icon: '📢' },
];

const Layout = () => {
  const navigate = useNavigate();
  const admin = JSON.parse(localStorage.getItem('admin_user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/login');
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-primary-800 text-white flex flex-col">
        <div className="p-6 border-b border-primary-700">
          <h1 className="text-xl font-bold">RIDEAPP</h1>
          <p className="text-primary-300 text-sm">Admin Panel</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-primary-200 hover:bg-primary-700'
                }`
              }
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-primary-700">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center font-bold">
              {admin.name?.[0] || 'A'}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">{admin.name || 'Admin'}</p>
              <p className="text-primary-300 text-xs">{admin.role || 'Admin'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left text-primary-200 hover:text-white text-sm"
          >
            ← Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;