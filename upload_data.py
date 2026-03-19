import pandas as pd
import requests
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

# Config
INFLUX_URL = "http://localhost:8086"
INFLUX_TOKEN = "F5qPXJNO8S_fRQgl42ubxgLjqwC55RKYBd36CrBo0tD2PSHs5n-1viYoB8mM-aNzZK-a4EdOV-H_n-tKI5Zkrg=="
INFLUX_ORG = "virtual-gateway"
INFLUX_BUCKET = "energy_readings"
ORION_URL = "http://localhost:1026/v2/entities"
API_URL = "http://localhost:8000/api/v1"

# Read Excel
print("Reading Excel file...")
devices_df = pd.read_excel("energy_data.xlsx", sheet_name="Devices")
readings_df = pd.read_excel("energy_data.xlsx", sheet_name="Readings")
events_df = pd.read_excel("energy_data.xlsx", sheet_name="DR_Events")

# Upload Devices to Orion (create or update)
print("\nUploading devices to FIWARE Orion...")
for _, row in devices_df.iterrows():
    payload = {
        "id": row["id"],
        "type": row["type"],
        "deviceType": {"type": "Text", "value": row["deviceType"]},
        "community": {"type": "Text", "value": row["community"]},
        "realPower": {"type": "Number", "value": row["realPower"]},
        "voltage": {"type": "Number", "value": row["voltage"]},
        "status": {"type": "Text", "value": row["status"]},
        "location": {"type": "Text", "value": str(row["location"])},
        "manufacturer": {"type": "Text", "value": str(row["manufacturer"])},
        "installDate": {"type": "Text", "value": str(row["install_date"])},
        "serialNumber": {"type": "Text", "value": str(row["serial_number"])},
        "description": {"type": "Text", "value": str(row["description"])}
    }
    r = requests.post(ORION_URL, json=payload)
    if r.status_code == 422:
        update_url = f"{ORION_URL}/{row['id']}/attrs"
        update_payload = {
            "deviceType": {"type": "Text", "value": row["deviceType"]},
            "community": {"type": "Text", "value": row["community"]},
            "realPower": {"type": "Number", "value": row["realPower"]},
            "voltage": {"type": "Number", "value": row["voltage"]},
            "status": {"type": "Text", "value": row["status"]},
            "location": {"type": "Text", "value": str(row["location"])},
            "manufacturer": {"type": "Text", "value": str(row["manufacturer"])},
            "installDate": {"type": "Text", "value": str(row["install_date"])},
            "serialNumber": {"type": "Text", "value": str(row["serial_number"])},
            "description": {"type": "Text", "value": str(row["description"])}
        }
        r = rr = requests.patch(update_url, json=update_payload, params={"options": "keyValues"})
    else:
        print(f"Device {row['id']}: Created ({r.status_code})")

# Upload Readings to InfluxDB
print("\nUploading readings to InfluxDB...")
client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
write_api = client.write_api(write_options=SYNCHRONOUS)
for _, row in readings_df.iterrows():
    point = Point("power") \
        .tag("device", row["device"]) \
        .tag("community", row["community"]) \
        .field("real_power", float(row["real_power"])) \
        .field("voltage", float(row["voltage"])) \
        .field("temperature", float(row["temperature"])) \
        .field("frequency", float(row["frequency"])) \
        .field("energy_kwh", float(row["energy_kwh"])) \
        .field("current_a", float(row["current_a"]))
    write_api.write(bucket=INFLUX_BUCKET, record=point)
    print(f"Reading for {row['device']}: uploaded!")

# Upload DR Events to API
print("\nUploading DR events to API...")
for _, row in events_df.iterrows():
    payload = {
        "name": row["name"],
        "community": row["community"],
        "start_time": str(row["start_time"]),
        "duration_minutes": int(row["duration_minutes"]),
        "reduction_kw": float(row["reduction_kw"])
    }
    r = requests.post(f"{API_URL}/dr/events", json=payload)
    print(f"DR Event {row['name']}: {r.status_code}")

print("\n✅ All data uploaded successfully!")