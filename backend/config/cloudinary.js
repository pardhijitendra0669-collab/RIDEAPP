const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

/**
 * Cloudinary configuration for file uploads (driver documents, profile photos)
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Storage engine for driver documents organized per driver
 * e.g. drivers/{driverId}/license, drivers/{driverId}/rc
 */
const driverDocStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: `drivers/${req.driverId || req.user.id || 'pending'}/${file.fieldname}`,
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
    max_file_size: 5 * 1024 * 1024, // 5MB
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
  }),
});

/**
 * Storage engine for profile photos
 */
const profilePicStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: `profiles/${req.user?.id || req.driverId || 'user'}`,
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    max_file_size: 2 * 1024 * 1024, // 2MB
    transformation: [{ width: 500, height: 500, crop: 'limit', quality: 'auto' }],
  }),
});

const uploadDriverDoc = multer({ storage: driverDocStorage });
const uploadProfilePic = multer({ storage: profilePicStorage });

module.exports = {
  cloudinary,
  uploadDriverDoc,
  uploadProfilePic,
};