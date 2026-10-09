from app.db.database import SessionLocal
from app.models.user import UserModel
from app.services.auth_service import create_access_token
import httpx
import asyncio

async def test():
    with SessionLocal() as db:
        user = db.query(UserModel).filter_by(role="DOCTOR").first()
        token = create_access_token(data={"sub": str(user.id), "email": user.email, "role": user.role})
    
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        res = await client.get("/doctors/me/availability?date=2026-10-09", headers={"Authorization": f"Bearer {token}"})
        print("Status:", res.status_code)
        print("Slots count:", len(res.json()))
        
asyncio.run(test())
