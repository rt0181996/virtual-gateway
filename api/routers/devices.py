from fastapi import APIRouter

router = APIRouter()

devices_db = []

@router.post("/edev")
def register_device(device: dict):
    devices_db.append(device)
    return {"status": "registered", "device": device}

@router.get("/edev")
def list_devices():
    return {"devices": devices_db, "total": len(devices_db)}

@router.get("/edev/{sfdi}")
def get_device(sfdi: str):
    for d in devices_db:
        if d.get("sfdi") == sfdi:
            return d
    return {"error": "Device not found"}