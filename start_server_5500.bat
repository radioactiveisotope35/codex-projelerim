\
@echo off
setlocal
REM Basit yerel sunucu (Python) - bulunduğunuz klasörden yayına alır
REM Dosyayı bu klasöre koyun: C:\Users\aserd\Desktop\codex-main
REM Sonra çift tıklayın. http://localhost:5500/ adresine açar.

where py >nul 2>nul
if errorlevel 1 (
  echo Python bulunamadI. Node.js varsa 'npx http-server -p 5500' kullanabilirsiniz.
  pause
  exit /b 1
)

set PORT=5500
start "" http://localhost:%PORT%/index.html
py -3 -m http.server %PORT%
