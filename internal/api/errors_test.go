package api

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/Polyphron-AI/tailshare/internal/platform/apperr"
	"github.com/Polyphron-AI/tailshare/internal/services/peer"
	"github.com/Polyphron-AI/tailshare/internal/services/share"
	"github.com/Polyphron-AI/tailshare/internal/services/transfer"
	"github.com/gofiber/fiber/v3"
)

func TestToAppError(t *testing.T) {
	leaky := `open C:\Users\secret\file.txt: access denied`

	cases := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"apperr", apperr.NotFound("Gone."), 404, "not_found"},
		{"wrapped apperr", fmt.Errorf("x: %w", apperr.Conflict("busy", "Busy.")), 409, "busy"},
		{"bad path", share.ErrBadPath, 400, "bad_path"},
		{"transfer unavailable", transfer.ErrUnavailable, 409, "conflict"},
		{"transfer closed", transfer.ErrClosed, 409, "not_connected"},
		{"not found", share.ErrNotFound, 404, "not_found"},
		{"exists", share.ErrExists, 409, "exists"},
		{"denied", share.ErrDenied, 403, "denied"},
		{"not a file", share.ErrNotFile, 400, "not_file"},
		{"remote bad path", &peer.RemoteError{Code: peer.CodeBadPath, Message: leaky}, 400, "bad_path"},
		{"remote not found", &peer.RemoteError{Code: peer.CodeNotFound, Message: leaky}, 404, "not_found"},
		{"remote denied", &peer.RemoteError{Code: peer.CodeDenied, Message: leaky}, 403, "denied"},
		{"remote not sharing", &peer.RemoteError{Code: peer.CodeNotSharing, Message: leaky}, 409, "not_sharing"},
		{"remote too large", &peer.RemoteError{Code: peer.CodeTooLarge, Message: leaky}, 413, "too_large"},
		{"remote bad request", &peer.RemoteError{Code: peer.CodeBadRequest, Message: leaky}, 400, "bad_request"},
		{"remote internal", &peer.RemoteError{Code: peer.CodeInternal, Message: leaky}, 502, "unavailable"},
		{"remote unknown", &peer.RemoteError{Code: "made_up", Message: leaky}, 502, "unavailable"},
		{"canceled", context.Canceled, 502, "unavailable"},
		{"timeout", fmt.Errorf("x: %w", context.DeadlineExceeded), 502, "unavailable"},
		{"fiber 404", fiber.ErrNotFound, 404, "not_found"},
		{"fiber 413", fiber.ErrRequestEntityTooLarge, 413, "too_large"},
		{"fiber 405", fiber.ErrMethodNotAllowed, 405, "bad_request"},
		{"fiber 500", fiber.ErrInternalServerError, 500, "internal"},
		{"unknown", errors.New(leaky), 500, "internal"},
	}

	for _, tc := range cases {
		got := toAppError(tc.err)
		if got.Status != tc.status || got.Code != tc.code {
			t.Errorf("%s: %d %s, want %d %s", tc.name, got.Status, got.Code, tc.status, tc.code)
		}

		if strings.Contains(got.Message, "secret") || strings.Contains(got.Message, `C:\`) || got.Message == "" {
			t.Errorf("%s: message %q is not safe", tc.name, got.Message)
		}
	}
}
