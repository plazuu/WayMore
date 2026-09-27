// googleMaps.ts reads the key at import time, so import this before ../src/app.
process.env.GOOGLE_MAPS_API_KEY ??= "test-key";
