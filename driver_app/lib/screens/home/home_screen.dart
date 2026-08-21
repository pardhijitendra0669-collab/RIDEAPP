import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:provider/provider.dart';
import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../config/app_config.dart';
import '../../utils/web_maps_loader.dart'
  if (dart.library.html) '../../utils/web_maps_loader_web.dart' as web_maps_loader;
import '../../providers/auth_provider.dart';
import '../../providers/ride_provider.dart';
import '../../providers/location_provider.dart';
import '../../providers/socket_provider.dart';
import '../../services/api_service.dart';
import 'widgets/ride_request_popup.dart';
import 'widgets/trip_flow_screen.dart';
import 'widgets/earnings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Timer? _locationTimer;
  bool _isLoading = false;
  bool _isMapReady = !kIsWeb;

  bool get _canRenderMap {
    if (!kIsWeb) return true;
    return _isMapReady;
  }

  @override
  void initState() {
    super.initState();
    _prepareWebMaps();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _initialize();
      }
    });
  }

  Future<void> _prepareWebMaps() async {
    if (!kIsWeb) return;
    final ready = await web_maps_loader.ensureGoogleMapsLoaded(AppConfig.googleMapsApiKey);
    if (!mounted) return;
    setState(() {
      _isMapReady = ready;
    });
  }

  Future<void> _initialize() async {
    final socketProvider = Provider.of<SocketProvider>(context, listen: false);
    final rideProvider = Provider.of<RideProvider>(context, listen: false);
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final locationProvider = Provider.of<LocationProvider>(context, listen: false);

    // Get current location
    await locationProvider.getCurrentLocation();

    // Restore any active trip the driver may have been on before app restart
    await rideProvider.restoreActiveRide();

    // New ride request — only handled when driver has no active trip (guarded in provider too)
    socketProvider.onRideEvent('ride:newRequest', (data) {
      rideProvider.handleNewRequest(Map<String, dynamic>.from(data as Map));
    });

    // Backend status updates (arrived, started, completed from other side)
    socketProvider.onRideEvent('ride:statusUpdate', (data) {
      rideProvider.handleRideStatus(Map<String, dynamic>.from(data as Map));
    });

    socketProvider.onRideEvent('ride:cancelled', (data) {
      rideProvider.handleRideCancelled();
    });

    // Start location streaming if online
    if (authProvider.isOnline) {
      _startLocationStreaming();
    }
  }

  void _startLocationStreaming() {
    _locationTimer?.cancel();
    _sendLocationUpdate();
    _locationTimer = Timer.periodic(const Duration(seconds: 4), (_) => _sendLocationUpdate());
  }

  Future<void> _sendLocationUpdate() async {
    if (!mounted) return;

    final locationProvider = Provider.of<LocationProvider>(context, listen: false);
    final socketProvider = Provider.of<SocketProvider>(context, listen: false);
    final apiService = Provider.of<ApiService>(context, listen: false);

    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      locationProvider.updatePosition(position);

      await apiService.updateLocation(position.latitude, position.longitude);

      if (socketProvider.isConnected) {
        socketProvider.emit('driver:locationUpdate', {
          'lat': position.latitude,
          'lng': position.longitude,
        });
      }
    } catch (e) {
      debugPrint('Driver location update error: $e');
    }
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final rideProvider = Provider.of<RideProvider>(context);
    final locationProvider = Provider.of<LocationProvider>(context);
    final driver = authProvider.driver ?? {};
    final currentPosition = locationProvider.currentPosition;
    final hasGpsFix = currentPosition != null;
    final totalEarnings = driver['totalEarnings'] ?? 0;
    final todayEarnings = driver['todayEarnings'] ?? 0;
    final totalTrips = driver['totalTrips'] ?? 0;

    // Active trip takes priority — never interrupt it with a new request popup
    if (rideProvider.hasActiveRide) {
      return TripFlowScreen(
        rideProvider: rideProvider,
        locationProvider: locationProvider,
      );
    }

    // If there's an incoming ride request, show the popup
    if (rideProvider.hasIncomingRequest) {
      return Scaffold(
        body: RideRequestPopup(
          request: rideProvider.incomingRequest!,
          timeLeft: rideProvider.responseTimeLeft,
          onAccept: () => rideProvider.acceptRide(),
          onReject: () => rideProvider.rejectRide(),
        ),
      );
    }

    return Scaffold(
      body: Stack(
        children: [
          // Map
          if (!_canRenderMap)
            _buildMapUnavailablePlaceholder()
          else if (locationProvider.currentPosition != null)
            GoogleMap(
              initialCameraPosition: CameraPosition(
                target: LatLng(
                  locationProvider.currentPosition!.latitude,
                  locationProvider.currentPosition!.longitude,
                ),
                zoom: 15,
              ),
              myLocationEnabled: true,
              myLocationButtonEnabled: false,
            )
          else
            const Center(child: CircularProgressIndicator()),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  return SingleChildScrollView(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(minHeight: constraints.maxHeight),
                      child: IntrinsicHeight(
                        child: Column(
                          children: [
                            _buildTopDashboardCard(
                              authProvider: authProvider,
                              hasGpsFix: hasGpsFix,
                              todayEarnings: todayEarnings,
                              totalEarnings: totalEarnings,
                              totalTrips: totalTrips,
                            ),
                            const SizedBox(height: 12),
                            _buildQuickGuidanceCard(authProvider),
                            const Spacer(),
                            _buildBottomStatusCard(
                              authProvider: authProvider,
                              hasGpsFix: hasGpsFix,
                              currentPosition: currentPosition,
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopDashboardCard({
    required AuthProvider authProvider,
    required bool hasGpsFix,
    required dynamic todayEarnings,
    required dynamic totalEarnings,
    required dynamic totalTrips,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.18),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: authProvider.isOnline ? const Color(0xFF22C55E) : const Color(0xFF64748B),
                child: Text(
                  (authProvider.driver?['name'] ?? 'D').toString().substring(0, 1).toUpperCase(),
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      authProvider.driver?['name']?.toString() ?? 'Driver workspace',
                      style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      hasGpsFix ? 'Live location active' : 'Waiting for GPS fix',
                      style: TextStyle(color: Colors.white.withOpacity(0.72), fontSize: 12),
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: _isLoading ? null : _toggleStatus,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: authProvider.isOnline ? const Color(0xFF16A34A) : const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        authProvider.isOnline ? Icons.circle : Icons.circle_outlined,
                        color: Colors.white,
                        size: 14,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        authProvider.isOnline ? 'ONLINE' : 'OFFLINE',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _dashboardStat(
                  icon: Icons.payments_outlined,
                  label: 'Today',
                  value: '₹$todayEarnings',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _dashboardStat(
                  icon: Icons.account_balance_wallet_outlined,
                  label: 'Total',
                  value: '₹$totalEarnings',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _dashboardStat(
                  icon: Icons.emoji_transportation_outlined,
                  label: 'Trips',
                  value: '$totalTrips',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuickGuidanceCard(AuthProvider authProvider) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.96),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: authProvider.isOnline ? const Color(0xFFE8F5E9) : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              authProvider.isOnline ? Icons.flash_on : Icons.pause_circle_outline,
              color: authProvider.isOnline ? const Color(0xFF16A34A) : const Color(0xFF64748B),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  authProvider.isOnline ? 'Ready for rides' : 'Go online to receive requests',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  authProvider.isApproved
                      ? (authProvider.isOnline
                          ? 'Stay online and keep GPS enabled to get nearby bookings.'
                          : 'Tap ONLINE to start receiving requests near you.')
                      : 'Your profile is still pending approval.',
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomStatusCard({
    required AuthProvider authProvider,
    required bool hasGpsFix,
    required Position? currentPosition,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 10,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                authProvider.isApproved ? Icons.check_circle : Icons.pending,
                color: authProvider.isApproved ? Colors.green : Colors.orange,
              ),
              const SizedBox(width: 8),
              Text(
                authProvider.isApproved
                    ? 'Ready to earn'
                    : 'Pending approval',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            authProvider.isApproved
                ? 'You can accept ride requests'
                : 'Your account is being reviewed by our team. You can go online once approved.',
            style: TextStyle(fontSize: 13, color: Colors.grey[600]),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _actionTile(
                  icon: Icons.receipt_long,
                  label: 'Earnings',
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const EarningsScreen(),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _actionTile(
                  icon: Icons.my_location,
                  label: 'GPS',
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          hasGpsFix
                              ? 'GPS active at ${currentPosition!.latitude.toStringAsFixed(4)}, ${currentPosition.longitude.toStringAsFixed(4)}'
                              : 'Waiting for GPS permission or fix',
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _dashboardStat({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: Colors.white.withOpacity(0.8), size: 18),
          const SizedBox(height: 10),
          Text(
            value,
            style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(color: Colors.white.withOpacity(0.65), fontSize: 11),
          ),
        ],
      ),
    );
  }

  Widget _actionTile({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: const Color(0xFF334155)),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF0F172A)),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMapUnavailablePlaceholder() {
    return Container(
      color: const Color(0xFFF3F4F6),
      alignment: Alignment.topCenter,
      padding: const EdgeInsets.only(top: 100, left: 20, right: 20),
      child: const Text(
        'Map is unavailable on web. Set a valid Google Maps API key in driver_app/lib/config/app_config.dart.',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: Color(0xFF374151),
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Future<void> _toggleStatus() async {
    setState(() => _isLoading = true);
    final authProvider = Provider.of<AuthProvider>(context, listen: false);

    try {
      await authProvider.toggleStatus();
      if (!mounted) return;
      if (authProvider.isOnline) {
        _startLocationStreaming();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You are now online')),
        );
      } else {
        _locationTimer?.cancel();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You are now offline')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }
}