import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Drivers from './pages/Drivers';
import DriverDetails from './pages/DriverDetails';
import Customers from './pages/Customers';
import Rides from './pages/Rides';
import Pricing from './pages/Pricing';
import Promos from './pages/Promos';
import Reports from './pages/Reports';
import Broadcast from './pages/Broadcast';
import Layout from './components/Layout';

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('admin_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="drivers/:id" element={<DriverDetails />} />
        <Route path="customers" element={<Customers />} />
        <Route path="rides" element={<Rides />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="promos" element={<Promos />} />
        <Route path="reports" element={<Reports />} />
        <Route path="broadcast" element={<Broadcast />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;