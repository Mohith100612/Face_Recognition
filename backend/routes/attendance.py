from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from database import get_db
from models import Attendance
from face_service import get_embedding, save_base64_image
from datetime import date
import os

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.55"))


class DetectRequest(BaseModel):
    image: str  # base64 data URL


@router.post("/detect")
def detect_face(request: DetectRequest, db: Session = Depends(get_db)):
    temp_path = save_base64_image(request.image)

    try:
        # enforce=False so a slightly off-angle webcam frame still gets an embedding
        embedding = get_embedding(temp_path, enforce=False)
        if embedding is None:
            print("[detect] DeepFace could not extract embedding")
            return {"status": "no_face"}

        # Build the vector literal directly — avoids SQLAlchemy confusing
        # ':emb::vector' (named param + PG cast) as a malformed parameter name.
        # Safe: embedding_str is a list of floats from DeepFace, not user input.
        embedding_str = "[" + ",".join(map(str, embedding)) + "]"

        row = db.execute(
            text(f"""
                SELECT id, name, image_url,
                       embedding <=> '{embedding_str}'::vector AS distance
                FROM users
                ORDER BY embedding <=> '{embedding_str}'::vector
                LIMIT 1
            """)
        ).fetchone()

        if row is None:
            return {"status": "no_users_registered"}

        print(f"[detect] best match: '{row.name}' distance={row.distance:.4f} threshold={MATCH_THRESHOLD}")

        if row.distance > MATCH_THRESHOLD:
            return {"status": "not_registered", "distance": round(row.distance, 4)}

        # Check for duplicate attendance today
        today = date.today()
        already_attended = db.execute(
            text("SELECT id FROM attendance WHERE user_id = :uid AND DATE(timestamp) = :today"),
            {"uid": row.id, "today": today},
        ).fetchone()

        if not already_attended:
            db.add(Attendance(user_id=row.id, status="present"))
            db.commit()

        return {
            "status": "matched",
            "user": {
                "id": row.id,
                "name": row.name,
                "image_url": row.image_url,
                "already_attended": already_attended is not None,
            },
            "distance": round(row.distance, 4),
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.get("/logs")
def attendance_logs(db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT a.id, u.name, u.image_url, a.status, a.timestamp
            FROM attendance a
            JOIN users u ON u.id = a.user_id
            ORDER BY a.timestamp DESC
            LIMIT 200
        """)
    ).fetchall()

    return [
        {
            "id": r.id,
            "name": r.name,
            "image_url": r.image_url,
            "status": r.status,
            "timestamp": r.timestamp,
        }
        for r in rows
    ]
