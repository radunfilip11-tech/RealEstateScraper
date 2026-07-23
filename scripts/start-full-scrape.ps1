# start-full-scrape.ps1
# Starts 6 background PowerShell windows, one for each worker.
# They will run the full-scrape.ts script across their assigned categories, split by county.

Write-Host "Starting 6 full-scrape workers..."

for ($i = 1; $i -le 6; $i++) {
    Write-Host "Launching Worker $i"
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit -Command `"npx tsx scripts/full-scrape.ts --worker $i --split-counties`""
    Start-Sleep -Seconds 2
}

Write-Host "All 6 workers have been started in separate windows."
