import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class LocationProvider extends ChangeNotifier {
  Position? _currentPosition;
  String? _currentAddress;
  bool _isLoading = false;
  bool _permissionGranted = false;

  Position? get currentPosition => _currentPosition;
  String? get currentAddress => _currentAddress;
  bool get isLoading => _isLoading;
  bool get permissionGranted => _permissionGranted;

  void _notifySafely() {
    if (SchedulerBinding.instance.schedulerPhase == SchedulerPhase.idle ||
        SchedulerBinding.instance.schedulerPhase == SchedulerPhase.postFrameCallbacks) {
      notifyListeners();
      return;
    }

    SchedulerBinding.instance.addPostFrameCallback((_) {
      notifyListeners();
    });
  }

  /// Request location permission and get current position
  Future<bool> getCurrentLocation() async {
    _isLoading = true;
    _notifySafely();

    try {
      // Check permission
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        _permissionGranted = false;
        return false;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          _permissionGranted = false;
          return false;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        _permissionGranted = false;
        return false;
      }

      _permissionGranted = true;
      _currentPosition = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      // Get address from coordinates
      await _getAddressFromLatLng(_currentPosition!);

      return true;
    } catch (e) {
      debugPrint('Location error: $e');
      return false;
    } finally {
      _isLoading = false;
      _notifySafely();
    }
  }

  /// Get address from lat/lng
  Future<void> _getAddressFromLatLng(Position position) async {
    String? resolvedAddress;

    try {
      List<Placemark> placemarks = await placemarkFromCoordinates(
        position.latitude,
        position.longitude,
      );

      if (placemarks.isNotEmpty) {
        Placemark place = placemarks.first;
        resolvedAddress = [
          place.street,
          place.subLocality,
          place.locality,
          place.administrativeArea,
        ].where((s) => s != null && s.isNotEmpty).join(', ');
      }
    } catch (e) {
      debugPrint('Geocoding error: $e');
    }

    if (resolvedAddress == null || resolvedAddress.trim().isEmpty) {
      resolvedAddress = await _reverseGeocodeWithGoogleApi(position.latitude, position.longitude);
    }

    _currentAddress = (resolvedAddress == null || resolvedAddress.trim().isEmpty)
        ? '${position.latitude}, ${position.longitude}'
        : resolvedAddress;
  }

  Future<String?> _reverseGeocodeWithGoogleApi(double latitude, double longitude) async {
    final apiKey = AppConfig.googleMapsApiKey.trim();
    if (apiKey.isEmpty) return null;

    try {
      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/geocode/json?latlng=$latitude,$longitude&key=$apiKey',
      );
      final response = await http.get(url).timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) return null;

      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final status = (payload['status'] ?? '').toString();
      if (status != 'OK') return null;

      final results = payload['results'] as List<dynamic>?;
      if (results == null || results.isEmpty) return null;

      final formatted = (results.first as Map<String, dynamic>)['formatted_address'];
      if (formatted is String && formatted.trim().isNotEmpty) {
        return formatted.trim();
      }
    } catch (e) {
      debugPrint('Google reverse geocoding error: $e');
    }

    return null;
  }

  /// Set location manually (e.g. from map tap)
  void setLocation(double lat, double lng, String address) {
    _currentPosition = Position(
      latitude: lat,
      longitude: lng,
      timestamp: DateTime.now(),
      accuracy: 0,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: 0,
      headingAccuracy: 0,
      speed: 0,
      speedAccuracy: 0,
    );
    _currentAddress = address;
    _notifySafely();
  }
}