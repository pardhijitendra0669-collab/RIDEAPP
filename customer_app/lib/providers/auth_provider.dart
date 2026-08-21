import 'package:flutter/foundation.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _apiService;
  Map<String, dynamic>? _user;
  String? _accessToken;
  bool _isLoading = false;
  bool _isNewUser = false;

  AuthProvider(this._apiService);

  Map<String, dynamic>? get user => _user;
  String? get accessToken => _accessToken;
  bool get isLoading => _isLoading;
  bool get isNewUser => _isNewUser;
  bool get isLoggedIn => _accessToken != null;

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
      _user = response['user'];
      _isNewUser = response['isNewUser'] ?? false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Complete profile setup
  Future<void> completeProfile(Map<String, dynamic> data) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _apiService.registerCustomer(data);
      _user = response['user'];
      _isNewUser = false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Update profile
  Future<void> updateProfile(Map<String, dynamic> data) async {
    final response = await _apiService.updateProfile(data);
    _user = response['data'];
    notifyListeners();
  }

  /// Logout
  Future<void> logout() async {
    await _apiService.clearTokens();
    _accessToken = null;
    _user = null;
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
        _user = response['data'];
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