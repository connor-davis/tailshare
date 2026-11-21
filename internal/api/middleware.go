package api

import (
	"slices"
	"strings"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/gofiber/fiber/v3"
)

const (
	// wsProtocol is the WebSocket subprotocol the renderer asks for. The token
	// rides along as a second subprotocol, because a browser can't set headers
	// on a WebSocket and a query string would leak into logs.
	wsProtocol = "tailshare.v1"

	livePath = "/api/live"
)

// allowedOrigins are the only browser origins that may call the API: the
// packaged app's page (Origin "null") and the Vite dev server. 5174 is the
// second dev copy (TAILSHARE_DEV_PORT=5174). If a dev port changes, change it
// here and in electron.vite.config.ts together. The token is still required.
var allowedOrigins = []string{"null", "http://localhost:5173", "http://localhost:5174"}

// guard runs before every route: Host, then Origin, then the token. The Host
// check stops DNS rebinding, the Origin check stops other web pages, and the
// token stops other programs on this machine.
func (server *Server) guard(c fiber.Ctx) error {
	// Forwarded headers are never trusted: only the real Host header counts.
	if !slices.Contains(server.hosts, c.Host()) {
		return apperr.Forbidden()
	}

	origin := c.Get(fiber.HeaderOrigin)
	if origin != "" && !slices.Contains(allowedOrigins, origin) {
		return apperr.Forbidden()
	}

	if origin != "" {
		c.Set(fiber.HeaderAccessControlAllowOrigin, origin)
		c.Set(fiber.HeaderVary, fiber.HeaderOrigin)
	}

	// Browsers never send the token on a preflight, so an allowed origin gets
	// its answer without one. It grants nothing: real requests still need it.
	if origin != "" && c.Method() == fiber.MethodOptions {
		c.Set(fiber.HeaderAccessControlAllowMethods, "GET, POST, PUT, DELETE")
		c.Set(fiber.HeaderAccessControlAllowHeaders, "Authorization, Content-Type")
		c.Set(fiber.HeaderAccessControlMaxAge, "600")

		return c.SendStatus(fiber.StatusNoContent)
	}

	if c.Path() == livePath || strings.HasPrefix(c.Path(), "/api/screen/ingest/") ||
		strings.HasPrefix(c.Path(), "/api/screen/watch/") {
		return server.guardLive(c)
	}

	if !server.bearerOK(c) {
		return apperr.Unauthorized()
	}

	return c.Next()
}

// bearerOK wants exactly one Authorization header holding "Bearer <token>".
func (server *Server) bearerOK(c fiber.Ctx) bool {
	values := c.Request().Header.PeekAll(fiber.HeaderAuthorization)
	if len(values) != 1 {
		return false
	}

	offered, ok := strings.CutPrefix(string(values[0]), "Bearer ")

	return ok && tokenMatches(offered, server.cfg.Token)
}

// guardLive checks the WebSocket handshake before it upgrades: the offered
// subprotocols must be tailshare.v1 and the token, nothing else.
func (server *Server) guardLive(c fiber.Ctx) error {
	var offered []string
	for _, line := range c.Request().Header.PeekAll(fiber.HeaderSecWebSocketProtocol) {
		for part := range strings.SplitSeq(string(line), ",") {
			offered = append(offered, strings.TrimSpace(part))
		}
	}

	var tokens []string
	hasProtocol := false
	for _, name := range offered {
		if name == wsProtocol {
			hasProtocol = true
		} else {
			tokens = append(tokens, name)
		}
	}

	if len(tokens) != 1 || !tokenMatches(tokens[0], server.cfg.Token) {
		return apperr.Unauthorized()
	}
	if !hasProtocol {
		return apperr.BadRequest("Ask for the tailshare.v1 protocol.")
	}

	return c.Next()
}
