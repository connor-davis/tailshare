// Package api is the local HTTP and WebSocket API the Electron app talks to.
// It listens on loopback only, and every request needs the per-launch token.
// Handlers stay thin: the work lives in the services, and the one Server
// owns the rooms and their sessions, peers and shared folders.
package api

import (
	"context"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net"
	"net/netip"
	"strconv"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/gofiber/fiber/v3"
)

const (
	// A request body is a path, a code or a chat line, so 64 KiB is plenty.
	bodyLimit = 64 << 10

	// How long one call to the other computer may take.
	callTimeout = 30 * time.Second
)

// Server is the local API. Build it with New, bind it with Listen, run it
// with Serve, and stop it with Shutdown.
type Server struct {
	cfg    config.Config
	app    *fiber.App
	hub    *hub
	ctx    context.Context
	cancel context.CancelFunc

	// hosts are the only Host header values accepted. Listen sets them before
	// Serve starts, so no lock is needed.
	hosts []string

	// roomIO keeps roots open during imports. Acquire it before mu when both are needed.
	roomIO sync.RWMutex

	// mu guards everything below. Never hold it across a network call, and
	// never publish an event while holding it: snapshots read it under the hub.
	mu            sync.Mutex
	rooms         map[string]*room
	active        string
	downloadRoot  *share.Root
	downloadRoots []*share.Root
	relayRegion   string
	limits        transferLimits
	trusted       *session.Trusted
}

// New builds the API and owns a transfer manager for each connected session.
// It refuses a token that is not 32 random bytes in hex.
func New(cfg config.Config) (*Server, error) {
	if raw, err := hex.DecodeString(cfg.Token); err != nil || len(raw) != 32 {
		return nil, errors.New("TAILSHARE_TOKEN must be 32 random bytes written as 64 hex characters.")
	}

	if cfg.MainToken != "" {
		raw, err := hex.DecodeString(cfg.MainToken)
		renderer, _ := hex.DecodeString(cfg.Token)
		if err != nil || len(raw) != 32 || subtle.ConstantTimeCompare(raw, renderer) == 1 {
			return nil, errors.New("TAILSHARE_MAIN_TOKEN must be a separate 32-byte hex token.")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	server := &Server{
		cfg: cfg, hub: newHub(), ctx: ctx, cancel: cancel, rooms: make(map[string]*room),
		trusted: session.NewTrusted(),
	}

	server.app = fiber.New(fiber.Config{ErrorHandler: errorHandler, BodyLimit: bodyLimit})
	server.routes()

	return server, nil
}

// Listen binds the configured address, which must be IPv4 loopback, and
// remembers the Host header values that belong to the bound port.
func (server *Server) Listen() (net.Listener, error) {
	address, err := netip.ParseAddrPort(server.cfg.Addr)
	if err != nil || !address.Addr().Is4() || !address.Addr().IsLoopback() {
		return nil, errors.New("TAILSHARE_ADDR must be a loopback address like 127.0.0.1:0.")
	}

	listener, err := net.Listen("tcp4", address.String())
	if err != nil {
		return nil, errors.New("Could not listen on the local API address.")
	}

	port := listener.Addr().(*net.TCPAddr).Port
	server.hosts = []string{
		net.JoinHostPort("127.0.0.1", strconv.Itoa(port)),
		net.JoinHostPort("localhost", strconv.Itoa(port)),
	}

	return listener, nil
}

// Serve runs the API on a listener from Listen until Shutdown.
func (server *Server) Serve(listener net.Listener) error {
	return server.app.Listener(listener, fiber.ListenConfig{DisableStartupMessage: true})
}

// Shutdown stops accepting, drops live clients, ends every room and closes
// their folders. After timeout it stops waiting for slow requests.
func (server *Server) Shutdown(timeout time.Duration) error {
	server.cancel()
	server.hub.closeAll()
	server.mu.Lock()
	rooms := make([]*room, 0, len(server.rooms))
	for _, current := range server.rooms {
		rooms = append(rooms, current)
	}
	server.mu.Unlock()

	for _, current := range rooms {
		server.endRoom(current, nil)
	}
	server.closeFolder()
	server.mu.Lock()
	roots := server.downloadRoots
	server.downloadRoots, server.downloadRoot = nil, nil
	server.mu.Unlock()

	for _, root := range roots {
		_ = root.Close()
	}

	return server.app.ShutdownWithTimeout(timeout)
}

// closeFolder releases the shared folder, which Windows holds open until then.
func (server *Server) closeFolder() {
	server.roomIO.Lock()
	defer server.roomIO.Unlock()

	server.mu.Lock()
	roots := make([]*share.Root, 0, len(server.rooms))
	for _, current := range server.rooms {
		if current.root != nil {
			roots = append(roots, current.root)
			current.root = nil
		}
	}
	server.mu.Unlock()

	for _, root := range roots {
		_ = root.Close()
	}
}

func (server *Server) routes() {
	server.app.Use(server.guard)

	api := server.app.Group("/api")
	api.Get("/health", server.health)
	api.Put("/connection/region", server.mainOnly, server.putRelayRegion)
	api.Post("/connection/test", server.testConnection)
	api.Get("/live", server.liveHandler())

	api.Get("/rooms", server.listRooms)
	api.Post("/rooms/active", server.putActiveRoom)

	api.Get("/session", server.getSession)
	api.Post("/session/host", server.hostSession)
	api.Post("/session/join", server.joinSession)
	api.Delete("/session", server.leaveSession)
	api.Delete("/session/members/:id", server.removeMember)
	api.Put("/session/trusted", server.mainOnly, server.putTrusted)
	api.Get("/session/joins/:id/key", server.mainOnly, server.joinKey)
	api.Post("/session/joins/:id/allow", server.allowJoin)
	api.Post("/session/joins/:id/deny", server.denyJoin)

	api.Post("/room/files", server.mainOnly, server.addRoomFiles)
	api.Get("/room/preview", server.roomPreview)
	api.Post("/downloads/preview", server.mainOnly, server.downloadPreview)
	api.Put("/downloads", server.mainOnly, server.putDownloads)
	api.Get("/files/local", server.localFiles)
	api.Get("/files/peer", server.peerFiles)

	api.Get("/chat", server.getChat)
	api.Post("/chat", server.postChat)

	api.Get("/forwards", server.listForwards)
	api.Post("/forwards", server.shareForward)
	api.Delete("/forwards/:id", server.stopForward)
	api.Post("/forwards/:id/open", server.openForward)
	api.Delete("/forwards/:id/open", server.closeForward)

	api.Get("/transfers", server.listTransfers)
	api.Post("/transfers", server.startTransfer)
	api.Post("/transfers/clear", server.clearTransfers)
	api.Post("/transfers/save", server.mainOnly, server.saveTransfer)
	api.Post("/transfers/folder", server.mainOnly, server.folderTransfer)
	api.Put("/transfers/limits", server.mainOnly, server.putTransferLimits)
	api.Post("/transfers/:id/pause", server.pauseTransfer)
	api.Post("/transfers/:id/resume", server.resumeTransfer)
	api.Delete("/transfers/:id", server.cancelTransfer)
}

func (server *Server) health(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok", "version": config.Version})
}

// tokenMatches compares in constant time. A different length is a mismatch
// without comparing bytes.
func tokenMatches(offered, token string) bool {
	return subtle.ConstantTimeCompare([]byte(offered), []byte(token)) == 1
}

// contextWithin bounds one piece of work, and also ends when the API shuts down.
func (server *Server) contextWithin(limit time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(server.ctx, limit)
}
