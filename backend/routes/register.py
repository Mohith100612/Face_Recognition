from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import User, Attendance
from face_service import get_embedding, save_upload_bytes, save_base64_image, UPLOAD_DIR
import os

router = APIRouter(prefix="/api/register", tags=["register"])


@router.post("")
async def register_user(
    name: str = Form(...),
    image: UploadFile = File(None),
    image_base64: str = Form(None),
    db: Session = Depends(get_db),
):
    if not image and not image_base64:
        raise HTTPException(status_code=400, detail="Provide either image file or base64 image.")

    if image:
        file_bytes = await image.read()
        filepath, filename = save_upload_bytes(file_bytes, image.filename)
        image_url = f"/uploads/{filename}"
    else:
        filepath = save_base64_image(image_base64)
        image_url = f"/uploads/{os.path.basename(filepath)}"

    embedding = get_embedding(filepath)
    if embedding is None:
        # Remove saved file if no face found
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=400, detail="No face detected. Use a clear, front-facing photo.")

    user = User(name=name.strip(), image_url=image_url, embedding=embedding)
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"success": True, "user_id": user.id, "name": user.name}


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.registered_at.desc()).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "image_url": u.image_url,
            "registered_at": u.registered_at,
        }
        for u in users
    ]


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # 1. Delete all attendance records for this user first (foreign key constraint)
    db.query(Attendance).filter(Attendance.user_id == user_id).delete()

    # 2. Delete the photo file from disk
    if user.image_url:
        filename = user.image_url.lstrip("/uploads/")
        filepath = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(filepath):
            os.remove(filepath)

    # 3. Delete the user
    db.delete(user)
    db.commit()

    return {"success": True}
