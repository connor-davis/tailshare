package api

import (
	"encoding/json"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/screen"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/gofiber/contrib/v3/websocket"
	"github.com/gofiber/fiber/v3"
)

func (server *Server) newScreens() *screen.Screens {
	return screen.New(func() { server.hub.publish("screen.changed", server.screenState()) })
}

func (server *Server) attachScreens(sess *session.Session, screens *screen.Screens) {
	server.mu.Lock()

	if server.sess != sess || server.ending != nil || server.ctx.Err() != nil {
		server.mu.Unlock()
		screens.Close()
		return
	}

	server.screens = screens
	server.mu.Unlock()

	if err := screens.Attach(sess); err != nil {
		screens.Close()
	}
}

func roomHandlers(forwards, screens map[string]peer.Handler) map[string]peer.Handler {
	for method, handler := range screens {
		forwards[method] = handler
	}

	return forwards
}

func (server *Server) screenState() screen.State {
	server.mu.Lock()
	screens := server.screens
	server.mu.Unlock()

	if screens == nil {
		return screen.State{Mine: []screen.Item{}, Others: []screen.Item{}, Unsupported: []string{}}
	}

	return screens.State()
}

func (server *Server) currentScreens() (*screen.Screens, error) {
	server.mu.Lock()
	defer server.mu.Unlock()

	if server.screens == nil {
		return nil, errNotConnected()
	}

	return server.screens, nil
}

func (server *Server) listScreens(c fiber.Ctx) error {
	return c.JSON(server.screenState())
}

func (server *Server) startScreen(c fiber.Ctx) error {
	var request struct {
		Codec string `json:"codec"`
	}

	if json.Unmarshal(c.Body(), &request) != nil {
		return apperr.BadRequest("Choose a screen to share.")
	}

	screens, err := server.currentScreens()

	if err != nil {
		return err
	}

	item, err := screens.Start(request.Codec)

	if err != nil {
		return apperr.Conflict("screen_busy", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(item)
}

func (server *Server) stopScreen(c fiber.Ctx) error {
	screens, err := server.currentScreens()

	if err != nil {
		return err
	}

	screens.Stop(c.Params("id"))
	return c.JSON(screens.State())
}

func (server *Server) screenSocket(ingest bool) fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		defer conn.Close()

		if conn.Subprotocol() != wsProtocol {
			return
		}

		screens, err := server.currentScreens()

		if err != nil {
			return
		}

		id := conn.Params("id")
		conn.SetReadLimit(screen.MaxChunk)

		if ingest {
			if !screens.BindIngest(id, func() { _ = conn.Close() }) {
				return
			}

			defer screens.Stop(id)

			for {
				_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
				kind, data, err := conn.ReadMessage()

				if err != nil || kind != websocket.BinaryMessage {
					return
				}

				if screens.Push(id, data) != nil {
					return
				}
			}
		}

		ctx, cancel := server.contextWithin(15 * time.Second)
		stream, err := screens.Watch(ctx, id)
		cancel()

		if err != nil {
			return
		}

		defer screens.Unwatch(stream)
		go func() {
			defer conn.Close()

			for {
				_ = stream.SetReadDeadline(time.Now().Add(10 * time.Second))
				chunk, err := screen.ReadChunk(stream)

				if err != nil {
					return
				}

				_ = conn.SetWriteDeadline(time.Now().Add(3 * time.Second))

				if conn.WriteMessage(websocket.BinaryMessage, chunk) != nil {
					return
				}
			}
		}()

		// Read only to detect Stop watching; viewers never send media.
		_, _, _ = conn.ReadMessage()
	}, websocket.Config{Subprotocols: []string{wsProtocol}, Origins: allowedOrigins, AllowEmptyOrigin: true})
}
