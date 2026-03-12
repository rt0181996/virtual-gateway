from fastapi import APIRouter
from datetime import datetime

router = APIRouter()

@router.post("/mup/{sfdi}/readings")
def push_reading(sfdi: str, reading: dict):
    reading["device"] = sfdi
    reading["timestamp"] = datetime.utcnow().isoformat()
    return {"status": "stored", "reading": reading}

@router.get("/community/{community_id}/balance")
def get_balance(community_id: str):
    return {
        "community": community_id,
        "total_generation_kw": 5.2,
        "total_consumption_kw": 3.8,
        "net_balance_kw": 1.4,
        "status": "surplus"
    }