@echo off
set "BASE_DIR=%~dp0"
echo Iniciando Hub Administrativo...
start "" "%BASE_DIR%node_modules\electron\dist\electron.exe" "%BASE_DIR%."
exit

