import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

class AppConfig {
  // Backend API URL - platform aware
  // For Android emulator use 10.0.2.2, for iOS simulator/web use localhost
  static String get apiBaseUrl {
    if (kIsWeb) {
      return 'http://localhost:5000/api';
    }
    if (Platform.isAndroid) {
      return 'http://localhost:5000/api';
    }
    return 'http://localhost:5000/api';
  }

  static String get socketUrl {
    if (kIsWeb) {
      return 'http://localhost:5000';
    }
    if (Platform.isAndroid) {
      return 'http://localhost:5000';
    }
    return 'http://localhost:5000';
  }

  // Google Maps API Key
  static const String googleMapsApiKey = 'AIzaSyD1b5AXygtiG_EoCW4ZGrUAW8oInvsnTxk';

  // Razorpay Key ID
  static const String razorpayKeyId = 'rzp_test_TLGaKVhDoEvmCm';

  // App name
  static const String appName = 'RIDEAPP';
}