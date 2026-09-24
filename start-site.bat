@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not exist "%NODE_EXE%" (
    for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
)

if not exist "%NODE_EXE%" (
    echo Node.js nao foi encontrado. Instale Node.js e tente novamente.
    pause
    exit /b 1
)

echo Iniciando Orcamentos Odin e aguardando o servidor ficar pronto...
"%NODE_EXE%" "%~dp0launcher.js"
if errorlevel 1 (
    echo O site nao conseguiu iniciar.
    pause
    exit /b 1
)
