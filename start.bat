@echo off
title "Be Hoc Chinh Ta & Hieu Van - Startup Script"

echo =================================================================
echo   KICH HOAT UNG DUNG: BE HOC CHINH TA ^& HIEU VAN
echo =================================================================
echo.

rem 1. Kiem tra moi truong Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay Node.js tren may tinh cua ban!
    echo Vui long tai va cai dat Node.js tu trang chu: https://nodejs.org/
    echo Sau khi cai dat xong, hay mo lai file start.bat nay.
    echo.
    pause
    exit /b
)

rem 2. Kiem tra va tu dong cai dat cac thu vien phu thuoc
if not exist "%~dp0node_modules\tsx\dist\cli.mjs" (
    echo [CAI DAT] Chua co thu vien hoac thu vien bi thieu nhu tsx.
    echo Dang tien hanh cai dat cac thu vien qua lenh npm install...
    echo Viec nay chi dien ra o lan dau tien. Vui long giu ket noi mang...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [LOI] Cai dat thu vien that bai! Vui long kiem tra lai ket noi mang.
        echo.
        pause
        exit /b
    )
    echo.
    echo [THANH CONG] Cai dat hoan tat toan bo thu vien!
    echo.
)

rem 3. Tu dong mo trinh duyet va chay ung dung
echo [KHOI DONG] Dang khoi chay may chu phat trien...
echo Giao dien hoc tap cua be se tu dong mo tren trinh duyet tai: http://localhost:3000
echo.
start http://localhost:3000

rem Khong su dung "npm run dev" de tranh loi phan tich ky tu dac biet "&" trong duong dan thu muc
rem Chay truc tiep cong cu tsx bang node voi duong dan duoc bao boc ky luong trong dau nhay kep
node "%~dp0node_modules\tsx\dist\cli.mjs" "%~dp0server.ts"
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Khong the khoi chay ung dung!
    echo Vui long kiem tra xem co ung dung nao khac dang chay o cong 3000 khong.
    echo.
)
pause
