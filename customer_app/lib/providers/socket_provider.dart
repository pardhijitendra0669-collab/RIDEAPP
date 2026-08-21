import 'package:flutter/foundation.dart';
import '../services/socket_service.dart';

class SocketProvider extends ChangeNotifier {
  final SocketService _socketService;
  bool _isConnected = false;

  SocketProvider(this._socketService);

  bool get isConnected => _isConnected || _socketService.isConnected;

  /// Connect to socket with auth token
  void connect(String token) {
    _socketService.connect(token);
    _socketService.on('connect', (_) {
      _isConnected = true;
      notifyListeners();
    });
    _socketService.on('disconnect', (_) {
      _isConnected = false;
      notifyListeners();
    });
  }

  /// Disconnect from socket
  void disconnect() {
    _socketService.disconnect();
    _isConnected = false;
    notifyListeners();
  }

  /// Listen for ride events
  void onRideEvent(String event, Function(dynamic) handler) {
    _socketService.on(event, handler);
  }

  /// Emit event
  void emit(String event, [dynamic data]) {
    _socketService.emit(event, data);
  }
}