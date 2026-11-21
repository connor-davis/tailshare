package api

import (
	"context"
	"errors"
	"log"
	"net/http"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/forward"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/services/transfer"
	"github.com/gofiber/fiber/v3"
)

// errorHandler is the one place errors become JSON. Whatever the error was,
// the caller only ever sees an apperr sentence, never Go error text.
func errorHandler(c fiber.Ctx, err error) error {
	out := toAppError(err)

	return c.Status(out.Status).JSON(out)
}

// toAppError maps any error onto a safe apperr.Error. Errors that are none of
// the known kinds are bugs: they go to stderr and the caller gets a generic 500.
func toAppError(err error) *apperr.Error {
	var known *apperr.Error
	if errors.As(err, &known) {
		return known
	}

	var remote *peer.RemoteError
	if errors.As(err, &remote) {
		return fromRemote(remote.Code)
	}

	var web *fiber.Error
	if errors.As(err, &web) {
		return fromStatus(web.Code)
	}

	switch {
	case errors.Is(err, forward.ErrInvalid):
		return apperr.BadRequest(forward.ErrInvalid.Error())
	case errors.Is(err, forward.ErrLimit):
		return apperr.Conflict("limit", forward.ErrLimit.Error())
	case errors.Is(err, forward.ErrNotFound):
		return apperr.NotFound(forward.ErrNotFound.Error())
	case errors.Is(err, forward.ErrNotConnected):
		return errNotConnected()
	case errors.Is(err, forward.ErrUnreachable):
		return apperr.Unavailable(forward.ErrUnreachable.Error())
	case errors.Is(err, transfer.ErrUnavailable):
		return apperr.Conflict("conflict", transfer.ErrUnavailable.Error())
	case errors.Is(err, transfer.ErrClosed):
		return errNotConnected()
	case errors.Is(err, share.ErrBadPath):
		return apperr.New(http.StatusBadRequest, "bad_path", share.ErrBadPath.Error())
	case errors.Is(err, share.ErrNotFound):
		return apperr.NotFound(share.ErrNotFound.Error())
	case errors.Is(err, share.ErrExists):
		return apperr.Conflict("exists", share.ErrExists.Error())
	case errors.Is(err, share.ErrDenied):
		return apperr.New(http.StatusForbidden, "denied", share.ErrDenied.Error())
	case errors.Is(err, share.ErrNotFile):
		return apperr.New(http.StatusBadRequest, "not_file", share.ErrNotFile.Error())
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return errUnreachable()
	}

	log.Printf("api: unexpected error: %v", err)

	return apperr.Internal()
}

// fromRemote turns the other computer's error code into our own sentence. Its
// message is never passed on: it is text from outside this machine.
func fromRemote(code string) *apperr.Error {
	switch code {
	case peer.CodeBadRequest:
		return apperr.BadRequest("The other computer could not understand the request.")
	case peer.CodeBadPath:
		return toAppError(share.ErrBadPath)
	case peer.CodeNotFound:
		return toAppError(share.ErrNotFound)
	case peer.CodeExists:
		return toAppError(share.ErrExists)
	case peer.CodeDenied:
		return toAppError(share.ErrDenied)
	case peer.CodeJoinDenied:
		return apperr.New(http.StatusForbidden, "join_denied", "The host did not let you join.")
	case peer.CodeBusy:
		return apperr.Conflict("busy", "Someone else is joining. Try again shortly.")
	case peer.CodeShareFull:
		return apperr.Conflict("share_full", "This share already has eight people.")
	case peer.CodeJoinFailed:
		return apperr.Unavailable("Could not connect everyone in the share.")
	case peer.CodeNotAdmitter:
		return apperr.Conflict("not_admitter", "This computer cannot admit someone.")
	case peer.CodeNotSharing:
		return apperr.Conflict("not_sharing", "That computer is not sharing a folder.")
	case peer.CodeTooLarge:
		return apperr.New(http.StatusRequestEntityTooLarge, "too_large",
			"That folder is too big to list at once. Ask for fewer items.")
	}

	return apperr.Unavailable("The other computer could not answer. Try again.")
}

// fromStatus covers errors Fiber raises itself, such as an unknown route.
func fromStatus(status int) *apperr.Error {
	switch {
	case status == http.StatusNotFound:
		return apperr.NotFound("That address was not found.")
	case status == http.StatusRequestEntityTooLarge:
		return apperr.New(status, "too_large", "That request is too large.")
	case status >= 400 && status < 500:
		return apperr.New(status, "bad_request", "That request could not be handled.")
	}

	return apperr.Internal()
}

// errUnreachable is the answer when a call to the other computer fails.
func errUnreachable() *apperr.Error {
	return apperr.Unavailable("Could not reach the other computer.")
}

// connectError turns a failed host or join into a plain sentence. The
// services already speak in sentences, but a timeout or cancel arrives as
// Go's own text ("context deadline exceeded"), which must not reach the page.
func connectError(err error) *apperr.Error {
	var remote *peer.RemoteError
	if errors.As(err, &remote) {
		return fromRemote(remote.Code)
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return errUnreachable()
	}

	return errUnreachable()
}

// errNotConnected is the answer to a request that needs a joined session.
func errNotConnected() *apperr.Error {
	return apperr.Conflict("not_connected", "Connect to another computer first.")
}
