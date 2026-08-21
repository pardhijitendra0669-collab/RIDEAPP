// ignore_for_file: avoid_web_libraries_in_flutter

import 'dart:async';
import 'dart:html' as html;
import 'dart:js_util' as js_util;

const _mapsScriptId = 'rideapp-google-maps-js';

bool isGoogleMapsLoaded() {
  final google = js_util.getProperty<Object?>(html.window, 'google');
  return google != null;
}

Future<bool> ensureGoogleMapsLoaded(String apiKey) async {
  if (apiKey.trim().isEmpty || apiKey == 'YOUR_GOOGLE_MAPS_API_KEY') {
    return false;
  }

  if (isGoogleMapsLoaded()) {
    return true;
  }

  final existing = html.document.getElementById(_mapsScriptId);
  if (existing is html.ScriptElement) {
    try {
      await existing.onLoad.first.timeout(const Duration(seconds: 8));
      return isGoogleMapsLoaded();
    } catch (_) {
      return isGoogleMapsLoaded();
    }
  }

  final script = html.ScriptElement()
    ..id = _mapsScriptId
    ..src = 'https://maps.googleapis.com/maps/api/js?key=$apiKey'
    ..defer = true
    ..async = true;

  final completer = Completer<bool>();
  script.onLoad.listen((_) => completer.complete(isGoogleMapsLoaded()));
  script.onError.listen((_) => completer.complete(false));
  html.document.head?.append(script);

  return completer.future.timeout(
    const Duration(seconds: 8),
    onTimeout: () => isGoogleMapsLoaded(),
  );
}
