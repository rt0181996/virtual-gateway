from fastapi import FastAPI

app = FastAPI(
    title="Virtual Gateway — IEEE 2030.5",
    description="Community Energy Balancing API",
    version="1.0.0"
)

from routers import devices, dr_events, readings

app.include_router(devices.router, prefix="/api/v1", tags=["Devices"])
app.include_router(dr_events.router, prefix="/api/v1", tags=["DR Events"])
app.include_router(readings.router, prefix="/api/v1", tags=["Readings"])

@app.get("/")
def root():
    return {"message": "Virtual Gateway IEEE 2030.5 API is running!"}

@app.get("/health")
def health():
    return {"status": "healthy", "version": "1.0.0"}