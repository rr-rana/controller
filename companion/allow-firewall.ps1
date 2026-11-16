# Allows the phone to reach the companion over Wi-Fi (private networks only).
# Run in an elevated PowerShell:  powershell -ExecutionPolicy Bypass -File .\allow-firewall.ps1
param([int]$Port = 8765)
$name = "ETS2 RR Controller companion (TCP $Port)"
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private | Out-Null
Write-Host "Firewall rule added: $name (Private profile). Make sure your Wi-Fi network is set to 'Private'."
