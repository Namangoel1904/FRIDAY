# FRIDAY Revival Setup (Vertex AI + ADC)

## 1. Google Cloud Project Setup

1. Open Google Cloud Console: https://console.cloud.google.com/
2. Select or create a Google Cloud project for FRIDAY.
3. Make sure **Billing** is enabled (free trial $300 credits work).
4. Open **APIs & Services > Library**.
5. Search for and enable **Vertex AI API**.

## 2. Install Google Cloud CLI

Download and install from: https://cloud.google.com/sdk/docs/install

After installation, open a new terminal and run:

```powershell
gcloud init
```

Select your FRIDAY project when prompted.

## 3. Authenticate with ADC

Run this command once. It opens a browser for Google login:

```powershell
gcloud auth application-default login
```

This stores your credentials locally at:
```
%APPDATA%\gcloud\application_default_credentials.json
```

FRIDAY's `google-auth-library` picks up this file automatically — no environment variable or JSON key file needed.

## 4. Configure `.env`

```env
GOOGLE_CLOUD_PROJECT_ID=your-project-id-here
GOOGLE_CLOUD_LOCATION=us-central1
FRIDAY_LOG_LEVEL=INFO
```

- `GOOGLE_CLOUD_PROJECT_ID`: Your GCP project ID (not the project number).
- `GOOGLE_CLOUD_LOCATION`: Region for Vertex AI. `us-central1` is recommended.

## 5. Install local tools

FRIDAY needs these commands available:

- Node.js and npm
- FFmpeg and FFplay
- Python, for future local automation work

Recommended Windows installs:

- Node.js: https://nodejs.org/
- Python: https://www.python.org/downloads/
- FFmpeg: https://www.gyan.dev/ffmpeg/builds/

For Python, check **Add python.exe to PATH** in the installer.

FFmpeg can also live at:

```text
C:\Users\<you>\Tools\ffmpeg\bin\ffmpeg.exe
C:\Users\<you>\Tools\ffmpeg\bin\ffplay.exe
```

If FFmpeg is elsewhere, set these in `.env`:

```env
FFMPEG_PATH=C:\path\to\ffmpeg.exe
FFPLAY_PATH=C:\path\to\ffplay.exe
```

## 6. Install dependencies

```powershell
npm install
```

## 7. Run FRIDAY

```powershell
npm run dev
```

## Working Features

- Voice streaming through Gemini Live (Vertex AI)
- OAuth2 authentication via Application Default Credentials (no JSON key files)
- Automatic token refresh on WebSocket reconnect
- Wake word handling for "Friday"
- Screen capture and visual analysis through `capture_screen`
- File search through `file_search`
- Directory listing through `list_directory`
- Current working directory switching through `change_directory`
- Permission-gated folder creation and opening files/folders
- Browser URL/search opening through `open_browser`

## Architecture Note

FRIDAY connects to the **Vertex AI LlmBidiService** endpoint via WebSocket.
Authentication uses **Application Default Credentials** (ADC), which are
set up by running `gcloud auth application-default login`. The `google-auth-library`
automatically discovers and uses these credentials. OAuth tokens are refreshed
on every WebSocket reconnect (~60 min expiry).
