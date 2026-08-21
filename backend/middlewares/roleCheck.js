const { AppError } = require('./errorHandler');

/**
 * Check if user has required role
 */
const checkRole = (...roles) => {
  return (req, res, next) => {
    const userRole = req.userType;
    if (!roles.includes(userRole)) {
      return next(new AppError(`Access denied. Required role: ${roles.join(', ')}`, 403));
    }
    next();
  };
};

/**
 * Check if admin has required permission
 */
const checkPermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.admin) {
      return next(new AppError('Admin authentication required', 401));
    }

    // Super admin has all permissions
    if (req.admin.role === 'super_admin') {
      return next();
    }

    const hasPermission = permissions.some((perm) => req.admin.permissions.includes(perm));
    if (!hasPermission) {
      return next(new AppError(`Access denied. Required permission: ${permissions.join(', ')}`, 403));
    }
    next();
  };
};

module.exports = {
  checkRole,
  checkPermission,
};