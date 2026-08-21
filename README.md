# 🚖 RIDEAPP — Ride-Hailing Platform (Rapido/Ola/Uber Clone)

A complete ride-hailing platform for **tier-2/tier-3 cities in India**, letting users book **Bike, Auto, Cab Mini, and Cab Sedan** rides at **fair, transparent pricing**.

## 📱 Applications

| Application | Technology | Directory |
|---|---|---|
| **Customer App** | Flutter (Provider) | `customer_app/` |
| **Driver App** | Flutter (Provider) | `driver_app/` |
| **Admin Panel** | React + Vite + Tailwind | `admin_panel/` |
| **Backend API** | Node.js + Express + MongoDB + Socket.IO | `backend/` |

---

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Customer   │     │   Driver    │     │    Admin    │
│  App        │◄───►│    App      │◄───►│    Panel    │
│  (Flutter)  │     │  (Flutter)  │     │   (React)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                          ▼
              ┌─────────────────────┐
              │  Node.js + Express  │
              │      Backend API    │
              │  Socket.IO (Realtime)│
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │      MongoDB        │
              │   (MongoDB Atlas)   │
              └─────────────────────┘
```

---

## 🚀 Setup Instructions

### Prerequisites

- **Node.js** ≥ 18.x
- **MongoDB** (local or [MongoDB Atlas](https://www.mongodb.com/atlas))
- **Flutter SDK** ≥ 3.0 (for mobile apps)
- **Android Studio / Xcode** (for running Flutter apps)

---

## 1️⃣ Backend Setup

### Installation

```bash
cd backend
npm install
```

### Configuration

```bash
# Copy the example env file
cp .env.example .env
```

Edit `.env` and set:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/rideapp` |
| `JWT_SECRET` | Secret for JWT signing | `your_jwt_secret_key_here` |
| `RAZORPAY_KEY_ID` | Razorpay payment key | *(optional for dev)* |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | *(optional for dev)* |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary for file uploads | *(optional for dev)* |
| `TWILIO_ACCOUNT_SID` | Twilio for SMS OTP | *(optional for dev)* |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key | *(optional for dev)* |

### Run the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The server will:
1. Connect to MongoDB
2. Create the `2dsphere` index on `drivers.currentLocation`
3. **Auto-seed** default data:
   - Default admin: **admin@rideapp.com** / **Admin@123**
   - Pricing rules for 8 Indian cities × 4 vehicle types

### Verify

```
GET http://localhost:5000/health
```

Expected response:
```json
{
  "success": true,
  "message": "RIDEAPP API is running",
  "timestamp": "..."
}
```

### Socket.IO Events

| Event | Direction | Description |
|---|---|---|
| `driver:locationUpdate` | Driver → Server | Driver location every 3-5 sec |
| `ride:newRequest` | Server → Driver | New ride request (15s to respond) |
| `ride:accepted` | Server → Customer | Driver accepted the ride |
| `ride:statusUpdate` | Server → Customer | arrived/started/completed |
| `ride:driverLocation` | Server → Customer | Live driver position during approach & trip |
| `ride:cancelled` | Server → Both | Ride cancelled |
| `admin:driverLocation` | Server → Admin | Live map of drivers |
| `admin:sosAlert` | Server → Admin | SOS alert triggered |

---

## 2️⃣ Customer App (Flutter)

### Installation

```bash
cd customer_app
flutter pub get
```

### Configuration

Edit `lib/config/app_config.dart`:

```dart
class AppConfig {
  // For Android emulator use 10.0.2.2, for iOS simulator use localhost
  static const String apiBaseUrl = 'http://localhost:5000/api';
  static const String socketUrl = 'http://localhost:5000';

  // Your Google Maps API key
  static const String googleMapsApiKey = 'YOUR_GOOGLE_MAPS_API_KEY';

  // Your Razorpay key
  static const String razorpayKeyId = 'YOUR_RAZORPAY_KEY_ID';
}
```

### Run

```bash
flutter run
```

### Features Implemented

- ✅ Mobile + OTP login
- ✅ Profile setup (name, email, gender)
- ✅ Map with current location detection
- ✅ Pickup & drop selection (tap on map)
- ✅ Vehicle selection: Bike / Auto / Cab Mini / Cab Sedan
- ✅ **Transparent fare breakdown** before booking
- ✅ Book ride → live driver matching
- ✅ Live driver tracking (Socket.IO)
- ✅ OTP display for ride start verification
- ✅ Trip status tracking (searching → accepted → arrived → started → completed)
- ✅ Cancel ride
- ✅ Wallet, Promos, SOS contacts (in menu)

---

## 3️⃣ Driver App (Flutter)

### Installation

```bash
cd driver_app
flutter pub get
```

### Configuration

Edit `lib/config/app_config.dart` (same as customer app).

### Run

```bash
flutter run
```

### Features Implemented

- ✅ Mobile + OTP login
- ✅ Vehicle registration (type, number, model)
- ✅ Online/Offline toggle (admin approval required)
- ✅ Live ride request popup with 15-second countdown
- ✅ Accept / Decline ride requests
- ✅ Navigate to pickup → Mark arrived
- ✅ Enter customer OTP to start trip
- ✅ Complete trip with payment mode (cash/UPI/wallet)
- ✅ Earnings dashboard (today/week/month)
- ✅ Wallet balance & recent transactions
- ✅ Ride history
- ✅ Bank details & payout requests

---

## 4️⃣ Admin Panel (React)

### Installation

```bash
cd admin_panel
npm install
```

### Run

```bash
npm run dev
```

Admin panel runs at **http://localhost:3000**.

### Login

