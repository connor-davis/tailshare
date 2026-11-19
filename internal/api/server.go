// Package api is the local HTTP and WebSocket API the Electron app talks to.
// It listens on loopback only, and every request needs the per-launch token.
// Handlers stay thin: the work lives in the services, and the one Server
// owns the single active session, peer and shared folder.
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

	"github.com/Polyphron-AI/tailshare/internal/platform/config"
	"github.com/Polyphron-AI/tailshare/internal/services/peer"
	"github.com/Polyphron-AI/tailshare/internal/services/session"
	"github.com/Polyphron-AI/tailshare/internal/services/share"
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

	// mu guards everything below. Never hold it across a network call, and
	// never publish an event while holding it: snapshots read it under the hub.
	mu           sync.Mutex
	phase        string
	role         string
	code         string
	sess         *session.Session
	peer         *peer.Peer
	root         *share.Root
	transfers    Transfers
	transferDone chan struct{}
	ending       chan struct{}
}

// New builds the API and owns a transfer manager for each connected session.
// It refuses a token that is not 32 random bytes in hex.
func New(cfg config.Config) (*Server, error) {
	if raw, err := hex.DecodeString(cfg.Token); err != nil || len(raw) != 32 {
		return nil, errors.New("TAILSHARE_TOKEN must be 32 random bytes written as 64 hex characters.")
	}

	ctx, cancel := context.WithCancel(context.Background())
	server := &Server{
		cfg: cfg, hub: newHub(), ctx: ctx, cancel: cancel, phase: phaseIdle,
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

// Shutdown stops accepting, drops live clients, ends the session and closes
// the shared folder. After timeout it stops waiting for slow requests.
func (server *Server) Shutdown(timeout time.Duration) error {
	server.cancel()
	server.hub.closeAll()
	server.leave()
	server.closeFolder()

	return server.app.ShutdownWithTimeout(timeout)
}

// closeFolder releases the shared folder, which Windows holds open until then.
func (server *Server) closeFolder() {
	server.mu.Lock()
	root := server.root
	server.root = nil
	server.mu.Unlock()

	if root != nil {
		_ = root.Close()
	}
}

func (server *Server) routes() {
	server.app.Use(server.guard)

	api := server.app.Group("/api")
	api.Get("/health", server.health)
	api.Get("/live", server.liveHandler())

	api.Get("/session", server.getSession)
	api.Post("/session/host", server.hostSession)
	api.Post("/session/join", server.joinSession)
	api.Delete("/session", server.leaveSession)

	api.Put("/folder", server.putFolder)
	api.Get("/files/local", server.localFiles)
	api.Get("/files/peer", server.peerFiles)

	api.Get("/chat", server.getChat)
	api.Post("/chat", server.postChat)

	api.Get("/transfers", server.listTransfers)
	api.Post("/transfers", server.startTransfer)
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
