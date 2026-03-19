$cred = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:password"))
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Basic $cred"
}

# Create Catalog
Invoke-WebRequest -Uri "https://localhost:8181/api/catalogs" -Method POST -Headers $headers -Body '{"title":"Virtual Gateway Energy Data","description":"Community energy data from Block A and Block B - IEEE 2030.5"}' -UseBasicParsing | Out-Null
Write-Host "Catalog created!"

# Create Block A offer
Invoke-WebRequest -Uri "https://localhost:8181/api/offers" -Method POST -Headers $headers -Body '{"title":"Block A Energy Readings","description":"Real-time power and voltage data from Block A","keywords":["energy","IEEE2030.5","BlockA"],"publisher":"https://virtual-gateway.onrender.com","language":"EN","license":"https://creativecommons.org/licenses/by/4.0/","sovereign":"https://virtual-gateway.onrender.com"}' -UseBasicParsing | Out-Null
Write-Host "Block A offer created!"

# Create Block B offer
Invoke-WebRequest -Uri "https://localhost:8181/api/offers" -Method POST -Headers $headers -Body '{"title":"Block B Energy Readings","description":"Real-time power and voltage data from Block B","keywords":["energy","IEEE2030.5","BlockB"],"publisher":"https://virtual-gateway.onrender.com","language":"EN","license":"https://creativecommons.org/licenses/by/4.0/","sovereign":"https://virtual-gateway.onrender.com"}' -UseBasicParsing | Out-Null
Write-Host "Block B offer created!"

Write-Host "✅ Dataspace setup complete!"