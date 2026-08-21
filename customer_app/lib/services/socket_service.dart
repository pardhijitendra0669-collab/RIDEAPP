import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/app_config.dart';

class SocketService {
  io.Socket? _socket;
  bool _isConnected = false;

  io.Socket? get socket => _socket;
  bool get isConnected => _isConnected;

  /// Connect to the backend socket server
  void connect(String token) {
    if (_socket != null && _isConnected) return;

    _socket = io.io(
      AppConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .build(),
    );

    _socket!.onConnect((_) {
      _isConnected = true;
      print('Socket connected');
    });

    _socket!.onDisconnect((_) {
      _isConnected = false;
      print('Socket disconnected');
    });

    _socket!.onError((data) {
      print('Socket error: $data');
    });

    _socket!.connect();
  }

  /// Disconnect from socket
  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
  }

  /// Listen for a specific event
  void on(String event, Function(dynamic) handler) {
    _socket?.on(event, handler);
  }

  /// Emit an event
  void emit(String event, [dynamic data]) {
    _socket?.emit(event, data);
  }
}