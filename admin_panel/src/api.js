import axios from 'axios';

const API = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

const requireId = (id, resourceName) => {
  if (id === undefined || id === null || id === '' || id === 'undefined') {
    throw new Error(`Invalid ${resourceName} id`);
  }
  return id;
};

// Attach token to requests
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const loginAdmin = (email, password) => API.post('/auth/admin/login', { email, password });

// Dashboard
export const getDashboard = () => API.get('/admin/dashboard');

// Drivers
export const getDrivers = (params) => API.get('/admin/drivers', { params });
export const getDriverDetails = (id) => API.get(`/admin/drivers/${requireId(id, 'driver')}`);
export const approveDriver = (id, approve, rejectionReason) =>
  API.put(`/admin/drivers/${requireId(id, 'driver')}/approve`, { approve, rejectionReason });
export const blockDriver = (id, block) => API.put(`/admin/drivers/${requireId(id, 'driver')}/block`, { block });

// Customers
export const getCustomers = (params) => API.get('/admin/customers', { params });
export const blockCustomer = (id, block) => API.put(`/admin/customers/${requireId(id, 'customer')}/block`, { block });

// Rides
export const getRides = (params) => API.get('/admin/rides', { params });
export const getLiveRides = () => API.get('/admin/rides/live');

// Pricing
export const getPricingRules = () => API.get('/admin/pricing');
export const createPricingRule = (data) => API.post('/admin/pricing', data);
export const updatePricingRule = (id, data) => API.put(`/admin/pricing/${id}`, data);
export const deletePricingRule = (id) => API.delete(`/admin/pricing/${requireId(id, 'pricing')}`);

// Promos
export const getPromos = () => API.get('/admin/promos');
export const createPromo = (data) => API.post('/admin/promo', data);
export const updatePromo = (id, data) => API.put(`/admin/promo/${requireId(id, 'promo')}`, data);
export const deletePromo = (id) => API.delete(`/admin/promo/${requireId(id, 'promo')}`);

// Reports
export const getRevenueReport = (params) => API.get('/admin/reports/revenue', { params });
export const getDriverReport = () => API.get('/admin/reports/drivers');

// Broadcast
export const broadcastNotification = (data) => API.post('/admin/broadcast', data);

export default API;