import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/socket_provider.dart';
import 'profile_setup_screen.dart';
import '../home/home_screen.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _mobileController = TextEditingController();
  final _otpController = TextEditingController();
  bool _showOtpField = false;
  String? _error;
  int _resendTimer = 0;

  @override
  void dispose() {
    _mobileController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    final mobile = _mobileController.text.trim();
    if (mobile.length != 10) {
      setState(() => _error = 'Please enter a valid 10-digit mobile number');
      return;
    }

    setState(() {
      _error = null;
      _showOtpField = true;
      _resendTimer = 30;
    });

    // Start resend timer
    _startResendTimer();

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    try {
      await authProvider.sendOtp(mobile);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('OTP sent successfully')),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  void _startResendTimer() {
    Future.delayed(const Duration(seconds: 1), () {
      if (!mounted) return;
      if (_resendTimer > 0) {
        setState(() => _resendTimer--);
        _startResendTimer();
      }
    });
  }

  Future<void> _verifyOtp() async {
    final mobile = _mobileController.text.trim();
    final otp = _otpController.text.trim();

    if (otp.length != 6) {
      setState(() => _error = 'Please enter the 6-digit OTP');
      return;
    }

    setState(() => _error = null);

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final socketProvider = Provider.of<SocketProvider>(context, listen: false);

    try {
      await authProvider.verifyOtp(mobile, otp);

      if (!mounted) return;

      // Connect socket
      socketProvider.connect(authProvider.accessToken!);

      if (authProvider.isNewUser) {
        Navigator.pushReplacementNamed(context, '/profile-setup');
      } else {
        Navigator.pushReplacementNamed(context, '/home');
      }
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 40),
              const Icon(Icons.local_taxi, size: 60, color: Colors.blue),
              const SizedBox(height: 20),
              const Text(
                'Welcome to RIDEAPP',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Text(
                'Enter your mobile number to get started',
                style: TextStyle(fontSize: 16, color: Colors.grey),
              ),
              const SizedBox(height: 40),

              // Mobile number field
              TextField(
                controller: _mobileController,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                enabled: !_showOtpField,
                decoration: const InputDecoration(
                  labelText: 'Mobile Number',
                  prefixIcon: Icon(Icons.phone_android),
                  counterText: '',
                ),
              ),
              const SizedBox(height: 16),

              // OTP field (shown after sending OTP)
              if (_showOtpField) ...[
                TextField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: const InputDecoration(
                    labelText: 'Enter OTP',
                    prefixIcon: Icon(Icons.lock_outline),
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _resendTimer > 0
                          ? 'Resend OTP in ${_resendTimer}s'
                          : 'Didn\'t receive OTP?',
                      style: const TextStyle(color: Colors.grey),
                    ),
                    if (_resendTimer == 0)
                      TextButton(
                        onPressed: _sendOtp,
                        child: const Text('Resend'),
                      ),
                  ],
                ),
              ],

              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(
                  _error!,
                  style: const TextStyle(color: Colors.red),
                ),
              ],

              const SizedBox(height: 24),

              // Action button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: authProvider.isLoading
                      ? null
                      : _showOtpField ? _verifyOtp : _sendOtp,
                  child: authProvider.isLoading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(_showOtpField ? 'Verify OTP' : 'Send OTP'),
                ),
              ),

              const SizedBox(height: 20),
              const Center(
                child: Text(
                  'By continuing, you agree to our Terms & Privacy Policy',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}