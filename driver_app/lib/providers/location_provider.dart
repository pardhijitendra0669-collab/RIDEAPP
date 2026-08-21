import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:geolocator/geolocator.dart';

class LocationProvider extends ChangeNotifier {
  Position? _currentPosition;
  bool _isLoading = false;
  bool _permissionGranted = false;

  Position? get currentPosition => _currentPosition;
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

      return true;
    } catch (e) {
      debugPrint('Location error: $e');
      return false;
    } finally {
      _isLoading = false;
      _notifySafely();
    }
  }

  /// Update position (for live location streaming)
  void updatePosition(Position position) {
    _currentPosition = position;
    _notifySafely();
  }
}