import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:convert';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geocoding/geocoding.dart';
import 'package:http/http.dart' as http;
import '../../../config/app_config.dart';
import '../../../utils/web_maps_loader.dart'
  if (dart.library.html) '../../../utils/web_maps_loader_web.dart' as web_maps_loader;
import '../../../providers/ride_provider.dart';
import '../../../providers/location_provider.dart';

class TripFlowScreen extends StatefulWidget {
  final RideProvider rideProvider;
  final LocationProvider locationProvider;

  const TripFlowScreen({
    super.key,
    required this.rideProvider,
    required this.locationProvider,
  });

  @override
  State<TripFlowScreen> createState() => _TripFlowScreenState();
}

class _TripFlowScreenState extends State<TripFlowScreen> {
  final _otpController = TextEditingController();
  String _paymentMode = 'cash';
  bool _isLoading = false;
  final Map<String, Future<String>> _addressFutureCache = {};

  bool get _canRenderMap {
    if (!kIsWeb) return true;
    return web_maps_loader.isGoogleMapsLoaded();
  }

  @override
  void dispose() {
    _otpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.rideProvider.rideStatus;
    final ride = widget.rideProvider.currentRide ?? {};
    final pickup = ride['pickupLocation'] ?? {};
    final drop = ride['dropLocation'] ?? {};
    final pickupAddress = pickup['address']?.toString() ?? 'Pickup';
    final dropAddress = drop['address']?.toString() ?? 'Drop';
    final pickupCoords = _extractCoordinates(pickup);
    final dropCoords = _extractCoordinates(drop);

    return Scaffold(
      body: Stack(
        children: [
          // Map
          if (!_canRenderMap)
            Container(color: const Color(0xFFF3F4F6))
          else if (widget.locationProvider.currentPosition != null)
            GoogleMap(
              initialCameraPosition: CameraPosition(
                target: LatLng(
                  widget.locationProvider.currentPosition!.latitude,
                  widget.locationProvider.currentPosition!.longitude,
                ),
                zoom: 15,
              ),
              myLocationEnabled: true,
              myLocationButtonEnabled: false,
            )
          else
            Container(color: Colors.grey[200]),

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
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildStatusHeader(status),
                  const SizedBox(height: 16),

                  // Pickup/Drop info
                  _locationRow(Icons.trip_origin, Colors.green, pickupAddress, pickupCoords),
                  const SizedBox(height: 8),
                  _locationRow(Icons.place, Colors.red, dropAddress, dropCoords),
                  const SizedBox(height: 16),

                  // Status-specific content
                  if (status == 'accepted') _buildArrivedButton(),
                  if (status == 'arrived') _buildOtpSection(),
                  if (status == 'started') _buildCompleteSection(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusHeader(String? status) {
    final title = switch (status) {
      'accepted' => 'Navigate to pickup',
      'arrived' => 'Customer OTP required',
      'started' => 'Trip in progress',
      'completed' => 'Trip completed',
      _ => 'Trip',
    };
    final subtitle = switch (status) {
      'accepted' => 'Head to the pickup location',
      'arrived' => 'Ask customer for the OTP to start the trip',
      'started' => 'Drive to the drop location',
      'completed' => 'Fare summary',
      _ => '',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        Text(
          subtitle,
          style: TextStyle(fontSize: 13, color: Colors.grey[600]),
        ),
      ],
    );
  }

  Widget _locationRow(IconData icon, Color color, String label, List<double>? coords) {
    return Row(
      children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(width: 8),
        Expanded(
          child: FutureBuilder<String>(
            future: _addressFutureFor(label, coords),
            builder: (context, snapshot) {
              final text = snapshot.data ?? label;
              return Text(
                text,
                style: const TextStyle(fontSize: 14),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              );
            },
          ),
        ),
      ],
    );
  }

  Future<String> _addressFutureFor(String label, List<double>? coords) {
    final key = '$label|${coords?.join(',') ?? ''}';
    return _addressFutureCache.putIfAbsent(key, () => _resolveAddressLabel(label, coords));
  }

  List<double>? _extractCoordinates(dynamic locationObj) {
    if (locationObj is! Map) return null;
    final location = locationObj['location'];
    if (location is! Map) return null;
    final coordinates = location['coordinates'];
    if (coordinates is! List || coordinates.length < 2) return null;

    final lng = (coordinates[0] as num?)?.toDouble();
    final lat = (coordinates[1] as num?)?.toDouble();
    if (lat == null || lng == null) return null;

    return [lat, lng];
  }

  List<double>? _parseCoordinateText(String text) {
    final match = RegExp(r'^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$').firstMatch(text);
    if (match == null) return null;

    final first = double.tryParse(match.group(1)!);
    final second = double.tryParse(match.group(2)!);
    if (first == null || second == null) return null;
    if (first < -90 || first > 90 || second < -180 || second > 180) return null;

    return [first, second];
  }

  Future<String> _resolveAddressLabel(String label, List<double>? coords) async {
    final trimmed = label.trim();
    if (trimmed.isEmpty) return label;

    final parsed = _parseCoordinateText(trimmed);
    final lat = parsed != null ? parsed[0] : (coords != null ? coords[0] : null);
    final lng = parsed != null ? parsed[1] : (coords != null ? coords[1] : null);

    if (lat == null || lng == null) return label;

    try {
      final placemarks = await placemarkFromCoordinates(lat, lng);
      if (placemarks.isNotEmpty) {
        final p = placemarks.first;
        final resolved = [
          p.name,
          p.subLocality,
          p.locality,
          p.administrativeArea,
        ].where((s) => s != null && s.trim().isNotEmpty).join(', ');
        if (resolved.trim().isNotEmpty) {
          return resolved;
        }
      }
    } catch (_) {
      // Fall back to Google Geocoding API when plugin lookup is unavailable.
    }

    final googleResolved = await _reverseGeocodeWithGoogleApi(lat, lng);
    if (googleResolved != null) return googleResolved;

    return trimmed;
  }

  Future<String?> _reverseGeocodeWithGoogleApi(double lat, double lng) async {
    final apiKey = AppConfig.googleMapsApiKey.trim();
    if (apiKey.isEmpty) return null;

    try {
      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/geocode/json?latlng=$lat,$lng&key=$apiKey',
      );
      final response = await http.get(url).timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) return null;

      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      if ((payload['status'] ?? '').toString() != 'OK') return null;

      final results = payload['results'] as List<dynamic>?;
      if (results == null || results.isEmpty) return null;

      final formatted = (results.first as Map<String, dynamic>)['formatted_address'];
      if (formatted is String && formatted.trim().isNotEmpty) {
        return formatted.trim();
      }
    } catch (_) {
      return null;
    }

    return null;
  }

  Widget _buildArrivedButton() {
    return ElevatedButton(
      onPressed: _isLoading ? null : _markArrived,
      child: _isLoading
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          : const Text('I have arrived at pickup'),
    );
  }

  Widget _buildOtpSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _otpController,
          keyboardType: TextInputType.number,
          maxLength: 4,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, letterSpacing: 8),
          decoration: const InputDecoration(
            labelText: 'Enter 4-digit OTP',
            counterText: '',
          ),
        ),
        const SizedBox(height: 12),
        ElevatedButton(
          onPressed: _isLoading ? null : _startTrip,
          child: _isLoading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Start Trip'),
        ),
      ],
    );
  }

  Widget _buildCompleteSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Payment mode selection
        const Text('Payment Mode', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _paymentChip('cash', 'Cash'),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _paymentChip('upi', 'UPI'),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _paymentChip('wallet', 'Wallet'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: _isLoading ? null : _completeTrip,
          child: _isLoading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Complete Trip'),
        ),
      ],
    );
  }

  Widget _paymentChip(String value, String label) {
    final selected = _paymentMode == value;
    return GestureDetector(
      onTap: () => setState(() => _paymentMode = value),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: selected ? Colors.indigo.withOpacity(0.1) : Colors.grey[50],
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? Colors.indigo : Colors.grey[300]!,
            width: 2,
          ),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: selected ? Colors.indigo : Colors.grey[700],
          ),
        ),
      ),
    );
  }

  Future<void> _markArrived() async {
    setState(() => _isLoading = true);
    final success = await widget.rideProvider.arrivedAtPickup();
    if (!mounted) return;
    setState(() => _isLoading = false);
    if (!success) {
      final raw = widget.rideProvider.error?.trim();
      final message = (raw == null || raw.isEmpty)
          ? 'Failed to update status'
          : raw.replaceFirst(RegExp(r'^Exception:\s*'), '');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  Future<void> _startTrip() async {
    final otp = _otpController.text.trim();
    if (otp.length != 4) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter the 4-digit OTP')),
      );
      return;
    }
    setState(() => _isLoading = true);
    final success = await widget.rideProvider.startRide(otp);
    if (!mounted) return;
    setState(() => _isLoading = false);
    if (!success) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid OTP. Please try again.')),
      );
    }
  }

  Future<void> _completeTrip() async {
    final ride = widget.rideProvider.currentRide ?? {};
    final estimate = ride['fareEstimate'] ?? {};
    setState(() => _isLoading = true);
    final success = await widget.rideProvider.completeRide(
      distanceKm: (estimate['distanceKm'] ?? 0).toDouble(),
      durationMin: (estimate['durationMin'] ?? 0).toDouble(),
      paymentMode: _paymentMode,
    );
    if (!mounted) return;
    setState(() => _isLoading = false);

    if (success) {
      // Show completion dialog
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('Trip Completed! 🎉'),
          content: Text(
            'Fare: ₹${widget.rideProvider.currentRide?['fareBreakdown']?['finalFare'] ?? 'N/A'}'
            '\nPayment: $_paymentMode'
            '\n\nThank you for driving!',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                widget.rideProvider.resetRide();
              },
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
  }
}