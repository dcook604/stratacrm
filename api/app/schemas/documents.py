"""Pydantic schemas for document storage."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    original_filename: Optional[str]
    mime_type: Optional[str]
    file_size_bytes: Optional[int]
    linked_entity_type: Optional[str]
    linked_entity_id: Optional[int]
    uploaded_at: datetime
    download_url: str  # set by endpoint
