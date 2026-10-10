import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MessageCircle, Send, X } from "lucide-react";

import { supabase } from "../lib/supabase";
import locations from "../data/locations.json";
import { askUpsrtcAssistant } from "../lib/passengerAssistant";
import "../styles/PassengerChatbot.css";

const today = () => new Date().toISOString().slice(0, 10);
const normalize = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

function findLocations(text) {
  const normalizedText = normalize(text);
  const matches = locations
    .map((location) => ({
      name: location.name,
      index: normalizedText.indexOf(normalize(location.name)),
      length: normalize(location.name).length,
    }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index || b.length - a.length);

  const found = [];
  let lastEnd = -1;

  for (const match of matches) {
    if (match.index >= lastEnd) {
      found.push(match.name);
      lastEnd = match.index + match.length;
    }
  }

  return found;
}

async function findBusMatches(from, to) {
  const [fromResult, toResult] = await Promise.all([
    supabase
      .from("bus_schedule")
      .select("bus_id, stop_order, station_name, departure_time")
      .ilike("station_name", from),
    supabase
      .from("bus_schedule")
      .select("bus_id, stop_order, station_name, arrival_time")
      .ilike("station_name", to),
  ]);

  if (fromResult.error) throw fromResult.error;
  if (toResult.error) throw toResult.error;

  const destinationsByBus = new Map();

  for (const stop of toResult.data || []) {
    const list = destinationsByBus.get(stop.bus_id) || [];
    list.push(stop);
    destinationsByBus.set(stop.bus_id, list);
  }

  const matches = new Map();

  for (const boardingStop of fromResult.data || []) {
    const laterDestination = (destinationsByBus.get(boardingStop.bus_id) || [])
      .filter((stop) => Number(stop.stop_order) > Number(boardingStop.stop_order))
      .sort((a, b) => Number(a.stop_order) - Number(b.stop_order))[0];

    if (laterDestination && !matches.has(boardingStop.bus_id)) {
      matches.set(boardingStop.bus_id, { boardingStop, laterDestination });
    }
  }

  if (!matches.size) return [];

  const busesResult = await supabase
    .from("buses")
    .select("id, name, operator")
    .eq("is_active", true)
    .in("id", [...matches.keys()]);

  if (busesResult.error) throw busesResult.error;

  return (busesResult.data || []).map((bus) => ({
    ...bus,
    boardingStop: matches.get(bus.id).boardingStop,
    destinationStop: matches.get(bus.id).laterDestination,
  }));
}

export default function PassengerChatbot() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [routeDraft, setRouteDraft] = useState({ from: "", to: "" });
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi! Ask me about buses, routes, or UPSRTC. You can also tell me your boarding point and destination.",
    },
  ]);

  function addMessage(message) {
    setMessages((current) => [...current, message]);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    setInput("");
    addMessage({ role: "user", text: question });
    setBusy(true);

    try {
      const mentioned = findLocations(question);
      let from = routeDraft.from;
      let to = routeDraft.to;

      if (mentioned.length >= 2) {
        [from, to] = mentioned;
      } else if (mentioned.length === 1) {
        if (!from) from = mentioned[0];
        else if (!to && normalize(from) !== normalize(mentioned[0])) {
          to = mentioned[0];
        }
      }

      const isRouteRequest = /\b(bus|route|track|travel|boarding|destination)\b/i.test(
        question,
      );

      if (isRouteRequest && from && to) {
        setRouteDraft({ from: "", to: "" });
        addMessage({
          role: "assistant",
          text: `Checking saved schedules from ${from} to ${to}…`,
        });

        const buses = await findBusMatches(from, to);

        if (!buses.length) {
          addMessage({
            role: "assistant",
            text: `I couldn't find a saved bus schedule from ${from} to ${to}. Would you like me to check the UPSRTC website instead?`,
          });
          return;
        }

        addMessage({
          role: "assistant",
          text: `I found ${buses.length} matching bus${buses.length === 1 ? "" : "es"} from ${from} to ${to}. Choose an action:`,
          buses: buses.slice(0, 5).map((bus) => ({
            id: bus.id,
            name: bus.name || "UPSRTC Bus",
            from: bus.boardingStop.station_name,
            to: bus.destinationStop.station_name,
            date: today(),
          })),
        });
        return;
      }

      // Anything else goes to TinyFish, which answers from the UPSRTC website.
      const result = await askUpsrtcAssistant({ data: { question } });
      addMessage({
        role: "assistant",
        text: result?.answer || "I couldn't get an answer. Please try again.",
      });
    } catch (error) {
      addMessage({
        role: "assistant",
        text:
          error instanceof Error
            ? error.message
            : "Sorry, something went wrong. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  function openResults(from, to, date) {
    navigate({
      to: "/passenger/results",
      search: { from, to, date },
    });
  }

  function openTracking(bus) {
    navigate({
      to: "/trackbus",
      search: {
        busId: String(bus.id),
        from: bus.from,
        to: bus.to,
        date: bus.date,
      },
    });
  }

  return (
    <div className="passenger-chatbot">
      {open && (
        <section className="passenger-chat-panel" aria-label="Passenger assistant">
          <header className="passenger-chat-header">
            <div>
              <strong>BussInn Assistant</strong>
              <small>Bus help and route search</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">
              <X size={18} />
            </button>
          </header>

          <div className="passenger-chat-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div key={index} className={`passenger-chat-message ${message.role}`}>
                <p>{message.text}</p>
                {message.buses?.map((bus) => (
                  <div className="passenger-chat-bus" key={bus.id}>
                    <strong>{bus.name}</strong>
                    <small>
                      {bus.from} → {bus.to}
                    </small>
                    <div>
                      <button
                        type="button"
                        onClick={() => openResults(bus.from, bus.to, bus.date)}
                      >
                        See results
                      </button>
                      <button type="button" onClick={() => openTracking(bus)}>
                        Track
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {busy && <p className="passenger-chat-thinking">Checking…</p>}
          </div>

          <form className="passenger-chat-form" onSubmit={sendMessage}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a bus or route"
              maxLength={500}
              aria-label="Message"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send message">
              <Send size={17} />
            </button>
          </form>
        </section>
      )}

      <button
        className="passenger-chat-toggle"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && <span>Bus help</span>}
      </button>
    </div>
  );
}