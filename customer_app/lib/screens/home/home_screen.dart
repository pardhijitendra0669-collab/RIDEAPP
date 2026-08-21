import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:async';
import 'dart:convert';
import 'package:provider/provider.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import '../../config/app_config.dart';
import '../../utils/web_maps_loader.dart'
  if (dart.library.html) '../../utils/web_maps_loader_web.dart' as web_maps_loader;
import '../../providers/location_provider.dart';
import '../../providers/ride_provider.dart';
import '../../providers/socket_provider.dart';
import '../../providers/auth_provider.dart';
import 'widgets/vehicle_selector.dart';
import 'widgets/ride_status_card.dart';
import 'widgets/fare_breakdown.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  GoogleMapController? _mapController;
  final TextEditingController _destinationController = TextEditingController();
  LatLng? _pickupLocation;
  LatLng? _dropLocation;
  String? _pickupAddress;
  String? _dropAddress;
  double? _tripDistanceKm;
  String _selectedVehicle = 'bike';
  final List<Map<String, String>> _destinationSuggestions = [];
  Timer? _suggestionDebounce;
  bool _isLoadingSuggestions = false;
  bool _showBookingSheet = false;
  bool _isSearchingDestination = false;
  bool _isLoading = false;
  bool _isMapReady = !kIsWeb;
  bool _showActiveRideCard = true;

  static const Map<String, String> _openStreetMapHeaders = {
    'Accept': 'application/json',
    'User-Agent': 'RIDEAPP/1.0 (customer-app)',
  };

  bool get _canRenderMap {
    if (!kIsWeb) return true;
    return _isMapReady;
  }

  String _normalizeForCompare(String value) {
    return value.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  String _resolveCityForPricing() {
    final raw = (_pickupAddress ?? '').trim();
    if (raw.isEmpty) return 'delhi';

    final parts = raw.split(',').map((e) => e.trim().toLowerCase()).where((e) => e.isNotEmpty).toList();
    if (parts.isEmpty) return 'delhi';

    for (final part in parts.reversed) {
      // Ignore numeric coordinate fragments
      if (RegExp(r'^-?\d+(\.\d+)?$').hasMatch(part)) continue;
      // Keep only alpha-like place names
      if (RegExp(r'^[a-z\s]+$').hasMatch(part)) {
        return part;
      }
    }

    return 'delhi';
  }

  @override
  void initState() {
    super.initState();
    _prepareWebMaps();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _initialize();
      }
    });
  }

  @override
  void dispose() {
    _suggestionDebounce?.cancel();
    _destinationController.dispose();
    super.dispose();
  }

  Future<void> _prepareWebMaps() async {
    if (!kIsWeb) return;
    final ready = await web_maps_loader.ensureGoogleMapsLoaded(AppConfig.googleMapsApiKey);
    if (!mounted) return;
    setState(() {
      _isMapReady = ready;
    });
  }

  Future<void> _initialize() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final locationProvider = Provider.of<LocationProvider>(context, listen: false);
    final rideProvider = Provider.of<RideProvider>(context, listen: false);
    final socketProvider = Provider.of<SocketProvider>(context, listen: false);

    // Guard against stale UI state (e.g. hot restart on /home) where token is not loaded.
    var loggedIn = authProvider.isLoggedIn;
    if (!loggedIn) {
      loggedIn = await authProvider.restoreSession();
    }

    if (!mounted) return;
    if (!loggedIn || authProvider.accessToken == null) {
      Navigator.pushReplacementNamed(context, '/otp');
      return;
    }

    if (!socketProvider.isConnected) {
      socketProvider.connect(authProvider.accessToken!);
    }

    // Get current location
    await locationProvider.getCurrentLocation();

    if (!mounted) return;

    if (locationProvider.currentPosition != null) {
      final pickupLatLng = LatLng(
        locationProvider.currentPosition!.latitude,
        locationProvider.currentPosition!.longitude,
      );

      setState(() {
        _pickupLocation = pickupLatLng;
        _pickupAddress = locationProvider.currentAddress;
      });

      final pickupLabel = (locationProvider.currentAddress ?? '').trim();
      if (pickupLabel.isEmpty || _tryParseCoordinates(pickupLabel) != null) {
        final resolvedPickup = await _resolveAddressForCoordinates(
          pickupLatLng,
          fallback: pickupLabel.isEmpty
              ? '${pickupLatLng.latitude.toStringAsFixed(6)}, ${pickupLatLng.longitude.toStringAsFixed(6)}'
              : pickupLabel,
        );
        if (mounted) {
          setState(() {
            _pickupAddress = resolvedPickup;
          });
        }
      }

      if (_dropLocation != null) {
        _recalculateTripDistance();
      }
    }

    // Listen for ride events
    socketProvider.onRideEvent('ride:accepted', (data) {
      rideProvider.updateRideFromSocket('ride:accepted', data);
    });
    socketProvider.onRideEvent('ride:statusUpdate', (data) {
      rideProvider.updateRideFromSocket('ride:statusUpdate', data);
    });
    socketProvider.onRideEvent('ride:driverLocation', (data) {
      rideProvider.updateRideFromSocket('ride:driverLocation', data);
    });
    socketProvider.onRideEvent('ride:cancelled', (data) {
      rideProvider.updateRideFromSocket('ride:cancelled', data);
    });
    socketProvider.onRideEvent('ride:noDriverFound', (data) {
      rideProvider.updateRideFromSocket('ride:noDriverFound', data);
    });

    await rideProvider.loadActiveRide();
    if (!mounted) return;

    setState(() {
      _showActiveRideCard = rideProvider.hasActiveRide;
    });
  }

  void _onMapTap(LatLng location) {
    final fallback = '${location.latitude.toStringAsFixed(6)}, ${location.longitude.toStringAsFixed(6)}';
    setState(() {
      _dropLocation = location;
      _dropAddress = fallback;
      _destinationController.text = _dropAddress!;
      _showBookingSheet = false;
    });

    _updateDropAddressFromCoordinates(location, fallback: fallback);
    _recalculateTripDistance();
    _estimateFare();
  }

  void _recalculateTripDistance() {
    if (_pickupLocation == null || _dropLocation == null) {
      setState(() {
        _tripDistanceKm = null;
      });
      return;
    }

    final meters = Geolocator.distanceBetween(
      _pickupLocation!.latitude,
      _pickupLocation!.longitude,
      _dropLocation!.latitude,
      _dropLocation!.longitude,
    );

    setState(() {
      _tripDistanceKm = meters / 1000;
    });
  }

  LatLng? _tryParseCoordinates(String input) {
    final match = RegExp(r'^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$').firstMatch(input);
    if (match == null) return null;

    final lat = double.tryParse(match.group(1)!);
    final lng = double.tryParse(match.group(2)!);
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return LatLng(lat, lng);
  }

  Future<String?> _reverseGeocodeWithGoogleApi(LatLng location) async {
    final apiKey = AppConfig.googleMapsApiKey.trim();
    if (apiKey.isEmpty) return null;

    try {
      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.latitude},${location.longitude}&key=$apiKey',
      );
      final response = await http.get(url).timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) return null;

      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final status = (payload['status'] ?? '').toString();
      if (status != 'OK') return null;

      final results = payload['results'] as List<dynamic>?;
      if (results == null || results.isEmpty) return null;

      final formatted = (results.first as Map<String, dynamic>)['formatted_address'];
      if (formatted is String && formatted.trim().isNotEmpty) {
        return formatted.trim();
      }
    } catch (_) {
      // Ignore API failures and allow other fallbacks.
    }

    return null;
  }

  Future<String?> _reverseGeocodeWithOpenStreetMap(LatLng location) async {
    try {
      final url = Uri.parse(
        'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.latitude}&lon=${location.longitude}&zoom=18&addressdetails=1',
      );
      final response = await http.get(
        url,
        headers: _openStreetMapHeaders,
      ).timeout(const Duration(seconds: 8));

      if (response.statusCode != 200) return null;

      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final displayName = payload['display_name'];
      if (displayName is String && displayName.trim().isNotEmpty) {
        return displayName.trim();
      }
    } catch (_) {
      return null;
    }

    return null;
  }

  Future<String> _resolveAddressForCoordinates(LatLng location, {String? fallback}) async {
    try {
      final places = await placemarkFromCoordinates(location.latitude, location.longitude);
      if (places.isNotEmpty) {
        final place = places.first;
        final resolved = [
          place.name,
          place.subLocality,
          place.locality,
          place.administrativeArea,
        ].where((s) => s != null && s.trim().isNotEmpty).join(', ');

        if (resolved.trim().isNotEmpty) {
          return resolved;
        }
      }
    } catch (_) {
      // If native geocoding fails (common on web), use API fallback.
    }

    final googleResolved = await _reverseGeocodeWithGoogleApi(location);
    if (googleResolved != null) return googleResolved;

    final osmResolved = await _reverseGeocodeWithOpenStreetMap(location);
    if (osmResolved != null) return osmResolved;

    return fallback ?? '${location.latitude.toStringAsFixed(6)}, ${location.longitude.toStringAsFixed(6)}';
  }

  Future<void> _updateDropAddressFromCoordinates(LatLng location, {String? fallback}) async {
    final resolved = await _resolveAddressForCoordinates(location, fallback: fallback);
    if (!mounted) return;

    final current = _dropLocation;
    if (current == null) return;

    final samePoint =
        (current.latitude - location.latitude).abs() < 0.000001 &&
        (current.longitude - location.longitude).abs() < 0.000001;
    if (!samePoint) return;

    setState(() {
      _dropAddress = resolved;
      _destinationController.text = resolved;
    });
  }

  Future<LatLng?> _geocodeWithGoogleApi(String query) async {
    final apiKey = AppConfig.googleMapsApiKey.trim();
    if (apiKey.isEmpty) return null;

    try {
      final encodedQuery = Uri.encodeQueryComponent(query);
      String boundsParam = '';
      if (_pickupLocation != null) {
        final swLat = (_pickupLocation!.latitude - 0.35).clamp(-90, 90);
        final swLng = (_pickupLocation!.longitude - 0.35).clamp(-180, 180);
        final neLat = (_pickupLocation!.latitude + 0.35).clamp(-90, 90);
        final neLng = (_pickupLocation!.longitude + 0.35).clamp(-180, 180);
        boundsParam = '&bounds=$swLat,$swLng|$neLat,$neLng';
      }
      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/geocode/json?address=$encodedQuery&region=in$boundsParam&key=$apiKey',
      );
      final response = await http.get(url).timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) return null;

      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final status = (payload['status'] ?? '').toString();
      if (status != 'OK') return null;

      final results = payload['results'] as List<dynamic>?;
      if (results == null || results.isEmpty) return null;

      final geometry = (results.first as Map<String, dynamic>)['geometry'] as Map<String, dynamic>?;
      final point = geometry?['location'] as Map<String, dynamic>?;
      final lat = (point?['lat'] as num?)?.toDouble();
      final lng = (point?['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) return null;

      return LatLng(lat, lng);
    } catch (_) {
      return null;
    }
  }

  Future<LatLng?> _geocodeWithOpenStreetMap(String query) async {
    try {
      final encodedQuery = Uri.encodeQueryComponent(query);
      final url = Uri.parse(
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=$encodedQuery',
      );
      final response = await http.get(
        url,
        headers: _openStreetMapHeaders,
      ).timeout(const Duration(seconds: 8));

      if (response.statusCode != 200) return null;

      final payload = jsonDecode(response.body) as List<dynamic>;
      if (payload.isEmpty) return null;

      final best = payload.first as Map<String, dynamic>;
      final lat = double.tryParse((best['lat'] ?? '').toString());
      final lng = double.tryParse((best['lon'] ?? '').toString());
      if (lat == null || lng == null) return null;

      return LatLng(lat, lng);
    } catch (_) {
      return null;
    }
  }

  Future<List<Map<String, String>>> _fetchSuggestionsWithOpenStreetMap(String query) async {
    try {
      final encodedQuery = Uri.encodeQueryComponent(query);
      final url = Uri.parse(
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=in&q=$encodedQuery',
      );
      final response = await http.get(
        url,
        headers: _openStreetMapHeaders,
      ).timeout(const Duration(seconds: 8));

      if (response.statusCode != 200) return [];

      final payload = jsonDecode(response.body) as List<dynamic>;
      return payload
          .map((item) => item as Map<String, dynamic>)
          .map((item) {
            final lat = (item['lat'] ?? '').toString();
            final lon = (item['lon'] ?? '').toString();
            final name = (item['display_name'] ?? '').toString();
            return {
              'description': name,
              'placeId': 'osm:$lat,$lon',
            };
          })
          .where((item) => item['description']!.isNotEmpty && item['placeId']!.length > 5)
          .toList();
    } catch (_) {
      return [];
    }
  }

  void _onDestinationChanged(String value) {
    final query = value.trim();

    // When destination text changes, wait for explicit reconfirmation before showing fare sheet.
    if (_showBookingSheet) {
      setState(() {
        _showBookingSheet = false;
      });
    }

    if (query.isEmpty) {
      setState(() {
        _destinationSuggestions.clear();
        _isLoadingSuggestions = false;
      });
      return;
    }

    _suggestionDebounce?.cancel();
    _suggestionDebounce = Timer(const Duration(milliseconds: 350), () {
      _fetchDestinationSuggestions(query);
    });
  }

  Future<void> _fetchDestinationSuggestions(String query) async {
    if (query.length < 3) {
      if (!mounted) return;
      setState(() {
        _destinationSuggestions.clear();
        _isLoadingSuggestions = false;
      });
      return;
    }

    if (!mounted) return;
    setState(() {
      _isLoadingSuggestions = true;
    });

    try {
      List<Map<String, String>> suggestions = [];

      final apiKey = AppConfig.googleMapsApiKey.trim();
      if (apiKey.isNotEmpty) {
        final encodedQuery = Uri.encodeQueryComponent(query);
        final locationBias = _pickupLocation != null
            ? '&location=${_pickupLocation!.latitude},${_pickupLocation!.longitude}&radius=50000'
            : '';
        final url = Uri.parse(
          'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=$encodedQuery&components=country:in$locationBias&key=$apiKey',
        );
        final response = await http.get(url).timeout(const Duration(seconds: 8));

        if (response.statusCode == 200) {
          final payload = jsonDecode(response.body) as Map<String, dynamic>;
          final status = (payload['status'] ?? '').toString();
          if (status == 'OK' || status == 'ZERO_RESULTS') {
            final predictions = payload['predictions'] as List<dynamic>? ?? [];
            suggestions = predictions
                .map((item) => item as Map<String, dynamic>)
                .map(
                  (item) => {
                    'description': (item['description'] ?? '').toString(),
                    'placeId': (item['place_id'] ?? '').toString(),
                  },
                )
                .where((item) => item['description']!.isNotEmpty && item['placeId']!.isNotEmpty)
                .take(5)
                .toList();
          }
        }
      }

      if (suggestions.isEmpty) {
        suggestions = await _fetchSuggestionsWithOpenStreetMap(query);
      }

      if (!mounted) return;
      setState(() {
        _destinationSuggestions
          ..clear()
          ..addAll(suggestions);
      });
    } catch (_) {
      // Keep current suggestions if request fails.
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingSuggestions = false;
        });
      }
    }
  }

  Future<LatLng?> _geocodePlaceIdWithGoogleApi(String placeId) async {
    final apiKey = AppConfig.googleMapsApiKey.trim();
    if (apiKey.isEmpty) return null;

    try {
      final encoded = Uri.encodeQueryComponent(placeId);
      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/geocode/json?place_id=$encoded&key=$apiKey',
      );
      final response = await http.get(url).timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) return null;

      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      if ((payload['status'] ?? '').toString() != 'OK') return null;

      final results = payload['results'] as List<dynamic>?;
      if (results == null || results.isEmpty) return null;

      final geometry = (results.first as Map<String, dynamic>)['geometry'] as Map<String, dynamic>?;
      final point = geometry?['location'] as Map<String, dynamic>?;
      final lat = (point?['lat'] as num?)?.toDouble();
      final lng = (point?['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) return null;

      return LatLng(lat, lng);
    } catch (_) {
      return null;
    }
  }

  Future<void> _selectDestinationSuggestion(Map<String, String> suggestion) async {
    final placeId = suggestion['placeId'];
    final label = suggestion['description'] ?? '';
    if (placeId == null || placeId.isEmpty) return;

    setState(() {
      _isSearchingDestination = true;
      _destinationSuggestions.clear();
    });

    try {
      LatLng? destination;
      if (placeId.startsWith('osm:')) {
        final raw = placeId.substring(4);
        final parts = raw.split(',');
        if (parts.length == 2) {
          final lat = double.tryParse(parts[0]);
          final lng = double.tryParse(parts[1]);
          if (lat != null && lng != null) {
            destination = LatLng(lat, lng);
          }
        }
      } else {
        destination = await _geocodePlaceIdWithGoogleApi(placeId);
      }

      if (destination == null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not resolve selected place')),
        );
        return;
      }

      final resolvedAddress = await _resolveAddressForCoordinates(destination, fallback: label);
      if (!mounted) return;

      setState(() {
        _dropLocation = destination;
        _dropAddress = resolvedAddress;
        _destinationController.text = resolvedAddress;
        _showBookingSheet = false;
      });

      _recalculateTripDistance();

      await _mapController?.animateCamera(
        CameraUpdate.newLatLngZoom(destination, 15),
      );

    } finally {
      if (mounted) {
        setState(() {
          _isSearchingDestination = false;
        });
      }
    }
  }

  void _clearDrop() {
    final rideProvider = Provider.of<RideProvider>(context, listen: false);
    setState(() {
      _dropLocation = null;
      _dropAddress = null;
      _tripDistanceKm = null;
      _destinationController.clear();
      _destinationSuggestions.clear();
      _showBookingSheet = false;
    });
    rideProvider.clearFareEstimate();
  }

  Future<void> _searchDestination() async {
    final query = _destinationController.text.trim();
    if (query.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a destination to search')),
      );
      return;
    }

    final normalizedQuery = _normalizeForCompare(query);
    final exactSuggestion = _destinationSuggestions
        .where((s) => _normalizeForCompare(s['description'] ?? '') == normalizedQuery)
        .cast<Map<String, String>?>()
        .firstWhere((s) => s != null, orElse: () => null);

    if (exactSuggestion != null) {
      await _selectDestinationSuggestion(exactSuggestion);
      return;
    }

    if (_destinationSuggestions.isNotEmpty && _tryParseCoordinates(query) == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select destination from the suggestions list')),
      );
      return;
    }

    setState(() => _isSearchingDestination = true);
    try {
      LatLng? destination = _tryParseCoordinates(query);

      destination ??= await _geocodeWithGoogleApi(query);
      destination ??= await _geocodeWithOpenStreetMap(query);

      if (destination == null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No location found for this destination')),
        );
        return;
      }

      final resolvedAddress = await _resolveAddressForCoordinates(destination, fallback: query);

      setState(() {
        _dropLocation = destination;
        _dropAddress = resolvedAddress;
        _destinationController.text = resolvedAddress;
        _showBookingSheet = false;
      });

      _recalculateTripDistance();

      await _mapController?.animateCamera(
        CameraUpdate.newLatLngZoom(destination, 15),
      );

    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not find this place. Try a more specific name.')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSearchingDestination = false);
      }
    }
  }

  Future<void> _estimateFare() async {
    if (_pickupLocation == null || _dropLocation == null) return;

    final rideProvider = Provider.of<RideProvider>(context, listen: false);
    final city = _resolveCityForPricing();

    await rideProvider.estimateFare(
      pickup: {
        'address': _pickupAddress ?? 'Current Location',
        'location': {
          'type': 'Point',
          'coordinates': [_pickupLocation!.longitude, _pickupLocation!.latitude],
        },
      },
      drop: {
        'address': _dropAddress ?? 'Drop Location',
        'location': {
          'type': 'Point',
          'coordinates': [_dropLocation!.longitude, _dropLocation!.latitude],
        },
      },
      vehicleType: _selectedVehicle,
      city: city,
    );
  }

  Future<void> _confirmRouteAndShowFare() async {
    if (_pickupLocation == null || _dropLocation == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Set pickup and destination first')),
      );
      return;
    }

    setState(() {
      _showBookingSheet = true;
    });

    await _estimateFare();
  }

  Future<void> _bookRide() async {
    if (_pickupLocation == null || _dropLocation == null) return;

    final rideProvider = Provider.of<RideProvider>(context, listen: false);
    if (rideProvider.hasActiveRide) {
      if (!mounted) return;
      setState(() {
        _showActiveRideCard = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You already have an active ride. Opening live ride status.')),
      );
      return;
    }

    setState(() => _isLoading = true);
    final city = _resolveCityForPricing();

    final result = await rideProvider.bookRide(
      pickup: {
        'address': _pickupAddress ?? 'Current Location',
        'location': {
          'type': 'Point',
          'coordinates': [_pickupLocation!.longitude, _pickupLocation!.latitude],
        },
      },
      drop: {
        'address': _dropAddress ?? 'Drop Location',
        'location': {
          'type': 'Point',
          'coordinates': [_dropLocation!.longitude, _dropLocation!.latitude],
        },
      },
      vehicleType: _selectedVehicle,
      city: city,
    );

    if (!mounted) return;
    setState(() => _isLoading = false);

    if (result == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(rideProvider.error ?? 'Failed to book ride')),
      );
    } else {
      // Navigate to ride status screen immediately after booking
      setState(() {
        _showActiveRideCard = true;
        _showBookingSheet = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final rideProvider = Provider.of<RideProvider>(context);
    final authProvider = Provider.of<AuthProvider>(context);

    // Show ride card for active rides AND terminal states (completed/cancelled/no_driver_found)
    if (rideProvider.shouldShowRideCard && _showActiveRideCard) {
      return Scaffold(
        body: RideStatusCard(
          rideProvider: rideProvider,
          onCancel: () => rideProvider.cancelRide(),
          onDismiss: () {
            if (!mounted) return;
            final status = rideProvider.rideStatus;
            if (status == 'completed' || status == 'cancelled' || status == 'no_driver_found') {
              rideProvider.reset();
            }
            setState(() {
              _showActiveRideCard = false;
            });
          },
        ),
      );
    }

    return Scaffold(
      body: Stack(
        children: [
          // Map
          if (!_canRenderMap)
            _buildMapUnavailablePlaceholder()
          else if (_pickupLocation != null)
            GoogleMap(
              initialCameraPosition: CameraPosition(
                target: _pickupLocation!,
                zoom: 15,
              ),
              onMapCreated: (controller) => _mapController = controller,
              onTap: _onMapTap,
              markers: {
                if (_pickupLocation != null)
                  Marker(
                    markerId: const MarkerId('pickup'),
                    position: _pickupLocation!,
                    icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
                    infoWindow: InfoWindow(title: 'Pickup', snippet: _pickupAddress),
                  ),
                if (_dropLocation != null)
                  Marker(
                    markerId: const MarkerId('drop'),
                    position: _dropLocation!,
                    icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
                    infoWindow: InfoWindow(title: 'Drop', snippet: _dropAddress),
                  ),
              },
            )
          else
            const Center(child: CircularProgressIndicator()),

          // Top bar
          SafeArea(
            child: Column(
              children: [
                // Header
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: Colors.blue,
                        child: Text(
                          (authProvider.user?['name'] ?? 'U').toString().substring(0, 1).toUpperCase(),
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Book your ride',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: Colors.grey[800],
                              ),
                            ),
                            Text(
                              'Fast pickups, transparent fares',
                              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.menu),
                        onPressed: () => _showMenu(context),
                      ),
                    ],
                  ),
                ),

                if (rideProvider.shouldShowRideCard)
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE8F2FF),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF93C5FD)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.directions_car, color: Color(0xFF1D4ED8)),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'Your ride is active. Open live status to track driver and OTP.',
                            style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF1E3A8A)),
                          ),
                        ),
                        TextButton(
                          onPressed: () {
                            setState(() {
                              _showActiveRideCard = true;
                            });
                          },
                          child: const Text('Open'),
                        ),
                      ],
                    ),
                  ),

                if (rideProvider.shouldShowRideCard) const SizedBox(height: 10),

                // Ola-style search card
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.08),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      TextField(
                        controller: _destinationController,
                        onChanged: _onDestinationChanged,
                        onSubmitted: (_) => _searchDestination(),
                        decoration: InputDecoration(
                          hintText: 'Search destination',
                          prefixIcon: const Icon(Icons.search),
                          suffixIcon: (_isSearchingDestination || _isLoadingSuggestions)
                              ? const Padding(
                                  padding: EdgeInsets.all(12),
                                  child: SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  ),
                                )
                              : IconButton(
                                  icon: const Icon(Icons.arrow_forward),
                                  onPressed: _searchDestination,
                                ),
                          filled: true,
                          fillColor: Colors.grey[100],
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                      if (_destinationSuggestions.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFFE5E7EB)),
                          ),
                          child: Column(
                            children: _destinationSuggestions
                                .map(
                                  (suggestion) => ListTile(
                                    dense: true,
                                    leading: const Icon(Icons.place_outlined, size: 18),
                                    title: Text(
                                      suggestion['description'] ?? '',
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 13),
                                    ),
                                    onTap: () => _selectDestinationSuggestion(suggestion),
                                  ),
                                )
                                .toList(),
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      _pointTile(
                        icon: Icons.trip_origin,
                        iconColor: Colors.green,
                        label: 'From',
                        value: _pickupAddress ?? 'Getting your location...',
                      ),
                      const SizedBox(height: 8),
                      _pointTile(
                        icon: Icons.place,
                        iconColor: Colors.red,
                        label: 'To',
                        value: _dropAddress ?? 'Search above or tap map to set destination',
                        meta: _tripDistanceKm == null
                            ? null
                            : '${_tripDistanceKm!.toStringAsFixed(1)} km • ${_estimateEtaMinutes().toStringAsFixed(0)} min est',
                        onClear: _dropLocation != null ? _clearDrop : null,
                      ),
                      if (_dropLocation != null) ...[
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: _isSearchingDestination ? null : _confirmRouteAndShowFare,
                            icon: const Icon(Icons.check_circle_outline),
                            label: const Text('Confirm pickup & destination'),
                          ),
                        ),
                      ],
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Tap anywhere on the map to pin destination')),
                            );
                          },
                          icon: const Icon(Icons.add_location_alt_outlined),
                          label: const Text('Pin destination on map'),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Bottom sheet
          if (_showBookingSheet && _dropLocation != null)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * 0.5,
                ),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                ),
                padding: const EdgeInsets.all(20),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Vehicle selector
                      VehicleSelector(
                        selectedVehicle: _selectedVehicle,
                        onSelect: (vehicle) {
                          setState(() => _selectedVehicle = vehicle);
                          _estimateFare();
                        },
                      ),
                      const SizedBox(height: 16),

                      // Fare details
                      FareBreakdown(
                        fare: rideProvider.fareEstimate,
                        show: rideProvider.fareEstimate != null,
                      ),
                      if (rideProvider.fareEstimate == null) ...[
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton(
                            onPressed: _estimateFare,
                            child: const Text('Calculate fare'),
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),

                      // Book button
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _bookRide,
                          child: _isLoading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text('Book Ride'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _pointTile({
    required IconData icon,
    required Color iconColor,
    required String label,
    required String value,
    String? meta,
    VoidCallback? onClear,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                ),
                Text(
                  value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                if (meta != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
                  ),
                ],
              ],
            ),
          ),
          if (onClear != null)
            IconButton(
              onPressed: onClear,
              icon: const Icon(Icons.close, size: 18),
              visualDensity: VisualDensity.compact,
            ),
        ],
      ),
    );
  }

  Widget _buildMapUnavailablePlaceholder() {
    return Container(
      color: const Color(0xFFF3F4F6),
      alignment: Alignment.topCenter,
      padding: const EdgeInsets.only(top: 100, left: 20, right: 20),
      child: const Text(
        'Map is unavailable on web. Set a valid Google Maps API key in customer_app/lib/config/app_config.dart.',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: Color(0xFF374151),
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  double _estimateEtaMinutes() {
    if (_tripDistanceKm == null) return 0;

    final speedKmPerHour = switch (_selectedVehicle) {
      'bike' => 28,
      'auto' => 22,
      'cabmini' => 24,
      'cabsedan' => 24,
      _ => 24,
    };

    final minutes = (_tripDistanceKm! / speedKmPerHour) * 60;
    return minutes < 1 ? 1 : minutes;
  }

  void _showMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.history),
                title: const Text('Ride History'),
                onTap: () {
                  Navigator.pop(context);
                  // Navigate to ride history
                },
              ),
              ListTile(
                leading: const Icon(Icons.account_balance_wallet),
                title: const Text('Wallet'),
                onTap: () {
                  Navigator.pop(context);
                  // Navigate to wallet
                },
              ),
              ListTile(
                leading: const Icon(Icons.local_offer),
                title: const Text('Promos & Offers'),
                onTap: () {
                  Navigator.pop(context);
                  // Navigate to promos
                },
              ),
              ListTile(
                leading: const Icon(Icons.emergency),
                title: const Text('SOS Contacts'),
                onTap: () {
                  Navigator.pop(context);
                  // Navigate to SOS contacts
                },
              ),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Logout'),
                onTap: () {
                  Navigator.pop(context);
                  Provider.of<AuthProvider>(context, listen: false).logout();
                  Navigator.pushReplacementNamed(context, '/otp');
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}