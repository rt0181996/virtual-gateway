from fastapi import APIRouter
from datetime import datetime

router = APIRouter()
events_db = []

@router.get("/dr/events")
def list_events():
    return {"events": events_db, "total": len(events_db)}

@router.post("/dr/events")
def create_event(event: dict):
    event["id"] = len(events_db) + 1
    event["status"] = "scheduled"
    event["created_at"] = datetime.utcnow().isoformat()
    events_db.append(event)
    return {"status": "created", "event": event}

@router.put("/dr/events/{event_id}/cancel")
def cancel_event(event_id: int):
    for e in events_db:
        if e.get("id") == event_id:
            e["status"] = "cancelled"
            return {"status": "cancelled", "event": e}
    return {"error": "Event not found"}