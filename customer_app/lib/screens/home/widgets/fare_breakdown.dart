import 'package:flutter/material.dart';

class FareBreakdown extends StatelessWidget {
  final Map<String, dynamic>? fare;
  final bool show;

  const FareBreakdown({super.key, required this.fare, required this.show});

  @override
  Widget build(BuildContext context) {
    if (!show || fare == null) return const SizedBox.shrink();

    final baseFare = (fare!['baseFare'] ?? 0).toDouble();
    final perKmRate = (fare!['perKmRate'] ?? 0).toDouble();
    final perMinRate = (fare!['perMinRate'] ?? 0).toDouble();
    final distanceKm = (fare!['distanceKm'] ?? 0).toDouble();
    final durationMin = (fare!['durationMin'] ?? 0).toDouble();
    final surge = (fare!['surgeMultiplier'] ?? 1).toDouble();
    final estimatedFare = (fare!['estimatedFare'] ?? 0).toDouble();
    final minFareApplied = fare!['minFareApplied'] ?? false;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Fare Breakdown',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          _fareRow('Base fare', '₹${baseFare.toStringAsFixed(0)}'),
          _fareRow('Distance (${distanceKm.toStringAsFixed(1)} km × ₹$perKmRate)', '₹${(distanceKm * perKmRate).toStringAsFixed(0)}'),
          _fareRow('Time (${durationMin.toStringAsFixed(0)} min × ₹$perMinRate)', '₹${(durationMin * perMinRate).toStringAsFixed(0)}'),
          if (surge > 1) _fareRow('Surge ×$surge', ''),
          if (minFareApplied) _fareRow('Minimum fare applied', ''),
          const Divider(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Estimated Fare',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              Text(
                '₹${estimatedFare.toStringAsFixed(0)}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.blue,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Transparent pricing — no hidden charges',
            style: TextStyle(fontSize: 11, color: Colors.green),
          ),
        ],
      ),
    );
  }

  Widget _fareRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 13, color: Colors.grey[700])),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}