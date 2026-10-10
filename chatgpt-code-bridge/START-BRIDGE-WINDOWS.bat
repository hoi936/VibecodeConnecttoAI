@echo off
setlocal
cd /d "%~dp0"
if not defined BRIDGE_PORT set BRIDGE_PORT=3213
if not defined BRIDGE_DATA_DIR set BRIDGE_DATA_DIR=.local\gemini-preview
if not defined BRIDGE_LEGACY_URL set BRIDGE_LEGACY_URL=http://127.0.0.1:3210
call START-WINDOWS.bat
