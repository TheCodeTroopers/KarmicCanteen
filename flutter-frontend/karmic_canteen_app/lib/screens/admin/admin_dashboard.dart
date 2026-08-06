// lib/screens/admin/admin_dashboard.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:easy_localization/easy_localization.dart';
import '../../providers/auth_provider.dart';
import 'analytics_dashboard_screen.dart';
import 'menu_manager_screen.dart';
import 'reports_screen.dart';
import 'settings_screen.dart';
import 'food_donation_screen.dart';
import 'festival_broadcast_screen.dart'; // ✅ Added

class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  int _selectedIndex = 0;

  final List<Widget> _screens = [
    const AnalyticsDashboardScreen(),
    const MenuManagerScreen(),
    const ReportsScreen(),
    const FoodDonationScreen(),
    const FestivalBroadcastScreen(), // ✅ Added
    const SettingsScreen(),
  ];


  String _getScreenTitle() {
    switch (_selectedIndex) {
      case 0:
        return 'analytics'.tr();
      case 1:
        return 'menu'.tr();
      case 2:
        return 'reports'.tr();
      case 3:
        return 'Food Donation';
      case 4:
        return 'Festival Broadcast';
      case 5:
        return 'settings'.tr();
      default:
        return 'adminDashboard'.tr();
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(_getScreenTitle()),
        backgroundColor: const Color(0xFF21808D),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => authProvider.signOut(),
            tooltip: 'logout'.tr(),
          ),
        ],
      ),
      body: _screens[_selectedIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) {
          setState(() {
            _selectedIndex = index;
          });
        },
        backgroundColor: Colors.white,
        indicatorColor: const Color(0xFF21808D).withOpacity(0.15),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.analytics_outlined),
            selectedIcon: const Icon(Icons.analytics),
            label: 'analytics'.tr(),
          ),
          NavigationDestination(
            icon: const Icon(Icons.restaurant_menu_outlined),
            selectedIcon: const Icon(Icons.restaurant_menu),
            label: 'menu'.tr(),
          ),
          NavigationDestination(
            icon: const Icon(Icons.assessment_outlined),
            selectedIcon: const Icon(Icons.assessment),
            label: 'reports'.tr(),
          ),
          const NavigationDestination(
            icon: Icon(Icons.volunteer_activism_outlined),
            selectedIcon: Icon(Icons.volunteer_activism),
            label: 'Donation',
          ),
          const NavigationDestination(
            icon: Icon(Icons.celebration_outlined),
            selectedIcon: Icon(Icons.celebration),
            label: 'Festivals',
          ),
          NavigationDestination(
            icon: const Icon(Icons.settings_outlined),
            selectedIcon: const Icon(Icons.settings),
            label: 'settings'.tr(),
          ),
        ],
      ),
    );
  }
}
