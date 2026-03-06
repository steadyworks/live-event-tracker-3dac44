'use client'

import { useState, useEffect } from 'react'

interface EventItem {
  id: number
  title: string
  scheduled_at: string
}

const BACKEND = 'http://localhost:3001'
const WS_URL = 'ws://localhost:3001/ws'

export default function Home() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [clientCount, setClientCount] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [datetime, setDatetime] = useState('')

  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'events') setEvents(msg.data)
      else if (msg.type === 'clients') setClientCount(msg.count)
    }
    return () => ws.close()
  }, [])

  const handleAdd = async () => {
    if (!title.trim() || !datetime) return
    await fetch(`${BACKEND}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), scheduled_at: datetime }),
    })
    setTitle('')
    setDatetime('')
    setShowForm(false)
  }

  const handleDelete = async (id: number) => {
    await fetch(`${BACKEND}/events/${id}`, { method: 'DELETE' })
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Live Event Tracker</h1>
        <span
          data-testid="client-counter"
          className="bg-emerald-100 text-emerald-700 text-sm font-semibold px-3 py-1 rounded-full"
        >
          {clientCount} connected
        </span>
      </div>

      {/* Add Event Button */}
      <button
        data-testid="add-event-btn"
        onClick={() => setShowForm(true)}
        className="mb-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
      >
        + Add Event
      </button>

      {/* Add Event Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-6">New Event</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                data-testid="event-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date &amp; Time</label>
              <input
                data-testid="event-datetime-input"
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                data-testid="add-event-submit"
                onClick={handleAdd}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
              >
                Add Event
              </button>
              <button
                onClick={() => {
                  setShowForm(false)
                  setTitle('')
                  setDatetime('')
                }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event List */}
      <div data-testid="event-list">
        {events.length === 0 ? (
          <div
            data-testid="empty-state"
            className="text-center py-20 text-gray-400 text-lg"
          >
            No events scheduled. Add one to get started!
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li
                key={event.id}
                data-testid="event-item"
                className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  <p data-testid="event-title" className="font-semibold text-gray-900">
                    {event.title}
                  </p>
                  <p data-testid="event-datetime" className="text-sm text-gray-500 mt-0.5">
                    {event.scheduled_at.replace('T', ' ')}
                  </p>
                </div>
                <button
                  data-testid="delete-event-btn"
                  onClick={() => handleDelete(event.id)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
