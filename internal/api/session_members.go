package api

import (
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/transfer"
	"github.com/gofiber/fiber/v3"
)

func (server *Server) removeMember(c fiber.Ctx) error {
	server.mu.Lock()
	current := server.activeLocked()
	if current == nil {
		server.mu.Unlock()
		return errNotConnected()
	}

	sess := current.sess
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
	current := server.sessionRoomLocked(sess)
	if current == nil || current.sess != sess || current.peer != other || current.ending != nil {
		server.mu.Unlock()
		return
	}

	current.peer = nil
	current.transfers = nil
	current.phase = phaseHosting
	next := transfer.New(current.root)
	next.SetDownloadRoot(server.downloadRoot)
	next.OnRoomChanged(func() { server.announceRoomChanged(current) })
	if err := sess.SetHandlers(next.Handlers()); err != nil {
		server.mu.Unlock()
		_ = next.Close()
		server.end(sess)
		return
	}
	current.manager = next
	server.mu.Unlock()
	server.publishSessionFor(sess)
	go server.awaitJoiner(sess, next)
}
