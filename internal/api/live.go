package api

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/services/forward"
	"github.com/gofiber/contrib/v3/websocket"
	"github.com/gofiber/fiber/v3"
)

const (
	// A client that falls this many events behind is dropped, so one stuck
	// screen can never slow the session or the transfers.
	clientQueue = 64

	writeTimeout = 10 * time.Second
)

// Event is the one shape of every message on the live socket. Seq grows by
// one for every event the hub sends, so the screen can order them. The first
// message to a new client has type "snapshot" and the seq of the last event
// before it, so nothing falls between the snapshot and what follows.
type Event struct {
	Seq int64 `json:"seq"`
	// Type says what the data is: snapshot, session.state, chat.message,
	// transfer.state, transfer.progress or forward.changed (the whole forward.State).
	Type string `json:"type"`
	// Data is the payload for Type; its shape depends on Type.
	Data any `json:"data"`
}

// Snapshot is the data of the first live message: everything the screen needs
// to draw itself before any event arrives. Chat is not included; read it from
// /api/chat.
type Snapshot struct {
	Session   SessionState   `json:"session"`
	Transfers []TransferItem `json:"transfers"`
	Forwards  forward.State  `json:"forwards"`
}

// client is one open live socket.
type client struct {
	send chan []byte
	kick func()
}

// hub owns every live client. Publishing never blocks.
type hub struct {
	mu      sync.Mutex
	clients map[*client]struct{}
	seq     int64
	closed  bool
}

func newHub() *hub {
	return &hub{clients: make(map[*client]struct{})}
}

// add registers a client. Its first message is the snapshot, built while the
// hub is locked so no event can slip in before it. It returns nil once the
// hub is closed.
func (h *hub) add(snapshot func() any, kick func()) *client {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.closed {
		return nil
	}

	added := &client{send: make(chan []byte, clientQueue), kick: kick}
	added.send <- encode(Event{Seq: h.seq, Type: "snapshot", Data: snapshot()})
	h.clients[added] = struct{}{}

	return added
}

// remove forgets a client. It is safe to call more than once.
func (h *hub) remove(gone *client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, live := h.clients[gone]; live {
		delete(h.clients, gone)
		close(gone.send)
	}
}

// publish sends one event to every client. A client whose queue is full is
// dropped, and its socket is closed so a stuck write ends too.
func (h *hub) publish(kind string, data any) {
	h.mu.Lock()
	h.seq++
	message := encode(Event{Seq: h.seq, Type: kind, Data: data})

	var dropped []*client
	for live := range h.clients {
		select {
		case live.send <- message:
		default:
			delete(h.clients, live)
			close(live.send)
			dropped = append(dropped, live)
		}
	}
	h.mu.Unlock()

	for _, live := range dropped {
		live.kick()
	}
}

// closeAll drops every client and refuses new ones.
func (h *hub) closeAll() {
	h.mu.Lock()
	h.closed = true

	var all []*client
	for live := range h.clients {
		delete(h.clients, live)
		close(live.send)
		all = append(all, live)
	}
	h.mu.Unlock()

	for _, live := range all {
		live.kick()
	}
}

func encode(event Event) []byte {
	raw, err := json.Marshal(event)
	if err != nil {
		// Every payload is one of our own plain types, so this is a bug.
		raw = []byte(`{"seq":0,"type":"error","data":null}`)
	}

	return raw
}

func (server *Server) snapshot() any {
	return Snapshot{
		Session:   server.sessionState(),
		Transfers: server.transferList(),
		Forwards:  server.forwardState(),
	}
}

// liveHandler upgrades /api/live. guard has already checked Host, Origin and
// the token, so the handler only has to check that the protocol was agreed.
func (server *Server) liveHandler() fiber.Handler {
	return websocket.New(server.live, websocket.Config{
		Subprotocols:     []string{wsProtocol},
		Origins:          allowedOrigins,
		AllowEmptyOrigin: true,
	})
}

func (server *Server) live(conn *websocket.Conn) {
	defer conn.Close()

	if conn.Subprotocol() != wsProtocol {
		return
	}

	added := server.hub.add(server.snapshot, func() { _ = conn.Close() })
	if added == nil {
		return
	}

	go func() {
		defer conn.Close()

		for message := range added.send {
			_ = conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				server.hub.remove(added)
				return
			}
		}
	}()

	// The screen never sends anything; reading is how a closed socket is noticed.
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}

	server.hub.remove(added)
}
