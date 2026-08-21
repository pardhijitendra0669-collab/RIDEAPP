import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;

  ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

class ApiService {
  String? _accessToken;

  // Auth endpoints
  Future<Map<String, dynamic>> sendOtp(String mobile) async {
    return _post('/auth/send-otp', {'mobile': mobile, 'role': 'driver'});
  }

  Future<Map<String, dynamic>> verifyOtp(String mobile, String otp) async {
    final response = await _post('/auth/verify-otp', {'mobile': mobile, 'otp': otp, 'role': 'driver'});
    if (response['accessToken'] != null) {
      await _saveToken(response['accessToken'], response['refreshToken']);
    }
    return response;
  }

  Future<Map<String, dynamic>> registerDriver(Map<String, dynamic> data) async {
    return _post('/auth/driver/register', data);
  }

  // Driver endpoints
  Future<Map<String, dynamic>> getProfile() async {
    return _get('/driver/profile');
  }

  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> data) async {
    return _put('/driver/profile', data);
  }

  Future<Map<String, dynamic>> toggleStatus() async {
    return _post('/driver/toggle-status', {});
  }

  Future<Map<String, dynamic>> updateLocation(double lat, double lng) async {
    return _post('/driver/location', {'lat': lat, 'lng': lng});
  }

  Future<Map<String, dynamic>> getEarnings() async {
    return _get('/driver/earnings');
  }

  Future<Map<String, dynamic>> getRideHistory({int page = 1}) async {
    return _get('/driver/rides?page=$page');
  }

  Future<Map<String, dynamic>> updateBankDetails(Map<String, dynamic> data) async {
    return _post('/driver/bank-details', data);
  }

  Future<Map<String, dynamic>> requestPayout(double amount) async {
    return _post('/driver/payout', {'amount': amount});
  }

  // Ride actions
  Future<Map<String, dynamic>> getActiveRide() async {
    return _get('/driver/active-ride');
  }

  Future<Map<String, dynamic>> acceptRide(String rideId) async {
    return _post('/driver/rides/$rideId/accept', {});
  }

  Future<Map<String, dynamic>> rejectRide(String rideId) async {
    return _post('/driver/rides/$rideId/reject', {});
  }

  Future<Map<String, dynamic>> arrivedAtPickup(String rideId) async {
    return _post('/driver/rides/$rideId/arrived', {});
  }

  Future<Map<String, dynamic>> startRide(String rideId, String otp) async {
    return _post('/driver/rides/$rideId/start', {'otp': otp});
  }

  Future<Map<String, dynamic>> completeRide(String rideId, {double? distanceKm, double? durationMin, String paymentMode = 'cash'}) async {
    return _post('/driver/rides/$rideId/complete', {
      if (distanceKm != null) 'actualDistanceKm': distanceKm,
      if (durationMin != null) 'actualDurationMin': durationMin,
      'paymentMode': paymentMode,
    });
  }

  // Token management
  Future<void> _saveToken(String accessToken, String refreshToken) async {
    _accessToken = accessToken;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access_token', accessToken);
    await prefs.setString('refresh_token', refreshToken);
  }

  Future<String?> getAccessToken() async {
    if (_accessToken != null) return _accessToken;
    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString('access_token');
    return _accessToken;
  }

  Future<void> clearTokens() async {
    _accessToken = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access_token');
    await prefs.remove('refresh_token');
  }

  // HTTP helpers
  Future<Map<String, dynamic>> _get(String path) async {
    try {
      final response = await http.get(
        Uri.parse('${AppConfig.apiBaseUrl}$path'),
        headers: await _headers(),
      );
      return _handleResponse(response);
    } on http.ClientException {
      throw ApiException('Network error. Please check your internet connection.');
    } on FormatException {
      throw ApiException('Invalid response from server.');
    }
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    try {
      final response = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}$path'),
        headers: await _headers(),
        body: jsonEncode(body),
      );
      return _handleResponse(response);
    } on http.ClientException {
      throw ApiException('Network error. Please check your internet connection.');
    } on FormatException {
      throw ApiException('Invalid response from server.');
    }
  }

  Future<Map<String, dynamic>> _put(String path, Map<String, dynamic> body) async {
    try {
      final response = await http.put(
        Uri.parse('${AppConfig.apiBaseUrl}$path'),
        headers: await _headers(),
        body: jsonEncode(body),
      );
      return _handleResponse(response);
    } on http.ClientException {
      throw ApiException('Network error. Please check your internet connection.');
    } on FormatException {
      throw ApiException('Invalid response from server.');
    }
  }

  Future<Map<String, String>> _headers() async {
    final token = await getAccessToken();
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    try {
      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return data;
      }

      final message = data['error']?['message'] ?? 'Something went wrong';
      throw ApiException(message, statusCode: response.statusCode);
    } on FormatException {
      throw ApiException('Invalid response from server.', statusCode: response.statusCode);
    }
  }
}