Virtual Communication Gateway (VCG) - Core Backend
🌍 Overview
This repository contains the backend infrastructure and API for the Virtual Communication Gateway (MI6228 - Group 13). It acts as the "brain" of the system, enabling secure peer-to-peer energy sharing across local communities. It processes live smart grid data using the IEEE 2030.5 standard, routes it through a FIWARE Context Broker, and ensures data sovereignty using an IDS Dataspace.

🚀 Core Features
IEEE 2030.5 REST API: Built with FastAPI to handle standard smart grid endpoints (/dcap, /edev, /mup, /dr).

Interoperability Engine: Ingests live sensor data (Group 12) and converts standard CSV/Excel energy data into the NGSI-LD format.

Time-Series Database: Utilizes InfluxDB to efficiently store and query massive amounts of timestamped generation and consumption data.

Containerized Architecture: Fully dockerized ecosystem allowing the FIWARE broker, database, and APIs to run seamlessly together.

🛠 Tech Stack
Language: Python

Framework: FastAPI

Database: InfluxDB

Interoperability: FIWARE (Orion), IDS Dataspace

Deployment: Docker & Render
