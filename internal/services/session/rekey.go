package session

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

// ponytail: rekey uses one bounded text line and an ack; step 4's peer JSON
// framing will replace this temporary wire format.
const rekeyPrefix = "rekey "

func readJoiner(
	ctx context.Context,
	server *tailcat.Server,
	conn net.Conn,
) (key.NodePublic, bool) {
	stop := boundHandshake(ctx, conn)
	defer stop()
	line, err := bufio.NewReader(io.LimitReader(conn, 1024)).ReadString('\n')
	if err != nil || !strings.HasPrefix(line, "join ") {
		return key.NodePublic{}, false
	}

	var claimed key.NodePublic
	text := strings.TrimSuffix(strings.TrimPrefix(line, "join "), "\n")
	if err := claimed.UnmarshalText([]byte(text)); err != nil {
		return key.NodePublic{}, false
	}

	// The claim must match the key that actually authenticated this stream.
	actual, ok := peerKey(server, conn.RemoteAddr())

	return actual, ok && actual == claimed
}

func (session *Session) rekeyHost(
	ctx context.Context,
	oldServer *tailcat.Server,
	conn net.Conn,
	peer key.NodePublic,
) error {
	info, err := tailcat.ParseAddr(oldServer.TailcatAddr())
	if err != nil {
		return err
	}
	if len(info.Region) == 0 {
		return errors.New("The relay did not provide a connection address.")
	}

	server := &tailcat.Server{
		Key: key.NewNode(), PresharedKey: tailcat.NewPresharedKey(),
		Region: info.Region[0], AllowedClients: []key.NodePublic{peer}, Logf: quietLog,
	}
	listener, err := server.Listen(ctx, "tcp", fmt.Sprintf(":%d", sessionPort))
	if err != nil {
		_ = server.Close()
		return err
	}

	// Keep both servers owned until the acknowledgment makes retiring the old one safe.
	defer oldServer.Close()
	session.mu.Lock()
	if session.closed {
		session.mu.Unlock()
		_ = server.Close()
		return net.ErrClosed
	}
	session.server = server
	session.listener = listener
	session.mu.Unlock()

	go session.acceptStreams(listener)
	stop := boundHandshake(ctx, conn)
	defer stop()
	if _, err := fmt.Fprintf(conn, "%s%s\n", rekeyPrefix, server.TailcatAddr()); err != nil {
		return err
	}

	ack, err := bufio.NewReader(conn).ReadByte()
	if err != nil {
		return err
	}
	if ack != 1 {
		return errors.New("The other computer could not finish connecting.")
	}

	_ = conn.Close()
	session.mu.Lock()
	session.bootstrap = nil
	session.mu.Unlock()
	return nil
}

func (session *Session) acceptStreams(listener net.Listener) {
	for {
		conn, err := listener.Accept()
		if err != nil {
			return
		}

		select {
		case session.incoming <- conn:
		case <-session.done:
			_ = conn.Close()
			return
		}
	}
}

func rekeyJoin(ctx context.Context, conn net.Conn, identity key.NodePrivate) (*Session, error) {
	stop := boundHandshake(ctx, conn)
	defer stop()
	identityText, err := identity.Public().MarshalText()
	if err != nil {
		return nil, err
	}
	if _, err := fmt.Fprintf(conn, "join %s\n", identityText); err != nil {
		return nil, errors.New("The other computer could not finish connecting.")
	}

	reader := bufio.NewReader(io.LimitReader(conn, 16*1024))
	line, err := reader.ReadString('\n')
	if err != nil || !strings.HasPrefix(line, rekeyPrefix) {
		return nil, errors.New("The other computer could not finish connecting.")
	}

	address := tailcat.Addr(strings.TrimSuffix(strings.TrimPrefix(line, rekeyPrefix), "\n"))
	info, err := tailcat.ParseAddr(address)
	if err != nil || len(info.Region) == 0 {
		return nil, errors.New("The other computer sent an invalid connection address.")
	}

	client := tailcat.NewClient(address)
	client.Key = identity
	client.Logf = quietLog
	stream, err := dialBootstrap(ctx, client)
	if err != nil {
		_ = client.Close()
		return nil, errors.New("Could not secure the connection to the other computer.")
	}

	if _, err := conn.Write([]byte{1}); err != nil {
		_ = stream.Close()
		_ = client.Close()
		return nil, errors.New("The other computer could not finish connecting.")
	}

	session, _ := newSession(context.Background())
	session.mu.Lock()
	session.client = client
	session.first = stream
	session.mu.Unlock()
	return session, nil
}

func boundHandshake(ctx context.Context, conn net.Conn) func() {
	deadline := time.Now().Add(30 * time.Second)
	if limit, ok := ctx.Deadline(); ok && limit.Before(deadline) {
		deadline = limit
	}
	_ = conn.SetDeadline(deadline)

	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	return func() { stop() }
}
