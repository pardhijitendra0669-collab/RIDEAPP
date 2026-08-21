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
  Future<Map<String, dynamic>> sendOtp(String mobile, {String role = 'customer'}) async {
    return _post('/auth/send-otp', {'mobile': mobile, 'role': role});
  }

  Future<Map<String, dynamic>> verifyOtp(String mobile, String otp, {String role = 'customer'}) async {
    final response = await _post('/auth/verify-otp', {'mobile': mobile, 'otp': otp, 'role': role});
    if (response['accessToken'] != null) {
      await _saveToken(response['accessToken'], response['refreshToken']);
    }
    return response;
  }

  Future<Map<String, dynamic>> registerCustomer(Map<String, dynamic> data) async {
    return _post('/auth/register', data);
  }

  // Customer endpoints
  Future<Map<String, dynamic>> getProfile() async {
    return _get('/customer/profile');
  }

  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> data) async {
    return _put('/customer/profile', data);
  }

  Future<Map<String, dynamic>> getSavedPlaces() async {
    return _get('/customer/saved-places');
  }

  Future<Map<String, dynamic>> addSavedPlace(Map<String, dynamic> data) async {
    return _post('/customer/saved-places', data);
  }

  Future<Map<String, dynamic>> getWallet() async {
    return _get('/customer/wallet');
  }

  Future<Map<String, dynamic>> getActiveRide() async {
    return _get('/customer/active-ride');
  }

  Future<Map<String, dynamic>> updateFcmToken(String token) async {
    return _post('/customer/fcm-token', {'fcmToken': token});
  }

  // Ride endpoints
  Future<Map<String, dynamic>> estimateFare(Map<String, dynamic> data) async {
    return _post('/rides/estimate-fare', data);
  }

  Future<Map<String, dynamic>> bookRide(Map<String, dynamic> data) async {
    return _post('/rides/book', data);
  }

  Future<Map<String, dynamic>> getRide(String rideId) async {
    return _get('/rides/$rideId');
  }

  Future<Map<String, dynamic>> cancelRide(String rideId, {String reason = ''}) async {
    return _post('/rides/$rideId/cancel', {'reason': reason});
  }

  Future<Map<String, dynamic>> rateRide(String rideId, int rating, {String comment = ''}) async {
    return _post('/rides/$rideId/rate', {'rating': rating, 'comment': comment});
  }

  Future<Map<String, dynamic>> getRideHistory({int page = 1}) async {
    return _get('/rides/history?page=$page');
  }

  Future<Map<String, dynamic>> triggerSos(String rideId) async {
    return _post('/rides/$rideId/sos', {});
  }

  // Payment endpoints
  Future<Map<String, dynamic>> createPaymentOrder(String rideId) async {
    return _post('/payments/create-order', {'rideId': rideId});
  }

  Future<Map<String, dynamic>> verifyPayment(Map<String, dynamic> data) async {
    return _post('/payments/verify', data);
  }

  Future<Map<String, dynamic>> payWithWallet(String rideId) async {
    return _post('/payments/wallet', {'rideId': rideId});
  }

  Future<Map<String, dynamic>> getPaymentHistory() async {
    return _get('/payments/history');
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