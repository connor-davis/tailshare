package session

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/services/peer"
	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

func readJoinLine(ctx context.Context, server *tailcat.Server, conn net.Conn) (peer.ShareMember, error) {
	stop := boundHandshake(ctx, conn)
	defer stop()

	line, err := readLine(conn)
	if err != nil {
		return peer.ShareMember{}, err
	}

	parts := strings.Split(line, " ")
	if len(parts) != 3 || parts[0] != "join" {
		return peer.ShareMember{}, badJoin()
	}

	var claimed key.NodePublic
	if claimed.UnmarshalText([]byte(parts[1])) != nil || claimed.IsZero() || claimed.String() != parts[1] {
		return peer.ShareMember{}, badJoin()
	}
	actual, ok := peerKey(server, conn.RemoteAddr())
	if !ok || actual != claimed {
		return peer.ShareMember{}, badJoin()
	}

	id, err := meshIDFromAddress(parts[2])
	if err != nil {
		return peer.ShareMember{}, err
	}
	return peer.ShareMember{ID: id, Address: parts[2]}, nil
}

func readLine(conn net.Conn) (string, error) {
	// Reading exactly one byte leaves a pipelined hello untouched.
	line := make([]byte, 0, 512)
	var next [1]byte
	for len(line) < 4096 {
		if _, err := io.ReadFull(conn, next[:]); err != nil {
			return "", err
		}

		if next[0] == '\n' {
			return string(line), nil
		}
		line = append(line, next[0])
	}
	return "", badJoin()
}

func meshIDFromAddress(address string) (string, error) {
	if len(address) == 0 || len(address) > 4096 {
		return "", badJoin()
	}
	info, err := tailcat.ParseAddr(tailcat.Addr(address))
	if err != nil || info.ServerPublic.NodePublic.IsZero() {
		return "", badJoin()
	}
	return info.ServerPublic.NodePublic.String(), nil
}

func writeJoinLine(ctx context.Context, conn net.Conn, public key.NodePublic, address string) error {
	stop := boundHandshake(ctx, conn)
	defer stop()
	_, err := fmt.Fprintf(conn, "join %s %s\n", public.String(), address)
	return err
}

func badJoin() error { return errors.New("The other computer sent invalid share details.") }

func boundHandshake(ctx context.Context, conn net.Conn) func() {
	deadline := time.Now().Add(30 * time.Second)
	if limit, ok := ctx.Deadline(); ok && limit.Before(deadline) {
		deadline = limit
	}
	_ = conn.SetDeadline(deadline)
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	return func() {
		stop()
		_ = conn.SetDeadline(time.Time{})
	}
}
