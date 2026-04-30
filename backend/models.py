from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from pgvector.sqlalchemy import Vector
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    image_url = Column(String)
    embedding = Column(Vector(128))  # Facenet produces 128-dim embeddings
    registered_at = Column(DateTime, default=datetime.utcnow)


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String(50), default="present")
    timestamp = Column(DateTime, default=datetime.utcnow)
