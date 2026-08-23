@echo off
echo ==========================================
echo    PITWALL WINDOWS EXECUTABLE BUILDER
echo ==========================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3 from python.org and try again.
    pause
    exit /b
)

echo [1/4] Installing dependencies from requirements.txt...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies!
    pause
    exit /b
)

echo [2/4] Installing PyInstaller...
pip install pyinstaller

echo [3/4] Compiling Pitwall into a standalone Executable...
:: Clean up old corrupted builds
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

:: Build it as a SINGLE FILE application with hidden console
:: Output directly to a new folder on the Desktop, handling OneDrive
set DESKTOP_PATH=%USERPROFILE%\Desktop
if exist "%USERPROFILE%\OneDrive\Desktop" set DESKTOP_PATH=%USERPROFILE%\OneDrive\Desktop

pyinstaller --noconfirm --onefile --windowed ^
  --add-data "templates;templates/" ^
  --add-data "static;static/" ^
  --hidden-import="engineio.async_drivers.threading" ^
  --hidden-import="edge_tts" ^
  --hidden-import="gtts" ^
  --hidden-import="pyttsx3" ^
  --hidden-import="pyttsx3.drivers" ^
  --hidden-import="pyttsx3.drivers.sapi5" ^
  --icon="icon.ico" ^
  --distpath "%DESKTOP_PATH%\Pitwall" ^
  --name "Pitwall_Live_Telemetry" ^
  app.py

echo [4/4] Build complete!
echo.
echo ======================================================================
echo YOUR APP IS READY!
echo The Pitwall folder has been created on your Windows Desktop.
echo Automatically opening the folder now...
explorer "%DESKTOP_PATH%\Pitwall"
echo ======================================================================
echo Inside it, you will find 'Pitwall_Live_Telemetry.exe'.
echo Double-click that single file to launch the app!
echo ======================================================================
echo.
pause
