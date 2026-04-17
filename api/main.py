from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Virtual Gateway — IEEE 2030.5",
    description="Community Energy Balancing API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import devices, dr_events, readings, blocks

app.include_router(devices.router, prefix="/api/v1", tags=["Devices"])
app.include_router(dr_events.router, prefix="/api/v1", tags=["DR Events"])
app.include_router(readings.router, prefix="/api/v1", tags=["Readings"])
app.include_router(blocks.router, prefix="/api/v1", tags=["Blocks"])

@app.get("/")
def root():
    return {"message": "Virtual Gateway IEEE 2030.5 API is running!"}

@app.get("/health")
def health():
    return {"status": "healthy", "version": "1.0.0"}
