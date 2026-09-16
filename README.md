# GCA FORCE-IPTV PRO

Starter full-stack project for an Android / Android TV IPTV client and connected administration API.

## Included
- Android app in Kotlin + XML layouts
- Android TV / remote-friendly UI
- Login
- Activation code flow
- Device registration and device limits
- Multi-DNS server configuration
- Connected REST backend (Node.js + Express + SQLite)
- Admin endpoints for users, activation codes, devices and DNS servers
- GCA FORCE-IPTV PRO branding placeholders

## Important
Only connect playlists, streams, logos and other media for which you have the necessary rights/authorization. The sample backend contains demo data only.

## Backend
cd backend
npm install
npm start

Default API: http://10.0.2.2:8080 for the Android emulator.
For a physical TV/box, set the API URL in `ApiConfig.kt` to the LAN address of the backend.

Demo admin:
email: admin@gcaforce.local
password: ChangeMe123!

Demo user:
email: demo@gcaforce.local
password: Demo123!
activation code: GCA-DEMO-2026

## Android
Open the `android` directory in Android Studio and run the app on an Android phone, TV emulator or Android TV device.
