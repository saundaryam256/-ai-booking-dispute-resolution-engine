import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .routers.disputes import router as disputes_router, seed_samples
from .routers.policies import router as policies_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_samples(db)
    yield


app = FastAPI(
    title="AI Booking Dispute & Resolution Engine",
    description="Evidence-aware dispute investigation with administrator-owned final decisions.",
    version="1.0.0",
    lifespan=lifespan,
)
origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGIN",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(disputes_router)
app.include_router(policies_router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "mode": "llm" if os.getenv("OPENAI_API_KEY", "").strip() else "demo"}
