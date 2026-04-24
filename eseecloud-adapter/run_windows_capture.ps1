# PowerShell helper to run capture + server on Windows
# Usage: Open PowerShell and run this script from the eseecloud-adapter folder.

$env:PYTHONPATH = "$PSScriptRoot"
python -m pip install -r "$PSScriptRoot\requirements.txt"
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "$PSScriptRoot\capture.py"
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "$PSScriptRoot\server.py"
Write-Host "Capture and server started. Frames written to ./frames and served on port 6000."