```
Email: admin@rideapp.com
Password: Admin@123
```

### Features Implemented

- ✅ **Dashboard** — total users, drivers, rides, revenue, pending approvals
- ✅ **Driver Management** — approve/reject documents, block/unblock, view details & documents
- ✅ **Customer Management** — view and block/unblock customers
- ✅ **Ride Management** — filter by status, search, view all rides
- ✅ **Fare & Pricing** — per city/vehicle type: base fare, per-km, per-min, min fare, surge, night charges
- ✅ **Promo Codes** — create/edit/delete (percentage or fixed, min fare, expiry, usage limits)
- ✅ **Reports** — revenue reports with date filter, daily breakdown, driver performance
- ✅ **Broadcast** — push notification to all customers, all drivers, or everyone

---

## 🔗 Postman Collection

Import `postman/RIDEAPP.postman_collection.json` into Postman:

1. Open Postman → **Import** → Select the file
2. Set collection variable `baseUrl` if needed (default: `http://localhost:5000/api`)
3. Start with **Auth → Send OTP** — in development the OTP is printed in the server console
4. **Verify OTP** will auto-save the JWT token for all subsequent requests
5. **Admin Login** will auto-save the admin token

---

## 💡 Key API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/send-otp` | Send OTP to mobile |
| POST | `/api/auth/verify-otp` | Verify OTP & login |
| POST | `/api/auth/register` | Complete customer profile |
| POST | `/api/auth/driver/register` | Complete driver profile |

### Rides
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/rides/estimate-fare` | Transparent fare estimation |
| POST | `/api/rides/book` | Book a ride |
| GET | `/api/rides/:id` | Get ride details |
| POST | `/api/rides/:id/cancel` | Cancel ride |
| POST | `/api/rides/:id/rate` | Rate ride |
| GET | `/api/rides/history` | Ride history |

### Driver
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/driver/toggle-status` | Go online/offline |
| POST | `/api/driver/documents/upload` | Upload license/RC/insurance |
| POST | `/api/driver/rides/:id/accept` | Accept ride |
| POST | `/api/driver/rides/:id/start` | Start trip (verify OTP) |
| POST | `/api/driver/rides/:id/complete` | Complete trip |
| GET | `/api/driver/earnings` | Earnings dashboard |

### Admin
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/dashboard` | Dashboard stats |
| PUT | `/api/admin/drivers/:id/approve` | Approve/reject driver |
| POST | `/api/admin/pricing` | Create/edit pricing rule |
| POST | `/api/admin/promo` | Create promo code |
| GET | `/api/admin/reports/revenue` | Revenue report |
| POST | `/api/admin/broadcast` | Push notification broadcast |

---

## 🧮 Fare Calculation

```
fare = baseFare + (distanceKm × perKmRate) + (durationMin × perMinRate)
fare = fare × surgeMultiplier
fare = fare × nightChargeMultiplier (11 PM – 5 AM)
fare = max(fare, minFare)
```

All values are **admin-configurable per city & vehicle type** from the Admin Panel — this is the platform's key differentiator: **fair, transparent pricing**.

---

## 🔐 Default Credentials

| Role | Credentials |
|---|---|
| **Admin** | `admin@rideapp.com` / `Admin@123` |
| **Customer** | Any 10-digit Indian mobile number. OTP is printed in server console (dev mode) |
| **Driver** | Any 10-digit Indian mobile number. OTP is printed in server console (dev mode) |

> Note: In development, OTPs are logged to the backend console. In production, use Twilio Verify or your SMS gateway.

---

## 📁 Project Structure

```
RIDEAPP/
├── backend/               # Node.js + Express + MongoDB + Socket.IO
│   ├── config/            # db, socket, cloudinary config
│   ├── controllers/       # auth, rides, driver, customer, admin, payments
│   ├── middlewares/       # auth, roleCheck, errorHandler
│   ├── models/            # User, Driver, Ride, Payment, Wallet, Promo, Admin, PricingRule
│   ├── routes/            # API route definitions
│   ├── services/          # pricingEngine, matchingEngine, otpService, notificationService
│   ├── sockets/           # rideSocket (real-time events)
│   ├── utils/             # logger, seed
│   └── server.js
├── customer_app/          # Flutter customer app
│   └── lib/
│       ├── config/
│       ├── providers/     # auth, ride, location, socket
│       ├── screens/       # splash, auth, home
│       ├── services/      # api, socket
│       └── widgets/
├── driver_app/            # Flutter driver app
│   └── lib/
│       ├── config/
│       ├── providers/     # auth, ride, location, socket
│       ├── screens/       # splash, auth, home
│       └── services/      # api, socket
├── admin_panel/           # React + Vite + Tailwind admin panel
│   └── src/
│       ├── components/    # Layout
│       ├── pages/         # Dashboard, Drivers, Rides, Pricing, Promos, Reports, Broadcast
│       └── api.js
└── postman/
    └── RIDEAPP.postman_collection.json
```

---

## 🚢 Deployment (Production)

### Backend → Render

1. Push the `backend/` folder to GitHub
2. Create a new **Web Service** on Render
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables from `.env.example`

### Database → MongoDB Atlas

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Whitelist your IPs
3. Get the connection string and update `MONGODB_URI`

### Flutter Apps

- Add `google-services.json` (Android) / `GoogleService-Info.plist` (iOS) for FCM
- Update API URLs in `app_config.dart` to your hosted backend
- Build with: `flutter build apk` / `flutter build ios`

### Admin Panel

```bash
cd admin_panel
npm run build
# Deploy the dist/ folder to Netlify/Vercel/Any static host
```
