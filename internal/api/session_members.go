package api

import (
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/transfer"
	"github.com/gofiber/fiber/v3"
)

func (server *Server) removeMember(c fiber.Ctx) error {
	server.mu.Lock()
	sess := server.sess
	server.mu.Unlock()
	if sess == nil {
		return errNotConnected()
	}

	if err := sess.RemoveMember(c.Params("id")); err != nil {
		return toAppError(err)
	}

	server.publishSession()
	return c.JSON(server.sessionState())
}

func (server *Server) replacePeer(sess *session.Session, other *peer.Peer, manager *transfer.Manager) {
	select {
	case <-sess.Done():
		server.end(sess)
		return
	default:
	}

	_ = manager.Close()
	server.mu.Lock()
	if server.sess != sess || server.peer != other || server.ending != nil {
		server.mu.Unlock()
		return
	}

	server.peer = nil
	server.transfers = nil
	server.phase = phaseHosting
	next := transfer.New(server.root)
	next.SetDownloadRoot(server.downloadRoot)
	next.OnRoomChanged(server.announceShareChanged)
	if err := sess.SetHandlers(next.Handlers()); err != nil {
		server.mu.Unlock()
		_ = next.Close()
		server.end(sess)
		return
	}
	server.manager = next
	server.mu.Unlock()
	server.publishSession()
	go server.awaitJoiner(sess, next)
}
