import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:provider/provider.dart';
import 'package:firebase_core/firebase_core.dart';
import 'app.dart';
import 'providers/auth_provider.dart';
import 'providers/ride_provider.dart';
import 'providers/location_provider.dart';
import 'providers/socket_provider.dart';
import 'services/api_service.dart';
import 'services/socket_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase (for push notifications)
  if (!kIsWeb) {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Firebase init failed (continuing without): $e');
    }
  } else {
    debugPrint('Firebase web init skipped: configure firebase_options.dart if web FCM is needed.');
  }

  // Initialize services
  final apiService = ApiService();
  final socketService = SocketService();

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiService>.value(value: apiService),
        Provider<SocketService>.value(value: socketService),
        ChangeNotifierProvider(create: (_) => AuthProvider(apiService)),
        ChangeNotifierProvider(create: (_) => LocationProvider()),
        ChangeNotifierProvider(create: (_) => SocketProvider(socketService)),
        ChangeNotifierProxyProvider<AuthProvider, RideProvider>(
          create: (_) => RideProvider(apiService),
          update: (_, auth, ride) => ride!..updateAuth(auth),
        ),
      ],
      child: const RideApp(),
    ),
  );
}