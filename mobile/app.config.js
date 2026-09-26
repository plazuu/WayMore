// Extends app.json. Injects the Google Maps SDK key for native map tiles.
// Expo Go ships its own key, which Google currently rejects, so real tiles need a
// development build (`npx expo run:android`) with GOOGLE_MAPS_ANDROID_API_KEY set.
// This key is separate from the server's GOOGLE_MAPS_API_KEY: it ships in the app
// binary, so restrict it to "Maps SDK for Android/iOS" + your app's package/bundle id.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (!key) return config;
  return {
    ...config,
    android: { ...config.android, config: { ...config.android?.config, googleMaps: { apiKey: key } } },
  };
};
