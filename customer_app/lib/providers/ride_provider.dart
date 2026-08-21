import 'package:flutter/foundation.dart';
import '../services/api_service.dart';
import 'auth_provider.dart';

class RideProvider extends ChangeNotifier {
  final ApiService _apiService;

  Map<String, dynamic>? _currentRide;
  Map<String, dynamic>? _fareEstimate;
  Map<String, dynamic>? _driver;
  String? _rideStatus;
  double? _driverLat;
  double? _driverLng;
  bool _isSearching = false;
  String? _error;

  RideProvider(this._apiService);

  void updateAuth(AuthProvider _) {}

  Map<String, dynamic>? get currentRide => _currentRide;
  Map<String, dynamic>? get fareEstimate => _fareEstimate;
  Map<String, dynamic>? get driver => _driver;
  String? get rideStatus => _rideStatus;
  double? get driverLat => _driverLat;
  double? get driverLng => _driverLng;
  bool get isSearching => _isSearching;
  String? get error => _error;
  bool get hasActiveRide => _currentRide != null && _isActiveStatus(_rideStatus);

  /// True whenever the ride status card should stay visible (active + terminal until dismissed).
  bool get shouldShowRideCard => _currentRide != null && _rideStatus != null;

  bool _isActiveStatus(String? status) {
    return status == 'searching' || status == 'accepted' || status == 'arrived' || status == 'started';
  }

  String _normalizeRideStatus(dynamic status) {
    final raw = (status ?? '').toString().trim().toLowerCase();
    if (raw == 'requested') return 'searching';
    if (raw.isEmpty) return 'searching';
    return raw;
  }

  String? _rideIdFrom(Map<String, dynamic>? ride) {
    if (ride == null) return null;
    final id = ride['id'] ?? ride['_id'];
    return id?.toString();
  }

  /// Restore any active ride from backend and keep UI in sync across app restarts.
  Future<void> loadActiveRide() async {
    _error = null;
    try {
      final response = await _apiService.getActiveRide();
      final data = response['data'];
      if (data is Map<String, dynamic>) {
        _currentRide = data;
        _rideStatus = _normalizeRideStatus(data['status']);

        final driverRaw = data['driverId'];
        if (driverRaw is Map<String, dynamic>) {
          _driver = driverRaw;

          final locationRaw = driverRaw['currentLocation'];
          if (locationRaw is Map<String, dynamic>) {
            final coordinates = locationRaw['coordinates'];
            if (coordinates is List && coordinates.length >= 2) {
              _driverLng = (coordinates[0] as num?)?.toDouble();
              _driverLat = (coordinates[1] as num?)?.toDouble();
            }
          }
        }
      } else {
        _currentRide = null;
        _rideStatus = null;
        _driver = null;
        _driverLat = null;
        _driverLng = null;
      }
    } catch (e) {
      _error = e.toString();
    }

    notifyListeners();
  }

  /// Estimate fare for a ride
  Future<Map<String, dynamic>?> estimateFare({
    required Map<String, dynamic> pickup,
    required Map<String, dynamic> drop,
    required String vehicleType,
    required String city,
    double? distanceKm,
    double? durationMin,
  }) async {
    _isSearching = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _apiService.estimateFare({
        'pickupLocation': pickup,
        'dropLocation': drop,
        'vehicleType': vehicleType,
        'city': city,
        if (distanceKm != null) 'distanceKm': distanceKm,
        if (durationMin != null) 'durationMin': durationMin,
      });
      _fareEstimate = response['data'];
      return _fareEstimate;
    } catch (e) {
      _error = e.toString();
      return null;
    } finally {
      _isSearching = false;
      notifyListeners();
    }
  }

  /// Book a ride
  Future<Map<String, dynamic>?> bookRide({
    required Map<String, dynamic> pickup,
    required Map<String, dynamic> drop,
    required String vehicleType,
    required String city,
    double? distanceKm,
    double? durationMin,
    String paymentMode = 'cash',
    String? promoCode,
  }) async {
    _isSearching = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _apiService.bookRide({
        'pickupLocation': pickup,
        'dropLocation': drop,
        'vehicleType': vehicleType,
        'city': city,
        if (distanceKm != null) 'distanceKm': distanceKm,
        if (durationMin != null) 'durationMin': durationMin,
        'paymentMode': paymentMode,
        if (promoCode != null) 'promoCode': promoCode,
      });
      _currentRide = response['data']['ride'];
      _rideStatus = _normalizeRideStatus(_currentRide?['status']);
      return response['data'];
    } catch (e) {
      _error = e.toString();
      return null;
    } finally {
      _isSearching = false;
      notifyListeners();
    }
  }

  /// Update ride from socket events
  void updateRideFromSocket(String event, dynamic data) {
    switch (event) {
      case 'ride:accepted':
        _rideStatus = 'accepted';
        _driver = data['driver'];
        _currentRide = {
          ...?_currentRide,
          'id': data['rideId'],
          'otp': data['otp'],
        };
        break;
      case 'ride:statusUpdate':
        _rideStatus = data['status'];
        if (data['finalFare'] != null) {
          _currentRide = {...?_currentRide, 'finalFare': data['finalFare']};
        }
        break;
      case 'ride:driverLocation':
        _driverLat = data['lat'];
        _driverLng = data['lng'];
        break;
      case 'ride:cancelled':
        // Keep _currentRide so user sees the cancelled screen; reset() clears it.
        _rideStatus = 'cancelled';
        _driver = null;
        _driverLat = null;
        _driverLng = null;
        break;
      case 'ride:noDriverFound':
        // Keep _currentRide so user sees the no-driver screen; reset() clears it.
        _rideStatus = 'no_driver_found';
        _driver = null;
        _driverLat = null;
        _driverLng = null;
        break;
    }
    notifyListeners();
  }

  /// Cancel current ride
  Future<bool> cancelRide({String reason = ''}) async {
    final rideId = _rideIdFrom(_currentRide);
    if (rideId == null) return false;
    try {
      await _apiService.cancelRide(rideId, reason: reason);
      // Keep _currentRide alive so the cancelled screen is visible; reset() clears it.
      _rideStatus = 'cancelled';
      _driver = null;
      _driverLat = null;
      _driverLng = null;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// Rate the ride
  Future<bool> rateRide(int rating, {String comment = ''}) async {
    final rideId = _rideIdFrom(_currentRide);
    if (rideId == null) return false;
    try {
      await _apiService.rateRide(rideId, rating, comment: comment);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// Reset ride state
  void reset() {
    _currentRide = null;
    _fareEstimate = null;
    _driver = null;
    _rideStatus = null;
    _driverLat = null;
    _driverLng = null;
    _isSearching = false;
    _error = null;
    notifyListeners();
  }

  /// Clear only booking quote state without affecting active ride tracking.
  void clearFareEstimate() {
    _fareEstimate = null;
    _isSearching = false;
    _error = null;
    notifyListeners();
  }
}