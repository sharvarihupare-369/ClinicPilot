from app.db.database import SessionLocal
from app.models.user import UserModel
from app.services.auth_service import create_access_token
import httpx
import asyncio

async def test():
    with SessionLocal() as db:
        user = db.query(UserModel).filter_by(id=5).first() # Doctor 10
        token = create_access_token(data={"sub": str(user.id), "email": user.email, "role": user.role})
    
    async with httpx.AsyncClient(base_url="http://localhost:8000/api") as client:
        res = await client.get("/doctors/me/availability?date=2026-10-09", headers={"Authorization": f"Bearer {token}"})
        print("Doctor 10 Status:", res.status_code)
        print("Doctor 10 Slots count:", len(res.json()))

    with SessionLocal() as db:
        user = db.query(UserModel).filter_by(id=1).first() # Doctor ?
        if user:
            token = create_access_token(data={"sub": str(user.id), "email": user.email, "role": user.role})
            async with httpx.AsyncClient(base_url="http://localhost:8000/api") as client:
                res = await client.get("/doctors/me/availability?date=2026-10-09", headers={"Authorization": f"Bearer {token}"})
                print("Doctor 1 Status:", res.status_code)
                print("Doctor 1 Slots count:", len(res.json()))

        
asyncio.run(test())
