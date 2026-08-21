import 'package:flutter/material.dart';

class VehicleSelector extends StatelessWidget {
  final String selectedVehicle;
  final ValueChanged<String> onSelect;

  const VehicleSelector({
    super.key,
    required this.selectedVehicle,
    required this.onSelect,
  });

  static const _vehicles = [
    {
      'type': 'bike',
      'name': 'Bike',
      'icon': Icons.two_wheeler,
      'eta': '2 min',
      'price': '₹25+',
    },
    {
      'type': 'auto',
      'name': 'Auto',
      'icon': Icons.electric_rickshaw,
      'eta': '3 min',
      'price': '₹40+',
    },
    {
      'type': 'cabmini',
      'name': 'Cab Mini',
      'icon': Icons.directions_car,
      'eta': '5 min',
      'price': '₹60+',
    },
    {
      'type': 'cabsedan',
      'name': 'Cab Sedan',
      'icon': Icons.airport_shuttle,
      'eta': '7 min',
      'price': '₹80+',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Choose your ride',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 90,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _vehicles.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final vehicle = _vehicles[index];
              final selected = selectedVehicle == vehicle['type'];

              return GestureDetector(
                onTap: () => onSelect(vehicle['type'] as String),
                child: Container(
                  width: 100,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: selected ? Colors.blue.withOpacity(0.1) : Colors.grey[50],
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selected ? Colors.blue : Colors.grey[300]!,
                      width: 2,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        vehicle['icon'] as IconData,
                        color: selected ? Colors.blue : Colors.grey[600],
                        size: 28,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        vehicle['name'] as String,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: selected ? Colors.blue : Colors.grey[800],
                        ),
                      ),
                      Text(
                        '${vehicle['eta']} • ${vehicle['price']}',
                        style: TextStyle(
                          fontSize: 10,
                          color: Colors.grey[500],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}