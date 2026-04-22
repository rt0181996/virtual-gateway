from fastapi import APIRouter
from datetime import datetime
import json
from pathlib import Path

router = APIRouter()

# Persistent JSON storage (survives restarts on Render free tier)
STORAGE_FILE = Path("/tmp/vcg_data.json")

def load_db():
    if STORAGE_FILE.exists():
        try:
            return json.loads(STORAGE_FILE.read_text())
        except:
            pass
    return {
        "blocks": [],
        "group12": None,
        "devices": [],
        "der_commands": [],
        "trades": [],
        "dr_events": []
    }

def save_db(db):
    try:
        STORAGE_FILE.write_text(json.dumps(db, default=str))
    except Exception as e:
        print(f"Save error: {e}")

db = load_db()

# ═══════════════════════════════════════════════════════════
# BLOCKS (existing functionality)
# ═══════════════════════════════════════════════════════════
@router.post("/blocks")
def save_block(block: dict):
    block["updated_at"] = datetime.utcnow().isoformat()
    for i, b in enumerate(db["blocks"]):
        if b.get("id") == block.get("id"):
            db["blocks"][i] = block
            save_db(db)
            return {"status": "updated", "block": block}
    db["blocks"].append(block)
    save_db(db)
    return {"status": "created", "block": block}

@router.get("/blocks")
def get_blocks():
    return {"blocks": db["blocks"], "total": len(db["blocks"])}

@router.delete("/blocks/{block_id}")
def delete_block(block_id: str):
    db["blocks"] = [b for b in db["blocks"] if b.get("id") != block_id]
    save_db(db)
    return {"status": "deleted", "id": block_id}

@router.post("/blocks/group12")
def save_group12(data: dict):
    db["group12"] = {**data, "updated_at": datetime.utcnow().isoformat()}
    save_db(db)
    return {"status": "saved"}

@router.get("/blocks/group12")
def get_group12():
    if not db["group12"]:
        return {"data": None}
    return {"data": db["group12"]}

@router.post("/devices/sync")
def sync_devices(data: dict):
    db["devices"] = data.get("devices", [])
    save_db(db)
    return {"status": "synced", "total": len(db["devices"])}

@router.get("/devices/sync")
def get_devices():
    return {"devices": db["devices"], "total": len(db["devices"])}

# ═══════════════════════════════════════════════════════════
# DER COMMANDS (IEEE 2030.5 Grid Operator Controls)
# ═══════════════════════════════════════════════════════════
@router.post("/der/commands")
def log_der_command(cmd: dict):
    cmd["timestamp"] = datetime.utcnow().isoformat()
    cmd["status"] = "Executed"
    cmd["protocol"] = "IEEE 2030.5"
    cmd["server_id"] = f"SRV-{len(db['der_commands'])+1:04d}"
    db["der_commands"].insert(0, cmd)
    db["der_commands"] = db["der_commands"][:100]
    save_db(db)
    return {"status": "logged", "command": cmd, "total_commands": len(db["der_commands"])}

@router.get("/der/commands")
def get_der_commands(limit: int = 50):
    return {
        "commands": db["der_commands"][:limit],
        "total": len(db["der_commands"]),
        "protocol": "IEEE 2030.5",
        "server_time": datetime.utcnow().isoformat()
    }

@router.delete("/der/commands")
def clear_der_commands():
    db["der_commands"] = []
    save_db(db)
    return {"status": "cleared"}

# ═══════════════════════════════════════════════════════════
# P2P TRADES
# ═══════════════════════════════════════════════════════════
@router.post("/trades")
def execute_trade(trade: dict):
    trade["timestamp"] = datetime.utcnow().isoformat()
    trade["status"] = "Settled"
    trade["settlement_id"] = f"SETTL-{len(db['trades'])+1:04d}"
    db["trades"].insert(0, trade)
    db["trades"] = db["trades"][:100]
    save_db(db)
    return {"status": "settled", "trade": trade, "total_trades": len(db["trades"])}

@router.get("/trades")
def get_trades(limit: int = 50):
    total_volume = sum(t.get("amount", 0) for t in db["trades"])
    total_value = sum(t.get("value", 0) for t in db["trades"])
    total_co2 = sum(t.get("co2", 0) for t in db["trades"])
    
    return {
        "trades": db["trades"][:limit],
        "total_trades": len(db["trades"]),
        "statistics": {
            "total_volume_kWh": round(total_volume, 2),
            "total_value_EUR": round(total_value, 2),
            "total_co2_saved_kg": round(total_co2, 2),
        },
        "server_time": datetime.utcnow().isoformat()
    }

@router.delete("/trades")
def clear_trades():
    db["trades"] = []
    save_db(db)
    return {"status": "cleared"}

# ═══════════════════════════════════════════════════════════
# DEMAND RESPONSE EVENTS
# ═══════════════════════════════════════════════════════════
@router.post("/dr/events")
def log_dr_event(event: dict):
    event["timestamp"] = datetime.utcnow().isoformat()
    event["status"] = "Dispatched"
    event["dispatch_id"] = f"DR-{len(db['dr_events'])+1:04d}"
    db["dr_events"].insert(0, event)
    db["dr_events"] = db["dr_events"][:100]
    save_db(db)
    return {"status": "dispatched", "event": event, "total_events": len(db["dr_events"])}

@router.get("/dr/events")
def get_dr_events(limit: int = 50):
    total_reduction = sum(e.get("reduction", 0) for e in db["dr_events"])
    total_savings = sum(e.get("savings", 0) for e in db["dr_events"])
    
    return {
        "events": db["dr_events"][:limit],
        "total_events": len(db["dr_events"]),
        "statistics": {
            "total_reduction_kW": round(total_reduction, 2),
            "total_savings_EUR": round(total_savings, 2),
        },
        "server_time": datetime.utcnow().isoformat()
    }

@router.delete("/dr/events")
def clear_dr_events():
    db["dr_events"] = []
    save_db(db)
    return {"status": "cleared"}
