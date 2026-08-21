import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:geocoding/geocoding.dart';
import 'package:http/http.dart' as http;
import '../../../config/app_config.dart';

class RideRequestPopup extends StatelessWidget {
  final Map<String, dynamic> request;
  final int timeLeft;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  const RideRequestPopup({
    super.key,
    required this.request,
    required this.timeLeft,
    required this.onAccept,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final pickup = request['pickupLocation'] ?? {};
    final drop = request['dropLocation'] ?? {};
    final fare = request['fareEstimate'] ?? {};
    final distanceKm = request['distanceKm'] ?? 'N/A';
    final durationMin = request['durationMin'] ?? 'N/A';
    final vehicleType = request['vehicleType']?.toString() ?? 'ride';

    return Scaffold(
      backgroundColor: Colors.black54,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Container(
            margin: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.25),
                  blurRadius: 30,
                  offset: const Offset(0, 16),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFF1D4ED8), Color(0xFF0F172A)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.14),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: const Icon(Icons.local_taxi, color: Colors.white, size: 26),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'New Ride Request',
                                    style: TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w800,
                                      color: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    vehicleType.toUpperCase(),
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.white.withOpacity(0.82),
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 0.6,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        LinearProgressIndicator(
                          value: (timeLeft.clamp(0, 15)) / 15,
                          minHeight: 7,
                          backgroundColor: Colors.white.withOpacity(0.18),
                          color: timeLeft < 5 ? const Color(0xFFF97316) : Colors.white,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Respond in ${timeLeft}s',
                          style: TextStyle(
                            fontSize: 13,
                            color: timeLeft < 5 ? const Color(0xFFFCA5A5) : Colors.white.withOpacity(0.9),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _statsRow(distanceKm.toString(), durationMin.toString(), fare['estimatedFare']?.toString() ?? 'N/A'),
                        const SizedBox(height: 18),
                        _locationCard(
                          icon: Icons.trip_origin,
                          accent: const Color(0xFF16A34A),
                          title: 'Pickup',
                          label: pickup['address']?.toString() ?? 'Pickup location',
                          coords: _extractCoordinates(pickup),
                        ),
                        const SizedBox(height: 10),
                        _locationCard(
                          icon: Icons.place,
                          accent: const Color(0xFFDC2626),
                          title: 'Drop',
                          label: drop['address']?.toString() ?? 'Drop location',
                          coords: _extractCoordinates(drop),
                        ),
                        const SizedBox(height: 18),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: onReject,
                                icon: const Icon(Icons.close),
                                label: const Text('Decline'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: const Color(0xFFDC2626),
                                  side: const BorderSide(color: Color(0xFFFCA5A5)),
                                  padding: const EdgeInsets.symmetric(vertical: 14),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed: onAccept,
                                icon: const Icon(Icons.check),
                                label: const Text('Accept'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF16A34A),
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 14),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _locationRow({
    required IconData icon,
    required Color color,
    required String label,
    List<double>? coords,
  }) {
    return Row(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 12),
        Expanded(
          child: FutureBuilder<String>(
            future: _resolveAddressLabel(label, coords),
            builder: (context, snapshot) {
              final text = snapshot.data ?? label;
              return Text(
                text,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _statsRow(String distanceKm, String durationMin, String fare) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Expanded(child: _tinyStat(Icons.straighten, '$distanceKm km')),
          Expanded(child: _tinyStat(Icons.timer_outlined, '$durationMin min')),
          Expanded(child: _tinyStat(Icons.payments, '₹$fare')),
        ],
      ),
    );
  }

  Widget _tinyStat(IconData icon, String value) {
    return Column(
      children: [
        Icon(icon, color: const Color(0xFF1D4ED8), size: 18),
        const SizedBox(height: 6),
        Text(
          value,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }

  Widget _locationCard({
    required IconData icon,
    required Color accent,
    required String title,
    required String label,
    List<double>? coords,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: accent.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: accent, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: FutureBuilder<String>(
              future: _resolveAddressLabel(label, coords),
              builder: (context, snapshot) {
                final text = snapshot.data ?? label;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(fontSize: 11, color: Colors.grey[600], fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      text,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, height: 1.25),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
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
      // Fall through to API reverse geocode fallback.
    }

    final apiKey = AppConfig.googleMapsApiKey.trim();
    if (apiKey.isNotEmpty) {
      try {
        final url = Uri.parse(
          'https://maps.googleapis.com/maps/api/geocode/json?latlng=$lat,$lng&key=$apiKey',
        );
        final response = await http.get(url).timeout(const Duration(seconds: 8));
        if (response.statusCode == 200) {
          final payload = jsonDecode(response.body) as Map<String, dynamic>;
          if ((payload['status'] ?? '').toString() == 'OK') {
            final results = payload['results'] as List<dynamic>?;
            if (results != null && results.isNotEmpty) {
              final formatted = (results.first as Map<String, dynamic>)['formatted_address'];
              if (formatted is String && formatted.trim().isNotEmpty) {
                return formatted.trim();
              }
            }
          }
        }
      } catch (_) {
        // Ignore and use original label.
      }
    }

    return trimmed;
  }

  Widget _detailItem(IconData icon, String label) {
    return Column(
      children: [
        Icon(icon, color: Colors.indigo, size: 20),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }
}