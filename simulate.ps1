while ($true) {
    $powerA = Get-Random -Minimum 200 -Maximum 800
    $voltageA = Get-Random -Minimum 220 -Maximum 240
    $powerB = Get-Random -Minimum 150 -Maximum 600
    $voltageB = Get-Random -Minimum 220 -Maximum 240

    docker exec influxdb influx write --bucket energy_readings --org virtual-gateway --token "F5qPXJNO8S_fRQgl42ubxgLjqwC55RKYBd36CrBo0tD2PSHs5n-1viYoB8mM-aNzZK-a4EdOV-H_n-tKI5Zkrg==" --precision s "power,device=SmartMeter001,community=BlockA real_power=$powerA,voltage=$voltageA"

    docker exec influxdb influx write --bucket energy_readings --org virtual-gateway --token "F5qPXJNO8S_fRQgl42ubxgLjqwC55RKYBd36CrBo0tD2PSHs5n-1viYoB8mM-aNzZK-a4EdOV-H_n-tKI5Zkrg==" --precision s "power,device=SmartMeter002,community=BlockB real_power=$powerB,voltage=$voltageB"

    Start-Sleep -Seconds 5
}