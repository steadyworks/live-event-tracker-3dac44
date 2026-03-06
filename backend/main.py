import json
import sqlite3

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

DB_PATH = "/tmp/events.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            scheduled_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


init_db()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, msg: dict):
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_text(json.dumps(msg))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


def fetch_events():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, title, scheduled_at FROM events ORDER BY scheduled_at ASC"
    ).fetchall()
    conn.close()
    return [{"id": r["id"], "title": r["title"], "scheduled_at": r["scheduled_at"]} for r in rows]


class EventIn(BaseModel):
    title: str
    scheduled_at: str


@app.get("/events")
def list_events():
    return fetch_events()


@app.post("/events")
async def create_event(body: EventIn):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO events (title, scheduled_at) VALUES (?, ?)",
        (body.title, body.scheduled_at),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    events = fetch_events()
    await manager.broadcast({"type": "events", "data": events})
    return {"id": new_id, "title": body.title, "scheduled_at": body.scheduled_at}


@app.delete("/events/{event_id}")
async def delete_event(event_id: int):
    conn = get_db()
    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()
    events = fetch_events()
    await manager.broadcast({"type": "events", "data": events})
    return {"ok": True}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await manager.connect(ws)
    await ws.send_text(json.dumps({"type": "events", "data": fetch_events()}))
    await manager.broadcast({"type": "clients", "count": len(manager.active)})
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
        await manager.broadcast({"type": "clients", "count": len(manager.active)})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3001)
