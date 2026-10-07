"""Doctor schemas."""

from pydantic import BaseModel


class DoctorSchema(BaseModel):
    id: int
    name: str
    specialty: str
    location: str
