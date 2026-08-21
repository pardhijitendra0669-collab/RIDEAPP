import 'dart:async';
import 'package:flutter/foundation.dart';
import '../services/api_service.dart';
import 'auth_provider.dart';

class RideProvider extends ChangeNotifier {
  final ApiService _apiService;

  Map<String, dynamic>? _incomingRequest;
  Map<String, dynamic>? _currentRide;
  String? _rideStatus;
  int _responseTimeLeft = 0;
  Timer? _responseTimer;
  String? _error;

  RideProvider(this._apiService);

  void updateAuth(AuthProvider _) {}

  Map<String, dynamic>? get incomingRequest => _incomingRequest;
  Map<String, dynamic>? get currentRide => _currentRide;
  String? get rideStatus => _rideStatus;
  int get responseTimeLeft => _responseTimeLeft;
  bool get hasIncomingRequest => _incomingRequest != null;
  bool get hasActiveRide => _currentRide != null;
  String? get error => _error;

  /// Handle incoming ride request from socket
  void handleNewRequest(Map<String, dynamic> data) {
    // Ignore new requests while already on an active trip
    if (_currentRide != null) return;
    _incomingRequest = data;
    _responseTimeLeft = (data['timeoutMs'] ?? 15000) ~/ 1000;
    _startResponseTimer();
    notifyListeners();
  }

  void _startResponseTimer() {
    _responseTimer?.cancel();
    _responseTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_responseTimeLeft <= 0) {
        timer.cancel();
        _incomingRequest = null;
        notifyListeners();
      } else {
        _responseTimeLeft--;
        notifyListeners();
      }
    });
  }

  /// Accept incoming ride request
  Future<bool> acceptRide() async {
    if (_incomingRequest == null) return false;
    try {
      _error = null;
      final response = await _apiService.acceptRide(_incomingRequest!['rideId'].toString());
      final data = response['data'] as Map<String, dynamic>?;
      final status = data?['status']?.toString();

      if (status != 'accepted') {
        _error = 'Ride request expired or already handled';
        notifyListeners();
        return false;
      }

      final customer = data?['customer'] as Map<String, dynamic>?;
      _currentRide = {
        ...?_incomingRequest,
        'rideId': (data?['rideId'] ?? _incomingRequest!['rideId']).toString(),
        'pickupLocation': customer?['pickup'] ?? _incomingRequest!['pickupLocation'],
        'dropLocation': customer?['drop'] ?? _incomingRequest!['dropLocation'],
      };
      _rideStatus = 'accepted';
      _incomingRequest = null;
      _responseTimer?.cancel();
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      debugPrint('Accept ride error: $e');
      notifyListeners();
      return false;
    }
  }

  /// Reject incoming ride request
  Future<void> rejectRide() async {
    if (_incomingRequest == null) return;
    try {
      await _apiService.rejectRide(_incomingRequest!['rideId'].toString());
    } catch (e) {
      debugPrint('Reject ride error: $e');
    }
    _incomingRequest = null;
    _responseTimer?.cancel();
    notifyListeners();
  }

  /// Update ride status from socket events
  void handleRideStatus(Map<String, dynamic> data) {
    _rideStatus = data['status']?.toString();
    notifyListeners();
  }

  /// Restore active ride from backend on app startup
  Future<void> restoreActiveRide() async {
    try {
      final response = await _apiService.getActiveRide();
      final ride = response['data'] as Map<String, dynamic>?;
      if (ride == null) return;

      _currentRide = {
        'rideId': ride['_id']?.toString() ?? '',
        'pickupLocation': ride['pickupLocation'],
        'dropLocation': ride['dropLocation'],
        'vehicleType': ride['vehicleType'],
        'fareEstimate': ride['fareEstimate'],
      };
      _rideStatus = ride['status']?.toString();
      notifyListeners();
    } catch (e) {
      debugPrint('Restore active ride error: $e');
    }
  }

  /// Driver arrived at pickup
  Future<bool> arrivedAtPickup() async {
    if (_currentRide == null) return false;
    try {
      _error = null;
      await _apiService.arrivedAtPickup(_currentRide!['rideId'].toString());
      _rideStatus = 'arrived';
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      debugPrint('Arrived error: $e');
      notifyListeners();
      return false;
    }
  }

  /// Start ride with OTP
  Future<bool> startRide(String otp) async {
    if (_currentRide == null) return false;
    try {
      _error = null;
      await _apiService.startRide(_currentRide!['rideId'].toString(), otp);
      _rideStatus = 'started';
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      debugPrint('Start ride error: $e');
      notifyListeners();
      return false;
    }
  }

  /// Complete ride
  Future<bool> completeRide({double? distanceKm, double? durationMin, String paymentMode = 'cash'}) async {
    if (_currentRide == null) return false;
    try {
      _error = null;
      final response = await _apiService.completeRide(
        _currentRide!['rideId'].toString(),
        distanceKm: distanceKm,
        durationMin: durationMin,
        paymentMode: paymentMode,
      );
      _rideStatus = 'completed';
      _currentRide = {...?_currentRide, 'fareBreakdown': response['data']};
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      debugPrint('Complete ride error: $e');
      notifyListeners();
      return false;
    }
  }

  /// Handle ride cancellation
  void handleRideCancelled() {
    _currentRide = null;
    _rideStatus = 'cancelled';
    notifyListeners();
  }

  /// Reset ride state (after completion/cancellation)
  void resetRide() {
    _currentRide = null;
    _incomingRequest = null;
    _rideStatus = null;
    _error = null;
    _responseTimer?.cancel();
    notifyListeners();
  }

  @override
  void dispose() {
    _responseTimer?.cancel();
    super.dispose();
  }
}