package api

import (
	"encoding/json"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/connection"
	"github.com/gofiber/fiber/v3"
)

func (server *Server) putRelayRegion(c fiber.Ctx) error {
	var input struct {
		RelayRegion string `json:"relayRegion"`
	}
	if json.Unmarshal(c.Body(), &input) != nil {
		return apperr.BadRequest("Choose a relay region or Nearest.")
	}
	if _, _, err := config.ParseRegion(input.RelayRegion); err != nil {
		return apperr.BadRequest("Choose a relay region or Nearest.")
	}
	server.mu.Lock()
	server.relayRegion = input.RelayRegion
	server.mu.Unlock()
	return c.JSON(fiber.Map{"relayRegion": input.RelayRegion})
}

func (server *Server) connectionConfig() config.Config {
	server.mu.Lock()
	defer server.mu.Unlock()
	result := server.cfg
	if server.relayRegion != "" {
		result.Region, result.Nearest, _ = config.ParseRegion(server.relayRegion)
	}
	return result
}

func (server *Server) testConnection(c fiber.Ctx) error {
	ctx, cancel := server.contextWithin(15 * time.Second)
	defer cancel()
	result, err := connection.Test(ctx, server.cfg.DERPMapURL)
	if err != nil {
		return apperr.BadRequest("Could not test this connection. Check your network and try again.")
	}
	return c.JSON(result)
}
