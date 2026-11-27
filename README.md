# SchoolMaster — Complete AI-Powered School Management System (Web + Android)

SchoolMaster is a full-stack School Management System with a React + TypeScript + Express web platform, Firebase Firestore cloud persistence, a server-side Gemini multimodal AI engine (English, Urdu, and Kashmiri), and a native Android wrapper/offline project under `android-app/`.

---

## Key Capabilities

- **Data Preservation & Safe Synchronization**: Preserves existing students, teachers, marks, attendance, leave records, HPC records, and school profile settings with duplicate prevention and audit trails.
- **Central Student Photograph Management**: Upload from mobile gallery or capture with the device camera once per student ID. Updated photos sync automatically across Student Profile, Daily Attendance Register, Holistic Progress Cards (HPC), Marks Cards, and Student Reports.
- **Advanced Attendance Register & Live QR Scanner**:
  - Daily attendance (Present, Absent, Late, Approved Leave) with student photographs, search, filters, inline editing, and confirmed deletion.
  - Integrated Live Camera QR Code Scanner tab (`html5-qrcode`) for automatic touchless check-in, batch scanning, GPS verification, and camera diagnostics.
  - Recharts **7-Day Weekly Attendance Trend Line Chart** and **30-Day Trend Analysis**.
  - Formatted **Daily Attendance PDF Summary**, CSV, and Excel exports plus print views.
- **Holistic Progress Cards (HPC) & Examination Marks**: Subject-wise marks entry, automatic totals/percentages/grades, single-line auto-fit Teacher Remarks (150 chars), student photograph integration, PDF download, and print support.
- **Teacher & Student Leave Management**: Apply, approve/reject with audit logs, edit, filter, and download reports without disturbing historical leave records.
- **Multilingual AI Studio on the Dashboard**:
  - **Multilingual AI Question Assistant**: Supports **English, Urdu (RTL), and Kashmiri (RTL)** with both text and image Q&A (camera capture + gallery upload), conversation history, copy, share, and PDF export.
  - **AI Lesson Plan Generator**: Generates structured 13-section lesson plans in English, Urdu, or Kashmiri with Edit, Save, Regenerate, Delete, Print, Share, PDF download, and Word (`.doc`) download.

---

## 1. Local Installation & Development

### Prerequisites

- **Node.js** `>= 20.x` and **npm** `>= 10.x`
- **JDK 17** and **Android Studio (Ladybug / Koala or newer)** with Android SDK 34 (only required for compiling Android APKs locally)

### Setup Steps

