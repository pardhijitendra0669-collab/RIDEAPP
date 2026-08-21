import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../home/home_screen.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _nameController = TextEditingController();
  final _vehicleNumberController = TextEditingController();
  final _vehicleModelController = TextEditingController();
  String _vehicleType = 'bike';
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _vehicleNumberController.dispose();
    _vehicleModelController.dispose();
    super.dispose();
  }

  Future<void> _saveDetails() async {
    final name = _nameController.text.trim();
    final vehicleNumber = _vehicleNumberController.text.trim();

    if (name.isEmpty) {
      setState(() => _error = 'Please enter your name');
      return;
    }
    if (vehicleNumber.isEmpty) {
      setState(() => _error = 'Please enter your vehicle number');
      return;
    }

    setState(() => _error = null);

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    try {
      await authProvider.completeRegistration({
        'name': name,
        'vehicleType': _vehicleType,
        'vehicleNumber': vehicleNumber,
        'vehicleModel': _vehicleModelController.text.trim(),
      });

      if (!mounted) return;

      // Show document upload prompt
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('Documents Required'),
          content: const Text(
            'To complete your registration, please upload your Driving License, '
            'RC, and Insurance documents. Our team will review them for approval.\n\n'
            'You will be able to go online once your documents are approved.',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                Navigator.pushReplacementNamed(context, '/home');
              },
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Driver Registration'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 20),
            const Text(
              'Vehicle & Personal Details',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Tell us about you and your vehicle',
              style: TextStyle(fontSize: 14, color: Colors.grey),
            ),
            const SizedBox(height: 32),

            // Name field
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Full Name',
                prefixIcon: Icon(Icons.person_outline),
              ),
            ),
            const SizedBox(height: 16),

            // Vehicle type selection
            const Text(
              'Vehicle Type',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                _vehicleTypeChip('bike', '🏍️ Bike'),
                _vehicleTypeChip('auto', '🛺 Auto'),
                _vehicleTypeChip('cabmini', '🚗 Cab Mini'),
                _vehicleTypeChip('cabsedan', '🚘 Cab Sedan'),
              ],
            ),
            const SizedBox(height: 16),

            // Vehicle number
            TextField(
              controller: _vehicleNumberController,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'Vehicle Number (e.g. MH12AB1234)',
                prefixIcon: Icon(Icons.confirmation_number),
              ),
            ),
            const SizedBox(height: 16),

            // Vehicle model
            TextField(
              controller: _vehicleModelController,
              decoration: const InputDecoration(
                labelText: 'Vehicle Model (optional)',
                prefixIcon: Icon(Icons.directions_car),
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(
                _error!,
                style: const TextStyle(color: Colors.red),
              ),
            ],

            const SizedBox(height: 32),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: authProvider.isLoading ? null : _saveDetails,
                child: authProvider.isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Continue'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _vehicleTypeChip(String value, String label) {
    final selected = _vehicleType == value;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => setState(() => _vehicleType = value),
      selectedColor: Colors.indigo,
      labelStyle: TextStyle(
        color: selected ? Colors.white : Colors.black,
      ),
    );
  }
}