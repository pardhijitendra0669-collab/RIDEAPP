import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:async';
import '../../../services/api_service.dart';

class EarningsScreen extends StatefulWidget {
  const EarningsScreen({super.key});

  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends State<EarningsScreen> {
  Map<String, dynamic>? _earnings;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadEarnings();
  }

  Future<void> _loadEarnings() async {
    setState(() => _isLoading = true);
    try {
      final apiService = Provider.of<ApiService>(context, listen: false);
      final response = await apiService.getEarnings();
      setState(() {
        _earnings = response['data'];
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Earnings'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadEarnings,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadEarnings,
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _buildSummaryCard(),
                        const SizedBox(height: 16),
                        _buildPeriodCards(),
                        const SizedBox(height: 16),
                        _buildTransactions(),
                      ],
                    ),
                  ),
                ),
    );
  }

  Widget _buildSummaryCard() {
    final summary = _earnings?['summary'] ?? {};
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Colors.indigo, Colors.indigoAccent],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Wallet Balance',
            style: TextStyle(color: Colors.white70, fontSize: 14),
          ),
          const SizedBox(height: 8),
          Text(
            '₹${summary['walletBalance'] ?? '0'}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 36,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _miniStat('Total Trips', summary['totalTrips']?.toString() ?? '0'),
              _miniStat('Total Earnings', '₹${summary['totalEarnings'] ?? '0'}'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _miniStat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: const TextStyle(color: Colors.white70, fontSize: 12),
        ),
      ],
    );
  }

  Widget _buildPeriodCards() {
    final summary = _earnings?['summary'] ?? {};

    final periods = [
      {
        'label': 'Today',
        'earnings': summary['today']?['earnings'] ?? 0,
        'trips': summary['today']?['trips'] ?? 0,
        'icon': Icons.today,
      },
      {
        'label': 'This Week',
        'earnings': summary['week']?['earnings'] ?? 0,
        'trips': summary['week']?['trips'] ?? 0,
        'icon': Icons.date_range,
      },
      {
        'label': 'This Month',
        'earnings': summary['month']?['earnings'] ?? 0,
        'trips': summary['month']?['trips'] ?? 0,
        'icon': Icons.calendar_month,
      },
    ];

    return Row(
      children: periods.map((period) {
        return Expanded(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 4),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 5,
                ),
              ],
            ),
            child: Column(
              children: [
                Icon(period['icon'] as IconData, color: Colors.indigo, size: 20),
                const SizedBox(height: 8),
                Text(
                  '₹${period['earnings']}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
                Text(
                  '${period['trips']} trips',
                  style: const TextStyle(fontSize: 11, color: Colors.grey),
                ),
                const SizedBox(height: 4),
                Text(
                  period['label'] as String,
                  style: const TextStyle(fontSize: 11, color: Colors.grey),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildTransactions() {
    final transactions = _earnings?['recentTransactions'] ?? [];
    if (transactions.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'No transactions yet',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Recent Transactions',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        ...transactions.map((txn) {
          final isCredit = txn['type'] == 'credit';
          return ListTile(
            leading: CircleAvatar(
              backgroundColor: isCredit ? Colors.green.withOpacity(0.1) : Colors.red.withOpacity(0.1),
              child: Icon(
                isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                color: isCredit ? Colors.green : Colors.red,
              ),
            ),
            title: Text(txn['description'] ?? 'Transaction'),
            subtitle: Text(txn['source'] ?? ''),
            trailing: Text(
              '${isCredit ? '+' : '-'}₹${txn['amount']}',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: isCredit ? Colors.green : Colors.red,
              ),
            ),
          );
        }),
      ],
    );
  }
}