1. **Clone the repository**:
   ```bash
   git clone <YOUR_GITHUB_REPOSITORY_URL>
   cd <YOUR_REPOSITORY_FOLDER>
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Copy `.env.example` to `.env` and fill in your values (never commit `.env` to Git):
   ```bash
   cp .env.example .env
   ```

   Required environment variables:
   ```env
   # Server-side Gemini API key (NEVER expose in frontend or Android source code)
   GEMINI_API_KEY="your_gemini_api_key_here"

   # Production HTTPS URL where the SchoolMaster web backend is deployed
   APP_URL="https://ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app"
   ```

   > **Security Note**: `GEMINI_API_KEY` is read strictly on the Node.js/Express server (`server.ts`). Never prefix it with `VITE_` and never embed it in `android-app/` source files.

4. **Run the development server** (runs Express + Vite on port `3000`):
   ```bash
   npm run dev
   ```

5. **Run TypeScript checks and production web build**:
   ```bash
   npm run lint
   npm run build
   ```

---

## 2. Building Android Debug & Release APKs

The native Android project lives in the `android-app/` directory (`applicationId: in.gov.jk.schoolmaster`, `compileSdk 34`, `minSdk 26`, Kotlin + Jetpack Compose + WebView + Room + CameraX).

### Option A: Automated Build via GitHub Actions (Recommended)

This repository includes `.github/workflows/android-build.yml`, which automatically compiles both **Debug** and **Release** APKs whenever code is pushed to `main` (or triggered manually via **Actions → Build SchoolMaster Android APK → Run workflow**).

1. Push your repository to GitHub (on a feature/upgrade branch first, then merge to `main`):
   ```bash
   git checkout -b upgrade/schoolmaster-ai
   git add .
   git commit -m "Upgrade SchoolMaster with Multilingual AI, Lesson Plan Generator, Attendance PDF & Android CI"
   git push -u origin upgrade/schoolmaster-ai
   ```
2. In your GitHub repository, open **Settings → Secrets and variables → Actions** and optionally add:
   - `APP_URL`: Your deployed HTTPS backend URL
   - `ANDROID_KEYSTORE_BASE64`: Base64-encoded `.jks` signing keystore (`base64 -w 0 schoolmaster-release.jks`)
   - `ANDROID_KEYSTORE_PASSWORD`: Keystore password
   - `ANDROID_KEY_ALIAS`: Signing key alias
   - `ANDROID_KEY_PASSWORD`: Signing key password
3. Open the **Actions** tab, click the latest **Build SchoolMaster Android APK** run, and download **`SchoolMaster-Debug-APK`**, **`SchoolMaster-Release-APK`**, or **`SchoolMaster-Release-AAB`** from the **Artifacts** section.
4. Pushing a version tag (e.g., `git tag v1.0.5 && git push origin v1.0.5`) automatically creates a **GitHub Release** with attached APKs.

### Option B: Build Locally with Android Studio or Gradle CLI

1. Open the `android-app/` folder in **Android Studio**, wait for Gradle sync (JDK 17, Gradle 8.9), and run **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
2. Or build from the command line inside `android-app/`:

   **Debug APK**:
   ```bash
   cd android-app
   gradle assembleDebug
   ```
   Output: `android-app/app/build/outputs/apk/debug/app-debug.apk`

   **Signed Release APK**:
   First generate a keystore if you don't already have one:
   ```bash
   keytool -genkeypair -v \
     -keystore schoolmaster-release.jks \
     -alias schoolmaster \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   Then run the release build with environment variables:
   ```bash
   export APP_URL="https://ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app"
   export ANDROID_KEYSTORE_PATH="app/schoolmaster-release.jks"
   export ANDROID_KEYSTORE_PASSWORD="YOUR_STORE_PASSWORD"
   export ANDROID_KEY_ALIAS="schoolmaster"
   export ANDROID_KEY_PASSWORD="YOUR_KEY_PASSWORD"

   gradle assembleRelease
   ```
   Output: `android-app/app/build/outputs/apk/release/app-release.apk`

   **Signed Android App Bundle (AAB) for Google Play**:
   ```bash
   gradle bundleRelease
   ```
   Output: `android-app/app/build/outputs/bundle/release/app-release.aab`

---

## 3. Android Permissions Configured

`android-app/app/src/main/AndroidManifest.xml` declares:
- `INTERNET` & `ACCESS_NETWORK_STATE` — cloud sync & live connection checks
- `CAMERA` — student photograph capture, QR code attendance scanning, and AI homework photo capture
- `READ_EXTERNAL_STORAGE` & `READ_MEDIA_IMAGES` — gallery uploads for student photographs and AI image questions
- `WRITE_EXTERNAL_STORAGE` (`maxSdkVersion="28"`) — legacy Android PDF/Excel report downloads
- `ACCESS_FINE_LOCATION` & `ACCESS_COARSE_LOCATION` — attendance geofencing verification
- `POST_NOTIFICATIONS` & `USE_BIOMETRIC` — alerts and protected administrative workflows

---

## 4. Data Backup & Security Checklist

- Keep `.env`, `*.jks`, `*.keystore`, and local student data backups excluded from version control (`.gitignore`).
- Store `GEMINI_API_KEY` only in server environment secrets (AI Studio **Settings → Secrets** or cloud host environment variables).
- Review and harden `firestore.rules` before sharing the deployment broadly.
