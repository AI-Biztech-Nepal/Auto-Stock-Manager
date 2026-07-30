"""Local-only dev entrypoint: runs the real FastAPI app against an in-memory
mongomock database instead of a real MongoDB, so the kit/BOM feature can be
previewed on localhost without any real credentials or data.

Not used by production (Dockerfile/render.yaml/railway.toml all point at
server:app directly) — this file is purely for local preview and is safe to
delete once the preview is done.
"""
import motor.motor_asyncio
from mongomock_motor import AsyncMongoMockClient

motor.motor_asyncio.AsyncIOMotorClient = AsyncMongoMockClient

import uvicorn

if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8001, reload=False)
