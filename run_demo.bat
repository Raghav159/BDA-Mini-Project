@echo off
REM ==============================================================================
REM BDA Mini Project — Windows Launcher Batch Wrapper
REM Executes run_demo.ps1 with execution policy bypass
REM ==============================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_demo.ps1" %*
