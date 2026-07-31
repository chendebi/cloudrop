@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "PYTHON_EXE=%CD%\.venv\Scripts\python.exe"
set "CLIENT_DIR=%CD%\client"
set "ACCESS_PASSWORD=local-password"
set "AUTOMATION_MODE=0"
if /i "%CLOUDROP_AUTOMATION%"=="1" set "AUTOMATION_MODE=1"
if not defined CLOUDROP_LOCAL_DATABASE_URL set "CLOUDROP_LOCAL_DATABASE_URL=sqlite:///%CD:\=/%/db.sqlite3"

echo [Cloudrop] 正在检查本地运行环境...

powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 goto port_8000_busy

powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 goto port_5173_busy

if not exist "%PYTHON_EXE%" (
  echo [Cloudrop] 正在创建 Python 虚拟环境...
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 -m venv .venv
  ) else (
    python -m venv .venv
  )
  if errorlevel 1 goto setup_failed
)

"%PYTHON_EXE%" -c "import django, channels, uvicorn" >nul 2>nul
if errorlevel 1 (
  echo [Cloudrop] 正在安装 Python 依赖...
  "%PYTHON_EXE%" -m pip install -r requirements-dev.txt
  if errorlevel 1 goto setup_failed
)

if not exist "%CLIENT_DIR%\node_modules\.bin\vite.cmd" (
  echo [Cloudrop] 正在安装前端依赖...
  pushd "%CLIENT_DIR%"
  call npm install
  if errorlevel 1 (
    popd
    goto setup_failed
  )
  popd
)

set "CLOUDROP_TESTING=true"
set "DJANGO_DEBUG=true"
set "CLOUDROP_ACCESS_PASSWORD=%ACCESS_PASSWORD%"
set "DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1"
set "DATABASE_URL=%CLOUDROP_LOCAL_DATABASE_URL%"

echo [Cloudrop] 正在迁移本地数据库...
"%PYTHON_EXE%" manage.py migrate --noinput
if errorlevel 1 goto setup_failed

echo [Cloudrop] 正在初始化本地安全状态...
"%PYTHON_EXE%" manage.py shell -c "from transfer.security import get_security_snapshot; get_security_snapshot()"
if errorlevel 1 goto setup_failed

echo [Cloudrop] 正在启动后端与前端...
if "%AUTOMATION_MODE%"=="1" (
  start "" /b cmd /c ""%PYTHON_EXE%" -m uvicorn cloudrop.asgi:application --host 127.0.0.1 --port 8000"
  start "" /b /D "%CLIENT_DIR%" cmd /c "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"
) else (
  start "Cloudrop Backend" /D "%CD%" cmd /k ""%PYTHON_EXE%" -m uvicorn cloudrop.asgi:application --host 127.0.0.1 --port 8000"
  start "Cloudrop Frontend" /D "%CLIENT_DIR%" cmd /k "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"
)

powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(30); do { $api=[bool](Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue); $web=[bool](Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue); if ($api -and $web) { exit 0 }; Start-Sleep -Milliseconds 300 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 goto startup_failed

if "%AUTOMATION_MODE%"=="1" exit /b 0

echo.
echo [Cloudrop] 本地服务已启动。
echo [Cloudrop] 地址: http://127.0.0.1:5173
echo [Cloudrop] 访问密码: %ACCESS_PASSWORD%
echo [Cloudrop] 关闭新打开的 Backend 和 Frontend 窗口即可停止服务。
start "" "http://127.0.0.1:5173"
echo.
pause
exit /b 0

:port_8000_busy
echo [Cloudrop] 无法启动：端口 8000 已被占用。
echo [Cloudrop] 为避免影响现有程序，本脚本不会结束占用端口的进程。
goto failed

:port_5173_busy
echo [Cloudrop] 无法启动：端口 5173 已被占用。
echo [Cloudrop] 为避免影响现有程序，本脚本不会结束占用端口的进程。
goto failed

:setup_failed
echo [Cloudrop] 本地依赖或数据库准备失败，请查看上方错误信息。
goto failed

:startup_failed
echo [Cloudrop] 服务未能在 30 秒内启动，请查看 Backend 和 Frontend 窗口中的日志。

:failed
echo.
if "%AUTOMATION_MODE%"=="1" exit /b 1
pause
exit /b 1
