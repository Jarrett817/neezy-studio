# download_ollama.ps1
# Downloads Ollama binary for bundling with Tauri app
# Usage: .\download_ollama.ps1 -Target windows|macos

param(
    [string]$Target = "windows"
)

$ErrorActionPreference = 'Stop'

$OllamaVersion = "0.22.1"
$ResourcesDir = Join-Path $PSScriptRoot "resources"

switch ($Target.ToLower()) {
    "windows" {
        $OllamaDir = Join-Path $ResourcesDir "windows"
        $OllamaExe = Join-Path $OllamaDir "ollama.exe"
        $OllamaUrl = "https://github.com/ollama/ollama/releases/download/v$OllamaVersion/ollama-windows-amd64.zip"

        if (!(Test-Path $OllamaDir)) {
            New-Item -ItemType Directory -Path $OllamaDir -Force | Out-Null
        }

        if (Test-Path $OllamaExe) {
            Write-Host "Ollama Windows already exists at $OllamaExe"
            exit 0
        }

        $ZipPath = Join-Path $OllamaDir "ollama-windows-amd64.zip"
        Write-Host "Downloading Ollama $OllamaVersion for Windows..."
        Invoke-WebRequest -Uri $OllamaUrl -OutFile $ZipPath -UserAgent "NeezyStudio/1.0"
        Write-Host "Extracting..."
        Expand-Archive -Path $ZipPath -DestinationPath $OllamaDir -Force
        Remove-Item $ZipPath -Force
        Write-Host "Done: $OllamaExe"
    }
    "macos" {
        $OllamaDir = Join-Path $ResourcesDir "macos"
        $OllamaBin = Join-Path $OllamaDir "ollama"
        # 注意：macOS 版本是 .tgz 格式，不是 .zip
        $OllamaUrl = "https://github.com/ollama/ollama/releases/download/v$OllamaVersion/ollama-darwin.tgz"

        if (!(Test-Path $OllamaDir)) {
            New-Item -ItemType Directory -Path $OllamaDir -Force | Out-Null
        }

        if (Test-Path $OllamaBin) {
            Write-Host "Ollama macOS already exists at $OllamaBin"
            exit 0
        }

        $TarPath = Join-Path $OllamaDir "ollama-darwin.tgz"
        Write-Host "Downloading Ollama $OllamaVersion for macOS..."
        Invoke-WebRequest -Uri $OllamaUrl -OutFile $TarPath -UserAgent "NeezyStudio/1.0"
        Write-Host "Extracting..."
        # 使用 tar 解压 .tgz 文件
        tar -xzf $TarPath -C $OllamaDir
        Remove-Item $TarPath -Force
        # macOS binary needs to be executable
        chmod +x $OllamaBin
        Write-Host "Done: $OllamaBin"
    }
    default {
        Write-Error "Unsupported target: $Target. Use 'windows' or 'macos'."
        exit 1
    }
}
