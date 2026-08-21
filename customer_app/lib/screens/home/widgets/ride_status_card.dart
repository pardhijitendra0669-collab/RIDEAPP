import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../../utils/web_maps_loader.dart'
  if (dart.library.html) '../../../utils/web_maps_loader_web.dart' as web_maps_loader;
import '../../../providers/ride_provider.dart';

class RideStatusCard extends StatelessWidget {
  final RideProvider rideProvider;
  final VoidCallback onCancel;
  final VoidCallback? onDismiss;

  const RideStatusCard({
    super.key,
    required this.rideProvider,
    required this.onCancel,
    this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final status = rideProvider.rideStatus;
    final driver = rideProvider.driver;
    final ride = rideProvider.currentRide;
    final canRenderMap = !kIsWeb || web_maps_loader.isGoogleMapsLoaded();

    return Scaffold(
      body: Stack(
        children: [
          // Map with driver location
          if (!canRenderMap)
            Container(color: const Color(0xFFF3F4F6))
          else if (rideProvider.driverLat != null && rideProvider.driverLng != null)
            GoogleMap(
              initialCameraPosition: CameraPosition(
                target: LatLng(rideProvider.driverLat!, rideProvider.driverLng!),
                zoom: 15,
              ),
              markers: {
                Marker(
                  markerId: const MarkerId('driver'),
                  position: LatLng(rideProvider.driverLat!, rideProvider.driverLng!),
                  icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueBlue),
                  infoWindow: const InfoWindow(title: 'Driver'),
                ),
              },
            )
          else
            Container(color: Colors.grey[200]),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Align(
                alignment: Alignment.topLeft,
                child: Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  elevation: 2,
                  child: IconButton(
                    icon: const Icon(Icons.arrow_back),
                    tooltip: 'Back to home',
                    onPressed: onDismiss,
                  ),
                ),
              ),
            ),
          ),

          // Status card
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Status indicator
                  _buildStatusHeader(status),
                  const SizedBox(height: 16),

                  // Trip addresses
                  if (ride != null) ...[
                    _buildRideAddressInfo(ride),
                    const SizedBox(height: 16),
                  ],

                  // Driver info (if accepted)
                  if (driver != null) ...[
                    _buildDriverInfo(driver),
                    const SizedBox(height: 16),
                  ],

                  // OTP display
                  if (status == 'accepted' || status == 'arrived') ...[
                    _buildOtpDisplay(ride?['otp']?.toString() ?? ''),
                    const SizedBox(height: 16),
                  ],

                  // Cancel button (only while ride is not yet started)
                  if (status == 'searching' || status == 'accepted' || status == 'arrived')
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: onCancel,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: const BorderSide(color: Colors.red),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: const Text('Cancel Ride'),
                      ),
                    ),

                  // Done button for terminal states
                  if (status == 'completed' || status == 'cancelled' || status == 'no_driver_found')
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: onDismiss,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: status == 'completed' ? Colors.green : Colors.grey[700],
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: Text(status == 'completed' ? 'Done' : 'Go Back'),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusHeader(String? status) {
    final statusInfo = _getStatusInfo(status);
    return Row(
      children: [
        Icon(statusInfo['icon'] as IconData, color: statusInfo['color'] as Color, size: 32),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                statusInfo['title'] as String,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              Text(
                statusInfo['subtitle'] as String,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: Colors.grey[600]),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildRideAddressInfo(Map<String, dynamic> ride) {
    final pickup = _extractAddress(ride['pickupLocation']);
    final drop = _extractAddress(ride['dropLocation']);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          _addressRow(
            icon: Icons.trip_origin,
            color: Colors.green,
            label: 'From',
            value: pickup,
          ),
          const SizedBox(height: 8),
          _addressRow(
            icon: Icons.place,
            color: Colors.red,
            label: 'To',
            value: drop,
          ),
        ],
      ),
    );
  }

  Widget _addressRow({
    required IconData icon,
    required Color color,
    required String label,
    required String value,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(fontSize: 11, color: Colors.grey[600]),
              ),
              Text(
                value,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _extractAddress(dynamic point) {
    if (point is Map<String, dynamic>) {
      final address = point['address'];
      if (address is String && address.trim().isNotEmpty) {
        return address.trim();
      }
    }
    return 'Address unavailable';
  }

  Map<String, dynamic> _getStatusInfo(String? status) {
    switch (status) {
      case 'searching':
        return {
          'title': 'Searching for drivers...',
          'subtitle': 'Finding the nearest driver for you',
          'icon': Icons.search,
          'color': Colors.orange,
        };
      case 'accepted':
        return {
          'title': 'Driver on the way!',
          'subtitle': 'Your driver is heading to pickup',
          'icon': Icons.directions_car,
          'color': Colors.blue,
        };
      case 'arrived':
        return {
          'title': 'Driver has arrived!',
          'subtitle': 'Please share the OTP with your driver',
          'icon': Icons.place,
          'color': Colors.green,
        };
      case 'started':
        return {
          'title': 'Trip in progress',
          'subtitle': 'Enjoy your ride! Stay safe.',
          'icon': Icons.navigation,
          'color': Colors.blue,
        };
      case 'completed':
        return {
          'title': 'Trip completed!',
          'subtitle': 'Thank you for riding with us',
          'icon': Icons.check_circle,
          'color': Colors.green,
        };
      case 'no_driver_found':
        return {
          'title': 'No drivers available',
          'subtitle': 'Please try again in a few minutes',
          'icon': Icons.error_outline,
          'color': Colors.red,
        };
      default:
        return {
          'title': 'Ride status',
          'subtitle': 'Please wait...',
          'icon': Icons.info_outline,
          'color': Colors.grey,
        };
    }
  }

  Widget _buildDriverInfo(Map<String, dynamic> driver) {
    final vehicle = driver['vehicle'] ?? {};
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: Colors.blue,
            child: Text(
              (driver['name'] ?? 'D').toString().substring(0, 1).toUpperCase(),
              style: const TextStyle(color: Colors.white, fontSize: 18),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  driver['name']?.toString() ?? 'Driver',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                Text(
                  '${vehicle['type']?.toString() ?? ''} • ${vehicle['number']?.toString() ?? ''}',
                  style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                ),
              ],
            ),
          ),
          Column(
            children: [
              const Icon(Icons.star, color: Colors.amber, size: 20),
              Text(
                '${driver['rating']?.toString() ?? '5.0'}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildOtpDisplay(String otp) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blue.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.blue),
      ),
      child: Column(
        children: [
          const Text(
            'Share this OTP with your driver',
            style: TextStyle(fontSize: 13, color: Colors.grey),
          ),
          const SizedBox(height: 8),
          Text(
            otp,
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.bold,
              letterSpacing: 8,
              color: Colors.blue,
            ),
          ),
        ],
      ),
    );
  }
}