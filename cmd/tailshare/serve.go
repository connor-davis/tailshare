package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/connor-davis/tailshare/internal/api"
	"github.com/connor-davis/tailshare/internal/platform/config"
)

// shutdownTimeout is how long serve waits for open requests before it stops.
const shutdownTimeout = 5 * time.Second

// serve runs the local API until ctx ends or stdin closes. Electron holds
// stdin open for as long as it lives, so closing it is how a sidecar learns
// its parent died, and no orphan is left behind. stdout gets exactly one
// line, printed only after the port is bound.
func serve(ctx context.Context, stdin io.Reader, stdout io.Writer) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	server, err := api.New(cfg)
	if err != nil {
		return err
	}

	listener, err := server.Listen()
	if err != nil {
		return err
	}

	if _, err := fmt.Fprintf(stdout, "TAILSHARE_READY http://%s\n", listener.Addr()); err != nil {
		_ = listener.Close()
		return err
	}

	served := make(chan error, 1)
	go func() { served <- server.Serve(listener) }()

	stdinClosed := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, stdin)
		close(stdinClosed)
	}()

	select {
	case err := <-served:
		return err
	case <-ctx.Done():
	case <-stdinClosed:
	}

	if err := server.Shutdown(shutdownTimeout); err != nil {
		return err
	}

	return <-served
}

// serveFromProcess runs serve with the real stdin, stdout and signals.
func serveFromProcess() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	return serve(ctx, os.Stdin, os.Stdout)
}
