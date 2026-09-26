# Shellhack2026 — Scenic Route & Tour Guide App

A mobile app that finds the most scenic route between two points, surfaces nearby landmarks and local restaurants along the way, and (in a future phase) narrates them aloud as you pass, like a local tour guide. Aimed at tourists and anyone who wants to get to know an area better.

## What it does

1. **Input**: user gives a start address and an end address.
2. **Route finding**: fetches candidate routes between the two points and scores them by how many notable landmarks and points of interest they pass, favoring the most scenic/interesting path over the fastest one.
3. **Landmarks & food stops**: pulls nearby landmarks (parks, viewpoints, historic sites, museums) and local restaurants along the route, using the Google Places API plus web search for richer descriptions and photos.
4. **Output**: a map showing the route with landmark and restaurant pins, each with a photo and a short description.
5. **(Future) Live tour guide mode**: using the device's live location, the app narrates landmarks and suggested food stops aloud as you approach them during the trip.

## Stack

- **Mobile app**: React Native (Expo), TypeScript
- **Backend**: Node/Express
- **Data**: Google Maps Platform (Places, Routes, Geocoding, Places Photos) + web search for enrichment

## Contributing

* Every feature should be on its own branch then merged, no push to main.
* See [`TODO.md`](./TODO.md) for the current task breakdown and suggested branch names.
