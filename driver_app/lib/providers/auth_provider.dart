import 'package:flutter/foundation.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _apiService;
  Map<String, dynamic>? _driver;
  String? _accessToken;
  bool _isLoading = false;
  bool _isNewUser = false;

  AuthProvider(this._apiService);

  Map<String, dynamic>? get driver => _driver;
  String? get accessToken => _accessToken;
  bool get isLoading => _isLoading;
  bool get isNewUser => _isNewUser;
  bool get isLoggedIn => _accessToken != null;
  bool get isApproved => _driver?['isApproved'] ?? false;
  bool get isOnline => _driver?['isOnline'] ?? false;

  /// Send OTP to mobile
  Future<void> sendOtp(String mobile) async {
    _isLoading = true;
    notifyListeners();
    try {
      await _apiService.sendOtp(mobile);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Verify OTP and login
  Future<void> verifyOtp(String mobile, String otp) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _apiService.verifyOtp(mobile, otp);
      _accessToken = response['accessToken'];
      _driver = response['user'];
      _isNewUser = response['isNewUser'] ?? false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Complete driver registration
  Future<void> completeRegistration(Map<String, dynamic> data) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _apiService.registerDriver(data);
      _driver = response['driver'];
      _isNewUser = false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Toggle online/offline
  Future<void> toggleStatus() async {
    try {
      final response = await _apiService.toggleStatus();
      _driver = {...?_driver, 'isOnline': response['data']['isOnline']};
      notifyListeners();
    } catch (e) {
      rethrow;
    }
  }

  /// Update profile
  Future<void> updateProfile(Map<String, dynamic> data) async {
    final response = await _apiService.updateProfile(data);
    _driver = response['data'];
    notifyListeners();
  }

  /// Logout
  Future<void> logout() async {
    await _apiService.clearTokens();
    _accessToken = null;
    _driver = null;
    _isNewUser = false;
    notifyListeners();
  }

  /// Restore session from stored token
  Future<bool> restoreSession() async {
    final token = await _apiService.getAccessToken();
    if (token != null) {
      _accessToken = token;
      try {
        final response = await _apiService.getProfile();
        _driver = response['data'];
        notifyListeners();
        return true;
      } catch (e) {
        await logout();
        return false;
      }
    }
    return false;
  }
}